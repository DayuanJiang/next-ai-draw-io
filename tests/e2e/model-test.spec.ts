import { expect, test } from "@playwright/test"
import { getIframe } from "./lib/fixtures"

// One provider with three models; the test endpoint answers each differently
const CONFIG = {
    version: 1,
    providers: [
        {
            id: "p1",
            provider: "glm",
            apiKey: "test-key",
            models: [
                { id: "m1", modelId: "model-ok" },
                { id: "m2", modelId: "model-no-tools" },
                { id: "m3", modelId: "model-broken" },
            ],
        },
    ],
}

test("the Test button checks all models at once and shows each result", async ({
    page,
}) => {
    await page.addInitScript((config) => {
        localStorage.setItem(
            "next-ai-draw-io-model-configs",
            JSON.stringify(config),
        )
    }, CONFIG)
    const started: string[] = []
    await page.route("**/api/validate-model", async (route) => {
        const { modelId } = route.request().postDataJSON()
        started.push(modelId)
        // Answer only once all three requests arrived: they run in parallel
        while (started.length < 3) await new Promise((r) => setTimeout(r, 50))
        const answers: Record<string, object> = {
            "model-ok": { valid: true, responseTime: 1234 },
            "model-no-tools": {
                valid: true,
                responseTime: 800,
                warning:
                    "Connected, but the model answered without calling a tool.",
            },
            "model-broken": { valid: false, error: "Model not found" },
        }
        await route.fulfill({ json: answers[modelId] })
    })
    await page.goto("/", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

    await page.locator("button:has(svg.lucide-bot)").first().click()
    await page.getByText("Configure Models...").click()
    const dialog = page.locator('[role="dialog"]')
    await dialog.getByText("GLM (Zhipu)").first().click()
    await dialog.getByRole("button", { name: "Test", exact: true }).click()

    await expect(
        dialog.getByText("answered without calling a tool"),
    ).toBeVisible({ timeout: 15000 })
    await expect(dialog.getByText("Model not found")).toBeVisible()
    await expect(dialog.locator('[title="1.2 s"]')).toBeVisible()
    expect(started.sort()).toEqual([
        "model-broken",
        "model-no-tools",
        "model-ok",
    ])
})

test("the key link and the base URL cleanup", async ({ page }) => {
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
    await dialog.getByText("GLM (Zhipu)").first().click()

    await expect(
        dialog.getByRole("link", { name: "Get API key" }),
    ).toHaveAttribute(
        "href",
        "https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys",
    )
    const baseUrl = dialog.locator("#base-url")
    await baseUrl.fill("https://proxy.example.com/v4/chat/completions/")
    await baseUrl.blur()
    await expect(baseUrl).toHaveValue("https://proxy.example.com/v4")
    await expect(
        dialog.getByText(
            "Requests go to https://proxy.example.com/v4/chat/completions",
        ),
    ).toBeVisible()
})
