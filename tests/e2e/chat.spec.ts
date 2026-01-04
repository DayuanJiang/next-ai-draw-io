import { expect, test } from "@playwright/test"

test.describe("Chat Panel", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("page has interactive elements", async ({ page }) => {
        // Verify buttons exist (settings, etc.)
        const buttons = page.locator("button")
        const count = await buttons.count()
        expect(count).toBeGreaterThan(0)
    })

    test("draw.io iframe is interactive", async ({ page }) => {
        const iframe = page.locator("iframe")
        await expect(iframe).toBeVisible()

        // Iframe should have loaded draw.io
        const src = await iframe.getAttribute("src")
        expect(src).toBeTruthy()
    })
})
