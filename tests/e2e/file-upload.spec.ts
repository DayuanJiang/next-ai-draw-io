import { SINGLE_BOX_XML } from "./fixtures/diagrams"
import {
    expect,
    getAttachmentInput,
    openApp,
    sendMessage,
    test,
} from "./lib/fixtures"
import { createMockSSEResponse } from "./lib/helpers"

const ONE_PIXEL_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
)

test.describe("File Upload", () => {
    test("upload button opens file picker", async ({ page }) => {
        await openApp(page)

        // The "Add" menu holds the upload entry
        const addButton = page.locator('[data-testid="composer-add"]')
        await expect(addButton).toBeVisible({ timeout: 10000 })
        await addButton.click()
        const [chooser] = await Promise.all([
            page.waitForEvent("filechooser"),
            page.getByRole("button", { name: "Upload file" }).click(),
        ])
        expect(chooser.isMultiple()).toBe(true)
    })

    test("can remove uploaded file", async ({ page }) => {
        await openApp(page)

        await getAttachmentInput(page).setInputFiles({
            name: "test-image.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
        })

        // The image shows as a preview
        await expect(page.getByAltText("test-image.png")).toBeVisible({
            timeout: 3000,
        })

        const removeButton = page.getByRole("button", { name: "Remove file" })
        await removeButton.first().click()
        await expect(removeButton).toHaveCount(0, { timeout: 2000 })
        await expect(page.getByAltText("test-image.png")).toHaveCount(0)
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

        await openApp(page)

        await getAttachmentInput(page).setInputFiles({
            name: "architecture.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
        })

        await sendMessage(page, "Convert this to a diagram")

        await expect(
            page.locator('text="Based on your image, here is a diagram:"'),
        ).toBeVisible({ timeout: 15000 })

        const last = capturedRequest.postDataJSON().messages.at(-1)
        const file = last.parts.find((p: any) => p.type === "file")
        expect(file?.mediaType).toBe("image/png")
        expect(file?.url).toMatch(/^data:image\/png;base64,/)
    })

    test("shows error for oversized file", async ({ page }) => {
        await openApp(page)

        const fileInput = getAttachmentInput(page)
        const largeBuffer = Buffer.alloc(3 * 1024 * 1024, "x")

        await fileInput.setInputFiles({
            name: "large-image.png",
            mimeType: "image/png",
            buffer: largeBuffer,
        })

        await expect(
            page.getByText('"large-image.png" is 3.00MB (exceeds 2MB)'),
        ).toBeVisible({ timeout: 5000 })
        await expect(page.getByAltText("large-image.png")).toHaveCount(0)
    })

    test("drag and drop file upload works", async ({ page }) => {
        await openApp(page)

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

        // The dropped file shows as a preview
        await expect(page.getByAltText("dropped-image.png")).toBeVisible({
            timeout: 3000,
        })
    })

    test("warns when the selected model cannot read images", async ({
        page,
    }) => {
        // models.dev lists glm-4.7 as text only and glm-4.6v with images
        await openApp(page, {
            config: {
                version: 1,
                selectedModelId: "m1",
                providers: [
                    {
                        id: "p1",
                        provider: "glm",
                        apiKey: "k1",
                        models: [
                            { id: "m1", modelId: "glm-4.7" },
                            { id: "m2", modelId: "glm-4.6v" },
                        ],
                    },
                ],
            },
        })
        const warning = page.getByText("glm-4.7 can't read images")

        // A text file needs no image input
        await getAttachmentInput(page).setInputFiles({
            name: "notes.md",
            mimeType: "text/markdown",
            buffer: Buffer.from("# Notes"),
        })
        await expect(page.getByText("notes.md")).toBeVisible()
        await expect(warning).toHaveCount(0)

        await getAttachmentInput(page).setInputFiles({
            name: "photo.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
        })
        await expect(warning).toBeVisible({ timeout: 5000 })
        // The image is still attached: the warning does not block sending
        await expect(page.getByAltText("photo.png")).toBeVisible()
    })

    test("no warning for a model that reads images", async ({ page }) => {
        await openApp(page, {
            config: {
                version: 1,
                selectedModelId: "m2",
                providers: [
                    {
                        id: "p1",
                        provider: "glm",
                        apiKey: "k1",
                        models: [{ id: "m2", modelId: "glm-4.6v" }],
                    },
                ],
            },
        })
        await getAttachmentInput(page).setInputFiles({
            name: "photo.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
        })
        await expect(page.getByAltText("photo.png")).toBeVisible()
        await page.waitForTimeout(1000)
        await expect(page.getByText("can't read images")).toHaveCount(0)
    })

    test("warns when the model changes to one that cannot read the attached image", async ({
        page,
    }) => {
        await openApp(page, {
            config: {
                version: 1,
                selectedModelId: "m2",
                providers: [
                    {
                        id: "p1",
                        provider: "glm",
                        apiKey: "k1",
                        models: [
                            { id: "m1", modelId: "glm-4.7" },
                            { id: "m2", modelId: "glm-4.6v" },
                        ],
                    },
                ],
            },
        })
        const warning = page.getByText("glm-4.7 can't read images")
        // Without an image, switching says nothing
        await page.getByTestId("model-selector").click()
        await page.getByRole("option", { name: /glm-4\.7/ }).click()
        await page.waitForTimeout(1000)
        await expect(warning).toHaveCount(0)

        await page.getByTestId("model-selector").click()
        await page.getByRole("option", { name: /glm-4\.6v/ }).click()
        await getAttachmentInput(page).setInputFiles({
            name: "photo.png",
            mimeType: "image/png",
            buffer: ONE_PIXEL_PNG,
        })
        await expect(page.getByAltText("photo.png")).toBeVisible()
        await page.waitForTimeout(1000)
        await expect(warning).toHaveCount(0)

        await page.getByTestId("model-selector").click()
        await page.getByRole("option", { name: /glm-4\.7/ }).click()
        await expect(warning).toBeVisible({ timeout: 5000 })
    })
})
