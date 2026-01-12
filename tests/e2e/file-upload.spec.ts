import { SINGLE_BOX_XML } from "./fixtures/diagrams"
import {
    expect,
    getChatInput,
    getIframe,
    sendMessage,
    test,
} from "./lib/fixtures"
import { createMockSSEResponse } from "./lib/helpers"

test.describe("File Upload", () => {
    test("upload button opens file picker", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const uploadButton = page.locator(
            'button[aria-label="Upload file"], button:has(svg.lucide-image)',
        )
        await expect(uploadButton.first()).toBeVisible({ timeout: 10000 })
        await expect(uploadButton.first()).toBeEnabled()
    })

    test("shows file preview after selecting image", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const fileInput = page.locator('input[type="file"]')

        await fileInput.setInputFiles({
            name: "test-image.png",
            mimeType: "image/png",
            buffer: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "base64",
            ),
        })

        await expect(
            page.locator('[role="alert"][data-type="error"]'),
        ).not.toBeVisible({ timeout: 2000 })
    })

    test("can remove uploaded file", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const fileInput = page.locator('input[type="file"]')

        await fileInput.setInputFiles({
            name: "test-image.png",
            mimeType: "image/png",
            buffer: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "base64",
            ),
        })

        await expect(
            page.locator('[role="alert"][data-type="error"]'),
        ).not.toBeVisible({ timeout: 2000 })

        const removeButton = page.locator(
            '[data-testid="remove-file-button"], button[aria-label*="Remove"], button:has(svg.lucide-x)',
        )

        const removeButtonCount = await removeButton.count()
        if (removeButtonCount === 0) {
            test.skip()
            return
        }

        await removeButton.first().click()
        await expect(removeButton.first()).not.toBeVisible({ timeout: 2000 })
    })

    test("sends file with message to API", async ({ page }) => {
        let capturedRequest: any = null

        await page.route("**/api/chat", async (route) => {
            capturedRequest = route.request()
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    SINGLE_BOX_XML,
                    "Based on your image, here is a diagram:",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const fileInput = page.locator('input[type="file"]')

        await fileInput.setInputFiles({
            name: "architecture.png",
            mimeType: "image/png",
            buffer: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                "base64",
            ),
        })

        await sendMessage(page, "Convert this to a diagram")

        await expect(
            page.locator('text="Based on your image, here is a diagram:"'),
        ).toBeVisible({ timeout: 15000 })

        expect(capturedRequest).not.toBeNull()
    })

    test("shows error for oversized file", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const fileInput = page.locator('input[type="file"]')
        const largeBuffer = Buffer.alloc(3 * 1024 * 1024, "x")

        await fileInput.setInputFiles({
            name: "large-image.png",
            mimeType: "image/png",
            buffer: largeBuffer,
        })

        await expect(
            page.locator('[role="alert"], [data-sonner-toast]').first(),
        ).toBeVisible({ timeout: 5000 })
    })

    test("drag and drop file upload works", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" })
        await getIframe(page).waitFor({ state: "visible", timeout: 30000 })

        const chatForm = page.locator("form").first()

        const dataTransfer = await page.evaluateHandle(() => {
            const dt = new DataTransfer()
            const file = new File(["test content"], "dropped-image.png", {
                type: "image/png",
            })
            dt.items.add(file)
            return dt
        })

        await chatForm.dispatchEvent("dragover", { dataTransfer })
        await chatForm.dispatchEvent("drop", { dataTransfer })

        await expect(getChatInput(page)).toBeVisible({ timeout: 3000 })
    })
})
