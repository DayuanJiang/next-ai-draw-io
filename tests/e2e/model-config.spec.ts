import { expect, getIframe, openSettings, test } from "./lib/fixtures"

test.describe("Model Configuration", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    })

    test("settings dialog opens and shows configuration options", async ({
        page,
    }) => {
        await openSettings(page)

        const dialog = page.locator('[role="dialog"]')
        const buttons = dialog.locator("button")
        const buttonCount = await buttons.count()
        expect(buttonCount).toBeGreaterThan(0)
    })
})
