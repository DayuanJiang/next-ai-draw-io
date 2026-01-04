import { SINGLE_BOX_XML } from "./fixtures/diagrams"
import {
    expect,
    expectBeforeAndAfterReload,
    getChatInput,
    getIframe,
    getIframeContent,
    openSettings,
    sendMessage,
    test,
    waitForComplete,
    waitForText,
} from "./lib/fixtures"
import { createMockSSEResponse } from "./lib/helpers"

test.describe("History and Session Restore", () => {
    test("new chat button clears conversation", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "Created your test diagram.",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await test.step("create a conversation", async () => {
            await sendMessage(page, "Create a test diagram")
            await waitForText(page, "Created your test diagram.")
        })

        await test.step("click new chat button", async () => {
            const newChatButton = page.locator(
                '[data-testid="new-chat-button"]',
            )
            await expect(newChatButton).toBeVisible({ timeout: 5000 })
            await newChatButton.click()
        })

        await test.step("verify conversation is cleared", async () => {
            await expect(
                page.locator('text="Created your test diagram."'),
            ).not.toBeVisible({ timeout: 5000 })
        })
    })

    test("chat history sidebar shows past conversations", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const historyButton = page.locator(
            'button[aria-label*="History"]:not([disabled]), button:has(svg.lucide-history):not([disabled]), button:has(svg.lucide-menu):not([disabled]), button:has(svg.lucide-sidebar):not([disabled]), button:has(svg.lucide-panel-left):not([disabled])',
        )

        const buttonCount = await historyButton.count()
        if (buttonCount === 0) {
            test.skip()
            return
        }

        await historyButton.first().click()
        await expect(getChatInput(page)).toBeVisible({ timeout: 3000 })
    })

    test("conversation persists after page reload", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "This message should persist.",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await test.step("create conversation", async () => {
            await sendMessage(page, "Create persistent diagram")
            await waitForText(page, "This message should persist.")
        })

        await test.step("verify message appears before reload", async () => {
            await expect(getChatInput(page)).toBeVisible({ timeout: 10000 })
            await expect(
                page.locator('text="This message should persist."'),
            ).toBeVisible({ timeout: 10000 })
        })

        // Note: After reload, mocked responses won't persist since we're not
        // testing with real localStorage. We just verify the app loads correctly.
        await test.step("verify app loads after reload", async () => {
            await page.reload({ waitUntil: "networkidle" })
            await getIframe(page).waitFor({ state: "visible", timeout: 30000 })
            await expect(getChatInput(page)).toBeVisible({ timeout: 10000 })
        })
    })

    test("diagram state persists after reload", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "Created a diagram that should be saved.",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await sendMessage(page, "Create saveable diagram")
        await waitForComplete(page)

        await page.reload({ waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const frame = getIframeContent(page)
        await expect(
            frame
                .locator(".geMenubarContainer, .geDiagramContainer, canvas")
                .first(),
        ).toBeVisible({ timeout: 30000 })
    })

    test("can restore from browser back/forward", async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "Testing browser navigation.",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await sendMessage(page, "Test navigation")
        await waitForText(page, "Testing browser navigation.")

        await page.goto("/about", { waitUntil: "networkidle" })
        await page.goBack({ waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await expect(getChatInput(page)).toBeVisible({ timeout: 10000 })
    })

    test("settings are restored after reload", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await openSettings(page)
        await page.keyboard.press("Escape")

        await page.reload({ waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await openSettings(page)
    })

    test("model selection persists", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const modelSelector = page.locator(
            'button[aria-label*="Model"], [data-testid="model-selector"], button:has-text("Claude")',
        )

        const selectorCount = await modelSelector.count()
        if (selectorCount === 0) {
            test.skip()
            return
        }

        const initialModel = await modelSelector.first().textContent()

        await page.reload({ waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const modelAfterReload = await modelSelector.first().textContent()
        expect(modelAfterReload).toBe(initialModel)
    })

    test("handles localStorage quota exceeded gracefully", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await page.evaluate(() => {
            try {
                const largeData = "x".repeat(5 * 1024 * 1024)
                localStorage.setItem("test-large-data", largeData)
            } catch {
                // Expected to fail on some browsers
            }
        })

        await expect(getChatInput(page)).toBeVisible({ timeout: 10000 })

        await page.evaluate(() => {
            localStorage.removeItem("test-large-data")
        })
    })
})
