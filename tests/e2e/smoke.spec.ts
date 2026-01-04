import { expect, getIframe, openSettings, test } from "./lib/fixtures"

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

    test("settings dialog opens", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await openSettings(page)
    })
})
