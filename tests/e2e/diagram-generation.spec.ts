import { CAT_DIAGRAM_XML } from "./fixtures/diagrams"
import { expect, getChatInput, openApp, test } from "./lib/fixtures"
import { createMockSSEResponse } from "./lib/helpers"

test.describe("Diagram Generation", () => {
    test.beforeEach(async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    CAT_DIAGRAM_XML,
                    "I'll create a diagram for you.",
                ),
            })
        })

        await openApp(page)
    })

    test("chat input clears after sending", async ({ page }) => {
        const chatInput = getChatInput(page)
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await chatInput.fill("Draw a cat")
        await chatInput.press("ControlOrMeta+Enter")

        await expect(chatInput).toHaveValue("", { timeout: 5000 })
    })
})
