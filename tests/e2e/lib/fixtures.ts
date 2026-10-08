/**
 * Playwright test fixtures for E2E tests
 * Uses test.extend to provide common setup and helpers
 */

import { test as base, expect, type Page, type Route } from "@playwright/test"
import { createMockSSEResponse, createTextOnlyResponse } from "./helpers"

/**
 * Extended test with common fixtures
 */
export const test = base.extend<{
    /** Page with iframe already loaded */
    appPage: Page
}>({
    appPage: async ({ page }, use) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
        await use(page)
    },
})

export { expect }

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
export function getSettingsButton(page: Page) {
    return page.locator('[data-testid="settings-button"]')
}

// ============================================
// Action helpers
// ============================================

/** Send a message in the chat input */
export async function sendMessage(page: Page, message: string) {
    const chatInput = getChatInput(page)
    await expect(chatInput).toBeVisible({ timeout: 10000 })
    await chatInput.fill(message)
    await chatInput.press("ControlOrMeta+Enter")
}

/** Tool calls that finished (version cards and tool rows) */
export function getCompletedTools(page: Page) {
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
// Mock helpers
// ============================================

interface MockResponse {
    xml: string
    text: string
    toolName?: string
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
            body: createMockSSEResponse(
                response.xml,
                response.text,
                response.toolName,
            ),
        })
    }
}

/**
 * Create a mock that returns text-only responses
 */
export function createTextOnlyMock(responses: string[]) {
    let requestCount = 0
    return async (route: Route) => {
        const text = responses[requestCount] || responses[responses.length - 1]
        requestCount++
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: createTextOnlyResponse(text),
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
 * Create a mock that returns an error
 */
export function createErrorMock(status: number, error: string) {
    return async (route: Route) => {
        await route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify({ error }),
        })
    }
}

// ============================================
// Persistence helpers
// ============================================

/**
 * Test that state persists across page reload.
 * Runs assertions before reload, reloads page, then runs assertions again.
 * Keep assertions narrow and explicit - test one specific thing.
 *
 * @param page - Playwright page
 * @param description - What persistence is being tested (for debugging)
 * @param assertion - Async function with expect() calls
 */
export async function expectBeforeAndAfterReload(
    page: Page,
    description: string,
    assertion: () => Promise<void>,
) {
    await test.step(`verify ${description} before reload`, assertion)
    await page.reload({ waitUntil: "networkidle" })
    await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
    await test.step(`verify ${description} after reload`, assertion)
}

/** Simple sleep helper */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
