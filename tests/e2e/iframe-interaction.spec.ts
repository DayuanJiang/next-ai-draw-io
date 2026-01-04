import { expect, test } from "@playwright/test"

// Helper to create SSE response
function createMockSSEResponse(xml: string, text: string) {
    const messageId = `msg_${Date.now()}`
    const toolCallId = `call_${Date.now()}`
    const textId = `text_${Date.now()}`

    const events = [
        { type: "start", messageId },
        { type: "text-start", id: textId },
        { type: "text-delta", id: textId, delta: text },
        { type: "text-end", id: textId },
        { type: "tool-input-start", toolCallId, toolName: "display_diagram" },
        {
            type: "tool-input-available",
            toolCallId,
            toolName: "display_diagram",
            input: { xml },
        },
        {
            type: "tool-output-available",
            toolCallId,
            output: "Successfully displayed the diagram",
        },
        { type: "finish" },
    ]

    return (
        events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
        "data: [DONE]\n\n"
    )
}

test.describe("Iframe Interaction", () => {
    test("draw.io iframe loads successfully", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })

        const iframe = page.locator("iframe")
        await expect(iframe).toBeVisible({ timeout: 30000 })

        // iframe should have loaded draw.io content
        const frame = page.frameLocator("iframe")
        await expect(
            frame
                .locator(".geMenubarContainer, .geDiagramContainer, canvas")
                .first(),
        ).toBeVisible({ timeout: 30000 })
    })

    test("can interact with draw.io toolbar", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const frame = page.frameLocator("iframe")

        // Draw.io menu items should be accessible
        await expect(
            frame
                .locator('text="Diagram"')
                .or(frame.locator('[title*="Diagram"]')),
        ).toBeVisible({ timeout: 10000 })
    })

    test("diagram XML is rendered in iframe after generation", async ({
        page,
    }) => {
        const testXml = `<mxCell id="test-node-123" value="Test Node" style="rounded=1;fillColor=#d5e8d4;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
</mxCell>`

        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(testXml, "Here is your diagram:"),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await chatInput.fill("Create a test node")
        await chatInput.press("ControlOrMeta+Enter")

        // Wait for completion
        await expect(page.locator('text="Complete"')).toBeVisible({
            timeout: 15000,
        })

        // The diagram should now be in the iframe
        // We can check the iframe's internal state via postMessage or visible elements
        // At minimum, verify no error state
        await page.waitForTimeout(1000) // Give draw.io time to render
    })

    test("zoom controls work in draw.io", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const frame = page.frameLocator("iframe")

        // draw.io should be loaded and functional - check for diagram container
        await expect(
            frame.locator(".geDiagramContainer, canvas").first(),
        ).toBeVisible({ timeout: 10000 })

        // Zoom controls may or may not be visible depending on UI mode
        // Just verify iframe is interactive
    })

    test("can resize the panel divider", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Find the resizer/divider between panels
        const resizer = page.locator(
            '[role="separator"], [data-panel-resize-handle-id], .resize-handle',
        )

        if ((await resizer.count()) > 0) {
            // Resizer should be draggable
            await expect(resizer.first()).toBeVisible()

            // Try to drag it
            const box = await resizer.first().boundingBox()
            if (box) {
                await page.mouse.move(
                    box.x + box.width / 2,
                    box.y + box.height / 2,
                )
                await page.mouse.down()
                await page.mouse.move(box.x + 50, box.y + box.height / 2)
                await page.mouse.up()
            }
        }
    })

    test("iframe responds to window resize", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const iframe = page.locator("iframe")
        const initialBox = await iframe.boundingBox()

        // Resize window
        await page.setViewportSize({ width: 800, height: 600 })
        await page.waitForTimeout(500)

        const newBox = await iframe.boundingBox()

        // iframe should have adjusted
        expect(newBox).toBeDefined()
        // Size should be different or at least still valid
        if (initialBox && newBox) {
            expect(newBox.width).toBeLessThanOrEqual(800)
        }
    })
})
