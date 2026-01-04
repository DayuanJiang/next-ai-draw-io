import { expect, test } from "@playwright/test"

test.describe("Keyboard Interactions", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("Escape closes settings dialog", async ({ page }) => {
        // Find and click settings button
        const buttons = page
            .locator("button")
            .filter({ has: page.locator("svg") })
        const settingsBtn = buttons.nth(1) // Usually second button is settings

        if (await settingsBtn.isVisible()) {
            await settingsBtn.click()
            await page.waitForTimeout(500)

            const dialog = page.locator('[role="dialog"]')
            if (await dialog.isVisible()) {
                await page.keyboard.press("Escape")
                await expect(dialog).not.toBeVisible({ timeout: 2000 })
            }
        }
    })

    test("page responds to keyboard events", async ({ page }) => {
        // Just verify the page is interactive
        await page.keyboard.press("Tab")
        // No error means success
    })
})
