import type { Page } from "@playwright/test"
import {
    expect,
    getIframe,
    openSettings,
    openSettingsTab,
    sendMessage,
    test,
} from "./lib/fixtures"

const KEY = "next-ai-draw-io-model-configs"

async function openApp(page: Page, config?: object) {
    if (config) {
        await page.addInitScript(
            ([key, config]) => {
                // Only on the first load: a reload keeps what the test did
                if (!sessionStorage.getItem("seeded")) {
                    localStorage.setItem(key, JSON.stringify(config))
                    sessionStorage.setItem("seeded", "1")
                }
            },
            [KEY, config] as const,
        )
    }
    await page.goto("/", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
}

const saved = (page: Page) =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), KEY)

const dialogOf = (page: Page) => page.getByRole("dialog", { name: "Settings" })

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
    await openApp(page)
    await openSettings(page)
    const dialog = dialogOf(page)
    await expect(dialog.getByText("Use your own API key")).toBeVisible()

    await dialog.getByTestId("pick-provider-deepseek").click()
    // The first suggested model is added, and the key field has the cursor
    await expect(
        dialog.getByRole("heading", { name: "DeepSeek", exact: true }),
    ).toBeVisible()
    await expect(dialog.locator('input[title="deepseek-v4-pro"]')).toBeVisible()
    await expect(dialog.locator("#api-key")).toBeFocused()
    await expect(dialog.getByTestId("step-1-todo")).toBeVisible()
    await expect(dialog.getByTestId("step-2-done")).toBeVisible()
    const testButton = dialog.getByTestId("test-models")
    await expect(testButton).toBeDisabled()
    await expect(dialog.getByText("Fill in the API key first.")).toBeVisible()

    await dialog.locator("#api-key").fill("sk-1234")
    await expect(dialog.getByTestId("step-1-done")).toBeVisible()
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
    const config = await saved(page)
    expect(config.selectedModelId).toBe(config.providers[0].models[0].id)
})

test("the provider picker searches, marks added ones, and Enter picks", async ({
    page,
}) => {
    await openApp(page, PROVIDERS)
    await page.getByTestId("model-selector").click()
    // The model picker opens the settings straight on the provider picker
    await page.getByText("Add a provider…").click()
    const dialog = dialogOf(page)
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
        24,
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
    expect((await saved(page)).providers.at(-1).provider).toBe("kimi")
})

test("the provider list shows what needs attention", async ({ page }) => {
    await openApp(page, PROVIDERS)
    await openSettings(page)
    const dialog = dialogOf(page)
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
    await openApp(page, PROVIDERS)
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
    await openApp(page, { ...PROVIDERS, showUnvalidatedModels: false })
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
    await openApp(page, { ...PROVIDERS, selectedModelId: "m1" })
    await sendMessage(page, "Draw a box")
    await page
        .getByRole("button", { name: "Open model settings" })
        .click({ timeout: 15000 })
    const dialog = dialogOf(page)
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
        route.fulfill({
            json: {
                accessCodeRequired: true,
                dailyRequestLimit: 0,
                dailyTokenLimit: 0,
                tpmLimit: 0,
            },
        }),
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
    const dialog = dialogOf(page)
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
    await openApp(page, PROVIDERS)
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-p3").click()
    await dialog.getByTestId("test-models").click()
    const key = dialog.locator("#api-key")
    await expect(key).toHaveAttribute("aria-invalid", "true")
    await expect(
        dialog.getByText(
            "The provider rejected this API key. Check that the key above was copied in full. Incorrect API key",
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

test("Bedrock shows one way of signing in and empties the other", async ({
    page,
}) => {
    await openApp(page, {
        version: 1,
        providers: [
            {
                id: "b1",
                provider: "bedrock",
                apiKey: "bedrock-key",
                awsRegion: "us-east-1",
                // Left by an older version: belongs to the access keys
                awsSessionToken: "session-token",
                models: [
                    {
                        id: "m1",
                        modelId: "amazon.nova-lite-v1:0",
                        validated: true,
                    },
                ],
            },
        ],
    })
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-b1").click()
    await expect(dialog.getByLabel("Bedrock API key")).toHaveValue(
        "bedrock-key",
    )
    await expect(dialog.locator("#aws-access-key-id")).toHaveCount(0)

    await dialog
        .getByRole("button", { name: "Access keys", exact: true })
        .click()
    await expect(dialog.locator("#bedrock-api-key")).toHaveCount(0)
    // The key that was tested is gone, and so is its test result
    await expect
        .poll(async () => (await saved(page)).providers[0].models[0].validated)
        .toBeUndefined()
    await dialog.locator("#aws-access-key-id").fill("AKIATEST")
    await dialog.locator("#aws-secret-access-key").fill("secret")
    await expect
        .poll(async () => (await saved(page)).providers[0])
        .toMatchObject({
            apiKey: "",
            awsAccessKeyId: "AKIATEST",
            awsSecretAccessKey: "secret",
        })
    // Reopened, it shows the way that is filled in
    await page.keyboard.press("Escape")
    await openSettings(page)
    await dialog.getByTestId("provider-row-b1").click()
    await expect(
        dialog.getByRole("button", { name: "Access keys", exact: true }),
    ).toHaveAttribute("aria-pressed", "true")

    await dialog
        .getByRole("button", { name: "Bedrock API key", exact: true })
        .click()
    await expect
        .poll(async () => (await saved(page)).providers[0])
        .toMatchObject({
            awsAccessKeyId: "",
            awsSecretAccessKey: "",
            awsSessionToken: "",
        })
})

test("switching Bedrock's sign-in with nothing filled in keeps the test results", async ({
    page,
}) => {
    // Older configs may hold a result without the key that earned it
    await openApp(page, {
        version: 1,
        providers: [
            {
                id: "b1",
                provider: "bedrock",
                apiKey: "",
                awsRegion: "us-east-1",
                models: [
                    {
                        id: "m1",
                        modelId: "amazon.nova-lite-v1:0",
                        validated: true,
                    },
                ],
            },
        ],
    })
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-b1").click()
    await dialog
        .getByRole("button", { name: "Access keys", exact: true })
        .click()
    await expect(dialog.locator("#aws-access-key-id")).toBeVisible()
    await page.waitForTimeout(300)
    expect((await saved(page)).providers[0].models[0].validated).toBe(true)
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
    await openApp(page, PROVIDERS)
    await sendMessage(page, "Draw a box")
    await openSettings(page)
    const dialog = dialogOf(page)
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
    })
    await openSettings(page)
    const dialog = dialogOf(page)
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
    await openApp(page, PROVIDERS)
    await openSettings(page)
    const dialog = dialogOf(page)
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
    await openApp(page, PROVIDERS)
    await openSettings(page)
    const dialog = dialogOf(page)
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
    expect((await saved(page)).providers).toHaveLength(2)
})

test("the general and drawing tabs hold their settings", async ({ page }) => {
    await openApp(page)
    await openSettingsTab(page, "general")
    const dialog = dialogOf(page)
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
