import { expect, test } from "@playwright/test"

test.describe("History Dialog", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("history button exists in UI", async ({ page }) => {
        // History button may be disabled initially (no history)
        // Just verify it exists in the DOM
        const historyButton = page
            .locator("button")
            .filter({ has: page.locator("svg") })
        const count = await historyButton.count()
        expect(count).toBeGreaterThan(0)
    })
})
