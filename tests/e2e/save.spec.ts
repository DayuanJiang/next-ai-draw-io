import { expect, test } from "@playwright/test"

test.describe("Save Dialog", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("save/download buttons exist", async ({ page }) => {
        // Check that buttons with icons exist (save/download functionality)
        const buttons = page
            .locator("button")
            .filter({ has: page.locator("svg") })
        const count = await buttons.count()
        expect(count).toBeGreaterThan(0)
    })
})
