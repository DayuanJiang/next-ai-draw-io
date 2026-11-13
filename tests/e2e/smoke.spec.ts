import { expect, getIframe, test } from "./lib/fixtures"

test.describe("Smoke Tests", () => {
    test("homepage loads without errors", async ({ page }) => {
        const errors: string[] = []
        page.on("pageerror", (err) => errors.push(err.message))

        await page.goto("/", { waitUntil: "networkidle" })
        await expect(page).toHaveTitle(/Draw\.io/i, { timeout: 10000 })

        const iframe = getIframe(page)
        await expect(iframe).toBeVisible({ timeout: 30000 })

        expect(errors).toEqual([])
    })

    test("Japanese locale page loads", async ({ page }) => {
        const errors: string[] = []
        page.on("pageerror", (err) => errors.push(err.message))

        await page.goto("/ja", { waitUntil: "networkidle" })
        await expect(page).toHaveTitle(/Draw\.io/i, { timeout: 10000 })

        const iframe = getIframe(page)
        await expect(iframe).toBeVisible({ timeout: 30000 })

        expect(errors).toEqual([])
    })

    test("the browser may keep the bundled draw.io", async ({ request }) => {
        // With Next's max-age=0 every visit asked the server about each of
        // draw.io's files again before the canvas could start
        const response = await request.get("/drawio/js/app.min.js")
        expect(response.headers()["cache-control"]).toBe(
            "public, max-age=14400",
        )
    })
})
