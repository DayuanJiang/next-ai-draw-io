import { expect, getIframe, test } from "./lib/fixtures"

test.describe("Save Dialog", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    })

    test("save/download buttons exist", async ({ page }) => {
        const buttons = page
            .locator("button")
            .filter({ has: page.locator("svg") })
        const count = await buttons.count()
        expect(count).toBeGreaterThan(0)
    })
})
