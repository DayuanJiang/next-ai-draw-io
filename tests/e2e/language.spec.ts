import { expect, test } from "@playwright/test"

test.describe("Language Switching", () => {
    test("loads English by default", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Check for English UI text
        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        // Send button should say "Send"
        await expect(page.locator('button:has-text("Send")')).toBeVisible()
    })

    test("can switch to Japanese", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Open settings
        const settingsButton = page.locator(
            'button[aria-label*="Settings"], button:has(svg.lucide-settings)',
        )
        await settingsButton.first().click()

        // Find language selector
        const languageSelector = page.locator('button:has-text("English")')
        await languageSelector.first().click()

        // Select Japanese
        await page.locator('text="日本語"').click()

        // UI should update to Japanese
        await expect(page.locator('button:has-text("送信")')).toBeVisible({
            timeout: 5000,
        })
    })

    test("can switch to Chinese", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Open settings
        const settingsButton = page.locator(
            'button[aria-label*="Settings"], button:has(svg.lucide-settings)',
        )
        await settingsButton.first().click()

        // Find language selector and switch to Chinese
        const languageSelector = page.locator('button:has-text("English")')
        await languageSelector.first().click()

        await page.locator('text="中文"').click()

        // UI should update to Chinese
        await expect(page.locator('button:has-text("发送")')).toBeVisible({
            timeout: 5000,
        })
    })

    test("language persists after reload", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Open settings and switch to Japanese
        const settingsButton = page.locator(
            'button[aria-label*="Settings"], button:has(svg.lucide-settings)',
        )
        await settingsButton.first().click()

        const languageSelector = page.locator('button:has-text("English")')
        await languageSelector.first().click()
        await page.locator('text="日本語"').click()

        // Verify Japanese UI
        await expect(page.locator('button:has-text("送信")')).toBeVisible({
            timeout: 5000,
        })

        // Close dialog and reload
        await page.keyboard.press("Escape")
        await page.waitForTimeout(500)

        // Use domcontentloaded to avoid networkidle timeout
        await page.reload({ waitUntil: "domcontentloaded" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Japanese should persist
        await expect(page.locator('button:has-text("送信")')).toBeVisible({
            timeout: 10000,
        })
    })

    test("Japanese locale URL works", async ({ page }) => {
        await page.goto("/ja", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Should show Japanese UI
        await expect(page.locator('button:has-text("送信")')).toBeVisible({
            timeout: 10000,
        })
    })

    test("Chinese locale URL works", async ({ page }) => {
        await page.goto("/zh", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Should show Chinese UI
        await expect(page.locator('button:has-text("发送")')).toBeVisible({
            timeout: 10000,
        })
    })
})
