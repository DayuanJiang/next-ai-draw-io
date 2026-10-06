import {
    expect,
    getChatInput,
    getIframe,
    sendMessage,
    test,
} from "./lib/fixtures"
import { createTextOnlyResponse } from "./lib/helpers"

test.describe("Chat Panel", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    })

    test("page has interactive elements", async ({ page }) => {
        const buttons = page.locator("button")
        const count = await buttons.count()
        expect(count).toBeGreaterThan(0)
    })

    test("draw.io iframe is interactive", async ({ page }) => {
        const iframe = getIframe(page)
        await expect(iframe).toBeVisible()

        const src = await iframe.getAttribute("src")
        expect(src).toBeTruthy()
    })
})

test.describe("Crossing the mobile breakpoint", () => {
    test.beforeEach(async ({ page }) => {
        // A text answer that arrives in parts over a few seconds
        await page.addInitScript(() => {
            const realFetch = window.fetch
            window.fetch = async (input, init) => {
                const url = input instanceof Request ? input.url : String(input)
                if (!url.endsWith("/api/chat")) return realFetch(input, init)
                const events = [
                    { type: "start" },
                    { type: "text-start", id: "t" },
                    { type: "text-delta", id: "t", delta: "Once upon" },
                    { type: "text-delta", id: "t", delta: " a time." },
                    { type: "text-end", id: "t" },
                    { type: "finish" },
                ]
                const body = new ReadableStream({
                    async start(controller) {
                        for (const event of events) {
                            controller.enqueue(
                                new TextEncoder().encode(
                                    `data: ${JSON.stringify(event)}\n\n`,
                                ),
                            )
                            await new Promise((r) => setTimeout(r, 1500))
                        }
                        controller.enqueue(
                            new TextEncoder().encode("data: [DONE]\n\n"),
                        )
                        controller.close()
                    },
                })
                return new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                })
            }
        })
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    })

    test("keeps the chat and its streaming answer", async ({ page }) => {
        await sendMessage(page, "Tell me a story")
        await expect(page.getByText("Once upon")).toBeVisible({
            timeout: 10000,
        })

        // Phones show the canvas or the chat, one at a time
        await page.setViewportSize({ width: 600, height: 900 })
        await page.getByRole("button", { name: "Chat", exact: true }).click()
        await expect(page.getByText("Tell me a story")).toBeVisible()

        await page.setViewportSize({ width: 1280, height: 800 })
        await expect(page.getByText("Once upon a time.")).toBeVisible({
            timeout: 10000,
        })
        await expect(page.getByText("Tell me a story")).toBeVisible()
    })

    test("reaches a chat hidden on desktop", async ({ page }) => {
        // The start screen has no chat panel yet
        await page.getByTestId("draw-yourself").click()
        await page.getByRole("button", { name: "Hide chat panel" }).click()
        await expect(getChatInput(page)).toBeHidden()

        await page.setViewportSize({ width: 600, height: 900 })
        await page.getByRole("button", { name: "Chat", exact: true }).click()
        await expect(getChatInput(page)).toBeVisible()

        await page.setViewportSize({ width: 1280, height: 800 })
        await page.getByTestId("show-panel").click()
        await expect(getChatInput(page)).toBeVisible()
    })
})

test.describe("Sending", () => {
    test("a double Enter sends the message once", async ({ page }) => {
        let requests = 0
        await page.route("**/api/chat", async (route) => {
            requests++
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createTextOnlyResponse("Hello there."),
            })
        })
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
        const input = getChatInput(page)
        await input.fill("Hi")
        // The second press comes while the diagram is being exported
        await input.press("ControlOrMeta+Enter")
        await input.press("ControlOrMeta+Enter")
        await expect(page.getByText("Hello there.")).toBeVisible({
            timeout: 10000,
        })
        await page.waitForTimeout(1500)
        expect(requests).toBe(1)
        await expect(page.getByText("Hello there.")).toHaveCount(1)
    })
})
