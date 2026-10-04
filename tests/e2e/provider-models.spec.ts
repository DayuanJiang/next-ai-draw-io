import { expect, type Page, test } from "@playwright/test"
import { getIframe } from "./lib/fixtures"

// qwen-mt-plus is a translation model; models.dev lists no tool calls for it
const CONFIG = {
    version: 1,
    providers: [
        {
            id: "p1",
            provider: "qwen",
            apiKey: "test-key",
            models: [{ id: "m1", modelId: "qwen-mt-plus" }],
        },
    ],
}

async function openQwenSettings(page: Page) {
    await page.addInitScript((config) => {
        localStorage.setItem(
            "next-ai-draw-io-model-configs",
            JSON.stringify(config),
        )
    }, CONFIG)
    await page.goto("/", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    await page.locator("button:has(svg.lucide-bot)").first().click()
    await page.getByText("Configure Models...").click()
    const dialog = page.locator('[role="dialog"]')
    await dialog.getByText("Qwen (Alibaba)").first().click()
    return dialog
}

test("fetches the provider's models and adds one from the picker", async ({
    page,
}) => {
    let request: Record<string, unknown> | undefined
    await page.route("**/api/provider-models", async (route) => {
        request = route.request().postDataJSON()
        await route.fulfill({
            json: {
                models: [
                    { id: "qwen-new-max", tools: true },
                    { id: "qwen-text-only", tools: false },
                ],
            },
        })
    })
    const dialog = await openQwenSettings(page)

    await expect(
        dialog.getByText("may not be able to draw").first(),
    ).toBeVisible()

    await dialog
        .getByRole("button", { name: "Fetch models from the provider" })
        .click()
    const picker = page.locator('[role="listbox"]')
    await expect(picker.getByText("qwen-new-max")).toBeVisible()
    await expect(
        picker.getByRole("option", { name: /qwen-text-only/ }),
    ).toContainText("no tool calls")
    expect(request).toMatchObject({ provider: "qwen", apiKey: "test-key" })

    await page.getByPlaceholder("Search models...").fill("new-max")
    await picker.getByText("qwen-new-max").click()
    await expect(dialog.locator('input[title="qwen-new-max"]')).toBeVisible()
})

test("shows a hint when the provider rejects the key", async ({ page }) => {
    await page.route("**/api/provider-models", (route) =>
        route.fulfill({
            status: 401,
            json: { code: "invalid_api_key", error: "Incorrect API key" },
        }),
    )
    const dialog = await openQwenSettings(page)
    await dialog
        .getByRole("button", { name: "Fetch models from the provider" })
        .click()
    await expect(
        dialog.getByText(
            "The provider rejected the API key. Check it in model settings. Incorrect API key",
        ),
    ).toBeVisible()
})
