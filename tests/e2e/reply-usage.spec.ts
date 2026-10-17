import { expect, test } from "@playwright/test"
import { getIframe, openApp, sendMessage } from "./lib/fixtures"
import { sse, toolCallEvents } from "./lib/helpers"

const BOX = `<mxCell id="a" value="Alpha" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>`
// Rejected by the checks (a shape may not take the root's id): the chat
// sends the next request of the turn itself
const REJECTED = `<UserObject id="1" label="Bad" link="https://example.com"><mxCell vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell></UserObject>`

// What the server reports after each request: the second adds its own
// tokens and time to the first's, and the turn's cost
const FIRST = {
    inputTokens: 1000,
    outputTokens: 100,
    cacheReadTokens: 800,
    reasoningTokens: 0,
    durationMs: 3000,
}
const BOTH = {
    inputTokens: 12200,
    outputTokens: 130,
    cacheReadTokens: 800,
    reasoningTokens: 12,
    durationMs: 5400,
    costUsd: 0.03734,
}

const drawReply = (id: string, xml: string, usage: object) => {
    const call = toolCallEvents(id, "display_diagram", { xml })
    return sse([
        { type: "start" },
        call.start,
        ...call.deltas,
        call.done,
        { type: "finish", messageMetadata: { usage } },
    ])
}

test("an answer shows the tokens and time of all its requests", async ({
    page,
}) => {
    const bodies: any[] = []
    await page.route("**/api/chat", async (route) => {
        bodies.push(route.request().postDataJSON())
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body:
                bodies.length === 1
                    ? drawReply("u1", REJECTED, FIRST)
                    : drawReply("u2", BOX, BOTH),
        })
    })
    await openApp(page)
    await sendMessage(page, "Draw a box")
    await expect.poll(() => bodies.length, { timeout: 20000 }).toBe(2)
    // The retry carries what the first request used, for the server to add to
    expect(bodies[1].messages.at(-1).metadata.usage).toEqual(FIRST)

    const note = page.getByTestId("reply-usage")
    await expect(note).toHaveText("In 12.2K · Out 130 · 5s", {
        timeout: 15000,
    })
    await note.hover()
    const details = page.getByRole("tooltip")
    await expect(details).toContainText("Input12,200")
    await expect(details).toContainText("From cache800")
    await expect(details).toContainText("Thinking12")
    await expect(details).toContainText("Time5.4")
    await expect(details).toContainText("Estimated cost$0.0373")

    // Kept with the chat
    await page.waitForURL(/session=/)
    await page.reload({ waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    await expect(note).toHaveText("In 12.2K · Out 130 · 5s", {
        timeout: 15000,
    })
})

test("an answer without usage shows none", async ({ page }) => {
    await page.route("**/api/chat", (route) =>
        route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: sse([
                { type: "start" },
                { type: "text-start", id: "t" },
                { type: "text-delta", id: "t", delta: "Hello there." },
                { type: "text-end", id: "t" },
                { type: "finish" },
            ]),
        }),
    )
    await openApp(page)
    await sendMessage(page, "Hi")
    await expect(page.getByText("Hello there.")).toBeVisible({
        timeout: 15000,
    })
    await expect(page.getByTestId("reply-usage")).toHaveCount(0)
})
