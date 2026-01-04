import { expect, getIframe, test } from "./lib/fixtures"

test.describe("Chat Panel", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    })

    test("page has interactive elements", async ({ page }) => {
        const buttons = page.locator("button")
        const count = await buttons.count()
        expect(count).toBeGreaterThan(0)
    })

    test("draw.io iframe is interactive", async ({ page }) => {
        const iframe = getIframe(page)
        await expect(iframe).toBeVisible()

        const src = await iframe.getAttribute("src")
        expect(src).toBeTruthy()
    })
})
