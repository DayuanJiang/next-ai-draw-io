import { expect, getIframe, test } from "./lib/fixtures"

test.describe("File Upload Area", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    })

    test("page loads without console errors", async ({ page }) => {
        const errors: string[] = []
        page.on("pageerror", (err) => errors.push(err.message))

        await page.waitForTimeout(1000)

        const criticalErrors = errors.filter(
            (e) => !e.includes("ResizeObserver") && !e.includes("Script error"),
        )
        expect(criticalErrors).toEqual([])
    })
})
