import { ARCHITECTURE_XML, createBoxXml } from "./fixtures/diagrams"
import {
    createMixedMock,
    createMultiTurnMock,
    expect,
    sendMessage,
    test,
    waitForComplete,
    waitForText,
} from "./lib/fixtures"
import { createTextOnlyResponse } from "./lib/helpers"

test.describe("Multi-turn Conversation", () => {
    test("handles multiple diagram requests in sequence", async ({ page }) => {
        await page.route(
            "**/api/chat",
            createMultiTurnMock([
                {
                    xml: createBoxXml("box1", "First"),
                    text: "Creating diagram 1...",
                },
                {
                    xml: createBoxXml("box2", "Second", 200),
                    text: "Creating diagram 2...",
                },
            ]),
        )

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // First request
        await sendMessage(page, "Draw first box")
        await waitForText(page, "Creating diagram 1...")

        // Second request
        await sendMessage(page, "Draw second box")
        await waitForText(page, "Creating diagram 2...")

        // Both messages should be visible
        await expect(page.locator('text="Draw first box"')).toBeVisible()
        await expect(page.locator('text="Draw second box"')).toBeVisible()
    })

    test("preserves conversation history", async ({ page }) => {
        let requestCount = 0
        await page.route("**/api/chat", async (route) => {
            requestCount++
            const request = route.request()
            const body = JSON.parse(request.postData() || "{}")

            // Verify messages array grows with each request
            if (requestCount === 2) {
                expect(body.messages?.length).toBeGreaterThan(1)
            }

            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createTextOnlyResponse(`Response ${requestCount}`),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // First message
        await sendMessage(page, "Hello")
        await waitForText(page, "Response 1")

        // Second message (should include history)
        await sendMessage(page, "Follow up question")
        await waitForText(page, "Response 2")
    })

    test("can continue after a text-only response", async ({ page }) => {
        await page.route(
            "**/api/chat",
            createMixedMock([
                {
                    type: "text",
                    text: "I understand. Let me explain the architecture first.",
                },
                {
                    type: "diagram",
                    xml: ARCHITECTURE_XML,
                    text: "Here is the diagram:",
                },
            ]),
        )

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Ask for explanation first
        await sendMessage(page, "Explain the architecture")
        await waitForText(
            page,
            "I understand. Let me explain the architecture first.",
        )

        // Then ask for diagram
        await sendMessage(page, "Now show it as a diagram")
        await waitForComplete(page)
    })
})
