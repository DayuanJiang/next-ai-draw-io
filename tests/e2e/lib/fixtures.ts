/**
 * Shared helpers for the E2E tests: locators, actions and chat API mocks
 */

import { expect, type Locator, type Page, type Route } from "@playwright/test"
import { createMockSSEResponse, createTextOnlyResponse } from "./helpers"

export { expect, test } from "@playwright/test"

// ============================================
// Locator helpers
// ============================================

/** Get the chat input textarea */
export function getChatInput(page: Page) {
    return page.getByTestId("chat-input")
}

/** Get the draw.io iframe */
export function getIframe(page: Page) {
    return page.locator("iframe")
}

/** Get the iframe's frame locator for internal queries */
export function getIframeContent(page: Page) {
    return page.frameLocator("iframe")
}

/** Open a .drawio file through the app's file picker */
export async function openDrawioFile(page: Page, name: string, xml: string) {
    await page
        .locator('input[type="file"][accept^=".drawio"]')
        .first()
        .setInputFiles({
            name,
            mimeType: "application/xml",
            buffer: Buffer.from(xml),
        })
}

/** Get the settings button */
function getSettingsButton(page: Page) {
    return page.locator('[data-testid="settings-button"]')
}

/** The settings dialog */
export const settingsDialog = (page: Page) =>
    page.getByRole("dialog", { name: "Settings" })

/** Back from a provider's page to the list of the models tab */
export const backToModels = (dialog: Locator) =>
    dialog.locator("header button", { hasText: /^Models$/ }).click()

// ============================================
// Action helpers
// ============================================

/** The key under which the app saves the user's own model configs */
export const MODEL_CONFIGS_KEY = "next-ai-draw-io-model-configs"

/**
 * Open the app and wait for draw.io's frame. A config is saved as the
 * user's model configs on the first load only: a reload keeps what the
 * test did.
 */
export async function openApp(
    page: Page,
    { path = "/", config }: { path?: string; config?: object } = {},
) {
    if (config) {
        await page.addInitScript(
            ([key, config]) => {
                if (!sessionStorage.getItem("seeded")) {
                    localStorage.setItem(key, JSON.stringify(config))
                    sessionStorage.setItem("seeded", "1")
                }
            },
            [MODEL_CONFIGS_KEY, config] as const,
        )
    }
    await page.goto(path, { waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
}

/** The model configs as saved in the browser */
export const savedModelConfigs = (page: Page) =>
    page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "{}"),
        MODEL_CONFIGS_KEY,
    )

/** What another browser tab saving the config looks like to this one */
export async function changeInAnotherTab(
    page: Page,
    change: (config: any) => void,
) {
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
        [MODEL_CONFIGS_KEY, `(${change.toString()})(config)`] as const,
    )
}

/** Send a message in the chat input */
export async function sendMessage(page: Page, message: string) {
    const chatInput = getChatInput(page)
    await expect(chatInput).toBeVisible({ timeout: 10000 })
    await chatInput.fill(message)
    await chatInput.press("ControlOrMeta+Enter")
}

/** Tool calls that finished (version cards and tool rows) */
function getCompletedTools(page: Page) {
    return page.locator('[data-tool-state="output-available"]')
}

/** Wait for diagram generation to complete */
export async function waitForComplete(page: Page, timeout = 15000) {
    await expect(getCompletedTools(page).first()).toBeVisible({ timeout })
}

/** Wait for N finished tool calls */
export async function waitForCompleteCount(
    page: Page,
    count: number,
    timeout = 15000,
) {
    await expect(getCompletedTools(page)).toHaveCount(count, { timeout })
}

/** The file input behind the message box's "Add" menu */
export function getAttachmentInput(page: Page) {
    return page.locator('[data-testid="attachment-input"]')
}

/** The send button (icon only; found by its accessible name) */
export function getSendButton(page: Page, name = "Send") {
    return page.getByRole("button", { name, exact: true })
}

/** Wait for a specific text to appear */
export async function waitForText(page: Page, text: string, timeout = 15000) {
    await expect(page.locator(`text="${text}"`)).toBeVisible({ timeout })
}

/** Open settings dialog */
export async function openSettings(page: Page) {
    await getSettingsButton(page).first().click()
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 })
}

/** Open settings on one of its pages: models, general, drawing, about */
export async function openSettingsTab(
    page: Page,
    tab: "models" | "general" | "drawing" | "about",
) {
    await openSettings(page)
    await page.locator(`[data-testid="settings-tab-${tab}"]`).click()
}

// ============================================
// Test data
// ============================================

/** Two providers with one model each, for the settings dialog's tests */
export const TWO_PROVIDERS = {
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

// ============================================
// Mock helpers
// ============================================

interface MockResponse {
    xml: string
    text: string
}

/**
 * Create a multi-turn mock handler
 * Each request gets the next response in the array
 */
export function createMultiTurnMock(responses: MockResponse[]) {
    let requestCount = 0
    return async (route: Route) => {
        const response =
            responses[requestCount] || responses[responses.length - 1]
        requestCount++
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: createMockSSEResponse(response.xml, response.text),
        })
    }
}

/**
 * Create a mock that alternates between text and diagram responses
 */
export function createMixedMock(
    responses: Array<
        | { type: "text"; text: string }
        | { type: "diagram"; xml: string; text: string }
    >,
) {
    let requestCount = 0
    return async (route: Route) => {
        const response =
            responses[requestCount] || responses[responses.length - 1]
        requestCount++
        if (response.type === "text") {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createTextOnlyResponse(response.text),
            })
        } else {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(response.xml, response.text),
            })
        }
    }
}

/**
 * Answer each chat request with the next reply, in the browser. Each string
 * in a reply is one network chunk, sent gapMs apart, so the throttled UI
 * renders between chunks like with a real model. A number in a reply sets
 * the wait before the next chunk instead. With holdLast, the last reply
 * never ends. Requests past the list get an answer with nothing in it.
 */
export async function chunkedReplies(
    page: Page,
    replies: (string | number)[][],
    {
        gapMs = 300,
        holdLast = false,
    }: { gapMs?: number; holdLast?: boolean } = {},
) {
    await page.addInitScript(
        ({ replies, gapMs, holdLast }) => {
            const realFetch = window.fetch
            let n = 0
            window.fetch = async (input, init) => {
                // Next.js passes URL objects for its own requests
                const url = input instanceof Request ? input.url : String(input)
                if (!url.endsWith("/api/chat")) return realFetch(input, init)
                const index = n++
                const chunks = replies[index] ?? [
                    'data: {"type":"start"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n',
                ]
                const body = new ReadableStream({
                    async start(controller) {
                        for (const [i, chunk] of chunks.entries()) {
                            if (typeof chunk === "number") continue
                            controller.enqueue(new TextEncoder().encode(chunk))
                            const next = chunks[i + 1]
                            await new Promise((r) =>
                                setTimeout(
                                    r,
                                    typeof next === "number" ? next : gapMs,
                                ),
                            )
                        }
                        if (!(holdLast && index === replies.length - 1)) {
                            controller.close()
                        }
                    },
                })
                return new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                })
            }
        },
        { replies, gapMs, holdLast },
    )
}

/** Simple sleep helper */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
