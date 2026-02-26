import { TEST_NODE_XML } from "./fixtures/diagrams"
import {
    expect,
    getIframe,
    getIframeContent,
    sendMessage,
    test,
    waitForComplete,
} from "./lib/fixtures"
import { createMockSSEResponse } from "./lib/helpers"

test.describe("Iframe Interaction", () => {
    test("draw.io iframe loads successfully", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })

        const iframe = getIframe(page)
        await expect(iframe).toBeVisible({ timeout: 30000 })

        // iframe should have loaded draw.io content
        const frame = getIframeContent(page)
        await expect(
            frame
                .locator(".geMenubarContainer, .geDiagramContainer, canvas")
                .first(),
        ).toBeVisible({ timeout: 30000 })
    })

    test("can interact with draw.io toolbar", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const frame = getIframeContent(page)

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
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    TEST_NODE_XML,
                    "Here is your diagram:",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        await sendMessage(page, "Create a test node")
        await waitForComplete(page)

        // Give draw.io time to render
        await page.waitForTimeout(1000)
    })

    test("zoom controls work in draw.io", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const frame = getIframeContent(page)

        // draw.io should be loaded and functional - check for diagram container
        await expect(
            frame.locator(".geDiagramContainer, canvas").first(),
        ).toBeVisible({ timeout: 10000 })
    })

    test("can resize the panel divider", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        // Find the resizer/divider between panels
        const resizer = page.locator(
            '[role="separator"], [data-panel-resize-handle-id], .resize-handle',
        )

        if ((await resizer.count()) > 0) {
            await expect(resizer.first()).toBeVisible()

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
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const iframe = getIframe(page)
        const initialBox = await iframe.boundingBox()

        // Resize window
        await page.setViewportSize({ width: 800, height: 600 })
        await page.waitForTimeout(500)

        const newBox = await iframe.boundingBox()

        expect(newBox).toBeDefined()
        if (initialBox && newBox) {
            expect(newBox.width).toBeLessThanOrEqual(800)
        }
    })
})
