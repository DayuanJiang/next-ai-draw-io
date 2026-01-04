import { TRUNCATED_XML } from "./fixtures/diagrams"
import {
    createErrorMock,
    expect,
    getChatInput,
    getIframe,
    sendMessage,
    test,
} from "./lib/fixtures"

test.describe("Error Handling", () => {
    test("displays error message when API returns 500", async ({ page }) => {
        await page.route(
            "**/api/chat",
            createErrorMock(500, "Internal server error"),
        )

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await sendMessage(page, "Draw a cat")

        // Should show error indication
        const errorIndicator = page
            .locator('[role="alert"]')
            .or(page.locator("[data-sonner-toast]"))
            .or(page.locator("text=/error|failed|something went wrong/i"))
        await expect(errorIndicator.first()).toBeVisible({ timeout: 10000 })

        // User should be able to type again
        const chatInput = getChatInput(page)
        await chatInput.fill("Retry message")
        await expect(chatInput).toHaveValue("Retry message")
    })

    test("displays error message when API returns 429 rate limit", async ({
        page,
    }) => {
        await page.route(
            "**/api/chat",
            createErrorMock(429, "Rate limit exceeded"),
        )

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await sendMessage(page, "Draw a cat")

        // Should show error indication for rate limit
        const errorIndicator = page
            .locator('[role="alert"]')
            .or(page.locator("[data-sonner-toast]"))
            .or(page.locator("text=/rate limit|too many|try again/i"))
        await expect(errorIndicator.first()).toBeVisible({ timeout: 10000 })

        // User should be able to type again
        const chatInput = getChatInput(page)
        await chatInput.fill("Retry after rate limit")
        await expect(chatInput).toHaveValue("Retry after rate limit")
    })

    test("handles network timeout gracefully", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 2000))
            await route.abort("timedout")
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await sendMessage(page, "Draw a cat")

        // Should show error indication for network failure
        const errorIndicator = page
            .locator('[role="alert"]')
            .or(page.locator("[data-sonner-toast]"))
            .or(page.locator("text=/error|failed|network|timeout/i"))
        await expect(errorIndicator.first()).toBeVisible({ timeout: 10000 })

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
                body:
                    events
                        .map((e) => `data: ${JSON.stringify(e)}\n\n`)
                        .join("") + "data: [DONE]\n\n",
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await sendMessage(page, "Draw something")

        // Should show truncated badge
        await expect(page.locator('text="Truncated"')).toBeVisible({
            timeout: 15000,
        })
    })
})
