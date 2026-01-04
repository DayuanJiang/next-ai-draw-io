import { expect, test } from "@playwright/test"

test.describe("Smoke Tests", () => {
    test("homepage loads without errors", async ({ page }) => {
        const errors: string[] = []
        page.on("pageerror", (err) => errors.push(err.message))

        await page.goto("/", { waitUntil: "networkidle" })
        await expect(page).toHaveTitle(/Draw\.io/i, { timeout: 10000 })

        // Wait for draw.io iframe to be present
        const iframe = page.locator("iframe")
        await expect(iframe).toBeVisible({ timeout: 30000 })

        expect(errors).toEqual([])
    })

    test("Japanese locale page loads", async ({ page }) => {
        const errors: string[] = []
        page.on("pageerror", (err) => errors.push(err.message))

        await page.goto("/ja", { waitUntil: "networkidle" })
        await expect(page).toHaveTitle(/Draw\.io/i, { timeout: 10000 })

        const iframe = page.locator("iframe")
        await expect(iframe).toBeVisible({ timeout: 30000 })

        expect(errors).toEqual([])
    })

    test("settings dialog opens", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })

        // Wait for page to load
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Click settings button (gear icon)
        const settingsButton = page.locator(
            'button[aria-label*="settings"], button:has(svg[class*="settings"])',
        )
        await expect(settingsButton).toBeVisible()
        await settingsButton.click()

        // Check if settings dialog appears
        await expect(page.locator('[role="dialog"]')).toBeVisible({
            timeout: 5000,
        })
    })
})
