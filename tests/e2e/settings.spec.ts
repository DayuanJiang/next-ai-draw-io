import {
    expect,
    getIframe,
    openSettings,
    openSettingsTab,
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
        await openSettingsTab(page, "general")

        const dialog = page.locator('[role="dialog"]')
        await expect(dialog.locator("#language-select")).toHaveText(/English/)
    })

    test("max output tokens is editable and persists", async ({ page }) => {
        await openSettingsTab(page, "drawing")

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

    test("theme can be light, dark or follow the system", async ({ page }) => {
        await openSettingsTab(page, "general")

        const dialog = page.locator('[role="dialog"]')
        for (const name of ["Light", "Dark", "System"]) {
            await expect(dialog.getByRole("radio", { name })).toBeVisible()
        }
        await dialog.getByRole("radio", { name: "Dark" }).click()
        await expect(page.locator("html")).toHaveClass(/dark/)
    })
})
