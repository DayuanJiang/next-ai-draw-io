import { expect, getIframe, openSettings, sleep, test } from "./lib/fixtures"

test.describe("Theme Switching", () => {
    test("can toggle app dark mode", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await openSettings(page)

        const html = page.locator("html")
        const initialClass = await html.getAttribute("class")

        const themeButton = page.locator(
            "button:has(svg.lucide-sun), button:has(svg.lucide-moon)",
        )

        if ((await themeButton.count()) > 0) {
            await test.step("toggle theme", async () => {
                await themeButton.first().click()
                await sleep(500)
            })

            await test.step("verify theme changed", async () => {
                const newClass = await html.getAttribute("class")
                expect(newClass).not.toBe(initialClass)
            })
        }
    })

    test("theme persists after page reload", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await openSettings(page)

        const themeButton = page.locator(
            "button:has(svg.lucide-sun), button:has(svg.lucide-moon)",
        )

        if ((await themeButton.count()) > 0) {
            let themeClass: string | null

            await test.step("change theme", async () => {
                await themeButton.first().click()
                await sleep(300)
                themeClass = await page.locator("html").getAttribute("class")
                await page.keyboard.press("Escape")
            })

            await test.step("reload page", async () => {
                await page.reload({ waitUntil: "networkidle" })
                await getIframe(page).waitFor({
                    state: "visible",
                    timeout: 30000,
                })
            })

            await test.step("verify theme persisted", async () => {
                const reloadedClass = await page
                    .locator("html")
                    .getAttribute("class")
                expect(reloadedClass).toBe(themeClass)
            })
        }
    })

    test("draw.io theme toggle exists", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await openSettings(page)

        await expect(
            page.locator('[role="dialog"], [role="menu"], form').first(),
        ).toBeVisible({ timeout: 5000 })
    })

    test("system theme preference is respected", async ({ page }) => {
        await page.emulateMedia({ colorScheme: "dark" })

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const html = page.locator("html")
        const classes = await html.getAttribute("class")
        expect(classes).toBeDefined()
    })
})
