// The thinking switch on a model row: only where the model has one, saved
// with the model, and sent with the chat request
import { expect, openApp, savedModelConfigs, test } from "./lib/fixtures"

test("a model's thinking switch is saved and sent with the chat", async ({
    page,
}) => {
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                {
                    id: "a1",
                    provider: "anthropic",
                    apiKey: "user-key",
                    models: [
                        { id: "m1", modelId: "claude-sonnet-4-5" },
                        // Never thinks: no switch
                        { id: "m2", modelId: "claude-3-5-haiku-20241022" },
                    ],
                },
            ],
            selectedModelId: "m1",
        },
    })
    await page.getByTestId("model-selector").click()
    await page.getByText("Configure Models...").click()
    const dialog = page.locator('[role="dialog"]')
    await dialog.getByTestId("provider-row-a1").click()

    const switches = dialog.getByRole("switch", { name: "Thinking mode" })
    await expect(switches).toHaveCount(1)
    await expect(switches).toBeChecked()
    await switches.click()
    await expect
        .poll(
            async () =>
                (await savedModelConfigs(page)).providers[0].models[0]
                    .thinkingEnabled,
        )
        .toBe(false)

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
    const input = page.getByTestId("chat-input")
    await input.fill("Hello")
    await input.press("ControlOrMeta+Enter")
    await expect.poll(() => headers["x-ai-thinking-enabled"]).toBe("false")
})
