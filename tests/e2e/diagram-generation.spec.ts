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
    sleep,
    test,
    waitForComplete,
    waitForCompleteCount,
    waitForText,
} from "./lib/fixtures"
import { createMockSSEResponse, createTextOnlyResponse } from "./lib/helpers"

function createClientToolCallSSEResponse(params: {
    xml: string
    text: string
    toolName?: string
    pageName?: string
}) {
    const messageId = `msg_${Date.now()}`
    const toolCallId = `call_${Date.now()}`
    const textId = `text_${Date.now()}`
    const toolName = params.toolName || "display_diagram"

    const events = [
        { type: "start", messageId },
        { type: "text-start", id: textId },
        { type: "text-delta", id: textId, delta: params.text },
        { type: "text-end", id: textId },
        { type: "tool-input-start", toolCallId, toolName },
        {
            type: "tool-input-available",
            toolCallId,
            toolName,
            input: {
                xml: params.xml,
                ...(params.pageName ? { pageName: params.pageName } : {}),
            },
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

        await page.goto("/", { waitUntil: "domcontentloaded" })
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

    test("preserves the first page when generating a second diagram in the same session", async ({
        page,
    }) => {
        let requestCount = 0
        let xmlAfterFirst = ""
        let xmlAfterSecond = ""

        await page.unroute("**/api/chat")
        await page.route("**/api/chat", async (route) => {
            requestCount += 1
            const body = route.request().postDataJSON() as
                | { xml?: string }
                | undefined

            if (requestCount === 2) {
                xmlAfterFirst = body?.xml || ""
                console.log(
                    `[preserves-first-page] request 2 xml preview: ${xmlAfterFirst.slice(0, 300)}`,
                )
            }

            if (requestCount === 3) {
                xmlAfterSecond = body?.xml || ""
                console.log(
                    `[preserves-first-page] request 3 xml preview: ${xmlAfterSecond.slice(0, 300)}`,
                )
            }

            const responseBody =
                requestCount === 1
                    ? createClientToolCallSSEResponse({
                          xml: CAT_DIAGRAM_XML,
                          text: "I'll create a diagram for you.",
                          pageName: "Page A",
                      })
                    : requestCount === 2
                      ? createClientToolCallSSEResponse({
                            xml: FLOWCHART_XML,
                            text: "I'll create a diagram for you.",
                            pageName: "Page B",
                        })
                      : createTextOnlyResponse("ok")

            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: responseBody,
            })
        })

        await sendMessage(page, "Draw a cat")
        await waitForComplete(page)
        await sleep(800)

        await sendMessage(page, "Create a flowchart")
        await waitForCompleteCount(page, 2)
        await sleep(800)

        await sendMessage(page, "ping")
        await waitForText(page, "ok")

        // After the first diagram, draw.io export may be <mxfile><mxGraphModel>...</mxGraphModel></mxfile>
        // (no <diagram> wrapper). We assert we at least exported an mxfile.
        // NOTE: some environments may export an empty-ish mxGraphModel while the diagram is still rendering.
        expect(xmlAfterFirst).toContain("<mxfile")

        // After the second diagram, we expect a true multi-page mxfile with 2 <diagram> pages.
        expect(xmlAfterSecond).toContain("<mxfile")
        expect((xmlAfterSecond.match(/<diagram\b/g) || []).length).toBe(2)
        expect(xmlAfterSecond).toContain('id="cat-head"')
        expect(xmlAfterSecond).toContain('id="start"')
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

        await page.goto("/", { waitUntil: "domcontentloaded" })
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

        await page.goto("/", { waitUntil: "domcontentloaded" })
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
