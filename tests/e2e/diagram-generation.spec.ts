import {
    CAT_DIAGRAM_XML,
    FLOWCHART_XML,
    NEW_NODE_XML,
} from "./fixtures/diagrams"
import {
    createMultiTurnMock,
    expect,
    getChatInput,
    sendMessage,
    test,
    waitForComplete,
    waitForCompleteCount,
} from "./lib/fixtures"
import { createMockSSEResponse } from "./lib/helpers"

test.describe("Diagram Generation", () => {
    test.beforeEach(async ({ page }) => {
        await page.route("**/api/chat", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: createMockSSEResponse(
                    CAT_DIAGRAM_XML,
                    "I'll create a diagram for you.",
                ),
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("generates and displays a diagram", async ({ page }) => {
        await sendMessage(page, "Draw a cat")
        await expect(page.locator('text="Generate Diagram"')).toBeVisible({
            timeout: 15000,
        })
        await waitForComplete(page)
    })

    test("chat input clears after sending", async ({ page }) => {
        const chatInput = getChatInput(page)
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await chatInput.fill("Draw a cat")
        await chatInput.press("ControlOrMeta+Enter")

        await expect(chatInput).toHaveValue("", { timeout: 5000 })
    })

    test("user message appears in chat", async ({ page }) => {
        await sendMessage(page, "Draw a cute cat")
        await expect(page.locator('text="Draw a cute cat"')).toBeVisible({
            timeout: 10000,
        })
    })

    test("assistant text message appears in chat", async ({ page }) => {
        await sendMessage(page, "Draw a cat")
        await expect(
            page.locator('text="I\'ll create a diagram for you."'),
        ).toBeVisible({ timeout: 10000 })
    })
})

test.describe("Diagram Edit", () => {
    test.beforeEach(async ({ page }) => {
        await page.route(
            "**/api/chat",
            createMultiTurnMock([
                { xml: FLOWCHART_XML, text: "I'll create a diagram for you." },
                {
                    xml: FLOWCHART_XML.replace("Process", "Updated Process"),
                    text: "I'll create a diagram for you.",
                },
            ]),
        )

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("can edit an existing diagram", async ({ page }) => {
        // First: create initial diagram
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)

        // Second: edit the diagram
        await sendMessage(page, "Change Process to Updated Process")
        await waitForCompleteCount(page, 2)
    })
})

test.describe("Diagram Append", () => {
    test.beforeEach(async ({ page }) => {
        await page.route(
            "**/api/chat",
            createMultiTurnMock([
                { xml: FLOWCHART_XML, text: "I'll create a diagram for you." },
                {
                    xml: NEW_NODE_XML,
                    text: "I'll create a diagram for you.",
                    toolName: "append_diagram",
                },
            ]),
        )

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("can append to an existing diagram", async ({ page }) => {
        // First: create initial diagram
        await sendMessage(page, "Create a flowchart")
        await waitForComplete(page)

        // Second: append to diagram
        await sendMessage(page, "Add a new node to the right")
        await waitForCompleteCount(page, 2)
    })
})
