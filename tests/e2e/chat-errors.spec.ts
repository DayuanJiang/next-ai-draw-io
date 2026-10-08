import { expect, type Page, test } from "@playwright/test"
import { getIframe, sendMessage } from "./lib/fixtures"

/** Answer the chat request with the given response and send a message */
async function chatWith(
    page: Page,
    response: { status: number; contentType: string; body: string },
) {
    await page.route("**/api/chat", (route) => route.fulfill(response))
    await page.goto("/", { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
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
