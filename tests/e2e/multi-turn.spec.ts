import { expect, test } from "@playwright/test"
import { createMockSSEResponse, createTextOnlyResponse } from "./lib/helpers"

test.describe("Multi-turn Conversation", () => {
    test("handles multiple diagram requests in sequence", async ({ page }) => {
        let requestCount = 0
        await page.route("**/api/chat", async (route) => {
            requestCount++
            const xml =
                requestCount === 1
                    ? `<mxCell id="box1" value="First" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="100" height="40" as="geometry"/></mxCell>`
                    : `<mxCell id="box2" value="Second" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="100" y="200" width="100" height="40" as="geometry"/></mxCell>`
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    xml,
                    `Creating diagram ${requestCount}...`,
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        // First request
        await chatInput.fill("Draw first box")
        await chatInput.press("ControlOrMeta+Enter")
        await expect(page.locator('text="Creating diagram 1..."')).toBeVisible({
            timeout: 15000,
        })

        // Second request
        await chatInput.fill("Draw second box")
        await chatInput.press("ControlOrMeta+Enter")
        await expect(page.locator('text="Creating diagram 2..."')).toBeVisible({
            timeout: 15000,
        })

        // Both messages should be visible
        await expect(page.locator('text="Draw first box"')).toBeVisible()
        await expect(page.locator('text="Draw second box"')).toBeVisible()
    })

    test("preserves conversation history", async ({ page }) => {
        let requestCount = 0
        await page.route("**/api/chat", async (route) => {
            requestCount++
            const request = route.request()
            const body = JSON.parse(request.postData() || "{}")

            // Verify messages array grows with each request
            if (requestCount === 2) {
                // Second request should have previous messages
                expect(body.messages?.length).toBeGreaterThan(1)
            }

            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createTextOnlyResponse(`Response ${requestCount}`),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        // First message
        await chatInput.fill("Hello")
        await chatInput.press("ControlOrMeta+Enter")
        await expect(page.locator('text="Response 1"')).toBeVisible({
            timeout: 15000,
        })

        // Second message (should include history)
        await chatInput.fill("Follow up question")
        await chatInput.press("ControlOrMeta+Enter")
        await expect(page.locator('text="Response 2"')).toBeVisible({
            timeout: 15000,
        })
    })

    test("can continue after a text-only response", async ({ page }) => {
        let requestCount = 0
        await page.route("**/api/chat", async (route) => {
            requestCount++
            if (requestCount === 1) {
                // First: text-only explanation
                await route.fulfill({
                    status: 200,
                    contentType: "text/event-stream",
                    body: createTextOnlyResponse(
                        "I understand. Let me explain the architecture first.",
                    ),
                })
            } else {
                // Second: diagram generation
                const xml = `<mxCell id="arch" value="Architecture" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="120" height="50" as="geometry"/></mxCell>`
                await route.fulfill({
                    status: 200,
                    contentType: "text/event-stream",
                    body: createMockSSEResponse(xml, "Here is the diagram:"),
                })
            }
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        // Ask for explanation first
        await chatInput.fill("Explain the architecture")
        await chatInput.press("ControlOrMeta+Enter")
        await expect(
            page.locator(
                'text="I understand. Let me explain the architecture first."',
            ),
        ).toBeVisible({ timeout: 15000 })

        // Then ask for diagram
        await chatInput.fill("Now show it as a diagram")
        await chatInput.press("ControlOrMeta+Enter")
        await expect(page.locator('text="Complete"')).toBeVisible({
            timeout: 15000,
        })
    })
})
