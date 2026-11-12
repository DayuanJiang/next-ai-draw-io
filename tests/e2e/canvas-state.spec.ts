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

test("a shape an edit adds outside the window comes into view, unless the user looks at a part of the diagram", async ({
    page,
}) => {
    const add = (id: string, label: string, x: number, y: number) =>
        sse([
            { type: "start", messageId: `msg_${id}` },
            {
                type: "tool-input-start",
                toolCallId: `call_${id}`,
                toolName: "edit_diagram",
            },
            {
                type: "tool-input-available",
                toolCallId: `call_${id}`,
                toolName: "edit_diagram",
                input: {
                    operations: [
                        {
                            operation: "add",
                            cell_id: id,
                            new_xml: `<mxCell id="${id}" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/></mxCell>`,
                        },
                    ],
                },
            },
            { type: "finish" },
        ])
    await mockChat(page, [
        drawing(BOX),
        add("below", "Far below", 100, 1500),
        add("right", "Far right", 2400, 100),
    ])
    await page.goto("/", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    const canvas = page.frameLocator("iframe")
    const service = canvas.getByText("Service", { exact: true })
    const below = canvas.getByText("Far below", { exact: true })

    await sendMessage(page, "Draw a service")
    await waitForCompleteCount(page, 1)
    // Past the time a resize fits the new diagram again
    await page.waitForTimeout(4500)
    // The whole diagram is in view: it stays so when an edit makes it grow
    await sendMessage(page, "Add a box far below")
    await waitForCompleteCount(page, 2)
    await expect(service).toBeInViewport()
    await expect(below).toBeInViewport()

    // The user zooms in on the middle of the diagram: that view is theirs
    await canvas
        .locator(".geDiagramContainer")
        .click({ position: { x: 20, y: 20 } })
    for (let i = 0; i < 4; i++) {
        await page.keyboard.press("ControlOrMeta+Equal")
    }
    await expect(below).not.toBeInViewport()
    // (draw.io applies a zoom key up to 0.6 s later)
    await page.waitForTimeout(1000)
    const place = await service.boundingBox()
    await sendMessage(page, "Add a box far right")
    await waitForCompleteCount(page, 3)
    await expect(
        canvas.getByText("Far right", { exact: true }),
    ).not.toBeInViewport()
    expect(await service.boundingBox()).toEqual(place)
})

/** draw.io's zoom: 1 is 100% */
function zoomOf(page: Page) {
    return page
        .frameLocator("iframe")
        .locator("body")
        .evaluate((body) => {
            const w = body.ownerDocument.defaultView as any
            let scale = 0
            // draw.io keeps no global editor; in embed mode Draw.loadPlugin
            // hands it to the callback at once
            w.Draw.loadPlugin((ui: any) => {
                scale = ui.editor.graph.view.scale
            })
            return scale
        })
}

const cell = (id: string, label: string, x: number, y: number) =>
    `<mxCell id="${id}" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/></mxCell>`

test("a diagram is back at its zoom and place when an edit that zoomed out to show its preview is stopped", async ({
    page,
}) => {
    const call = toolCallEvents("far", "edit_diagram", {
        operations: [
            {
                operation: "add",
                cell_id: "far",
                new_xml: cell("far", "Far away", 2400, 1500),
            },
            {
                operation: "add",
                cell_id: "late",
                new_xml: cell("late", "Late", 100, 300),
            },
        ],
    })
    // The second operation never completes: the canvas shows a preview
    await chunkedReplies(
        page,
        [
            [drawing(BOX)],
            [
                sseEvents(
                    [
                        { type: "start" },
                        call.start,
                        ...call.deltas.slice(0, -3),
                    ],
                    false,
                ),
            ],
        ],
        { holdLast: true },
    )
    await page.goto("/", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    const canvas = page.frameLocator("iframe")
    const service = canvas.getByText("Service", { exact: true })
    const far = canvas.getByText("Far away", { exact: true })

    await sendMessage(page, "Draw a service")
    await waitForCompleteCount(page, 1)
    // Past the time a resize fits the new diagram again
    await page.waitForTimeout(4500)
    expect(await zoomOf(page)).toBe(1)
    const place = await service.boundingBox()

    await sendMessage(page, "Add a box far away")
    await expect(far).toBeInViewport({ timeout: 15000 })
    await expect(service).toBeInViewport()
    expect(await zoomOf(page)).toBeLessThan(0.5)

    await page.getByRole("button", { name: "Stop generation" }).click()
    await expect(far).toHaveCount(0, { timeout: 15000 })
    await expect.poll(() => zoomOf(page)).toBe(1)
    const back = await service.boundingBox()
    expect(Math.abs((back?.x ?? 0) - (place?.x ?? 0))).toBeLessThan(2)
    expect(Math.abs((back?.y ?? 0) - (place?.y ?? 0))).toBeLessThan(2)
})

test("undoing the first drawing, which empties the canvas, keeps the zoom", async ({
    page,
}) => {
    // Larger than the window, and away from the page's corner
    await mockChat(page, [
        drawing(
            cell("a", "First", 400, 300) +
                cell("b", "Right", 2400, 300) +
                cell("c", "Down", 400, 1800),
        ),
    ])
    await page.goto("/", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    const first = page
        .frameLocator("iframe")
        .getByText("First", { exact: true })

    await sendMessage(page, "Draw something wide")
    await waitForCompleteCount(page, 1)
    // Past the time a resize fits the new diagram again
    await page.waitForTimeout(4500)
    const fitted = await zoomOf(page)
    expect(fitted).toBeLessThan(0.5)

    const undo = page.locator('[data-testid="version-undo"]')
    await undo.click()
    await expect(first).toHaveCount(0)
    await page.waitForTimeout(1000)
    expect(await zoomOf(page)).toBe(fitted)
    // Redone: fitted as before
    await undo.click()
    await expect(first).toBeInViewport()
    expect(await zoomOf(page)).toBeCloseTo(fitted, 2)
})

test("an edit that deletes every shape keeps the zoom, also when its preview emptied the canvas first", async ({
    page,
}) => {
    const input = {
        operations: ["a", "b", "c"].map((cell_id) => ({
            operation: "delete",
            cell_id,
        })),
    }
    // Two chunks: the three operations, then the "]}" that ends the JSON.
    // Between them the canvas shows the preview, without shapes
    const call = toolCallEvents(
        "clear",
        "edit_diagram",
        input,
        JSON.stringify(input).length - 2,
    )
    await chunkedReplies(page, [
        [
            drawing(
                cell("a", "First", 400, 300) +
                    cell("b", "Right", 2400, 300) +
                    cell("c", "Down", 400, 1800),
            ),
        ],
        [
            sseEvents([{ type: "start" }, call.start, call.deltas[0]], false),
            1500,
            sseEvents([call.deltas[1], call.done, { type: "finish" }]),
        ],
    ])
    await page.goto("/", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    const first = page
        .frameLocator("iframe")
        .getByText("First", { exact: true })

    await sendMessage(page, "Draw something wide")
    await waitForCompleteCount(page, 1)
    // Past the time a resize fits the new diagram again
    await page.waitForTimeout(4500)
    const fitted = await zoomOf(page)
    expect(fitted).toBeLessThan(0.5)

    await sendMessage(page, "Delete everything")
    await expect(first).toHaveCount(0)
    await waitForCompleteCount(page, 2)
    await page.waitForTimeout(1000)
    expect(await zoomOf(page)).toBe(fitted)
})
