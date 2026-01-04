import {
    expect,
    getIframe,
    getSettingsButton,
    openSettings,
    test,
} from "./lib/fixtures"

test.describe("Settings", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    })

    test("settings dialog opens", async ({ page }) => {
        await openSettings(page)
        // openSettings already verifies dialog is visible
    })

    test("language selection is available", async ({ page }) => {
        await openSettings(page)

        const dialog = page.locator('[role="dialog"]')
        await expect(dialog.locator('text="English"')).toBeVisible()
    })

    test("draw.io theme toggle exists", async ({ page }) => {
        await openSettings(page)

        const dialog = page.locator('[role="dialog"]')
        const themeText = dialog.locator("text=/sketch|minimal/i")
        await expect(themeText.first()).toBeVisible()
    })
})
