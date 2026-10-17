import {
    chunkedReplies,
    expect,
    getChatInput,
    openApp,
    sendMessage,
    test,
} from "./lib/fixtures"
import { createTextOnlyResponse, sse, toolCallEvents } from "./lib/helpers"

test.describe("Crossing the mobile breakpoint", () => {
    test.beforeEach(async ({ page }) => {
        // A text answer that arrives in parts over a few seconds
        await chunkedReplies(
            page,
            [
                [
                    sse([{ type: "start" }], false),
                    sse([{ type: "text-start", id: "t" }], false),
                    sse(
                        [{ type: "text-delta", id: "t", delta: "Once upon" }],
                        false,
                    ),
                    sse(
                        [{ type: "text-delta", id: "t", delta: " a time." }],
                        false,
                    ),
                    sse([{ type: "text-end", id: "t" }], false),
                    sse([{ type: "finish" }]),
                ],
            ],
            { gapMs: 1500 },
        )
        await page.setViewportSize({ width: 1280, height: 800 })
        await openApp(page)
    })

    test("keeps the chat and its streaming answer", async ({ page }) => {
        await sendMessage(page, "Tell me a story")
        await expect(page.getByText("Once upon")).toBeVisible({
            timeout: 10000,
        })

        // Phones show the canvas or the chat, one at a time
        await page.setViewportSize({ width: 600, height: 900 })
        await page.getByRole("button", { name: "Chat", exact: true }).click()
        await expect(page.getByText("Tell me a story")).toBeVisible()

        await page.setViewportSize({ width: 1280, height: 800 })
        await expect(page.getByText("Once upon a time.")).toBeVisible({
            timeout: 10000,
        })
        await expect(page.getByText("Tell me a story")).toBeVisible()
    })

    test("reaches a chat hidden on desktop", async ({ page }) => {
        // The start screen has no chat panel yet
        await page.getByTestId("draw-yourself").click()
        await page.getByRole("button", { name: "Hide chat panel" }).click()
        await expect(getChatInput(page)).toBeHidden()

        await page.setViewportSize({ width: 600, height: 900 })
        await page.getByRole("button", { name: "Chat", exact: true }).click()
        await expect(getChatInput(page)).toBeVisible()

        await page.setViewportSize({ width: 1280, height: 800 })
        await page.getByTestId("show-panel").click()
        await expect(getChatInput(page)).toBeVisible()
    })
})

test.describe("Sending", () => {
    test("a double Enter sends the message once", async ({ page }) => {
        let requests = 0
        await page.route("**/api/chat", async (route) => {
            requests++
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createTextOnlyResponse("Hello there."),
            })
        })
        await openApp(page)
        const input = getChatInput(page)
        await input.fill("Hi")
        // The second press comes while the diagram is being exported
        await input.press("ControlOrMeta+Enter")
        await input.press("ControlOrMeta+Enter")
        await expect(page.getByText("Hello there.")).toBeVisible({
            timeout: 10000,
        })
        await page.waitForTimeout(1500)
        expect(requests).toBe(1)
        await expect(page.getByText("Hello there.")).toHaveCount(1)
    })
})

test.describe("Answers", () => {
    test("copy button copies response text", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createTextOnlyResponse(
                    "Here is your diagram with a test box.",
                ),
            })
        })
        await page
            .context()
            .grantPermissions(["clipboard-read", "clipboard-write"])
        await openApp(page)
        await sendMessage(page, "Create a test box")
        await expect(
            page.getByText("Here is your diagram with a test box."),
        ).toBeVisible({ timeout: 15000 })

        // The user's message has one too: the answer's is the last
        await page.getByRole("button", { name: "Copy response" }).last().click()
        // The button shows a check mark for a moment
        await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible(
            { timeout: 3000 },
        )
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
            "Here is your diagram with a test box.",
        )
    })
})

// GPT-6 Luna on Bedrock sends a tool call's input only once it is complete:
// after its plan sentence the chat sits still while it writes the diagram
test("a model drawing silently shows the time so far", async ({ page }) => {
    const call = toolCallEvents("silent-1", "display_diagram", {
        xml: '<mxCell id="2" value="Box" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>',
    })
    await chunkedReplies(page, [
        [
            sse(
                [
                    { type: "start" },
                    { type: "text-start", id: "t" },
                    { type: "text-delta", id: "t", delta: "I'll draw a box." },
                ],
                false,
            ),
            9000,
            sse(
                [
                    { type: "text-end", id: "t" },
                    call.start,
                    ...call.deltas,
                    call.done,
                ],
                false,
            ),
            sse([{ type: "finish" }]),
        ],
    ])
    await openApp(page)
    await sendMessage(page, "Draw a box")
    await expect(page.getByText("I'll draw a box.")).toBeVisible({
        timeout: 10000,
    })
    // Not while something new is still arriving
    const clock = page.getByTestId("silent-work")
    await expect(clock).toBeHidden()
    await expect(clock).toBeVisible({ timeout: 8000 })
    await expect(clock).toHaveText(/^Drawing… \d+ s$/)
    // Gone once the drawing arrives
    await expect(clock).toBeHidden({ timeout: 10000 })
    await expect(
        page.locator('[data-tool-state="output-available"]'),
    ).toHaveCount(1, {
        timeout: 10000,
    })
})
