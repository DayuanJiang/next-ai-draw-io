import { expect, test } from "@playwright/test"

test.describe("Settings", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("settings dialog opens", async ({ page }) => {
        const settingsButton = page.locator('[data-testid="settings-button"]')
        await expect(settingsButton).toBeVisible()
        await settingsButton.click()

        const dialog = page.locator('[role="dialog"]')
        await expect(dialog).toBeVisible({ timeout: 5000 })
    })

    test("language selection is available", async ({ page }) => {
        const settingsButton = page.locator('[data-testid="settings-button"]')
        await settingsButton.click()

        const dialog = page.locator('[role="dialog"]')
        await expect(dialog).toBeVisible({ timeout: 5000 })

        // Should have language selector showing English
        await expect(dialog.locator('text="English"')).toBeVisible()
    })

    test("draw.io theme toggle exists", async ({ page }) => {
        const settingsButton = page.locator('[data-testid="settings-button"]')
        await settingsButton.click()

        const dialog = page.locator('[role="dialog"]')
        await expect(dialog).toBeVisible({ timeout: 5000 })

        // Should have draw.io theme option (sketch or minimal)
        const themeText = dialog.locator("text=/sketch|minimal/i")
        await expect(themeText.first()).toBeVisible()
    })
})
