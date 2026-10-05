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

async function openQwenSettings(page: Page, config: object = CONFIG) {
    await page.addInitScript((config) => {
        localStorage.setItem(
            "next-ai-draw-io-model-configs",
            JSON.stringify(config),
        )
    }, config)
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

test("the model picker scrolls with the mouse wheel", async ({ page }) => {
    // The picker sits in a popover above the settings dialog, which blocks
    // wheel events outside itself
    await page.route("**/api/provider-models", (route) =>
        route.fulfill({
            json: {
                models: Array.from({ length: 60 }, (_, i) => ({
                    id: `qwen-model-${i}`,
                })),
            },
        }),
    )
    const dialog = await openQwenSettings(page)
    await dialog
        .getByRole("button", { name: "Fetch models from the provider" })
        .click()
    const list = page.locator("[cmdk-list]")
    await expect(list.getByText("qwen-model-0")).toBeVisible()
    await list.hover()
    await page.mouse.wheel(0, 400)
    await expect
        .poll(() => list.evaluate((el) => el.scrollTop), { timeout: 3000 })
        .toBeGreaterThan(0)
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

test("a fetch error stays with its provider", async ({ page }) => {
    await page.route("**/api/provider-models", (route) =>
        route.fulfill({
            status: 401,
            json: { code: "invalid_api_key", error: "Incorrect API key" },
        }),
    )
    const dialog = await openQwenSettings(page, {
        version: 1,
        providers: [
            ...CONFIG.providers,
            { id: "p2", provider: "glm", apiKey: "k", models: [] },
        ],
    })
    await dialog
        .getByRole("button", { name: "Fetch models from the provider" })
        .click()
    const error = dialog.getByText("Incorrect API key")
    await expect(error).toBeVisible()
    await dialog.getByText("GLM (Zhipu)").first().click()
    await expect(error).toHaveCount(0)
})

test("editing a model id clears the old test warning", async ({ page }) => {
    const warning = "Connected, but the model answered without calling a tool."
    const dialog = await openQwenSettings(page, {
        version: 1,
        providers: [
            {
                ...CONFIG.providers[0],
                models: [
                    {
                        id: "m1",
                        modelId: "qwen-max",
                        validated: true,
                        validationWarning: warning,
                    },
                ],
            },
        ],
    })
    await expect(dialog.getByText(warning)).toBeVisible()
    const input = dialog.locator('input[title="qwen-max"]')
    await input.fill("qwen-mt-plus")
    await input.blur()
    await expect(dialog.getByText(warning)).toHaveCount(0)
    await expect(dialog.getByText("may not be able to draw")).toBeVisible()
})

/** Hold requests to an endpoint until release() answers them with json */
async function holdRoute(page: Page, url: string, json: object) {
    let release!: () => void
    const released = new Promise<void>((r) => {
        release = r
    })
    await page.route(url, async (route) => {
        await released
        await route.fulfill({ status: 200, json })
    })
    return release
}

const TWO_PROVIDERS = {
    version: 1,
    providers: [
        {
            ...CONFIG.providers[0],
            models: [{ id: "m1", modelId: "qwen-max" }],
        },
        { id: "p2", provider: "glm", apiKey: "k", models: [] },
    ],
}

test("a model list that arrives after switching provider stays with its provider", async ({
    page,
}) => {
    const release = await holdRoute(page, "**/api/provider-models", {
        code: "invalid_api_key",
        error: "Incorrect API key",
    })
    const dialog = await openQwenSettings(page, TWO_PROVIDERS)
    await dialog
        .getByRole("button", { name: "Fetch models from the provider" })
        .click()
    await dialog.getByText("GLM (Zhipu)").first().click()
    release()
    await page.waitForTimeout(500)
    await expect(dialog.getByText("Incorrect API key")).toHaveCount(0)
})

test("a test result that arrives after switching provider stays with its provider", async ({
    page,
}) => {
    const release = await holdRoute(page, "**/api/validate-model", {
        valid: false,
        error: "Model not found",
    })
    const dialog = await openQwenSettings(page, TWO_PROVIDERS)
    await dialog.getByRole("button", { name: "Test", exact: true }).click()
    await dialog.getByText("GLM (Zhipu)").first().click()
    release()
    await page.waitForTimeout(500)
    await expect(dialog.getByText(/model\(s\) failed validation/)).toHaveCount(
        0,
    )
})

test("a test result does not count for a model id changed meanwhile", async ({
    page,
}) => {
    const release = await holdRoute(page, "**/api/validate-model", {
        valid: true,
        responseTime: 1000,
    })
    const dialog = await openQwenSettings(page, TWO_PROVIDERS)
    await dialog.getByRole("button", { name: "Test", exact: true }).click()
    const input = dialog.locator('input[title="qwen-max"]')
    await input.fill("qwen-plus")
    await input.blur()
    release()
    await page.waitForTimeout(500)
    await expect(dialog.locator('[title="1.0 s"]')).toHaveCount(0)
})

test("a model list fetched with an old API key is dropped", async ({
    page,
}) => {
    const release = await holdRoute(page, "**/api/provider-models", {
        models: [{ id: "model-of-old-key", tools: true }],
    })
    const dialog = await openQwenSettings(page, TWO_PROVIDERS)
    await dialog
        .getByRole("button", { name: "Fetch models from the provider" })
        .click()
    // The user corrects the key while the list is loading
    await dialog.locator("#api-key").fill("new-key")
    release()
    await page.waitForTimeout(500)
    await expect(page.getByText("model-of-old-key")).toHaveCount(0)
})

test("a test result for an old API key is dropped", async ({ page }) => {
    const release = await holdRoute(page, "**/api/validate-model", {
        valid: true,
        responseTime: 1000,
    })
    const dialog = await openQwenSettings(page, TWO_PROVIDERS)
    await dialog.getByRole("button", { name: "Test", exact: true }).click()
    // Another tab saves a different key for this provider
    await page.evaluate(() => {
        const key = "next-ai-draw-io-model-configs"
        const config = JSON.parse(localStorage.getItem(key) ?? "{}")
        config.providers[0].apiKey = "key-from-another-tab"
        const value = JSON.stringify(config)
        localStorage.setItem(key, value)
        window.dispatchEvent(
            new StorageEvent("storage", { key, newValue: value }),
        )
    })
    release()
    await page.waitForTimeout(500)
    await expect(dialog.locator('[title="1.0 s"]')).toHaveCount(0)
    // The test is over: the button works again and nothing spins
    await expect(
        dialog.getByRole("button", { name: "Test", exact: true }),
    ).toBeEnabled()
    await expect(dialog.locator(".animate-spin")).toHaveCount(0)
})

test("an older test does not end a newer one's spinners", async ({ page }) => {
    // Each validate request waits for its own release
    const releases: Array<() => void> = []
    await page.route("**/api/validate-model", async (route) => {
        await new Promise<void>((r) => releases.push(r))
        await route.fulfill({
            status: 200,
            json: { valid: true, responseTime: 1000 },
        })
    })
    const dialog = await openQwenSettings(page, TWO_PROVIDERS)
    await dialog.getByRole("button", { name: "Test", exact: true }).click()
    await expect.poll(() => releases.length).toBe(1)
    // The user corrects the key and tests again
    await dialog.locator("#api-key").fill("new-key")
    await dialog.getByRole("button", { name: "Test", exact: true }).click()
    await expect.poll(() => releases.length).toBe(2)
    releases[0]()
    await page.waitForTimeout(500)
    await expect(dialog.locator(".animate-spin").first()).toBeVisible()
    releases[1]()
    await expect(dialog.locator('[title="1.0 s"]')).toHaveCount(1)
})

test("an older test touches nothing, also when the key came back", async ({
    page,
}) => {
    const releases: Array<() => void> = []
    await page.route("**/api/validate-model", async (route) => {
        const n = releases.length
        await new Promise<void>((r) => releases.push(r))
        await route.fulfill({
            status: 200,
            // The older test's result would say 9.0 s
            json: { valid: true, responseTime: n === 0 ? 9000 : 1000 },
        })
    })
    const dialog = await openQwenSettings(page, TWO_PROVIDERS)
    await dialog.getByRole("button", { name: "Test", exact: true }).click()
    await expect.poll(() => releases.length).toBe(1)
    // The key changes and comes back, and the user tests again
    await dialog.locator("#api-key").fill("other-key")
    await dialog.locator("#api-key").fill("test-key")
    await dialog.getByRole("button", { name: "Test", exact: true }).click()
    await expect.poll(() => releases.length).toBe(2)
    releases[0]()
    await page.waitForTimeout(500)
    await expect(dialog.locator(".animate-spin").first()).toBeVisible()
    await expect(dialog.locator('[title="9.0 s"]')).toHaveCount(0)
    releases[1]()
    await expect(dialog.locator('[title="1.0 s"]')).toHaveCount(1)
})

test("no spinner stays after another tab's change while elsewhere", async ({
    page,
}) => {
    const release = await holdRoute(page, "**/api/validate-model", {
        valid: true,
        responseTime: 1000,
    })
    const dialog = await openQwenSettings(page, TWO_PROVIDERS)
    await dialog.getByRole("button", { name: "Test", exact: true }).click()
    // The user looks at the other provider while another tab changes the key
    await dialog.getByText("GLM (Zhipu)").first().click()
    await page.evaluate(() => {
        const key = "next-ai-draw-io-model-configs"
        const config = JSON.parse(localStorage.getItem(key) ?? "{}")
        config.providers[0].apiKey = "key-from-another-tab"
        const value = JSON.stringify(config)
        localStorage.setItem(key, value)
        window.dispatchEvent(
            new StorageEvent("storage", { key, newValue: value }),
        )
    })
    release()
    await page.waitForTimeout(500)
    await dialog.getByText("Qwen (Alibaba)").first().click()
    await expect(dialog.locator(".animate-spin")).toHaveCount(0)
})
