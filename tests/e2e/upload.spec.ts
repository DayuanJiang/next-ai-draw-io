import { expect, test } from "@playwright/test"

test.describe("File Upload Area", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("page loads without console errors", async ({ page }) => {
        const errors: string[] = []
        page.on("pageerror", (err) => errors.push(err.message))

        // Give page time to settle
        await page.waitForTimeout(1000)

        // Filter out non-critical errors
        const criticalErrors = errors.filter(
            (e) => !e.includes("ResizeObserver") && !e.includes("Script error"),
        )
        expect(criticalErrors).toEqual([])
    })
})
