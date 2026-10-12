import {
    expect,
    getIframe,
    getIframeContent,
    openApp,
    test,
} from "./lib/fixtures"

test.describe("Iframe Interaction", () => {
    test("draw.io iframe loads successfully", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })

        const iframe = getIframe(page)
        await expect(iframe).toBeVisible({ timeout: 30000 })

        // iframe should have loaded draw.io content
        const frame = getIframeContent(page)
        await expect(frame.locator(".geDiagramContainer").first()).toBeVisible({
            timeout: 30000,
        })
    })

    test("can interact with draw.io toolbar", async ({ page }) => {
        await openApp(page)

        const frame = getIframeContent(page)

        // Draw.io menu items should be accessible
        await expect(
            frame
                .locator('text="Diagram"')
                .or(frame.locator('[title*="Diagram"]'))
                .filter({ visible: true })
                .first(),
        ).toBeVisible({ timeout: 30000 })
    })
})
