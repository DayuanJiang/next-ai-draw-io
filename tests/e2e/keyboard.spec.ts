import { expect, openApp, openSettings, test } from "./lib/fixtures"

test.describe("Keyboard Interactions", () => {
    test.beforeEach(async ({ page }) => {
        await openApp(page)
    })

    test("Escape closes settings dialog", async ({ page }) => {
        await openSettings(page)

        const dialog = page.locator('[role="dialog"]')
        await expect(dialog).toBeVisible({ timeout: 5000 })

        await page.keyboard.press("Escape")
        await expect(dialog).not.toBeVisible({ timeout: 2000 })
    })
})
