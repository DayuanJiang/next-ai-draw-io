import { expect, type Page, test } from "@playwright/test"
import {
    chunkedReplies,
    getIframe,
    sendMessage,
    waitForCompleteCount,
} from "./lib/fixtures"
import { sse as sseEvents, toolCallEvents } from "./lib/helpers"

/**
 * What the app asks of draw.io around a chat turn (contexts/
 * diagram-context.tsx): the page's XML before a message goes out and the
 * picture of each version. Neither may hold up the chat or the canvas.
 */

const BOX = `<mxCell id="box" value="Service" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="120" height="60" as="geometry"/></mxCell>`

function sse(events: object[]) {
    return `${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")}data: [DONE]\n\n`
}
const drawing = (xml: string) => {
    const toolCallId = `call_${Math.random().toString(36).slice(2)}`
    return sse([
        { type: "start", messageId: `msg_${toolCallId}` },
        { type: "tool-input-start", toolCallId, toolName: "display_diagram" },
        {
            type: "tool-input-available",
            toolCallId,
            toolName: "display_diagram",
            input: { xml },
        },
        { type: "finish" },
    ])
}
const text = (t: string) =>
    sse([
        { type: "start", messageId: `msg_${Math.random()}` },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: t },
        { type: "text-end", id: "t" },
        { type: "finish" },
    ])

/** Answers chat requests in order and counts them */
async function mockChat(page: Page, replies: string[]) {
    const sent: unknown[] = []
    await page.route("**/api/chat", async (route) => {
        sent.push(route.request().postDataJSON())
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: replies.shift() ?? text("OK"),
        })
    })
    return sent
}

test("a picture from a host that does not answer leaves the canvas and the chat usable", async ({
    page,
}) => {
    // Never answered and never failed: a slow or filtered host. draw.io
    // downloads pictures from this host itself when it exports
    await page.route("https://raw.githubusercontent.com/**", () => {})
    const picture = `<mxCell id="logo" value="Logo" style="shape=image;image=https://raw.githubusercontent.com/acme/icons/main/logo.png;" vertex="1" parent="1"><mxGeometry x="300" y="90" width="80" height="80" as="geometry"/></mxCell>`
    const sent = await mockChat(page, [drawing(BOX + picture), text("Done.")])
    await page.goto("/", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    const canvas = page.frameLocator("iframe")

    await sendMessage(page, "Draw a service and its logo")
    await waitForCompleteCount(page, 1)
    const box = canvas.getByText("Service", { exact: true })
    await expect(box).toBeVisible({ timeout: 15000 })

    // The version's picture is being made now: the canvas takes a click
    await box.click()
    await expect(page.locator('[data-testid="selection-chip"]')).toBeVisible({
        timeout: 5000,
    })
    // and the next message goes out
    await sendMessage(page, "Thanks")
    await expect.poll(() => sent.length, { timeout: 5000 }).toBe(2)
    await expect(page.getByText("Error fetching chart data")).toHaveCount(0)
})

test("a message sent while draw.io is still loading goes out at once, and its drawing shows once draw.io is ready", async ({
    page,
}) => {
    // draw.io's script arrives late, as on a slow first visit
    await page.route("**/drawio/js/app.min.js", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 6000))
        await route.continue()
    })
    const sent = await mockChat(page, [drawing(BOX)])
    await page.goto("/", { waitUntil: "domcontentloaded" })

    await sendMessage(page, "Draw a service")
    await expect.poll(() => sent.length, { timeout: 4000 }).toBe(1)
    // draw.io had not started when the request left
    await expect(page.locator('[data-testid="canvas-loading"]')).toHaveCount(1)

    await waitForCompleteCount(page, 1)
    await expect(
        page.frameLocator("iframe").getByText("Service", { exact: true }),
    ).toBeVisible({ timeout: 30000 })
    await expect(page.getByText("Error fetching chart data")).toHaveCount(0)
})

test("a drawing that streams onto an empty canvas stays in view as it grows", async ({
    page,
}) => {
    const cell = (id: string, label: string, x: number, y: number) =>
        `<mxCell id="${id}" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/></mxCell>`
    // Far apart: at 100% the window holds only one of them
    const call = toolCallEvents(
        "wide",
        "display_diagram",
        {
            xml:
                cell("a", "First", 40, 40) +
                cell("b", "Far right", 1900, 40) +
                cell("c", "Far down", 40, 1500) +
                cell("d", "Still coming", 900, 700),
        },
        60,
    )
    // One cell at a time, and the stream stays open before the last one
    // is complete: the canvas shows previews only
    const third = Math.ceil(call.deltas.length / 3)
    await chunkedReplies(
        page,
        [
            [
                sseEvents(
                    [{ type: "start" }, call.start, ...call.deltas.slice(0, 4)],
                    false,
                ),
                sseEvents(call.deltas.slice(4, third), false),
                sseEvents(call.deltas.slice(third, 2 * third), false),
                sseEvents(call.deltas.slice(2 * third, -1), false),
            ],
        ],
        { gapMs: 500, holdLast: true },
    )
    await page.goto("/", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    const canvas = page.frameLocator("iframe")

    await sendMessage(page, "Draw something wide")
    await expect(canvas.getByText("Far down", { exact: true })).toBeVisible({
        timeout: 15000,
    })
    for (const label of ["First", "Far right", "Far down"]) {
        await expect(canvas.getByText(label, { exact: true })).toBeInViewport()
    }
})
