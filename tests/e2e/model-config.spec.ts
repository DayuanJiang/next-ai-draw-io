import { expect, test } from "@playwright/test"

test.describe("Model Configuration", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("settings dialog opens and shows configuration options", async ({
        page,
    }) => {
        // Open settings
        const settingsButton = page.locator(
            'button[aria-label*="settings"], button:has(svg[class*="settings"])',
        )
        await expect(settingsButton).toBeVisible()
        await settingsButton.click()

        const dialog = page.locator('[role="dialog"]')
        await expect(dialog).toBeVisible({ timeout: 5000 })

        // Settings dialog should have some configuration UI
        const buttons = dialog.locator("button")
        const buttonCount = await buttons.count()
        expect(buttonCount).toBeGreaterThan(0)
    })
})
