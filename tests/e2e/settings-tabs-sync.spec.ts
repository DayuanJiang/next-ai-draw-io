// Settings changed by another browser tab, and answers that arrive late
import type { Page } from "@playwright/test"
import {
    backToModels,
    changeInAnotherTab,
    expect,
    MODEL_CONFIGS_KEY,
    openApp,
    openSettings,
    savedModelConfigs,
    sendMessage,
    settingsDialog,
    TWO_PROVIDERS,
    test,
} from "./lib/fixtures"

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

test("a refused key unchecks step 1, and a fix in another tab clears it", async ({
    page,
}) => {
    await page.route("**/api/validate-model", (route) =>
        route.fulfill({
            json: { valid: false, code: "invalid_api_key", error: "Bad key" },
        }),
    )
    await openApp(page, { config: TWO_PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
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

test("a model list fetched with a key another tab replaced is not offered", async ({
    page,
}) => {
    await page.route("**/api/provider-models", (route) =>
        route.fulfill({ json: { models: [{ id: "model-of-old-key" }] } }),
    )
    await openApp(page, { config: TWO_PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
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
    await openApp(page, { config: { ...TWO_PROVIDERS, selectedModelId: "a1" } })
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
        settingsDialog(page).getByRole("heading", {
            name: "GLM (Zhipu)",
            exact: true,
        }),
    ).toBeVisible()
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
    await openApp(page, { config: { ...TWO_PROVIDERS, selectedModelId: "a1" } })
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
    }, MODEL_CONFIGS_KEY)
    await expect.poll(() => sentWith).toEqual(["deepseek"])
    await page
        .getByRole("button", { name: "Open model settings" })
        .click({ timeout: 15000 })
    await expect(
        settingsDialog(page).getByRole("heading", {
            name: "DeepSeek",
            exact: true,
        }),
    ).toBeVisible()
})

test("testing another provider keeps the first one's results", async ({
    page,
}) => {
    const releases = await holdEach(page, "**/api/validate-model", () => ({
        valid: true,
        responseTime: 1000,
    }))
    await openApp(page, { config: TWO_PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-p1").click()
    await dialog.getByTestId("test-models").click()
    await expect.poll(() => releases.length).toBe(1)
    await backToModels(dialog)
    await dialog.getByTestId("provider-row-p2").click()
    await dialog.getByTestId("test-models").click()
    await expect.poll(() => releases.length).toBe(2)
    for (const release of releases) release()
    await expect
        .poll(async () =>
            (await savedModelConfigs(page)).providers.map(
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
    await openApp(page, { config: TWO_PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
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
    expect(
        (await savedModelConfigs(page)).providers[0].models[0].validated,
    ).toBe(true)
})

test("a slow model list keeps its provider busy while another loads", async ({
    page,
}) => {
    const releases = await holdEach(page, "**/api/provider-models", () => ({
        models: [{ id: "listed-model" }],
    }))
    await openApp(page, { config: TWO_PROVIDERS })
    await openSettings(page)
    const dialog = settingsDialog(page)
    const fetchButton = dialog.getByRole("button", {
        name: /^Get all models from/,
    })
    await dialog.getByTestId("provider-row-p1").click()
    await fetchButton.click()
    await expect.poll(() => releases.length).toBe(1)
    await backToModels(dialog)
    await dialog.getByTestId("provider-row-p2").click()
    await expect(fetchButton).toBeEnabled()
    await fetchButton.click()
    await expect.poll(() => releases.length).toBe(2)
    releases[1]()
    // B's list opens its picker; close it
    await expect(
        page.getByRole("option", { name: "listed-model" }),
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("listbox")).toHaveCount(0)
    await backToModels(dialog)
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
