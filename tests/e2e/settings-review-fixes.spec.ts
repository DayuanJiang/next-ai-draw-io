// What the settings review found: each test fails without its fix
import type { Locator, Page } from "@playwright/test"
import {
    expect,
    getIframe,
    openSettings,
    sendMessage,
    test,
} from "./lib/fixtures"

const KEY = "next-ai-draw-io-model-configs"

async function openApp(page: Page, config?: object) {
    if (config) {
        await page.addInitScript(
            ([key, config]) => {
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

const dialogOf = (page: Page) => page.getByRole("dialog", { name: "Settings" })
const saved = (page: Page) =>
    page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), KEY)

/** What another browser tab saving the config looks like to this one */
async function changeInAnotherTab(page: Page, change: (config: any) => void) {
    await page.evaluate(
        ([key, body]) => {
            const config = JSON.parse(localStorage.getItem(key) ?? "{}")
            new Function("config", body)(config)
            const value = JSON.stringify(config)
            localStorage.setItem(key, value)
            window.dispatchEvent(
                new StorageEvent("storage", { key, newValue: value }),
            )
        },
        [KEY, `(${change.toString()})(config)`] as const,
    )
}

const back = (dialog: Locator) =>
    dialog.locator("header button", { hasText: /^Models$/ }).click()

/** Hold the requests to an endpoint; each waits for its own release */
async function holdEach(
    page: Page,
    url: string,
    answer: (n: number) => object,
) {
    const releases: Array<() => void> = []
    await page.route(url, async (route) => {
        const n = releases.length
        await new Promise<void>((r) => releases.push(r))
        await route.fulfill({ json: answer(n) })
    })
    return releases
}

const TWO = {
    version: 1,
    providers: [
        {
            id: "p1",
            provider: "glm",
            apiKey: "k1",
            models: [{ id: "a1", modelId: "glm-a" }],
        },
        {
            id: "p2",
            provider: "kimi",
            apiKey: "k2",
            models: [{ id: "b1", modelId: "kimi-b" }],
        },
    ],
}

test("Add a provider… leaves the cursor in the provider search", async ({
    page,
}) => {
    await openApp(page)
    await page.getByTestId("model-selector").click()
    await page.getByText("Add a provider…").click()
    const search = dialogOf(page).getByRole("searchbox")
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
    await expect(dialogOf(page).getByRole("searchbox")).toBeVisible()
})

test("an Enter that confirms an IME candidate picks no provider", async ({
    page,
}) => {
    await openApp(page)
    await openSettings(page)
    const dialog = dialogOf(page)
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
    expect((await saved(page)).providers ?? []).toHaveLength(0)
})

test("the focus follows the page within the models tab", async ({ page }) => {
    await openApp(page, TWO)
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-p1").focus()
    await page.keyboard.press("Enter")
    await expect(
        dialog.getByRole("heading", { name: "GLM (Zhipu)", exact: true }),
    ).toBeFocused()
    await back(dialog)
    await expect(
        dialog.getByRole("heading", { name: "Models", exact: true }),
    ).toBeFocused()
})

test("long names stay inside the page", async ({ page }) => {
    const long = `model-${"x".repeat(150)}`
    await openApp(page, {
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
    })
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-p1").click()
    const right = async (l: Locator) => {
        const box = await l.boundingBox()
        return box ? box.x + box.width : 0
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

test("Azure needs its resource URL before it counts as connected", async ({
    page,
}) => {
    await openApp(page, {
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
    })
    await openSettings(page)
    const dialog = dialogOf(page)
    await expect(dialog.getByTestId("provider-row-z1")).toContainText(
        "Not set up yet",
    )
    await dialog.getByTestId("provider-row-z1").click()
    await expect(dialog.getByTestId("step-1-todo")).toBeVisible()
    await expect(dialog.getByTestId("test-models")).toBeDisabled()
    await expect(
        dialog.getByText(
            "Fill in the API key and your Azure resource's base URL first.",
        ),
    ).toBeVisible()
    await dialog
        .locator("#base-url")
        .fill("https://contoso.openai.azure.com/openai")
    await expect(dialog.getByTestId("test-models")).toBeEnabled()
})

test("a refused key unchecks step 1, and a fix in another tab clears it", async ({
    page,
}) => {
    await page.route("**/api/validate-model", (route) =>
        route.fulfill({
            json: { valid: false, code: "invalid_api_key", error: "Bad key" },
        }),
    )
    await openApp(page, TWO)
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-p1").click()
    await dialog.getByTestId("test-models").click()
    const key = dialog.locator("#api-key")
    await expect(key).toHaveAttribute("aria-invalid", "true")
    await expect(dialog.getByTestId("step-1-todo")).toBeVisible()
    await changeInAnotherTab(page, (config) => {
        config.providers[0].apiKey = "fixed-key"
        config.providers[0].models[0].validated = undefined
        config.providers[0].models[0].validationError = undefined
    })
    await expect(key).toHaveValue("fixed-key")
    await expect(key).not.toHaveAttribute("aria-invalid", "true")
    await expect(dialog.getByTestId("step-1-done")).toBeVisible()
    await expect(dialog.getByText("1 model failed the test")).toHaveCount(0)
})

test("testing another provider keeps the first one's results", async ({
    page,
}) => {
    const releases = await holdEach(page, "**/api/validate-model", () => ({
        valid: true,
        responseTime: 1000,
    }))
    await openApp(page, TWO)
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-p1").click()
    await dialog.getByTestId("test-models").click()
    await expect.poll(() => releases.length).toBe(1)
    await back(dialog)
    await dialog.getByTestId("provider-row-p2").click()
    await dialog.getByTestId("test-models").click()
    await expect.poll(() => releases.length).toBe(2)
    for (const release of releases) release()
    await expect
        .poll(async () =>
            (await saved(page)).providers.map(
                (p: any) => p.models[0].validated,
            ),
        )
        .toEqual([true, true])
})

test("an older test from before the tabs changed does not undo a newer one", async ({
    page,
}) => {
    // The first test fails, the second passes; the first answers last
    const releases = await holdEach(page, "**/api/validate-model", (n) =>
        n === 0
            ? { valid: false, error: "Old failure" }
            : { valid: true, responseTime: 1000 },
    )
    await openApp(page, TWO)
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-p1").click()
    await dialog.getByTestId("test-models").click()
    await expect.poll(() => releases.length).toBe(1)
    await dialog.getByTestId("settings-tab-general").click()
    await dialog.getByTestId("settings-tab-models").click()
    await dialog.getByTestId("test-models").click()
    await expect.poll(() => releases.length).toBe(2)
    releases[1]()
    await expect(dialog.getByText("Works · 1.0 s")).toBeVisible()
    releases[0]()
    await page.waitForTimeout(500)
    await expect(dialog.getByText("Works · 1.0 s")).toBeVisible()
    expect((await saved(page)).providers[0].models[0].validated).toBe(true)
})

test("a model list fetched with a key another tab replaced is not offered", async ({
    page,
}) => {
    await page.route("**/api/provider-models", (route) =>
        route.fulfill({ json: { models: [{ id: "model-of-old-key" }] } }),
    )
    await openApp(page, TWO)
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-p1").click()
    await dialog.getByRole("button", { name: /^Get all models from/ }).click()
    await expect(
        page.getByRole("option", { name: "model-of-old-key" }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await changeInAnotherTab(page, (config) => {
        config.providers[0].apiKey = "another-key"
    })
    await expect(dialog.locator("#api-key")).toHaveValue("another-key")
    // GLM has no suggested models: nothing to browse until fetched again
    await expect(
        dialog.getByRole("button", { name: "Browse models" }),
    ).toHaveCount(0)
})

test("a model list request keeps only its own provider busy", async ({
    page,
}) => {
    const releases = await holdEach(page, "**/api/provider-models", () => ({
        models: [],
    }))
    await openApp(page, TWO)
    await openSettings(page)
    const dialog = dialogOf(page)
    const fetchButton = dialog.getByRole("button", {
        name: /^Get all models from/,
    })
    await dialog.getByTestId("provider-row-p1").click()
    await fetchButton.click()
    await expect.poll(() => releases.length).toBe(1)
    await expect(fetchButton).toBeDisabled()
    await back(dialog)
    await dialog.getByTestId("provider-row-p2").click()
    await expect(fetchButton).toBeEnabled()
    for (const release of releases) release()
})

test("a model id typed for one provider does not follow to the next", async ({
    page,
}) => {
    await openApp(page, TWO)
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-p1").click()
    const input = dialog.getByPlaceholder("Or type another model ID")
    await input.fill("half-typed")
    await back(dialog)
    await dialog.getByTestId("provider-row-p2").click()
    await expect(input).toHaveValue("")
})

test("Bedrock shows the sign-in that is saved, also after another tab", async ({
    page,
}) => {
    await openApp(page, {
        version: 1,
        providers: [
            {
                id: "b1",
                provider: "bedrock",
                apiKey: "",
                awsAccessKeyId: "AKIAOLD",
                awsSecretAccessKey: "old-secret",
                awsRegion: "us-east-1",
                models: [{ id: "m1", modelId: "amazon.nova-lite-v1:0" }],
            },
        ],
    })
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-b1").click()
    await expect(dialog.locator("#aws-access-key-id")).toHaveValue("AKIAOLD")
    // Another tab signs the provider in with an API key instead
    await changeInAnotherTab(page, (config) => {
        config.providers[0].apiKey = "bedrock-key"
        config.providers[0].awsAccessKeyId = ""
        config.providers[0].awsSecretAccessKey = ""
    })
    await expect(dialog.locator("#bedrock-api-key")).toHaveValue("bedrock-key")
    await expect(dialog.locator("#aws-access-key-id")).toHaveCount(0)
})

test("a refused key opens the provider the request went to", async ({
    page,
}) => {
    // The request waits while another tab selects another provider's model
    let release!: () => void
    const released = new Promise<void>((r) => {
        release = r
    })
    const sentWith: string[] = []
    await page.route("**/api/chat", async (route) => {
        sentWith.push(route.request().headers()["x-ai-provider"] ?? "")
        await released
        await route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
                type: "provider",
                code: "invalid_api_key",
                message: "Incorrect API key",
            }),
        })
    })
    await openApp(page, { ...TWO, selectedModelId: "a1" })
    await sendMessage(page, "Draw a box")
    // Sent to GLM; only then does the other tab pick Kimi's model
    await expect.poll(() => sentWith).toEqual(["glm"])
    await changeInAnotherTab(page, (config) => {
        config.selectedModelId = "b1"
    })
    await expect(page.getByTestId("model-selector")).toContainText("kimi-b")
    release()
    await page
        .getByRole("button", { name: "Open model settings" })
        .click({ timeout: 15000 })
    await expect(
        dialogOf(page).getByRole("heading", {
            name: "GLM (Zhipu)",
            exact: true,
        }),
    ).toBeVisible()
})

test("a local server's base URL is shown from the start", async ({ page }) => {
    await openApp(page, {
        version: 1,
        providers: [{ id: "l1", provider: "ollama", apiKey: "", models: [] }],
    })
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-l1").click()
    await expect(dialog.locator("#base-url")).toBeVisible()
})

test("refused access keys are named as such", async ({ page }) => {
    await page.route("**/api/validate-model", (route) =>
        route.fulfill({
            json: { valid: false, code: "invalid_api_key", error: "Bad keys" },
        }),
    )
    await openApp(page, {
        version: 1,
        providers: [
            {
                id: "b1",
                provider: "bedrock",
                apiKey: "",
                awsAccessKeyId: "AKIA1",
                awsSecretAccessKey: "s",
                awsRegion: "us-east-1",
                models: [{ id: "m1", modelId: "amazon.nova-lite-v1:0" }],
            },
        ],
    })
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-b1").click()
    await dialog.getByTestId("test-models").click()
    await expect(
        dialog.getByText(
            "AWS rejected these access keys. Check that both were copied in full. Bad keys",
        ),
    ).toBeVisible()
    for (const id of ["#aws-access-key-id", "#aws-secret-access-key"]) {
        await expect(dialog.locator(id)).toHaveAttribute("aria-invalid", "true")
    }
})

// Found by the review of the fixes above

test("a slow model list keeps its provider busy while another loads", async ({
    page,
}) => {
    const releases = await holdEach(page, "**/api/provider-models", () => ({
        models: [{ id: "listed-model" }],
    }))
    await openApp(page, TWO)
    await openSettings(page)
    const dialog = dialogOf(page)
    const fetchButton = dialog.getByRole("button", {
        name: /^Get all models from/,
    })
    await dialog.getByTestId("provider-row-p1").click()
    await fetchButton.click()
    await expect.poll(() => releases.length).toBe(1)
    await back(dialog)
    await dialog.getByTestId("provider-row-p2").click()
    await fetchButton.click()
    await expect.poll(() => releases.length).toBe(2)
    releases[1]()
    // B's list opens its picker; close it
    await expect(
        page.getByRole("option", { name: "listed-model" }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("listbox")).toHaveCount(0)
    await back(dialog)
    await dialog.getByTestId("provider-row-p1").click()
    // The first request is still out
    await expect(fetchButton).toBeDisabled()
    releases[0]()
    // A's list arrives and opens its picker; afterwards A can fetch again
    await expect(
        page.getByRole("option", { name: "listed-model" }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(fetchButton).toBeEnabled()
})

test("refused keys stay marked for each provider", async ({ page }) => {
    await page.route("**/api/validate-model", (route) =>
        route.fulfill({
            json: { valid: false, code: "invalid_api_key", error: "Bad key" },
        }),
    )
    await openApp(page, TWO)
    await openSettings(page)
    const dialog = dialogOf(page)
    const key = dialog.locator("#api-key")
    await dialog.getByTestId("provider-row-p1").click()
    await dialog.getByTestId("test-models").click()
    await expect(key).toHaveAttribute("aria-invalid", "true")
    await back(dialog)
    await dialog.getByTestId("provider-row-p2").click()
    await dialog.getByTestId("test-models").click()
    await expect(key).toHaveAttribute("aria-invalid", "true")
    await back(dialog)
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
    await openApp(page, TWO)
    await openSettings(page)
    const dialog = dialogOf(page)
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
    await page.route("**/api/provider-models", (route) =>
        route.fulfill({ json: { models: [] } }),
    )
    // OpenAI has suggested models: they come back once the key changes
    await openApp(page, {
        version: 1,
        providers: [{ id: "o1", provider: "openai", apiKey: "k", models: [] }],
    })
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-o1").click()
    await dialog.getByRole("button", { name: /^Get all models from/ }).click()
    await expect(
        dialog.getByText("The provider returned no models."),
    ).toBeVisible()
    await dialog.locator("#api-key").fill("k-new")
    await expect(
        dialog.getByRole("button", { name: "Browse models" }),
    ).toBeVisible()
    await page.waitForTimeout(300)
    // The picker did not open by itself
    await expect(page.getByRole("listbox")).toHaveCount(0)
    await expect(dialog.locator("#api-key")).toBeFocused()
})

test("emptying Bedrock's access keys to type new ones keeps their fields", async ({
    page,
}) => {
    await openApp(page, {
        version: 1,
        providers: [
            {
                id: "b1",
                provider: "bedrock",
                apiKey: "",
                awsAccessKeyId: "AKIAOLD",
                awsSecretAccessKey: "old-secret",
                awsRegion: "us-east-1",
                models: [{ id: "m1", modelId: "amazon.nova-lite-v1:0" }],
            },
        ],
    })
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-b1").click()
    await dialog.locator("#aws-secret-access-key").fill("")
    await dialog.locator("#aws-access-key-id").fill("")
    await expect(dialog.locator("#bedrock-api-key")).toHaveCount(0)
    await dialog.locator("#aws-access-key-id").fill("AKIANEW")
    await expect
        .poll(async () => (await saved(page)).providers[0])
        .toMatchObject({ apiKey: "", awsAccessKeyId: "AKIANEW" })
})

test("a provider added in another tab while sending is the one its error opens", async ({
    page,
}) => {
    const sentWith: string[] = []
    await page.route("**/api/chat", async (route) => {
        sentWith.push(route.request().headers()["x-ai-provider"] ?? "")
        await route.fulfill({
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({
                type: "provider",
                code: "invalid_api_key",
                message: "Incorrect API key",
            }),
        })
    })
    await openApp(page, { ...TWO, selectedModelId: "a1" })
    await page.getByTestId("chat-input").fill("Draw a box")
    // Send, and right away another tab adds DeepSeek and picks its model,
    // while this tab still prepares the request (it exports the diagram)
    await page.evaluate((key) => {
        const send = document.querySelector<HTMLButtonElement>(
            'button[aria-label="Send"]',
        )
        send?.click()
        const config = JSON.parse(localStorage.getItem(key) ?? "{}")
        config.providers.push({
            id: "p3",
            provider: "deepseek",
            apiKey: "k3",
            models: [{ id: "c1", modelId: "deepseek-chat" }],
        })
        config.selectedModelId = "c1"
        const value = JSON.stringify(config)
        localStorage.setItem(key, value)
        window.dispatchEvent(
            new StorageEvent("storage", { key, newValue: value }),
        )
    }, KEY)
    await expect.poll(() => sentWith).toEqual(["deepseek"])
    await page
        .getByRole("button", { name: "Open model settings" })
        .click({ timeout: 15000 })
    await expect(
        dialogOf(page).getByRole("heading", { name: "DeepSeek", exact: true }),
    ).toBeVisible()
})

// After #957 merged

test("temporary Bedrock access keys can carry their session token", async ({
    page,
}) => {
    const bodies: any[] = []
    await page.route("**/api/validate-model", async (route) => {
        bodies.push(route.request().postDataJSON())
        await route.fulfill({ json: { valid: true, responseTime: 900 } })
    })
    await openApp(page, {
        version: 1,
        providers: [
            {
                id: "b1",
                provider: "bedrock",
                apiKey: "",
                awsAccessKeyId: "ASIATEMP",
                awsSecretAccessKey: "secret",
                awsRegion: "us-east-1",
                models: [{ id: "m1", modelId: "amazon.nova-lite-v1:0" }],
            },
        ],
    })
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-b1").click()
    await dialog.getByLabel("AWS session token (optional)").fill("session-1")
    await dialog.getByTestId("test-models").click()
    await expect.poll(() => bodies.length).toBe(1)
    expect(bodies[0]).toMatchObject({
        awsAccessKeyId: "ASIATEMP",
        awsSessionToken: "session-1",
    })
    expect((await saved(page)).providers[0].awsSessionToken).toBe("session-1")
})

test("Bedrock with both kinds of credentials offers to remove the access keys", async ({
    page,
}) => {
    await openApp(page, {
        version: 1,
        providers: [
            {
                id: "b1",
                provider: "bedrock",
                apiKey: "bedrock-key",
                awsAccessKeyId: "AKIAOLD",
                awsSecretAccessKey: "old-secret",
                awsSessionToken: "old-token",
                awsRegion: "us-east-1",
                models: [{ id: "m1", modelId: "amazon.nova-lite-v1:0" }],
            },
        ],
    })
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-b1").click()
    const notice = dialog.getByText(/also keeps an access key pair/)
    await expect(notice).toBeVisible()
    await dialog.getByRole("button", { name: "Remove the access keys" }).click()
    await expect(notice).toHaveCount(0)
    await expect
        .poll(async () => (await saved(page)).providers[0])
        .toMatchObject({
            apiKey: "bedrock-key",
            awsAccessKeyId: "",
            awsSecretAccessKey: "",
            awsSessionToken: "",
        })
    await expect(dialog.locator("#bedrock-api-key")).toHaveValue("bedrock-key")
})

test("the test result goes to a live region that is there from the start", async ({
    page,
}) => {
    await page.route("**/api/validate-model", (route) =>
        route.fulfill({ json: { valid: true, responseTime: 900 } }),
    )
    await openApp(page, TWO)
    await openSettings(page)
    const dialog = dialogOf(page)
    await dialog.getByTestId("provider-row-p1").click()
    const result = dialog.getByTestId("test-result")
    await expect(result).toHaveAttribute("role", "status")
    await expect(result).toHaveText("")
    await dialog.getByTestId("test-models").click()
    await expect(result).toHaveText("glm-a works")
})

test("removing access keys kept behind an API key keeps the test results", async ({
    page,
}) => {
    await openApp(page, {
        version: 1,
        providers: [
            {
                id: "b1",
                provider: "bedrock",
                apiKey: "bedrock-key",
                awsAccessKeyId: "AKIAOLD",
                awsSecretAccessKey: "old-secret",
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
    await dialog.getByRole("button", { name: "Remove the access keys" }).focus()
    await page.keyboard.press("Enter")
    await expect
        .poll(async () => (await saved(page)).providers[0].awsAccessKeyId)
        .toBe("")
    // The API key was the one in use: its result still holds
    expect((await saved(page)).providers[0].models[0].validated).toBe(true)
    await expect(dialog.locator("#bedrock-api-key")).toBeFocused()
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
    await openApp(page, TWO)
    await openSettings(page)
    const dialog = dialogOf(page)
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
