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

const sse = (events: object[]) =>
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
const EDIT_GAMMA = {
    operations: [
        { operation: "add", cell_id: "c", new_xml: cell("c", "Gamma", 400) },
    ],
}
const editStart = (id: string) => ({
    type: "tool-input-start",
    toolCallId: id,
    toolName: "edit_diagram",
})
const editDeltas = (id: string) =>
    (JSON.stringify(EDIT_GAMMA).match(/[\s\S]{1,40}/g) ?? []).map((d) => ({
        type: "tool-input-delta",
        toolCallId: id,
        inputTextDelta: d,
    }))

/**
 * Answer each chat request with the next reply. Each string in a reply is
 * one network chunk, sent 300 ms apart, so the throttled UI renders between
 * chunks like with a real model.
 */
async function chunkedReplies(p: Page, replies: string[][]) {
    await p.addInitScript((replies) => {
        const realFetch = window.fetch
        let n = 0
        window.fetch = async (input, init) => {
            const url =
                typeof input === "string" ? input : (input as Request).url
            if (!url.endsWith("/api/chat")) return realFetch(input, init)
            const chunks = replies[n++] ?? [
                'data: {"type":"start"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n',
            ]
            const body = new ReadableStream({
                async start(controller) {
                    for (const chunk of chunks) {
                        controller.enqueue(new TextEncoder().encode(chunk))
                        await new Promise((r) => setTimeout(r, 300))
                    }
                    controller.close()
                },
            })
            return new Response(body, {
                headers: { "content-type": "text/event-stream" },
            })
        }
    }, replies)
    await p.goto("/", { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    return p.frameLocator("iframe")
}

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

test("an edit with a fixable cell is fixed, not rejected", async ({
    page: p,
}) => {
    // Chrome's DOMParser puts a <parsererror> next to the cell, which used
    // to count as a second cell
    const canvas = await mockReplies(p, [
        streamedToolCall("display_diagram", { xml: cell("a", "Alpha", 40) }),
        streamedToolCall("edit_diagram", {
            operations: [
                {
                    operation: "add",
                    cell_id: "c",
                    new_xml: cell("c", "Gamma", 400).replace(
                        "</mxCell>",
                        "</mxcell>",
                    ),
                },
            ],
        }),
    ])
    await sendMessage(p, "Draw a box")
    await waitForCompleteCount(p, 1)
    await sendMessage(p, "Add another box")
    await waitForCompleteCount(p, 2)
    await expect(canvas.getByText("Gamma", { exact: true })).toBeVisible({
        timeout: 15000,
    })
    await expect(p.getByText(/exactly one cell/)).toHaveCount(0)
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

test("a built-in example draws its diagram", async ({ page: p }) => {
    // Answered in the browser from lib/cached-responses.ts, no request
    let requests = 0
    await p.route("**/api/chat", (route) => {
        requests++
        return route.fulfill({ status: 500, body: "{}" })
    })
    await p.goto("/", { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    await sendMessage(
        p,
        "Give me a **animated connector** diagram of transformer's architecture",
    )
    await waitForCompleteCount(p, 1)
    await expect(
        p.frameLocator("iframe").getByText("Transformer Architecture"),
    ).toBeVisible({ timeout: 15000 })
    expect(requests).toBe(0)
})

test("the thinking header is in the page language", async ({ page: p }) => {
    const events = [
        { type: "start" },
        { type: "reasoning-start", id: "r1" },
        { type: "reasoning-delta", id: "r1", delta: "Plan the boxes" },
        { type: "reasoning-end", id: "r1" },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "Done" },
        { type: "text-end", id: "t1" },
        { type: "finish" },
    ]
    await p.route("**/api/chat", (route) =>
        route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: `${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")}data: [DONE]\n\n`,
        }),
    )
    await p.goto("/zh", { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    await sendMessage(p, "画两个框")
    await expect(p.getByText("Plan the boxes")).toBeAttached({
        timeout: 15000,
    })
    await expect(p.getByText(/^思考/)).toBeVisible()
    await expect(p.getByText(/^Thought for|^Thinking/)).toHaveCount(0)
})

test("blank text before a tool call shows no empty bubble", async ({
    page: p,
}) => {
    // Kimi K2.6 sends a lone space before calling the tool
    const blankText = [
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: " " },
        { type: "text-end", id: "t1" },
    ]
        .map((e) => `data: ${JSON.stringify(e)}\n\n`)
        .join("")
    const reply = streamedToolCall("display_diagram", {
        xml: cell("2", "Alpha", 40),
    }).replace(
        'data: {"type":"tool-input-start"',
        `${blankText}data: {"type":"tool-input-start"`,
    )
    const canvas = await mockReplies(p, [reply])
    await sendMessage(p, "Draw a box")
    await waitForCompleteCount(p, 1)
    await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible({
        timeout: 15000,
    })
    // Assistant text bubbles have this background
    await expect(p.locator("div.rounded-2xl.bg-muted\\/60")).toHaveCount(0)
})

test("an edit right after a broken edit call starts from the real diagram", async ({
    page: p,
}) => {
    // Seen with Claude Opus 5.5: the first edit call had invalid JSON, the
    // server rejected it, and the model sent the same edit again at once.
    // The second edit must not see the first one's streamed preview.
    const replies = [
        [streamedToolCall("display_diagram", { xml: cell("a", "Alpha", 40) })],
        [
            sse([
                { type: "start" },
                { type: "start-step" },
                editStart("e1"),
                ...editDeltas("e1"),
            ]),
            sse([
                {
                    type: "tool-input-error",
                    toolCallId: "e1",
                    toolName: "edit_diagram",
                    input: "{broken",
                    errorText: "JSON parsing failed",
                },
                {
                    type: "tool-output-error",
                    toolCallId: "e1",
                    errorText: "JSON parsing failed",
                },
                { type: "finish-step" },
                { type: "start-step" },
                editStart("e2"),
                ...editDeltas("e2"),
            ]),
            `${sse([
                {
                    type: "tool-input-available",
                    toolCallId: "e2",
                    toolName: "edit_diagram",
                    input: EDIT_GAMMA,
                },
                { type: "finish-step" },
                { type: "finish" },
            ])}data: [DONE]\n\n`,
        ],
    ]
    const canvas = await chunkedReplies(p, replies)

    await sendMessage(p, "Draw a box")
    await waitForCompleteCount(p, 1)
    await sendMessage(p, "Add another box")
    await waitForCompleteCount(p, 2)
    await expect(canvas.getByText("Gamma", { exact: true })).toBeVisible({
        timeout: 15000,
    })
    await expect(p.getByText(/No changes were made/)).toHaveCount(0)
})

test("a request that fails during an edit undoes its preview", async ({
    page: p,
}) => {
    const canvas = await chunkedReplies(p, [
        [streamedToolCall("display_diagram", { xml: cell("a", "Alpha", 40) })],
        [
            sse([
                { type: "start" },
                { type: "start-step" },
                editStart("e1"),
                ...editDeltas("e1"),
            ]),
            `${sse([{ type: "error", errorText: "Upstream connection lost" }])}data: [DONE]\n\n`,
        ],
    ])
    await sendMessage(p, "Draw a box")
    await waitForCompleteCount(p, 1)
    await sendMessage(p, "Add another box")
    // The preview shows the new cell while the edit streams
    await expect(canvas.getByText("Gamma", { exact: true })).toBeVisible({
        timeout: 15000,
    })
    await expect(p.getByText("Upstream connection lost").first()).toBeVisible({
        timeout: 15000,
    })
    await expect(canvas.getByText("Gamma", { exact: true })).toHaveCount(0)
    await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible()
})
