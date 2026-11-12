import {
    expect,
    openApp,
    openSettingsTab,
    sendMessage,
    test,
} from "./lib/fixtures"

test.describe("Settings", () => {
    test.beforeEach(async ({ page }) => {
        await openApp(page)
    })

    test("language selection is available", async ({ page }) => {
        await openSettingsTab(page, "general")

        const dialog = page.locator('[role="dialog"]')
        await expect(dialog.locator("#language-select")).toHaveText(/English/)
    })

    test("the language select says why it is greyed while an answer runs", async ({
        page,
    }) => {
        // The chat request stays open until released
        let release!: () => void
        const released = new Promise<void>((r) => {
            release = r
        })
        await page.route("**/api/chat", async (route) => {
            await released
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: 'data: {"type":"start"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n',
            })
        })
        await sendMessage(page, "Draw a box")
        await openSettingsTab(page, "general")

        const dialog = page.locator('[role="dialog"]')
        const select = dialog.locator("#language-select")
        const usual = dialog.getByText("Choose your interface language.")
        await expect(select).toBeDisabled()
        await expect(
            dialog.getByText("Available when the answer is finished"),
        ).toBeVisible()
        await expect(usual).toHaveCount(0)
        release()
        await expect(select).toBeEnabled({ timeout: 15000 })
        await expect(usual).toBeVisible()
    })

    test("an access code with Chinese or full-width characters is refused as invalid, not as a network error", async ({
        page,
    }) => {
        await page.route("**/api/config", (route) =>
            route.fulfill({ json: { accessCodeRequired: true } }),
        )
        const sent: string[] = []
        await page.route("**/api/verify-access-code", (route) => {
            sent.push(route.request().headers()["x-access-code"])
            return route.fulfill({ json: { valid: true } })
        })
        await openSettingsTab(page, "general")

        const dialog = page.locator('[role="dialog"]')
        const field = dialog.locator("#access-code")
        const invalid = dialog.getByText(
            "Invalid or missing access code. Please configure it in Settings.",
        )
        // Pasted along with its label: a request header cannot carry it
        await field.fill("访问码：abc123")
        await field.press("Enter")
        await expect(invalid).toBeVisible()
        await expect(dialog.getByText(/Network error/)).toHaveCount(0)
        // A code of plain characters goes to the server as before
        await field.fill("abc123")
        await field.press("Enter")
        await expect(page.getByText("Access code saved")).toBeVisible()
        await expect(invalid).toHaveCount(0)
        await field.fill("ａｂｃ１２３")
        await field.press("Enter")
        await expect(invalid).toBeVisible()
        expect(sent).toEqual(["abc123"])
    })

    test("max output tokens is editable and persists", async ({ page }) => {
        await openSettingsTab(page, "drawing")

        const input = page.locator("#max-output-tokens")
        await expect(input).toBeVisible()

        await input.fill("48000")
        await expect
            .poll(() =>
                page.evaluate(() =>
                    localStorage.getItem("next-ai-draw-io-max-output-tokens"),
                ),
            )
            .toBe("48000")

        // Non-digits are dropped so the header always carries a plain number
        await input.fill("12k000")
        await expect(input).toHaveValue("12000")
    })

    test("the output token limit says when a value will not apply", async ({
        page,
    }) => {
        // A server that caps its own models at 4000 tokens
        await page.route("**/api/config", (route) =>
            route.fulfill({
                json: {
                    accessCodeRequired: false,
                    maxOutputTokens: { server: 4000, max: 200000 },
                },
            }),
        )
        await openSettingsTab(page, "drawing")

        const dialog = page.locator('[role="dialog"]')
        const input = dialog.locator("#max-output-tokens")
        const capped = dialog.getByText(
            "Models from this server get at most 4000. A higher value applies only to models on your own API key.",
        )
        const ignored = dialog.getByText(
            "Enter a number from 1 to 200000. Any other value is ignored and the default applies.",
        )
        // Empty: the server's value is the default
        await expect(input).toHaveAttribute("placeholder", "4000")
        await expect(capped).toHaveCount(0)
        await input.fill("64000")
        await expect(capped).toBeVisible()
        for (const value of ["999999999", "0"]) {
            await input.fill(value)
            await expect(ignored).toBeVisible()
            await expect(capped).toHaveCount(0)
        }
        await input.fill("3000")
        await expect(ignored).toHaveCount(0)
        await expect(capped).toHaveCount(0)
    })

    test("theme can be light, dark or follow the system", async ({ page }) => {
        await openSettingsTab(page, "general")

        const dialog = page.locator('[role="dialog"]')
        for (const name of ["Light", "Dark", "System"]) {
            await expect(dialog.getByRole("radio", { name })).toBeVisible()
        }
        await dialog.getByRole("radio", { name: "Dark" }).click()
        await expect(page.locator("html")).toHaveClass(/dark/)
    })
})
