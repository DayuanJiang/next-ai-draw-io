import { expect, test } from "@playwright/test"

test.describe("Keyboard Interactions", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("Escape closes settings dialog", async ({ page }) => {
        // Find settings button using aria-label or icon
        const settingsButton = page.locator(
            'button[aria-label*="settings"], button:has(svg[class*="settings"])',
        )
        await expect(settingsButton).toBeVisible()
        await settingsButton.click()

        // Wait for dialog to appear
        const dialog = page.locator('[role="dialog"]')
        await expect(dialog).toBeVisible({ timeout: 5000 })

        // Press Escape and verify dialog closes
        await page.keyboard.press("Escape")
        await expect(dialog).not.toBeVisible({ timeout: 2000 })
    })

    test("page is keyboard accessible", async ({ page }) => {
        // Verify page has focusable elements
        const focusableElements = page.locator(
            'button, [tabindex="0"], input, textarea, a[href]',
        )
        const count = await focusableElements.count()
        expect(count).toBeGreaterThan(0)
    })
})
