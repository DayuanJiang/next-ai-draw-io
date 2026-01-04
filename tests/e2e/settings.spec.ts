import { expect, test } from "@playwright/test"

test.describe("Settings", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("dark mode toggle works", async ({ page }) => {
        // Open settings
        const settingsButton = page.locator(
            'button[aria-label*="settings"], button:has(svg[class*="settings"])',
        )
        await settingsButton.click()

        const dialog = page.locator('[role="dialog"]')
        await expect(dialog).toBeVisible({ timeout: 5000 })

        // Find dark mode toggle
        const darkModeButton = dialog.locator(
            'button:has(svg[class*="moon"]), button:has(svg[class*="sun"])',
        )

        if (await darkModeButton.isVisible()) {
            // Get initial state
            const htmlClass = await page.locator("html").getAttribute("class")
            const wasDark = htmlClass?.includes("dark")

            // Click toggle
            await darkModeButton.click()

            // Verify state changed
            const newClass = await page.locator("html").getAttribute("class")
            const isDark = newClass?.includes("dark")

            expect(isDark).not.toBe(wasDark)
        }
    })

    test("language selection is available", async ({ page }) => {
        // Open settings
        const settingsButton = page.locator(
            'button[aria-label*="settings"], button:has(svg[class*="settings"])',
        )
        await settingsButton.click()

        const dialog = page.locator('[role="dialog"]')
        await expect(dialog).toBeVisible({ timeout: 5000 })

        // Should have language selector
        await expect(dialog.locator('text="English"')).toBeVisible()
    })

    test("draw.io theme toggle exists", async ({ page }) => {
        // Open settings
        const settingsButton = page.locator(
            'button[aria-label*="settings"], button:has(svg[class*="settings"])',
        )
        await settingsButton.click()

        const dialog = page.locator('[role="dialog"]')
        await expect(dialog).toBeVisible({ timeout: 5000 })

        // Should have draw.io theme option
        const themeText = dialog.locator("text=/sketch|minimal/i")
        await expect(themeText.first()).toBeVisible()
    })
})
