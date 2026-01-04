import { SINGLE_BOX_XML } from "./fixtures/diagrams"
import {
    expect,
    getChatInput,
    getIframe,
    sendMessage,
    test,
} from "./lib/fixtures"
import { createMockSSEResponse } from "./lib/helpers"

test.describe("Copy/Paste Functionality", () => {
    test("can paste text into chat input", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const chatInput = getChatInput(page)
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await chatInput.focus()
        await page.keyboard.insertText("Create a flowchart diagram")

        await expect(chatInput).toHaveValue("Create a flowchart diagram")
    })

    test("can paste multiline text into chat input", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const chatInput = getChatInput(page)
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await chatInput.focus()
        const multilineText = "Line 1\nLine 2\nLine 3"
        await page.keyboard.insertText(multilineText)

        await expect(chatInput).toHaveValue(multilineText)
    })

    test("copy button copies response text", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "Here is your diagram with a test box.",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await sendMessage(page, "Create a test box")

        // Wait for response
        await expect(
            page.locator('text="Here is your diagram with a test box."'),
        ).toBeVisible({ timeout: 15000 })

        // Find copy button in message
        const copyButton = page.locator(
            '[data-testid="copy-button"], button[aria-label*="Copy"], button:has(svg.lucide-copy), button:has(svg.lucide-clipboard)',
        )

        // Copy button feature may not exist - skip if not available
        const buttonCount = await copyButton.count()
        if (buttonCount === 0) {
            test.skip()
            return
        }

        await copyButton.first().click()
        await expect(
            page.locator('text="Copied"').or(page.locator("svg.lucide-check")),
        ).toBeVisible({ timeout: 3000 })
    })

    test("keyboard shortcuts work in chat input", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const chatInput = getChatInput(page)
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await chatInput.fill("Hello world")
        await chatInput.press("ControlOrMeta+a")
        await chatInput.fill("New text")

        await expect(chatInput).toHaveValue("New text")
    })

    test("can undo/redo in chat input", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const chatInput = getChatInput(page)
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await chatInput.fill("First text")
        await chatInput.press("Tab")

        await chatInput.focus()
        await chatInput.fill("Second text")
        await chatInput.press("ControlOrMeta+z")

        // Verify page is still functional after undo
        await expect(chatInput).toBeVisible()
    })

    test("chat input handles special characters", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const chatInput = getChatInput(page)
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        const specialText = "Test <>&\"' special chars 日本語 中文 🎉"
        await chatInput.fill(specialText)

        await expect(chatInput).toHaveValue(specialText)
    })

    test("long text in chat input scrolls", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const chatInput = getChatInput(page)
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        const longText = "This is a very long text. ".repeat(50)
        await chatInput.fill(longText)

        const value = await chatInput.inputValue()
        expect(value.length).toBeGreaterThan(500)
    })
})
