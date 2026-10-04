import { expect, type Page, test } from "@playwright/test"
import { getIframe, sendMessage, waitForCompleteCount } from "./lib/fixtures"

/**
 * Checks what draw.io actually shows after the diagram tools, not only the
 * tool card. The tool input is streamed in chunks like a real model, and
 * the browser tool handler (not the server) completes the tool call.
 */
function streamedToolCall(toolName: string, input: unknown) {
    const toolCallId = `call_${Math.random().toString(36).slice(2)}`
    const chunks = JSON.stringify(input).match(/[\s\S]{1,40}/g) ?? []
    const events = [
        { type: "start", messageId: `msg_${toolCallId}` },
        { type: "tool-input-start", toolCallId, toolName },
        ...chunks.map((inputTextDelta) => ({
            type: "tool-input-delta",
            toolCallId,
            inputTextDelta,
        })),
        { type: "tool-input-available", toolCallId, toolName, input },
        { type: "finish" },
    ]
    return `${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")}data: [DONE]\n\n`
}

const END_TURN =
    'data: {"type":"start"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n'

/** Answer each chat request with the next reply, then end the turn */
async function mockReplies(p: Page, replies: string[]) {
    await p.route("**/api/chat", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: replies.shift() ?? END_TURN,
        })
    })
    await p.goto("/", { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    return p.frameLocator("iframe")
}

const cell = (id: string, label: string, x: number) =>
    `<mxCell id="${id}" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="40" width="120" height="60" as="geometry"/></mxCell>`
const page = (id: string, cells: string) =>
    `<diagram id="${id}" name="${id}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram>`

const TWO_PAGES = `<mxfile>${page("First", cell("a", "Old A", 40))}${page("Second", cell("b", "Old B", 40))}</mxfile>`
// Bare cells with a duplicate id and an unescaped &, which get fixed, and
// a linked cell whose label lives on its UserObject wrapper
const NEW_CELLS =
    cell("2", "Alpha", 40) +
    cell("2", "Beta", 220) +
    cell("3", "R&D", 400) +
    `<UserObject id="4" label="Docs" link="https://example.com"><mxCell style="rounded=1;" vertex="1" parent="1"><mxGeometry x="580" y="40" width="120" height="60" as="geometry"/></mxCell></UserObject>`

test("display_diagram replaces the document with the fixed diagram", async ({
    page: p,
}) => {
    const canvas = await mockReplies(p, [
        streamedToolCall("display_diagram", { xml: TWO_PAGES }),
        streamedToolCall("display_diagram", { xml: NEW_CELLS }),
    ])

    await sendMessage(p, "Draw two pages")
    await waitForCompleteCount(p, 1)
    await expect(canvas.getByText("Old A")).toBeVisible({ timeout: 15000 })
    await expect(canvas.getByText("Second", { exact: true })).toBeVisible()

    await sendMessage(p, "Start over with three boxes")
    await waitForCompleteCount(p, 2)
    // Give a late preview time to redraw the raw cells, as it used to
    await p.waitForTimeout(1000)
    for (const label of ["Alpha", "Beta", "R&D", "Docs"]) {
        await expect(canvas.getByText(label, { exact: true })).toBeVisible({
            timeout: 15000,
        })
    }
    // The old pages are gone
    await expect(canvas.getByText("Old A")).toHaveCount(0)
    await expect(canvas.getByText("Second", { exact: true })).toHaveCount(0)
})

test("edit_diagram applies all operations or none", async ({ page: p }) => {
    const canvas = await mockReplies(p, [
        streamedToolCall("display_diagram", {
            xml: cell("a", "Alpha", 40) + cell("b", "Beta", 220),
        }),
        streamedToolCall("edit_diagram", {
            operations: [
                { operation: "delete", cell_id: "a" },
                {
                    operation: "update",
                    cell_id: "b",
                    new_xml: cell("b", "Beta two", 220),
                },
                {
                    operation: "add",
                    cell_id: "c",
                    new_xml: cell("c", "Gamma", 400),
                },
            ],
        }),
        // The first operation is fine, the second fails: nothing is kept
        streamedToolCall("edit_diagram", {
            operations: [
                {
                    operation: "update",
                    cell_id: "c",
                    new_xml: cell("c", "Broken", 400),
                },
                { operation: "delete", cell_id: "missing" },
            ],
        }),
    ])

    await sendMessage(p, "Draw two boxes")
    await waitForCompleteCount(p, 1)
    await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible({
        timeout: 15000,
    })

    await sendMessage(p, "Change them")
    await waitForCompleteCount(p, 2)
    await expect(canvas.getByText("Gamma", { exact: true })).toBeVisible({
        timeout: 15000,
    })
    await expect(canvas.getByText("Beta two", { exact: true })).toBeVisible()
    await expect(canvas.getByText("Alpha", { exact: true })).toHaveCount(0)

    await sendMessage(p, "Change again")
    await expect(p.getByText(/No changes were made/).first()).toBeAttached({
        timeout: 15000,
    })
    await p.waitForTimeout(1000)
    await expect(canvas.getByText("Gamma", { exact: true })).toBeVisible()
    await expect(canvas.getByText("Broken", { exact: true })).toHaveCount(0)
})
