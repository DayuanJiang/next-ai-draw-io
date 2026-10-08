import { expect, type Locator, type Page, test } from "@playwright/test"
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

/** Show a provider's page, going back to the provider list first */
async function showProvider(dialog: Locator, id: string) {
    const back = dialog.locator("header button", { hasText: /^(Models|模型)$/ })
    if (await back.count()) await back.click()
    await dialog.getByTestId(`provider-row-${id}`).click()
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
    await page.getByTestId("model-selector").click()
    await page.getByText("Configure Models...").click()
    const dialog = page.locator('[role="dialog"]')
    await showProvider(dialog, "p1")
    return dialog
}

const fetchButton = (dialog: Locator) =>
    dialog.getByRole("button", { name: /^Get all models from/ })
const testButton = (dialog: Locator) => dialog.getByTestId("test-models")

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

    await fetchButton(dialog).click()
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
    await fetchButton(dialog).click()
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
    await fetchButton(dialog).click()
    await expect(
        dialog.getByText(
            "The provider rejected this API key. Check that the key above was copied in full. Incorrect API key",
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
    await fetchButton(dialog).click()
    const error = dialog.getByText("Incorrect API key")
    await expect(error).toBeVisible()
    await showProvider(dialog, "p2")
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
    await fetchButton(dialog).click()
    await showProvider(dialog, "p2")
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
    await testButton(dialog).click()
    await showProvider(dialog, "p2")
    release()
    await page.waitForTimeout(500)
    await expect(dialog.getByText(/failed the test/)).toHaveCount(0)
})

test("a test result does not count for a model id changed meanwhile", async ({
    page,
}) => {
    const release = await holdRoute(page, "**/api/validate-model", {
        valid: true,
        responseTime: 1000,
    })
    const dialog = await openQwenSettings(page, TWO_PROVIDERS)
    await testButton(dialog).click()
    const input = dialog.locator('input[title="qwen-max"]')
    await input.fill("qwen-plus")
    await input.blur()
    release()
    await page.waitForTimeout(500)
    await expect(dialog.getByText("Works · 1.0 s")).toHaveCount(0)
})

test("a model list fetched with an old API key is dropped", async ({
    page,
}) => {
    const release = await holdRoute(page, "**/api/provider-models", {
        models: [{ id: "model-of-old-key", tools: true }],
    })
    const dialog = await openQwenSettings(page, TWO_PROVIDERS)
    await fetchButton(dialog).click()
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
    await testButton(dialog).click()
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
    await expect(dialog.getByText("Works · 1.0 s")).toHaveCount(0)
    // The test is over: the button works again and nothing spins
    await expect(testButton(dialog)).toBeEnabled()
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
    await testButton(dialog).click()
    await expect.poll(() => releases.length).toBe(1)
    // The user corrects the key and tests again
    await dialog.locator("#api-key").fill("new-key")
    await testButton(dialog).click()
    await expect.poll(() => releases.length).toBe(2)
    releases[0]()
    await page.waitForTimeout(500)
    await expect(dialog.locator(".animate-spin").first()).toBeVisible()
    releases[1]()
    await expect(dialog.getByText("Works · 1.0 s")).toHaveCount(1)
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
    await testButton(dialog).click()
    await expect.poll(() => releases.length).toBe(1)
    // The key changes and comes back, and the user tests again
    await dialog.locator("#api-key").fill("other-key")
    await dialog.locator("#api-key").fill("test-key")
    await testButton(dialog).click()
    await expect.poll(() => releases.length).toBe(2)
    releases[0]()
    await page.waitForTimeout(500)
    await expect(dialog.locator(".animate-spin").first()).toBeVisible()
    await expect(dialog.getByText("Works · 9.0 s")).toHaveCount(0)
    releases[1]()
    await expect(dialog.getByText("Works · 1.0 s")).toHaveCount(1)
})

test("no spinner stays after another tab's change while elsewhere", async ({
    page,
}) => {
    const release = await holdRoute(page, "**/api/validate-model", {
        valid: true,
        responseTime: 1000,
    })
    const dialog = await openQwenSettings(page, TWO_PROVIDERS)
    await testButton(dialog).click()
    // The user looks at the other provider while another tab changes the key
    await showProvider(dialog, "p2")
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
    await showProvider(dialog, "p1")
    await expect(dialog.locator(".animate-spin")).toHaveCount(0)
})

const savedConfig = (page: Page) =>
    page.evaluate(() =>
        JSON.parse(
            localStorage.getItem("next-ai-draw-io-model-configs") ?? "{}",
        ),
    )

test("a test result that arrives after the settings closed is kept", async ({
    page,
}) => {
    const release = await holdRoute(page, "**/api/validate-model", {
        valid: true,
        responseTime: 1000,
    })
    const dialog = await openQwenSettings(page, TWO_PROVIDERS)
    await testButton(dialog).click()
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    release()
    await expect
        .poll(
            async () =>
                (await savedConfig(page)).providers[0].models[0].validated,
        )
        .toBe(true)
})

test("a test result for a key changed on another settings tab is dropped", async ({
    page,
}) => {
    const release = await holdRoute(page, "**/api/validate-model", {
        valid: true,
        responseTime: 1000,
    })
    const dialog = await openQwenSettings(page, TWO_PROVIDERS)
    await testButton(dialog).click()
    // The panel goes away while the test runs, then the key changes
    await page.locator('[data-testid="settings-tab-general"]').click()
    await page.locator('[data-testid="settings-tab-models"]').click()
    await showProvider(dialog, "p1")
    await dialog.locator("input[type=password]").first().fill("new-key")
    release()
    await page.waitForTimeout(800)
    const saved = await savedConfig(page)
    expect(saved.providers[0].apiKey).toBe("new-key")
    expect(saved.providers[0].models[0].validated).not.toBe(true)
    expect(saved.providers[0].validated).not.toBe(true)
})

test("a test result for a model renamed on another settings tab is dropped", async ({
    page,
}) => {
    const release = await holdRoute(page, "**/api/validate-model", {
        valid: true,
        responseTime: 1000,
    })
    const dialog = await openQwenSettings(page, TWO_PROVIDERS)
    await testButton(dialog).click()
    // The panel goes away while the test runs, then the model id changes
    await page.locator('[data-testid="settings-tab-general"]').click()
    await page.locator('[data-testid="settings-tab-models"]').click()
    await showProvider(dialog, "p1")
    const input = dialog.locator('input[title="qwen-max"]')
    await input.fill("qwen-plus")
    await input.blur()
    release()
    await page.waitForTimeout(800)
    const saved = await savedConfig(page)
    expect(saved.providers[0].models[0].modelId).toBe("qwen-plus")
    expect(saved.providers[0].models[0].validated).not.toBe(true)
})

test("a failed test speaks the page's language", async ({ page }) => {
    await page.addInitScript((config) => {
        localStorage.setItem("next-ai-draw-io-locale", "zh")
        localStorage.setItem(
            "next-ai-draw-io-model-configs",
            JSON.stringify(config),
        )
    }, TWO_PROVIDERS)
    await page.route("**/api/validate-model", (route) => route.abort())
    await page.goto("/zh", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    await page.getByTestId("settings-button").first().click()
    const dialog = page.locator('[role="dialog"]')
    await showProvider(dialog, "p1")
    await testButton(dialog).click()
    // The visible line, not the screen reader's copy
    await expect(
        dialog
            .getByText("1 个模型没通过测试")
            .and(dialog.locator(':not([role="status"])')),
    ).toBeVisible()
    await expect(
        dialog.getByText("网络错误。请检查您的连接。").first(),
    ).toBeAttached()
})

test("testing a provider without models speaks the page's language", async ({
    page,
}) => {
    await page.addInitScript(
        (config) => {
            localStorage.setItem("next-ai-draw-io-locale", "zh")
            localStorage.setItem(
                "next-ai-draw-io-model-configs",
                JSON.stringify(config),
            )
        },
        {
            version: 1,
            providers: [{ ...CONFIG.providers[0], models: [] }],
        },
    )
    await page.goto("/zh", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    await page.getByTestId("settings-button").first().click()
    const dialog = page.locator('[role="dialog"]')
    await showProvider(dialog, "p1")
    // Nothing to test yet: the button says what is missing
    await expect(testButton(dialog)).toBeDisabled()
    await expect(dialog.getByText("先添加一个模型。")).toBeVisible()
})

test("adding a model id twice is refused in the page's language", async ({
    page,
}) => {
    await page.addInitScript((config) => {
        localStorage.setItem("next-ai-draw-io-locale", "zh")
        localStorage.setItem(
            "next-ai-draw-io-model-configs",
            JSON.stringify(config),
        )
    }, CONFIG)
    await page.goto("/zh", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    await page.getByTestId("settings-button").first().click()
    const dialog = page.locator('[role="dialog"]')
    await showProvider(dialog, "p1")
    const input = dialog.getByPlaceholder("或者输入其他模型 ID")
    await input.fill("qwen-mt-plus")
    await input.press("Enter")
    await expect(dialog.getByText("此模型 ID 已存在")).toBeVisible()
})

test("Bedrock can be tested and used with an API key alone", async ({
    page,
}) => {
    const bodies: any[] = []
    await page.route("**/api/validate-model", async (route) => {
        bodies.push(route.request().postDataJSON())
        await route.fulfill({
            status: 200,
            json: { valid: true, responseTime: 900 },
        })
    })
    await page.addInitScript(
        (config) => {
            localStorage.setItem(
                "next-ai-draw-io-model-configs",
                JSON.stringify(config),
            )
        },
        {
            version: 1,
            providers: [
                {
                    id: "b1",
                    provider: "bedrock",
                    awsRegion: "us-east-1",
                    models: [{ id: "m1", modelId: "amazon.nova-lite-v1:0" }],
                },
            ],
        },
    )
    await page.goto("/", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    await page.getByTestId("model-selector").click()
    await page.getByText("Configure Models...").click()
    const dialog = page.locator('[role="dialog"]')
    await showProvider(dialog, "b1")
    const test = testButton(dialog)
    await expect(test).toBeDisabled()
    await dialog.getByLabel("Bedrock API key").fill("bedrock-api-key")
    await expect(test).toBeEnabled()
    await test.click()
    await expect.poll(() => bodies.length).toBe(1)
    expect(bodies[0]).toMatchObject({
        provider: "bedrock",
        apiKey: "bedrock-api-key",
        awsRegion: "us-east-1",
    })

    // The chat sends it with the request
    let headers: Record<string, string> = {}
    await page.route("**/api/chat", async (route) => {
        headers = route.request().headers()
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: 'data: {"type":"start"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n',
        })
    })
    await page.keyboard.press("Escape")
    await page.getByTestId("model-selector").click()
    await page.getByText("amazon.nova-lite-v1:0").first().click()
    const input = page.getByTestId("chat-input")
    await input.fill("Hello")
    await input.press("ControlOrMeta+Enter")
    await expect.poll(() => headers["x-ai-api-key"]).toBe("bedrock-api-key")
    expect(headers["x-ai-provider"]).toBe("bedrock")
    expect(headers["x-aws-region"]).toBe("us-east-1")
})
