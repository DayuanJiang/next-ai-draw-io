import { expect, type Page, test } from "@playwright/test"
import { getChatInput, openApp, sendMessage } from "./lib/fixtures"
import { sse } from "./lib/helpers"

/** Answer the chat request with the given response and send a message */
async function chatWith(
    page: Page,
    response: { status: number; contentType: string; body: string },
) {
    await page.route("**/api/chat", (route) => route.fulfill(response))
    await openApp(page)
    await sendMessage(page, "Draw a box")
}

test("a rejected key shows a hint, the provider's words and a settings button", async ({
    page,
}) => {
    await chatWith(page, {
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
            type: "provider",
            code: "invalid_api_key",
            message: "Authentication Fails, Your api key is invalid",
        }),
    })
    await expect(
        page.getByText("The provider rejected the API key"),
    ).toBeVisible({
        timeout: 15000,
    })
    // First match: the Next.js dev overlay at the end also lists the error
    await expect(page.getByText("Authentication Fails").first()).toBeVisible()
    await page.getByRole("button", { name: "Open model settings" }).click()
    // A server model answered: settings opens on the models tab's list
    const dialog = page.getByRole("dialog", { name: "Settings" })
    await expect(dialog).toBeVisible()
    await expect(
        dialog.getByRole("heading", { name: "Models", exact: true }),
    ).toBeVisible()
    await expect(dialog.getByText("Use your own API key")).toBeVisible()
})

test("an error before the stream shows its text, not raw JSON", async ({
    page,
}) => {
    await chatWith(page, {
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
            error: 'Model "x" is not available on the server',
        }),
    })
    // The whole message, not the JSON around it (the Next.js dev overlay
    // also lists the raw console error; it is not part of the app)
    await expect(
        page.getByText('Model "x" is not available on the server', {
            exact: true,
        }),
    ).toBeVisible({ timeout: 15000 })
})

test("a gateway's HTML error page shows as its title, not its source", async ({
    page,
}) => {
    // What Cloudflare or nginx answer while the server behind them restarts
    await chatWith(page, {
        status: 502,
        contentType: "text/html",
        body: "<!DOCTYPE html>\n<html>\n<head><title>502 Bad Gateway</title></head>\n<body>\n<center><h1>502 Bad Gateway</h1></center>\n<hr><center>cloudflare</center>\n</body>\n</html>",
    })
    // (Next.js has an alert of its own, for route changes)
    const card = page.getByTestId("chat-panel").getByRole("alert")
    await expect(card).toContainText("The server could not answer.", {
        timeout: 15000,
    })
    await expect(card).toContainText("502 Bad Gateway")
    await expect(card).not.toContainText("<html")
    await expect(card).not.toContainText("cloudflare")
})

test("a connection that breaks while the answer streams says so in words", async ({
    page,
}) => {
    // Chrome's own text for it is "network error"
    await page.addInitScript(() => {
        const realFetch = window.fetch
        window.fetch = async (input, init) => {
            const url = input instanceof Request ? input.url : String(input)
            if (!url.endsWith("/api/chat")) return realFetch(input, init)
            const body = new ReadableStream({
                start(controller) {
                    controller.enqueue(
                        new TextEncoder().encode('data: {"type":"start"}\n\n'),
                    )
                    controller.error(new TypeError("network error"))
                },
            })
            return new Response(body, {
                headers: { "content-type": "text/event-stream" },
            })
        }
    })
    await openApp(page)
    await sendMessage(page, "Draw a box")
    await expect(
        page.getByText(
            "The connection broke before the answer was complete. Try again.",
        ),
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId("retry-button")).toBeVisible()
})

test("the record of a chat error says where it was thrown", async ({
    page,
}) => {
    // A server that keeps error records
    const records: any[] = []
    await page.route("**/api/log-client-error", (route) => {
        if (route.request().method() !== "POST") {
            return route.fulfill({ json: { enabled: true } })
        }
        records.push(route.request().postDataJSON())
        return route.fulfill({ json: { logged: true } })
    })
    // Thrown inside the page, by the code that reads the stream: text for
    // a part that never started
    await chatWith(page, {
        status: 200,
        contentType: "text/event-stream",
        body: sse([
            { type: "start" },
            { type: "text-delta", id: "t1", delta: "Hello" },
        ]),
    })
    await expect(page.getByTestId("retry-button")).toBeVisible({
        timeout: 15000,
    })
    await expect.poll(() => records.length).toBe(1)
    expect(records[0].kind).toBe("chat-error")
    expect(records[0].stack).toContain("/_next/static/chunks/")
})

test("a provider rate limit is not shown as this site's quota", async ({
    page,
}) => {
    const errorText = JSON.stringify({
        type: "provider",
        code: "rate_limited",
        message: "Rate limit exceeded for your organization",
    })
    await chatWith(page, {
        status: 200,
        contentType: "text/event-stream",
        body: `data: {"type":"start"}\n\ndata: ${JSON.stringify({ type: "error", errorText })}\n\ndata: [DONE]\n\n`,
    })
    await expect(
        page.getByText("The provider is limiting requests"),
    ).toBeVisible({ timeout: 15000 })
    // The site's own tokens-per-minute toast
    await expect(page.getByText("Rate limit reached")).toHaveCount(0)
})

test("a refused server key shows only the quota hint and a settings button", async ({
    page,
}) => {
    // What the chat route streams when the server's key gets a 403, e.g.
    // after a daily spend cap blocked it
    const errorText = JSON.stringify({
        type: "provider",
        code: "server_key_forbidden",
        message: "",
    })
    await chatWith(page, {
        status: 200,
        contentType: "text/event-stream",
        body: `data: {"type":"start"}\n\ndata: ${JSON.stringify({ type: "error", errorText })}\n\ndata: [DONE]\n\n`,
    })
    await expect(
        page.getByText("Today's free quota is used up", { exact: false }),
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("The provider returned an error")).toHaveCount(
        0,
    )
    await page.getByRole("button", { name: "Open model settings" }).click()
    // A server model answered: settings opens on the models tab's list
    const dialog = page.getByRole("dialog", { name: "Settings" })
    await expect(dialog).toBeVisible()
    await expect(
        dialog.getByRole("heading", { name: "Models", exact: true }),
    ).toBeVisible()
    await expect(dialog.getByText("Use your own API key")).toBeVisible()
})

test("an edit that ran on what arrived before the output limit says it was cut off", async ({
    page,
}) => {
    // The server repairs the cut off JSON of a tool call, so the edit runs
    // with the operations written before the limit and reports success
    await chatWith(page, {
        status: 200,
        contentType: "text/event-stream",
        body: sse([
            { type: "start" },
            { type: "start-step" },
            {
                type: "tool-input-available",
                toolCallId: "e1",
                toolName: "edit_diagram",
                input: {
                    operations: [
                        {
                            operation: "add",
                            cell_id: "a",
                            new_xml:
                                '<mxCell id="a" value="Alpha" style="rounded=1;" x="40" y="40" w="120" h="60"/>',
                        },
                    ],
                },
            },
            { type: "finish-step" },
            { type: "finish", finishReason: "length" },
        ]),
    })
    await expect(page.frameLocator("iframe").getByText("Alpha")).toBeVisible({
        timeout: 15000,
    })
    await expect(
        page.getByText("The output was cut off before the diagram was"),
    ).toBeVisible()
    await expect(page.getByTestId("retry-button")).toBeVisible()
})

// An answer that spent the whole output limit thinking and drew nothing
const ALL_THINKING = {
    status: 200,
    contentType: "text/event-stream",
    body: sse([
        { type: "start" },
        { type: "start-step" },
        { type: "reasoning-start", id: "r1" },
        { type: "reasoning-delta", id: "r1", delta: "Where does each box go?" },
        { type: "reasoning-end", id: "r1" },
        { type: "finish-step" },
        {
            type: "finish",
            finishReason: "length",
            messageMetadata: {
                usage: {
                    inputTokens: 900,
                    outputTokens: 64000,
                    cacheReadTokens: 0,
                    reasoningTokens: 64000,
                    durationMs: 385000,
                },
            },
        },
    ]),
}

test("thinking that used up the output limit points to the model's thinking switch", async ({
    page,
}) => {
    await page.route("**/api/chat", (route) => route.fulfill(ALL_THINKING))
    // The user's own model, whose thinking switch is on
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                {
                    id: "d1",
                    provider: "deepseek",
                    apiKey: "user-key",
                    models: [{ id: "m1", modelId: "deepseek-v4-pro" }],
                },
            ],
            selectedModelId: "m1",
        },
    })
    await sendMessage(page, "Draw a box")
    await expect(
        page.getByText("Thinking used up most of the output limit"),
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("raise the output limit")).toHaveCount(0)
    await expect(page.getByTestId("retry-button")).toBeVisible()
    // The card's button opens the provider's page, where the switch is
    await page.getByRole("button", { name: "Open model settings" }).click()
    await expect(
        page.getByRole("switch", { name: "Thinking mode" }),
    ).toBeChecked()
})

test("without a thinking switch the same answer keeps the advice to raise the limit", async ({
    page,
}) => {
    // A server model: its thinking is not the user's to turn off
    await chatWith(page, ALL_THINKING)
    await expect(
        page.getByText("The output was cut off before the diagram was"),
    ).toBeVisible({ timeout: 15000 })
    await expect(
        page.getByRole("button", { name: "Open model settings" }),
    ).toHaveCount(0)
})

test("an answer that ends on a shape library lookup says it ended early", async ({
    page,
}) => {
    // The server allows five steps a request: a model that spends them
    // all on lookups never gets to draw
    await chatWith(page, {
        status: 200,
        contentType: "text/event-stream",
        body: sse([
            { type: "start" },
            { type: "start-step" },
            {
                type: "tool-input-available",
                toolCallId: "l1",
                toolName: "get_shape_library",
                input: { library: "aws4" },
            },
            {
                type: "tool-output-available",
                toolCallId: "l1",
                output: "AWS shapes",
            },
            { type: "finish-step" },
            { type: "finish", finishReason: "tool-calls" },
        ]),
    })
    await expect(
        page.getByText("The answer ended before the diagram was finished."),
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId("retry-button")).toBeVisible()
})

test("an answer with nothing in it says so, with Retry", async ({ page }) => {
    // Some providers end a reply like this when a filter drops its content
    await chatWith(page, {
        status: 200,
        contentType: "text/event-stream",
        body: sse([
            { type: "start" },
            { type: "start-step" },
            { type: "finish-step" },
            { type: "finish", finishReason: "stop" },
        ]),
    })
    await expect(
        page.getByText("The model returned an empty answer."),
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId("retry-button")).toBeVisible()
})

test("a server model removed meanwhile gives way to the default, and Retry works", async ({
    page,
}) => {
    const model = (name: string, isDefault = false) => ({
        id: `server:fake:${name}`,
        modelId: name,
        provider: "openai",
        providerLabel: "Fake",
        isDefault,
    })
    // The admin removes "second" after the page has loaded
    let lists = 0
    await page.route("**/api/server-models", (route) =>
        route.fulfill({
            json: {
                models:
                    lists++ === 0
                        ? [model("first", true), model("second")]
                        : [model("first", true)],
            },
        }),
    )
    const selected: (string | undefined)[] = []
    await page.route("**/api/chat", (route) => {
        const id = route.request().headers()["x-selected-model-id"]
        selected.push(id)
        return id === "server:fake:second"
            ? route.fulfill({
                  status: 400,
                  json: {
                      error: "This model is no longer available on this server.",
                      code: "server_model_gone",
                  },
              })
            : route.fulfill({
                  status: 200,
                  contentType: "text/event-stream",
                  body: sse([
                      { type: "start" },
                      { type: "text-start", id: "t" },
                      { type: "text-delta", id: "t", delta: "Here you are." },
                      { type: "text-end", id: "t" },
                      { type: "finish" },
                  ]),
              })
    })
    await openApp(page, {
        config: {
            version: 1,
            providers: [],
            selectedModelId: "server:fake:second",
        },
    })
    await sendMessage(page, "Draw a box")
    await expect(
        page.getByText("This model is no longer on the server."),
    ).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId("model-selector")).toContainText("first")
    await page.getByTestId("retry-button").click()
    await expect(page.getByText("Here you are.")).toBeVisible()
    expect(selected).toEqual(["server:fake:second", "server:fake:first"])
})

// The quota toast reads the dictionary: outside its provider it threw and
// the whole page went to the error screen
for (const [type, title] of [
    ["request", "Daily Quota Reached"],
    ["token", "Daily Token Limit Reached"],
] as const) {
    test(`the daily ${type} limit shows its toast and the page stays`, async ({
        page,
    }) => {
        await chatWith(page, {
            status: 429,
            contentType: "application/json",
            body: JSON.stringify({
                error: "Daily limit exceeded",
                type,
                used: 50,
                limit: 50,
            }),
        })
        await expect(page.getByText(title)).toBeVisible({ timeout: 15000 })
        await getChatInput(page).fill("Still here")
        await expect(getChatInput(page)).toHaveValue("Still here")
        await page.getByRole("button", { name: "Use Your API Key" }).click()
        await expect(
            page.getByRole("dialog", { name: "Settings" }),
        ).toBeVisible()
    })
}
