import { expect, test } from "@playwright/test"

test.describe("Error Handling", () => {
    test("displays error message when API returns 500", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ error: "Internal server error" }),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await chatInput.fill("Draw a cat")
        await chatInput.press("ControlOrMeta+Enter")

        // Should show error indication (toast, alert, or error text)
        const errorIndicator = page
            .locator('[role="alert"]')
            .or(page.locator("[data-sonner-toast]"))
            .or(page.locator("text=/error|failed|something went wrong/i"))
        await expect(errorIndicator.first()).toBeVisible({ timeout: 10000 })

        // User should be able to type again (input still functional)
        await chatInput.fill("Retry message")
        await expect(chatInput).toHaveValue("Retry message")
    })

    test("displays error message when API returns 429 rate limit", async ({
        page,
    }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 429,
                contentType: "application/json",
                body: JSON.stringify({ error: "Rate limit exceeded" }),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await chatInput.fill("Draw a cat")
        await chatInput.press("ControlOrMeta+Enter")

        // Should show error indication for rate limit
        const errorIndicator = page
            .locator('[role="alert"]')
            .or(page.locator("[data-sonner-toast]"))
            .or(page.locator("text=/rate limit|too many|try again/i"))
        await expect(errorIndicator.first()).toBeVisible({ timeout: 10000 })

        // User should be able to type again
        await chatInput.fill("Retry after rate limit")
        await expect(chatInput).toHaveValue("Retry after rate limit")
    })

    test("handles network timeout gracefully", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            // Simulate timeout by not responding for a short time then aborting
            await new Promise((resolve) => setTimeout(resolve, 2000))
            await route.abort("timedout")
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await chatInput.fill("Draw a cat")
        await chatInput.press("ControlOrMeta+Enter")

        // Should show error indication for network failure
        const errorIndicator = page
            .locator('[role="alert"]')
            .or(page.locator("[data-sonner-toast]"))
            .or(page.locator("text=/error|failed|network|timeout/i"))
        await expect(errorIndicator.first()).toBeVisible({ timeout: 10000 })

        // After timeout, user should be able to type again
        await chatInput.fill("Try again after timeout")
        await expect(chatInput).toHaveValue("Try again after timeout")
    })

    test("shows truncated badge for incomplete XML", async ({ page }) => {
        const toolCallId = `call_${Date.now()}`
        const textId = `text_${Date.now()}`
        const messageId = `msg_${Date.now()}`

        // Truncated XML (missing closing tags)
        const truncatedXml = `<mxCell id="node1" value="Start" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="100" height="40"`

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
                input: { xml: truncatedXml },
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
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await chatInput.fill("Draw something")
        await chatInput.press("ControlOrMeta+Enter")

        // Should show truncated badge
        await expect(page.locator('text="Truncated"')).toBeVisible({
            timeout: 15000,
        })
    })
})
