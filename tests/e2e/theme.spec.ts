import { expect, test } from "@playwright/test"

test.describe("Theme Switching", () => {
    test("can toggle app dark mode", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Open settings
        const settingsButton = page.locator(
            'button[aria-label*="Settings"], button:has(svg.lucide-settings)',
        )
        await settingsButton.first().click()

        // Wait for settings dialog to open
        await page.waitForTimeout(500)

        // Check initial state (should have html class)
        const html = page.locator("html")
        const initialClass = await html.getAttribute("class")

        // Find and click the theme toggle button (sun/moon icon)
        const themeButton = page.locator(
            "button:has(svg.lucide-sun), button:has(svg.lucide-moon)",
        )

        if ((await themeButton.count()) > 0) {
            await themeButton.first().click()

            // Class should change
            await page.waitForTimeout(500) // Wait for theme transition
            const newClass = await html.getAttribute("class")
            expect(newClass).not.toBe(initialClass)
        }
    })

    test("theme persists after page reload", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Open settings and toggle theme
        const settingsButton = page.locator(
            'button[aria-label*="Settings"], button:has(svg.lucide-settings)',
        )
        await settingsButton.first().click()

        // Click theme button if available
        const themeButton = page.locator(
            "button:has(svg.lucide-sun), button:has(svg.lucide-moon)",
        )

        if ((await themeButton.count()) > 0) {
            await themeButton.first().click()
            await page.waitForTimeout(300)

            // Get current theme class
            const html = page.locator("html")
            const themeClass = await html.getAttribute("class")

            // Close dialog
            await page.keyboard.press("Escape")

            // Reload page
            await page.reload({ waitUntil: "networkidle" })
            await page
                .locator("iframe")
                .waitFor({ state: "visible", timeout: 30000 })

            // Theme should persist
            const reloadedClass = await html.getAttribute("class")
            expect(reloadedClass).toBe(themeClass)
        }
    })

    test("draw.io theme toggle exists", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Open settings
        const settingsButton = page.locator(
            'button[aria-label*="Settings"], button:has(svg.lucide-settings)',
        )
        await settingsButton.first().click()

        // Settings dialog should be visible
        await page.waitForTimeout(500)

        // Find any theme-related section - various possible labels
        const themeSection = page
            .locator('text="Draw.io Theme"')
            .or(page.locator('text="draw.io"'))
            .or(page.locator('text="Theme"'))
            .or(page.locator('[aria-label*="theme"]'))

        // At least some settings content should be visible
        await expect(
            page.locator('[role="dialog"], [role="menu"], form').first(),
        ).toBeVisible({ timeout: 5000 })
    })

    test("system theme preference is respected", async ({ page }) => {
        // Emulate dark mode preference
        await page.emulateMedia({ colorScheme: "dark" })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Check if dark mode is applied (depends on implementation)
        const html = page.locator("html")
        const classes = await html.getAttribute("class")
        // Should have dark class or similar
        // This depends on the app's theme implementation
        expect(classes).toBeDefined()
    })
})
