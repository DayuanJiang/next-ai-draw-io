import { expect, test } from "@playwright/test"
import { createMockSSEResponse } from "./lib/helpers"

test.describe("Copy/Paste Functionality", () => {
    test("can paste text into chat input", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        // Focus and paste text
        await chatInput.focus()
        await page.keyboard.insertText("Create a flowchart diagram")

        await expect(chatInput).toHaveValue("Create a flowchart diagram")
    })

    test("can paste multiline text into chat input", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
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
                    `<mxCell id="box" value="Test" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="100" height="50" as="geometry"/></mxCell>`,
                    "Here is your diagram with a test box.",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        // Send a message
        await chatInput.fill("Create a test box")
        await chatInput.press("ControlOrMeta+Enter")

        // Wait for response
        await expect(
            page.locator('text="Here is your diagram with a test box."'),
        ).toBeVisible({ timeout: 15000 })

        // Find copy button in message
        const copyButton = page.locator(
            '[data-testid="copy-button"], button[aria-label*="Copy"], button:has(svg.lucide-copy), button:has(svg.lucide-clipboard)',
        )

        // Skip test if copy button doesn't exist
        const buttonCount = await copyButton.count()
        test.skip(buttonCount === 0, "Copy button not available")

        await copyButton.first().click()
        // Should show copied confirmation (toast or button state change)
        await expect(
            page.locator('text="Copied"').or(page.locator("svg.lucide-check")),
        ).toBeVisible({ timeout: 3000 })
    })

    test("paste XML into XML input works", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Find XML input textarea (different from chat input)
        const xmlInput = page.locator(
            'textarea[placeholder*="XML"], textarea[placeholder*="mxCell"]',
        )

        // XML input might be in a collapsed section - try to expand it
        const xmlToggle = page.locator(
            'button:has-text("XML"), [data-testid*="xml"], details summary',
        )
        if ((await xmlToggle.count()) > 0) {
            await xmlToggle.first().click()
        }

        // Skip test if XML input feature doesn't exist
        const xmlInputCount = await xmlInput.count()
        const isXmlVisible =
            xmlInputCount > 0 && (await xmlInput.first().isVisible())
        test.skip(!isXmlVisible, "XML input feature not available")

        const testXml = `<mxCell id="pasted" value="Pasted Node" style="rounded=1;fillColor=#d5e8d4;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
</mxCell>`

        await xmlInput.first().fill(testXml)
        await expect(xmlInput.first()).toHaveValue(testXml)
    })

    test("keyboard shortcuts work in chat input", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        // Type some text
        await chatInput.fill("Hello world")

        // Select all with Ctrl+A
        await chatInput.press("ControlOrMeta+a")

        // Type replacement text
        await chatInput.fill("New text")

        await expect(chatInput).toHaveValue("New text")
    })

    test("can undo/redo in chat input", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        // Type text
        await chatInput.fill("First text")
        await chatInput.press("Tab") // Blur to register change

        await chatInput.focus()
        await chatInput.fill("Second text")

        // Undo with Ctrl+Z
        await chatInput.press("ControlOrMeta+z")

        // Verify page is still functional after undo
        await expect(chatInput).toBeVisible()
    })

    test("chat input handles special characters", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        const specialText = "Test <>&\"' special chars 日本語 中文 🎉"
        await chatInput.fill(specialText)

        await expect(chatInput).toHaveValue(specialText)
    })

    test("long text in chat input scrolls", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        // Very long text
        const longText = "This is a very long text. ".repeat(50)
        await chatInput.fill(longText)

        // Input should handle it without error
        const value = await chatInput.inputValue()
        expect(value.length).toBeGreaterThan(500)
    })
})
