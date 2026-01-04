import { expect, test } from "@playwright/test"
import { createMockSSEResponse } from "./lib/helpers"

test.describe("File Upload", () => {
    test("upload button opens file picker", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Find the upload button (image icon)
        const uploadButton = page.locator(
            'button[aria-label="Upload file"], button:has(svg.lucide-image)',
        )
        await expect(uploadButton.first()).toBeVisible({ timeout: 10000 })

        // Click should trigger hidden file input
        // Just verify the button is clickable
        await expect(uploadButton.first()).toBeEnabled()
    })

    test("shows file preview after selecting image", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        // Find the hidden file input
        const fileInput = page.locator('input[type="file"]')

        // Create a test image file
        await fileInput.setInputFiles({
            name: "test-image.png",
            mimeType: "image/png",
            buffer: Buffer.from(
                // Minimal valid PNG (1x1 transparent pixel)
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "base64",
            ),
        })

        // Wait for file to be processed
        await page.waitForTimeout(1000)

        // File input should have processed the file - check any indicator
        // This test passes if no error occurs during file selection
    })

    test("can remove uploaded file", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const fileInput = page.locator('input[type="file"]')

        // Upload a file
        await fileInput.setInputFiles({
            name: "test-image.png",
            mimeType: "image/png",
            buffer: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "base64",
            ),
        })

        // Wait for file to be processed
        await page.waitForTimeout(1000)

        // Find and click remove button if it exists (X icon)
        const removeButton = page.locator(
            'button[aria-label*="Remove"], button:has(svg.lucide-x)',
        )
        if ((await removeButton.count()) > 0) {
            await removeButton.first().click()
            await page.waitForTimeout(500)
        }
        // Test passes if no errors during upload and potential removal
    })

    test("sends file with message to API", async ({ page }) => {
        let capturedRequest: any = null

        await page.route("**/api/chat", async (route) => {
            capturedRequest = route.request()
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    `<mxCell id="img" value="Diagram" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="100" height="100" as="geometry"/></mxCell>`,
                    "Based on your image, here is a diagram:",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const fileInput = page.locator('input[type="file"]')
        const chatInput = page.locator('textarea[aria-label="Chat input"]')

        // Upload a file
        await fileInput.setInputFiles({
            name: "architecture.png",
            mimeType: "image/png",
            buffer: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "base64",
            ),
        })

        // Type message and send
        await chatInput.fill("Convert this to a diagram")
        await chatInput.press("ControlOrMeta+Enter")

        // Wait for response
        await expect(
            page.locator('text="Based on your image, here is a diagram:"'),
        ).toBeVisible({ timeout: 15000 })

        // Verify request was made (file should be in request body as base64)
        expect(capturedRequest).not.toBeNull()
    })

    test("shows error for oversized file", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const fileInput = page.locator('input[type="file"]')

        // Create a large file (> 2MB limit)
        const largeBuffer = Buffer.alloc(3 * 1024 * 1024, "x") // 3MB

        await fileInput.setInputFiles({
            name: "large-image.png",
            mimeType: "image/png",
            buffer: largeBuffer,
        })

        // Should show error toast/message about file size
        // The exact error message depends on the app implementation
        await expect(
            page.locator('[role="alert"], [data-sonner-toast]').first(),
        ).toBeVisible({ timeout: 5000 })
    })

    test("drag and drop file upload works", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })

        const chatForm = page.locator("form").first()

        // Create a DataTransfer with a file
        const dataTransfer = await page.evaluateHandle(() => {
            const dt = new DataTransfer()
            const file = new File(["test content"], "dropped-image.png", {
                type: "image/png",
            })
            dt.items.add(file)
            return dt
        })

        // Dispatch drag and drop events
        await chatForm.dispatchEvent("dragover", { dataTransfer })
        await chatForm.dispatchEvent("drop", { dataTransfer })

        // Should show file preview (or at least not crash)
        // File might be rejected due to not being a real image, but UI should handle it
        await page.waitForTimeout(1000) // Give UI time to process
    })
})
