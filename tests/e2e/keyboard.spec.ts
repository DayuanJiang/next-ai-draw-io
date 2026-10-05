import { expect, getIframe, openSettings, test } from "./lib/fixtures"

test.describe("Keyboard Interactions", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    })

    test("Escape closes settings dialog", async ({ page }) => {
        await openSettings(page)

        const dialog = page.locator('[role="dialog"]')
        await expect(dialog).toBeVisible({ timeout: 5000 })

        await page.keyboard.press("Escape")
        await expect(dialog).not.toBeVisible({ timeout: 2000 })
    })

    test("page is keyboard accessible", async ({ page }) => {
        const focusableElements = page.locator(
            'button, [tabindex="0"], input, textarea, a[href]',
        )
        const count = await focusableElements.count()
        expect(count).toBeGreaterThan(0)
    })
})
