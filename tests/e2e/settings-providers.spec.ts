// The models tab of the settings: providers, their keys and models
import type { Locator } from "@playwright/test"
import {
    backToModels,
    expect,
    openApp,
    openSettings,
    openSettingsTab,
    savedModelConfigs,
    sendMessage,
    settingsDialog,
    TWO_PROVIDERS,
    test,
} from "./lib/fixtures"

// Three providers: one with a failed model, one not set up, one working
const PROVIDERS = {
    version: 1,
    selectedModelId: "m4",
    providers: [
        {
            id: "p1",
            provider: "openai",
            apiKey: "sk-test",
            models: [
                { id: "m1", modelId: "gpt-6-astra", validated: true },
                {
                    id: "m2",
                    modelId: "gpt-6.1-sol",
                    validated: false,
                    validationError: "Model not found",
                },
                { id: "m3", modelId: "gpt-6-luna" },
            ],
        },
        { id: "p2", provider: "bedrock", apiKey: "", models: [] },
        {
            id: "p3",
            provider: "deepseek",
            apiKey: "sk-ds",
            models: [{ id: "m4", modelId: "deepseek-chat", validated: true }],
        },
    ],
}

test("a first provider: pick it, fill in the key, test, use it", async ({
    page,
}) => {
    const tested: string[] = []
    await page.route("**/api/validate-model", async (route) => {
        tested.push(route.request().postDataJSON().modelId)
        await route.fulfill({ json: { valid: true, responseTime: 1400 } })
    })
    const listedWith: string[] = []
    await page.route("**/api/provider-models", async (route) => {
        listedWith.push(route.request().postDataJSON().apiKey)
        await route.fulfill({
            json: {
                models: [{ id: "deepseek-v4-pro" }, { id: "deepseek-chat" }],
            },
        })
    })
    await openApp(page)
    await openSettings(page)
    const dialog = settingsDialog(page)
    await expect(dialog.getByText("Use your own API key")).toBeVisible()

    await dialog.getByTestId("pick-provider-deepseek").click()
    // No model yet (DeepSeek lists its own), and the key field has the cursor
    await expect(
        dialog.getByRole("heading", { name: "DeepSeek", exact: true }),
    ).toBeVisible()
    await expect(dialog.locator("#api-key")).toBeFocused()
    await expect(dialog.getByTestId("step-1-todo")).toBeVisible()
    await expect(dialog.getByTestId("step-2-todo")).toBeVisible()
    const testButton = dialog.getByTestId("test-models")
    await expect(testButton).toBeDisabled()
    await expect(dialog.getByText("Fill in the API key first.")).toBeVisible()

    // The key is in: the list is fetched once by itself, without taking the
    // focus; it is behind "Browse models"
    await dialog.locator("#api-key").fill("sk-1234")
    await expect(dialog.getByTestId("step-1-done")).toBeVisible()
    const browse = dialog.getByRole("button", { name: "Browse models" })
    await expect(browse).toBeVisible()
    await expect(dialog.locator("#api-key")).toBeFocused()
    expect(listedWith).toEqual(["sk-1234"])
    await browse.click()
    await page.getByRole("option", { name: "deepseek-v4-pro" }).click()
    expect(listedWith).toEqual(["sk-1234"])
    await expect(dialog.locator('input[title="deepseek-v4-pro"]')).toBeVisible()
    await expect(dialog.getByTestId("step-2-done")).toBeVisible()
    await expect(testButton).toHaveText("Test deepseek-v4-pro")
    await testButton.click()
    // The visible panel, not the screen reader's copy
    await expect(
        dialog
            .getByText("deepseek-v4-pro works")
            .and(dialog.locator(':not([role="status"])')),
    ).toBeVisible()
    await expect(dialog.getByTestId("step-3-done")).toBeVisible()
    expect(tested).toEqual(["deepseek-v4-pro"])

    // The next step: use it in the chat
    await dialog
        .getByRole("button", { name: "Use deepseek-v4-pro in the chat" })
        .click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId("model-selector")).toContainText(
        "deepseek-v4-pro",
    )
    const config = await savedModelConfigs(page)
    expect(config.selectedModelId).toBe(config.providers[0].models[0].id)
})

test("the provider picker searches, marks added ones, and Enter picks", async ({
    page,
}) => {
    await openApp(page, { config: PROVIDERS })
    await page.getByTestId("model-selector").click()
    // The model picker opens the settings straight on the provider picker
    await page.getByText("Add a provider…").click()
    const dialog = settingsDialog(page)
    const search = dialog.getByRole("searchbox")
    await expect(search).toBeFocused()
    await expect(dialog.getByTestId("pick-provider-openai")).toContainText(
        "Added",
    )
    await expect(dialog.getByTestId("pick-provider-bedrock")).toContainText(
        "AWS credentials · Added",
    )
    await expect(
        dialog.getByTestId("pick-provider-anthropic"),
    ).not.toContainText("Added")
    await expect(dialog.locator('[data-testid^="pick-provider-"]')).toHaveCount(
        25,
    )

    await search.fill("zzz")
    await expect(dialog.getByText("No provider matches.")).toBeVisible()
    await search.fill("kimi")
    await expect(dialog.locator('[data-testid^="pick-provider-"]')).toHaveCount(
        1,
    )
    await search.press("Enter")
    await expect(
        dialog.getByRole("heading", { name: "Kimi (Moonshot)", exact: true }),
    ).toBeVisible()
    expect((await savedModelConfigs(page)).providers.at(-1).provider).toBe(
        "kimi",
    )
})

test("the provider list shows what needs attention", async ({ page }) => {
    await openApp(page, { config: PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await expect(dialog.getByTestId("provider-row-p1")).toContainText(
        "1 failed",
    )
    await expect(dialog.getByTestId("provider-row-p2")).toContainText(
        "Not set up yet",
    )
    await expect(dialog.getByTestId("provider-row-p3")).toContainText(
        "1 working",
    )
    // The selected model's provider is the one in use
    await expect(dialog.getByTestId("provider-row-p3")).toContainText("In use")
    await expect(dialog.getByTestId("provider-row-p1")).not.toContainText(
        "In use",
    )
})

test("the model picker lists untested and failed models", async ({ page }) => {
    await openApp(page, { config: PROVIDERS })
    await page.getByTestId("model-selector").click()
    // By the model config's id: the server may offer a model of that name
    const option = (id: string) =>
        page.locator(`[role="option"][data-value="${id}"]`)
    await expect(option("m3")).toContainText("Untested")
    await expect(option("m2")).toContainText("Failed")
    await expect(option("m1")).not.toContainText(/Untested|Failed/)
    // An untested model can be picked
    await option("m3").click()
    await expect(page.getByTestId("model-selector")).toContainText("gpt-6-luna")
})

test("an old setting to hide untested models is ignored", async ({ page }) => {
    await openApp(page, {
        config: { ...PROVIDERS, showUnvalidatedModels: false },
    })
    await page.getByTestId("model-selector").click()
    await expect(page.locator('[role="option"][data-value="m3"]')).toBeVisible()
})

test("a refused key opens the settings on that provider", async ({ page }) => {
    await page.route("**/api/chat", (route) =>
        route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
                type: "provider",
                code: "invalid_api_key",
                message: "Incorrect API key",
            }),
        }),
    )
    await openApp(page, { config: { ...PROVIDERS, selectedModelId: "m1" } })
    await sendMessage(page, "Draw a box")
    await page
        .getByRole("button", { name: "Open model settings" })
        .click({ timeout: 15000 })
    const dialog = settingsDialog(page)
    await expect(
        dialog.getByRole("heading", { name: "OpenAI", exact: true }),
    ).toBeVisible()
    // Back to the list from there
    await dialog.locator("header button", { hasText: "Models" }).click()
    await expect(dialog.getByTestId("provider-row-p1")).toBeVisible()
})

test("an access code error opens the general tab with the code field", async ({
    page,
}) => {
    await page.route("**/api/config", (route) =>
        route.fulfill({ json: { accessCodeRequired: true } }),
    )
    await page.route("**/api/chat", (route) =>
        route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
                error: "Invalid or missing access code. Please configure it in Settings.",
            }),
        }),
    )
    await openApp(page)
    await sendMessage(page, "Draw a box")
    const dialog = settingsDialog(page)
    await expect(dialog.locator("#access-code")).toBeVisible({ timeout: 15000 })
    await expect(dialog.getByTestId("settings-tab-general")).toHaveAttribute(
        "aria-current",
        "page",
    )
})

test("a refused key marks the key field until it changes", async ({ page }) => {
    await page.route("**/api/validate-model", (route) =>
        route.fulfill({
            json: {
                valid: false,
                code: "invalid_api_key",
                error: "Incorrect API key",
            },
        }),
    )
    await openApp(page, { config: PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-p3").click()
    await dialog.getByTestId("test-models").click()
    const key = dialog.locator("#api-key")
    await expect(key).toHaveAttribute("aria-invalid", "true")
    await expect(
        dialog.getByText(
            "The provider rejected this API key. It may be mistyped, expired, revoked, or from another account. To make a new one, use Get API key. Provider says: Incorrect API key",
        ),
    ).toBeVisible()
    // The visible line, not the screen reader's copy
    await expect(
        dialog
            .getByText("1 model failed the test")
            .and(dialog.locator(':not([role="status"])')),
    ).toBeVisible()
    await key.fill("sk-new")
    await expect(key).not.toHaveAttribute("aria-invalid", "true")
})

test("Use in the chat waits while an answer runs", async ({ page }) => {
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
    await page.route("**/api/validate-model", (route) =>
        route.fulfill({ json: { valid: true, responseTime: 900 } }),
    )
    await openApp(page, { config: PROVIDERS })
    await sendMessage(page, "Draw a box")
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-p3").click()
    await dialog.getByTestId("test-models").click()
    const use = dialog.getByRole("button", {
        name: "Use deepseek-chat in the chat",
    })
    await expect(use).toBeDisabled()
    release()
    await expect(use).toBeEnabled({ timeout: 15000 })
})

test("more options open by themselves only when they matter", async ({
    page,
}) => {
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                { id: "a1", provider: "azure", apiKey: "k", models: [] },
                { id: "o1", provider: "openai", apiKey: "k", models: [] },
                {
                    id: "o2",
                    provider: "openai",
                    apiKey: "k",
                    baseUrl: "https://proxy.example.com/v1",
                    models: [],
                },
            ],
        },
    })
    await openSettings(page)
    const dialog = settingsDialog(page)
    const back = () =>
        dialog.locator("header button", { hasText: "Models" }).click()
    // Azure's default URL is only an example
    await dialog.getByTestId("provider-row-a1").click()
    await expect(dialog.locator("#base-url")).toBeVisible()
    await back()
    await dialog.getByTestId("provider-row-o1").click()
    await expect(dialog.locator("#base-url")).toHaveCount(0)
    await back()
    await dialog.getByTestId("provider-row-o2").click()
    await expect(dialog.locator("#base-url")).toHaveValue(
        "https://proxy.example.com/v1",
    )
})

test("the models tab keeps its page across tabs, not across openings", async ({
    page,
}) => {
    await openApp(page, { config: PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-p1").click()
    await dialog.getByTestId("settings-tab-drawing").click()
    await expect(dialog.locator("#max-output-tokens")).toBeVisible()
    await dialog.getByTestId("settings-tab-models").click()
    await expect(
        dialog.getByRole("heading", { name: "OpenAI", exact: true }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await openSettings(page)
    await expect(dialog.getByTestId("provider-row-p1")).toBeVisible()
})

test("deleting a provider says what goes with it", async ({ page }) => {
    await openApp(page, { config: PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-p3").click()
    await dialog
        .getByRole("button", { name: "Delete DeepSeek and its model" })
        .click()
    await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Delete" })
        .click()
    await expect(dialog.getByTestId("provider-row-p3")).toHaveCount(0)
    await expect(dialog.getByTestId("provider-row-p1")).toBeVisible()
    expect((await savedModelConfigs(page)).providers).toHaveLength(2)
})

test("the general and drawing tabs hold their settings", async ({ page }) => {
    await openApp(page)
    await openSettingsTab(page, "general")
    const dialog = settingsDialog(page)
    for (const id of ["#language-select", "#send-shortcut-select"]) {
        await expect(dialog.locator(id)).toBeVisible()
    }
    await expect(
        dialog.getByRole("radiogroup", { name: "Theme" }),
    ).toBeVisible()
    await dialog.getByTestId("settings-tab-drawing").click()
    for (const id of [
        "#custom-system-message",
        "#vlm-validation",
        "#max-output-tokens",
    ]) {
        await expect(dialog.locator(id)).toBeVisible()
    }
    await expect(
        dialog.getByRole("radiogroup", { name: "Diagram style" }),
    ).toBeVisible()
})

test("Add a provider… leaves the cursor in the provider search", async ({
    page,
}) => {
    await openApp(page)
    await page.getByTestId("model-selector").click()
    await page.getByText("Add a provider…").click()
    const search = settingsDialog(page).getByRole("searchbox")
    await expect(search).toBeFocused()
    // After the model picker has closed
    await page.waitForTimeout(800)
    await expect(search).toBeFocused()
    await page.keyboard.type("kimi")
    await expect(search).toHaveValue("kimi")
})

test("the model picker's footer is there while searching and reachable by Tab", async ({
    page,
}) => {
    await openApp(page)
    await page.getByTestId("model-selector").click()
    await page.keyboard.type("zzzz")
    await expect(page.getByText("Add a provider…")).toBeVisible()
    const add = page.getByRole("button", { name: "Add a provider…" })
    for (let i = 0; i < 6; i++) {
        if (await add.evaluate((el) => el === document.activeElement)) break
        await page.keyboard.press("Tab")
    }
    await expect(add).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(settingsDialog(page).getByRole("searchbox")).toBeVisible()
})

test("an Enter that confirms an IME candidate picks no provider", async ({
    page,
}) => {
    await openApp(page)
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByRole("button", { name: /See all/ }).click()
    const search = dialog.getByRole("searchbox")
    await search.fill("deep")
    await search.evaluate((el) =>
        el.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Enter",
                bubbles: true,
                isComposing: true,
            }),
        ),
    )
    await page.waitForTimeout(300)
    await expect(search).toBeVisible()
    expect((await savedModelConfigs(page)).providers ?? []).toHaveLength(0)
})

test("the focus follows the page within the models tab", async ({ page }) => {
    await openApp(page, { config: TWO_PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-p1").focus()
    await page.keyboard.press("Enter")
    await expect(
        dialog.getByRole("heading", { name: "GLM (Zhipu)", exact: true }),
    ).toBeFocused()
    await backToModels(dialog)
    await expect(
        dialog.getByRole("heading", { name: "Models", exact: true }),
    ).toBeFocused()
})

test("a passing test hands the focus to its next step, a failing one keeps it", async ({
    page,
}) => {
    let pass = false
    await page.route("**/api/validate-model", (route) =>
        route.fulfill({
            json: pass
                ? { valid: true, responseTime: 900 }
                : { valid: false, error: "Model not found" },
        }),
    )
    await openApp(page, { config: TWO_PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-p1").click()
    const testButton = dialog.getByTestId("test-models")
    await testButton.focus()
    await page.keyboard.press("Enter")
    await expect(dialog.getByTestId("test-result")).toHaveText(
        "1 model failed the test",
    )
    await expect(testButton).toBeFocused()

    pass = true
    await page.keyboard.press("Enter")
    const use = dialog.getByRole("button", { name: "Use glm-a in the chat" })
    await expect(use).toBeFocused()
    const resultId = await dialog.getByTestId("test-result").getAttribute("id")
    await expect(use).toHaveAttribute("aria-describedby", resultId ?? "")
})

test("the test result goes to a live region that is there from the start", async ({
    page,
}) => {
    await page.route("**/api/validate-model", (route) =>
        route.fulfill({ json: { valid: true, responseTime: 900 } }),
    )
    await openApp(page, { config: TWO_PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-p1").click()
    const result = dialog.getByTestId("test-result")
    await expect(result).toHaveAttribute("role", "status")
    await expect(result).toHaveText("")
    await dialog.getByTestId("test-models").click()
    await expect(result).toHaveText("glm-a works")
})

test("long names stay inside the page", async ({ page }) => {
    const long = `model-${"x".repeat(150)}`
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                {
                    id: "p1",
                    provider: "openai",
                    name: `My ${"provider ".repeat(10)}name`,
                    apiKey: "k",
                    models: [{ id: "m1", modelId: long }],
                },
            ],
        },
    })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-p1").click()
    const right = async (l: Locator) => {
        const box = await l.boundingBox()
        if (!box) throw new Error("element is not laid out")
        return box.x + box.width
    }
    const pageRight = await right(dialog)
    expect(await right(dialog.getByTestId("test-models"))).toBeLessThanOrEqual(
        pageRight,
    )
    expect(
        await right(
            dialog.getByRole("button", { name: /^Get all models from/ }),
        ),
    ).toBeLessThanOrEqual(pageRight)
})

test("a local server's base URL is shown from the start", async ({ page }) => {
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                { id: "l1", provider: "ollama", apiKey: "", models: [] },
            ],
        },
    })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-l1").click()
    await expect(dialog.locator("#base-url")).toBeVisible()
})

test("Azure needs its resource URL before it counts as connected", async ({
    page,
}) => {
    // An entry saved while Azure still had a placeholder default URL: the
    // placeholder names no resource, so the entry is not set up yet
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                {
                    id: "z1",
                    provider: "azure",
                    apiKey: "k",
                    baseUrl: "https://your-resource.openai.azure.com/openai",
                    models: [{ id: "m1", modelId: "gpt-6-astra" }],
                },
            ],
        },
    })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await expect(dialog.getByTestId("provider-row-z1")).toContainText(
        "Not set up yet",
    )
    await dialog.getByTestId("provider-row-z1").click()
    await expect(dialog.getByTestId("step-1-todo")).toBeVisible()
    await expect(dialog.getByTestId("test-models")).toBeDisabled()
    await expect(
        dialog.getByText("Fill in the API key and the base URL first."),
    ).toBeVisible()
    await dialog
        .locator("#base-url")
        .fill("https://contoso.openai.azure.com/openai")
    await expect(dialog.getByTestId("test-models")).toBeEnabled()
})

test("the OpenAI-compatible preset takes any URL and shows where requests go", async ({
    page,
}) => {
    await openApp(page)
    await openSettings(page)
    const dialog = settingsDialog(page)
    // Not among the popular ones: it is in the full picker
    await dialog.getByRole("button", { name: /^See all \d+ providers/ }).click()
    await dialog.getByTestId("pick-provider-custom").click()
    await expect(
        dialog.getByRole("heading", { name: "OpenAI-compatible", exact: true }),
    ).toBeVisible()
    // No URL yet: a key alone does not count as connected
    await dialog.locator("#api-key").fill("any")
    await expect(dialog.getByTestId("step-1-todo")).toBeVisible()
    await expect(
        dialog.getByText("Fill in the API key and the base URL first."),
    ).toBeVisible()
    // Its options start open; the URL field shows the chat endpoint
    await dialog.locator("#base-url").fill("http://127.0.0.1:1234/v1")
    await expect(
        dialog.getByText(
            "Requests go to http://127.0.0.1:1234/v1/chat/completions",
        ),
    ).toBeVisible()
    await expect(dialog.getByTestId("step-1-done")).toBeVisible()
})

test("a refused key names Get API key only where the provider has that link", async ({
    page,
}) => {
    await page.route("**/api/provider-models", (route) =>
        route.fulfill({
            status: 401,
            json: { code: "invalid_api_key", error: "Incorrect API key" },
        }),
    )
    await openApp(page)
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByRole("button", { name: /^See all \d+ providers/ }).click()
    await dialog.getByTestId("pick-provider-custom").click()
    await dialog.locator("#api-key").fill("sk-wrong")
    await dialog.locator("#base-url").fill("https://llm.example.com/v1")
    await dialog
        .getByRole("button", { name: "Get all models from OpenAI-compatible" })
        .click()
    await expect(
        dialog.getByText(
            "The provider rejected this API key. It may be mistyped, expired, revoked, or from another account.",
            { exact: true },
        ),
    ).toBeVisible()
    await expect(dialog.getByRole("link", { name: "Get API key" })).toHaveCount(
        0,
    )
})

test("a provider left as its tile made it goes when the settings show another tab", async ({
    page,
}) => {
    await openApp(page)
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("pick-provider-openai").click()
    await expect(
        dialog.getByRole("heading", { name: "OpenAI", exact: true }),
    ).toBeVisible()
    await dialog.getByTestId("settings-tab-general").click()
    await expect
        .poll(async () => (await savedModelConfigs(page)).providers)
        .toEqual([])
    await dialog.getByTestId("settings-tab-models").click()
    await expect(dialog.getByText("Use your own API key")).toBeVisible()
})

test("a model id typed for one provider does not follow to the next", async ({
    page,
}) => {
    await openApp(page, { config: TWO_PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-p1").click()
    const input = dialog.getByPlaceholder("Or type another model ID")
    await input.fill("half-typed")
    await backToModels(dialog)
    await dialog.getByTestId("provider-row-p2").click()
    await expect(input).toHaveValue("")
})

test("refused keys stay marked for each provider", async ({ page }) => {
    await page.route("**/api/validate-model", (route) =>
        route.fulfill({
            json: { valid: false, code: "invalid_api_key", error: "Bad key" },
        }),
    )
    await openApp(page, { config: TWO_PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
    const key = dialog.locator("#api-key")
    await dialog.getByTestId("provider-row-p1").click()
    await dialog.getByTestId("test-models").click()
    await expect(key).toHaveAttribute("aria-invalid", "true")
    await backToModels(dialog)
    await dialog.getByTestId("provider-row-p2").click()
    await dialog.getByTestId("test-models").click()
    await expect(key).toHaveAttribute("aria-invalid", "true")
    await backToModels(dialog)
    await dialog.getByTestId("provider-row-p1").click()
    await expect(key).toHaveAttribute("aria-invalid", "true")
})

test("a model list that loads leaves a refused test's mark", async ({
    page,
}) => {
    // Some providers list their models without the key: a list proves nothing
    await page.route("**/api/validate-model", (route) =>
        route.fulfill({
            json: { valid: false, code: "invalid_api_key", error: "Bad key" },
        }),
    )
    await page.route("**/api/provider-models", (route) =>
        route.fulfill({ json: { models: [{ id: "listed-model" }] } }),
    )
    await openApp(page, { config: TWO_PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
    const key = dialog.locator("#api-key")
    await dialog.getByTestId("provider-row-p1").click()
    await dialog.getByTestId("test-models").click()
    await expect(key).toHaveAttribute("aria-invalid", "true")
    await dialog.getByRole("button", { name: /^Get all models from/ }).click()
    await expect(
        page.getByRole("option", { name: "listed-model" }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("listbox")).toHaveCount(0)
    await expect(key).toHaveAttribute("aria-invalid", "true")
})

test("an empty model list says so and opens nothing", async ({ page }) => {
    let models: { id: string }[] = []
    await page.route("**/api/provider-models", (route) =>
        route.fulfill({ json: { models } }),
    )
    // OpenAI lists its own models: nothing to browse until a list arrives
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                { id: "o1", provider: "openai", apiKey: "k", models: [] },
            ],
        },
    })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-o1").click()
    // A key the provider already had fetches nothing by itself
    await page.waitForTimeout(800)
    await expect(
        dialog.getByRole("button", { name: "Browse models" }),
    ).toHaveCount(0)
    await dialog.getByRole("button", { name: /^Get all models from/ }).click()
    await expect(
        dialog.getByText("The provider returned no models."),
    ).toBeVisible()
    // The picker did not open by itself
    await expect(page.getByRole("listbox")).toHaveCount(0)
    // A new key fetches the list again by itself; the list waits behind
    // "Browse models" and the cursor stays in the key field
    models = [{ id: "fresh-model" }]
    await dialog.locator("#api-key").fill("k-new")
    await expect(
        dialog.getByRole("button", { name: "Browse models" }),
    ).toBeVisible()
    await expect(page.getByRole("listbox")).toHaveCount(0)
    await expect(dialog.locator("#api-key")).toBeFocused()
})
