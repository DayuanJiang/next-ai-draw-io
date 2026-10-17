import { TRUNCATED_XML } from "./fixtures/diagrams"
import {
    expect,
    getChatInput,
    openApp,
    sendMessage,
    test,
} from "./lib/fixtures"
import { sse } from "./lib/helpers"

test.describe("Error Handling", () => {
    test("handles network timeout gracefully", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 2000))
            await route.abort("timedout")
        })

        await openApp(page)

        await sendMessage(page, "Draw a cat")

        // Should show error indication for network failure
        await expect(
            page.getByRole("alert").filter({
                hasText: "Network error. Please check your connection.",
            }),
        ).toBeVisible({ timeout: 10000 })

        // After timeout, user should be able to type again
        const chatInput = getChatInput(page)
        await chatInput.fill("Try again after timeout")
        await expect(chatInput).toHaveValue("Try again after timeout")
    })

    test("shows truncated badge for incomplete XML", async ({ page }) => {
        const toolCallId = `call_${Date.now()}`
        const textId = `text_${Date.now()}`
        const messageId = `msg_${Date.now()}`

        const events = [
            { type: "start", messageId },
            { type: "text-start", id: textId },
            { type: "text-delta", id: textId, delta: "Creating diagram..." },
            { type: "text-end", id: textId },
            {
                type: "tool-input-start",
                toolCallId,
                toolName: "display_diagram",
            },
            {
                type: "tool-input-available",
                toolCallId,
                toolName: "display_diagram",
                input: { xml: TRUNCATED_XML },
            },
            {
                type: "tool-output-error",
                toolCallId,
                error: "XML validation failed",
            },
            { type: "finish" },
        ]

        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: sse(events),
            })
        })

        await openApp(page)

        await sendMessage(page, "Draw something")

        // Should show truncated badge
        await expect(page.locator('text="Truncated"')).toBeVisible({
            timeout: 15000,
        })
    })

    test("shows the error of a tool call with broken input", async ({
        page,
    }) => {
        // Invalid JSON that the server could not repair: not a length limit
        const toolCallId = `call_${Date.now()}`
        const events = [
            { type: "start", messageId: `msg_${Date.now()}` },
            {
                type: "tool-input-start",
                toolCallId,
                toolName: "display_diagram",
            },
            {
                type: "tool-input-error",
                toolCallId,
                toolName: "display_diagram",
                input: '{"xml": "<mxCell value="a"/>"}',
                errorText: "Invalid input for tool display_diagram",
            },
            { type: "finish" },
        ]
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: sse(events),
            })
        })
        await openApp(page)
        await sendMessage(page, "Draw something")

        // The failed call's row opens to show the error
        const failed = page
            .locator('[data-testid="tool-row"][data-tool-state="output-error"]')
            .first()
        await failed.getByRole("button").first().click({ timeout: 15000 })
        await expect(
            page.getByText("Invalid input for tool display_diagram").first(),
        ).toBeVisible()
        await expect(page.locator('text="Truncated"')).toHaveCount(0)
    })
})
