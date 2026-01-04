import { expect, test } from "@playwright/test"
import { createMockSSEResponse } from "./lib/helpers"

// Simple cat diagram XML for testing (mxCell elements only, no wrapper)
const CAT_DIAGRAM_XML = `<mxCell id="cat-head" value="Cat Head" style="ellipse;whiteSpace=wrap;html=1;fillColor=#FFE4B5;" vertex="1" parent="1">
  <mxGeometry x="200" y="100" width="100" height="80" as="geometry"/>
</mxCell>
<mxCell id="cat-body" value="Cat Body" style="ellipse;whiteSpace=wrap;html=1;fillColor=#FFE4B5;" vertex="1" parent="1">
  <mxGeometry x="180" y="180" width="140" height="100" as="geometry"/>
</mxCell>`

// Simple flowchart XML for testing edits
const FLOWCHART_XML = `<mxCell id="start" value="Start" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;" vertex="1" parent="1">
  <mxGeometry x="200" y="50" width="100" height="40" as="geometry"/>
</mxCell>
<mxCell id="process" value="Process" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;" vertex="1" parent="1">
  <mxGeometry x="200" y="130" width="100" height="40" as="geometry"/>
</mxCell>
<mxCell id="end" value="End" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;" vertex="1" parent="1">
  <mxGeometry x="200" y="210" width="100" height="40" as="geometry"/>
</mxCell>`

test.describe("Diagram Generation", () => {
    test.beforeEach(async ({ page }) => {
        // Mock the chat API to return our test XML
        await page.route("**/api/chat", async (route) => {
            const response = createMockSSEResponse(
                CAT_DIAGRAM_XML,
                "I'll create a diagram for you.",
            )
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: response,
            })
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("generates and displays a diagram", async ({ page }) => {
        // Find the chat input by aria-label
        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        // Type a prompt
        await chatInput.fill("Draw a cat")

        // Submit using Cmd/Ctrl+Enter
        await chatInput.press("ControlOrMeta+Enter")

        // Wait for the tool card with "Generate Diagram" header and "Complete" badge
        await expect(page.locator('text="Generate Diagram"')).toBeVisible({
            timeout: 15000,
        })
        await expect(page.locator('text="Complete"')).toBeVisible({
            timeout: 15000,
        })
    })

    test("chat input clears after sending", async ({ page }) => {
        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await chatInput.fill("Draw a cat")
        await chatInput.press("ControlOrMeta+Enter")

        // Input should clear after sending
        await expect(chatInput).toHaveValue("", { timeout: 5000 })
    })

    test("user message appears in chat", async ({ page }) => {
        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await chatInput.fill("Draw a cute cat")
        await chatInput.press("ControlOrMeta+Enter")

        // User message should appear
        await expect(page.locator('text="Draw a cute cat"')).toBeVisible({
            timeout: 10000,
        })
    })

    test("assistant text message appears in chat", async ({ page }) => {
        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        await chatInput.fill("Draw a cat")
        await chatInput.press("ControlOrMeta+Enter")

        // Assistant message should appear
        await expect(
            page.locator('text="I\'ll create a diagram for you."'),
        ).toBeVisible({ timeout: 10000 })
    })
})

test.describe("Diagram Edit", () => {
    test.beforeEach(async ({ page }) => {
        // First request: display initial diagram
        // Second request: edit diagram
        let requestCount = 0
        await page.route("**/api/chat", async (route) => {
            requestCount++
            if (requestCount === 1) {
                await route.fulfill({
                    status: 200,
                    contentType: "text/event-stream",
                    body: createMockSSEResponse(
                        FLOWCHART_XML,
                        "I'll create a diagram for you.",
                    ),
                })
            } else {
                // Edit response - replaces the diagram
                const editedXml = FLOWCHART_XML.replace(
                    "Process",
                    "Updated Process",
                )
                await route.fulfill({
                    status: 200,
                    contentType: "text/event-stream",
                    body: createMockSSEResponse(
                        editedXml,
                        "I'll create a diagram for you.",
                    ),
                })
            }
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("can edit an existing diagram", async ({ page }) => {
        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        // First: create initial diagram
        await chatInput.fill("Create a flowchart")
        await chatInput.press("ControlOrMeta+Enter")
        await expect(page.locator('text="Complete"').first()).toBeVisible({
            timeout: 15000,
        })

        // Second: edit the diagram
        await chatInput.fill("Change Process to Updated Process")
        await chatInput.press("ControlOrMeta+Enter")

        // Should see second "Complete" badge
        await expect(page.locator('text="Complete"')).toHaveCount(2, {
            timeout: 15000,
        })
    })
})

test.describe("Diagram Append", () => {
    test.beforeEach(async ({ page }) => {
        let requestCount = 0
        await page.route("**/api/chat", async (route) => {
            requestCount++
            if (requestCount === 1) {
                await route.fulfill({
                    status: 200,
                    contentType: "text/event-stream",
                    body: createMockSSEResponse(
                        FLOWCHART_XML,
                        "I'll create a diagram for you.",
                    ),
                })
            } else {
                // Append response - adds new element
                const appendXml = `<mxCell id="new-node" value="New Node" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;" vertex="1" parent="1">
  <mxGeometry x="350" y="130" width="100" height="40" as="geometry"/>
</mxCell>`
                await route.fulfill({
                    status: 200,
                    contentType: "text/event-stream",
                    body: createMockSSEResponse(
                        appendXml,
                        "I'll create a diagram for you.",
                        "append_diagram",
                    ),
                })
            }
        })

        await page.goto("/", { waitUntil: "networkidle" })
        await page
            .locator("iframe")
            .waitFor({ state: "visible", timeout: 30000 })
    })

    test("can append to an existing diagram", async ({ page }) => {
        const chatInput = page.locator('textarea[aria-label="Chat input"]')
        await expect(chatInput).toBeVisible({ timeout: 10000 })

        // First: create initial diagram
        await chatInput.fill("Create a flowchart")
        await chatInput.press("ControlOrMeta+Enter")
        await expect(page.locator('text="Complete"').first()).toBeVisible({
            timeout: 15000,
        })

        // Second: append to diagram
        await chatInput.fill("Add a new node to the right")
        await chatInput.press("ControlOrMeta+Enter")

        // Should see second "Complete" badge
        await expect(page.locator('text="Complete"')).toHaveCount(2, {
            timeout: 15000,
        })
    })
})
