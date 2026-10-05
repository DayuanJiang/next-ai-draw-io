import { expect, getIframe, openSettings, test } from "./lib/fixtures"

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

    test("max output tokens is editable and persists", async ({ page }) => {
        await openSettings(page)

        const input = page.locator("#max-output-tokens")
        await expect(input).toBeVisible()

        await input.fill("48000")
        await expect
            .poll(() =>
                page.evaluate(() =>
                    localStorage.getItem("next-ai-draw-io-max-output-tokens"),
                ),
            )
            .toBe("48000")

        // Non-digits are dropped so the header always carries a plain number
        await input.fill("12k000")
        await expect(input).toHaveValue("12000")
    })

    test("draw.io theme toggle exists", async ({ page }) => {
        await openSettings(page)

        const dialog = page.locator('[role="dialog"]')
        const themeText = dialog.locator("text=/sketch|minimal/i")
        await expect(themeText.first()).toBeVisible()
    })
})
