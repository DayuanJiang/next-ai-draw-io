import zlib from "node:zlib"
import { expect, type Page, test } from "@playwright/test"
import {
    getIframe,
    openDrawioFile,
    sendMessage,
    waitForCompleteCount,
} from "./lib/fixtures"

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

// A screenshot check that finds a problem
const FAILED_CHECK = {
    valid: false,
    issues: [
        { type: "overlap", severity: "critical", description: "Boxes overlap" },
    ],
    suggestions: ["Move them apart"],
}

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
 * chunks like with a real model. A number in a reply sets the wait before
 * the next chunk instead.
 */
async function chunkedReplies(p: Page, replies: (string | number)[][]) {
    await p.addInitScript((replies) => {
        const realFetch = window.fetch
        let n = 0
        window.fetch = async (input, init) => {
            // Next.js passes URL objects for its own requests
            const url = input instanceof Request ? input.url : String(input)
            if (!url.endsWith("/api/chat")) return realFetch(input, init)
            const chunks = replies[n++] ?? [
                'data: {"type":"start"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n',
            ]
            const body = new ReadableStream({
                async start(controller) {
                    for (const [i, chunk] of chunks.entries()) {
                        if (typeof chunk === "number") continue
                        controller.enqueue(new TextEncoder().encode(chunk))
                        const next = chunks[i + 1]
                        await new Promise((r) =>
                            setTimeout(
                                r,
                                typeof next === "number" ? next : 300,
                            ),
                        )
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
    // draw.io's own page tabs
    const pageTabs = canvas.locator(".geTabContainer")
    await expect(pageTabs.getByText("Second", { exact: true })).toBeVisible()

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
    await expect(pageTabs.getByText("Second", { exact: true })).toHaveCount(0)
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
    // The failed call's row opens to show the error
    await p
        .locator('[data-testid="tool-row"][data-tool-state="output-error"]')
        .first()
        .getByRole("button")
        .first()
        .click({ timeout: 15000 })
    await expect(p.getByText(/No changes were made/).first()).toBeAttached()
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

/** A streamed tool call split into its start, input deltas and finished input */
function toolCallEvents(id: string, toolName: string, input: unknown) {
    const deltas = (JSON.stringify(input).match(/[\s\S]{1,40}/g) ?? []).map(
        (d) => ({
            type: "tool-input-delta",
            toolCallId: id,
            inputTextDelta: d,
        }),
    )
    return {
        start: { type: "tool-input-start", toolCallId: id, toolName },
        deltas,
        done: { type: "tool-input-available", toolCallId: id, toolName, input },
    }
}
const drawReply = (id: string, xml: string) => {
    const call = toolCallEvents(id, "display_diagram", { xml })
    return `${sse([{ type: "start" }, call.start, ...call.deltas, call.done, { type: "finish" }])}data: [DONE]\n\n`
}
const textReply = (text: string) =>
    `${sse([
        { type: "start" },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: text },
        { type: "text-end", id: "t" },
        { type: "finish" },
    ])}data: [DONE]\n\n`
// SSE comments keep a stream open without sending anything
const KEEP_OPEN = Array(20).fill(":\n\n")

test("an error after a finished edit keeps the current diagram", async ({
    page: p,
}) => {
    const edit = toolCallEvents("e1", "edit_diagram", EDIT_GAMMA)
    const half = Math.ceil(edit.deltas.length / 2)
    const canvas = await chunkedReplies(p, [
        [drawReply("d1", cell("a", "Alpha", 40))],
        [
            sse([
                { type: "start" },
                { type: "start-step" },
                edit.start,
                ...edit.deltas.slice(0, half),
            ]),
            // The last input and the finished call arrive together, so the
            // tool handler runs before the UI shows the call as finished
            `${sse([...edit.deltas.slice(half), edit.done, { type: "finish-step" }, { type: "finish" }])}data: [DONE]\n\n`,
        ],
        [drawReply("d2", cell("b", "Beta", 40))],
        [
            `${sse([{ type: "start" }, { type: "error", errorText: "Upstream down" }])}data: [DONE]\n\n`,
        ],
    ])
    await sendMessage(p, "Draw a box")
    await waitForCompleteCount(p, 1)
    await sendMessage(p, "Add a box")
    await waitForCompleteCount(p, 2)
    await expect(canvas.getByText("Gamma", { exact: true })).toBeVisible({
        timeout: 15000,
    })
    await sendMessage(p, "Start over")
    await waitForCompleteCount(p, 3)
    await expect(canvas.getByText("Beta", { exact: true })).toBeVisible({
        timeout: 15000,
    })
    await sendMessage(p, "Once more")
    await expect(p.getByText("Upstream down").first()).toBeVisible({
        timeout: 15000,
    })
    await p.waitForTimeout(1000)
    await expect(canvas.getByText("Beta", { exact: true })).toBeVisible()
    await expect(canvas.getByText("Alpha", { exact: true })).toHaveCount(0)
})

// The broken call's error and the whole next edit arrive together. 220 ms
// after the preview: the UI (throttled to 150 ms) shows the error only after
// the next edit was applied. 600 ms: the UI undoes the preview first.
for (const gap of [220, 600]) {
    test(`an edit that arrives with a broken edit's error keeps its change (${gap} ms)`, async ({
        page: p,
    }) => {
        const delta = toolCallEvents("e2", "edit_diagram", {
            operations: [
                {
                    operation: "add",
                    cell_id: "d",
                    new_xml: cell("d", "Delta", 220),
                },
            ],
        })
        const canvas = await chunkedReplies(p, [
            [drawReply("d1", cell("a", "Alpha", 40))],
            [
                sse([{ type: "start" }, { type: "start-step" }]),
                sse([editStart("e1"), ...editDeltas("e1")]),
                gap,
                `${sse([
                    {
                        type: "tool-input-error",
                        toolCallId: "e1",
                        toolName: "edit_diagram",
                        input: "{broken",
                        errorText: "JSON parsing failed",
                    },
                    { type: "finish-step" },
                    { type: "start-step" },
                    delta.start,
                    ...delta.deltas,
                    delta.done,
                    { type: "finish-step" },
                    { type: "finish" },
                ])}data: [DONE]\n\n`,
            ],
        ])
        await sendMessage(p, "Draw a box")
        await waitForCompleteCount(p, 1)
        await sendMessage(p, "Add another box")
        await expect(canvas.getByText("Delta", { exact: true })).toBeVisible({
            timeout: 15000,
        })
        await p.waitForTimeout(1000)
        await expect(canvas.getByText("Delta", { exact: true })).toBeVisible()
        await expect(canvas.getByText("Gamma", { exact: true })).toHaveCount(0)
        await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible()
        await expect(p.getByText(/No changes were made/)).toHaveCount(0)
    })
}

test("a request that fails while drawing undoes the half drawn diagram", async ({
    page: p,
}) => {
    const redraw = toolCallEvents("d2", "display_diagram", {
        xml: cell("b", "Beta", 40) + cell("c", "Gamma", 220),
    })
    const canvas = await chunkedReplies(p, [
        [drawReply("d1", cell("a", "Alpha", 40))],
        [
            sse([{ type: "start" }, redraw.start, ...redraw.deltas]),
            `${sse([{ type: "error", errorText: "Upstream connection lost" }])}data: [DONE]\n\n`,
        ],
    ])
    await sendMessage(p, "Draw a box")
    await waitForCompleteCount(p, 1)
    await sendMessage(p, "Draw it again")
    await expect(canvas.getByText("Beta", { exact: true })).toBeVisible({
        timeout: 15000,
    })
    await expect(p.getByText("Upstream connection lost").first()).toBeVisible({
        timeout: 15000,
    })
    await expect(canvas.getByText("Beta", { exact: true })).toHaveCount(0)
    await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible()
})

test("stopping while drawing undoes the half drawn diagram", async ({
    page: p,
}) => {
    const redraw = toolCallEvents("d2", "display_diagram", {
        xml: cell("b", "Beta", 40) + cell("c", "Gamma", 220),
    })
    const canvas = await chunkedReplies(p, [
        [drawReply("d1", cell("a", "Alpha", 40))],
        [
            sse([{ type: "start" }, redraw.start, ...redraw.deltas]),
            ...KEEP_OPEN,
        ],
    ])
    await sendMessage(p, "Draw a box")
    await waitForCompleteCount(p, 1)
    await sendMessage(p, "Draw it again")
    await expect(canvas.getByText("Beta", { exact: true })).toBeVisible({
        timeout: 15000,
    })
    await p.getByRole("button", { name: "Stop generation" }).click()
    await expect(canvas.getByText("Beta", { exact: true })).toHaveCount(0)
    await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible()
})

test("a broken edit's preview is undone after a shape library call", async ({
    page: p,
}) => {
    // The server runs get_shape_library, but its call still reaches the
    // browser's tool handler, before the UI shows the broken edit's error
    const library = toolCallEvents("s1", "get_shape_library", {
        library: "aws4",
    })
    const canvas = await chunkedReplies(p, [
        [drawReply("d1", cell("a", "Alpha", 40))],
        [
            sse([{ type: "start" }, { type: "start-step" }]),
            sse([editStart("e1"), ...editDeltas("e1")]),
            220,
            `${sse([
                {
                    type: "tool-input-error",
                    toolCallId: "e1",
                    toolName: "edit_diagram",
                    input: "{broken",
                    errorText: "JSON parsing failed",
                },
                { type: "finish-step" },
                { type: "start-step" },
                library.start,
                ...library.deltas,
                library.done,
                {
                    type: "tool-output-available",
                    toolCallId: "s1",
                    output: "AWS shapes",
                },
                { type: "finish-step" },
                { type: "finish" },
            ])}data: [DONE]\n\n`,
        ],
    ])
    await sendMessage(p, "Draw a box")
    await waitForCompleteCount(p, 1)
    await sendMessage(p, "Add another box")
    // The preview shows Gamma only for a moment; afterwards it must be gone
    await expect(
        p.locator('[data-tool-name="get_shape_library"]').first(),
    ).toBeVisible({ timeout: 15000 })
    await p.waitForTimeout(2000)
    await expect(canvas.getByText("Gamma", { exact: true })).toHaveCount(0)
    await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible()
})

test("a drawing rejected by the checks undoes its preview", async ({
    page: p,
}) => {
    // A linked shape that uses the root cell id "1": the finished XML is
    // rejected, while the preview still draws the other shape
    const redraw = toolCallEvents("d2", "display_diagram", {
        xml:
            cell("b", "Beta", 40) +
            `<UserObject id="1" label="Bad" link="https://example.com"><mxCell vertex="1" parent="1"><mxGeometry x="220" y="40" width="120" height="60" as="geometry"/></mxCell></UserObject>`,
    })
    const canvas = await chunkedReplies(p, [
        [drawReply("d1", cell("a", "Alpha", 40))],
        [
            sse([{ type: "start" }, redraw.start, ...redraw.deltas]),
            `${sse([redraw.done, { type: "finish" }])}data: [DONE]\n\n`,
        ],
    ])
    await sendMessage(p, "Draw a box")
    await waitForCompleteCount(p, 1)
    await sendMessage(p, "Draw it again")
    await expect(canvas.getByText("Beta", { exact: true })).toBeVisible({
        timeout: 15000,
    })
    // The tool row shows the rejection
    await expect(
        p
            .locator('[data-testid="tool-row"][data-tool-state="output-error"]')
            .first(),
    ).toBeVisible({ timeout: 15000 })
    await p.waitForTimeout(1000)
    await expect(canvas.getByText("Beta", { exact: true })).toHaveCount(0)
    await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible()
})

test("stopping during the screenshot check starts no new request", async ({
    page: p,
}) => {
    await p.addInitScript(() => {
        localStorage.setItem("next-ai-draw-io-vlm-validation-enabled", "true")
    })
    let chatRequests = 0
    await p.route("**/api/chat", async (route) => {
        chatRequests++
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: drawReply(`d${chatRequests}`, cell("a", "Alpha", 40)),
        })
    })
    // The check answers late, and finds a problem
    let checking = false
    await p.route("**/api/validate-diagram", async (route) => {
        checking = true
        await new Promise((r) => setTimeout(r, 3000))
        await route.fulfill({
            status: 200,
            contentType: "text/plain",
            body: JSON.stringify({
                valid: false,
                issues: [
                    {
                        type: "overlap",
                        severity: "critical",
                        description: "Boxes overlap",
                    },
                ],
                suggestions: ["Move them apart"],
            }),
        })
    })
    await p.goto("/", { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    await sendMessage(p, "Draw a box")
    await expect.poll(() => checking, { timeout: 15000 }).toBe(true)
    await p.getByRole("button", { name: "Stop generation" }).click()
    await p.waitForTimeout(5000)
    expect(chatRequests).toBe(1)
})

test("stopping during the screenshot check lets the next message go at once", async ({
    page: p,
}) => {
    // The check was still running when the user stopped; it held up the
    // chat until it ended, and its call never got a result
    await p.addInitScript(() => {
        localStorage.setItem("next-ai-draw-io-vlm-validation-enabled", "true")
    })
    const bodies: Array<{ messages: any[] }> = []
    await p.route("**/api/chat", async (route) => {
        bodies.push(route.request().postDataJSON())
        const n = bodies.length
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body:
                n === 1
                    ? drawReply("d1", cell("a", "Alpha", 40))
                    : textReply("Second answer"),
        })
    })
    let checking = false
    await p.route("**/api/validate-diagram", async (route) => {
        checking = true
        // Much longer than this test waits for the second answer
        await new Promise((r) => setTimeout(r, 30000))
        await route.fulfill({ status: 200, body: "{}" }).catch(() => {})
    })
    await p.goto("/", { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    await sendMessage(p, "Draw a box")
    await expect.poll(() => checking, { timeout: 15000 }).toBe(true)
    await p.getByRole("button", { name: "Stop generation" }).click()
    await sendMessage(p, "Thanks")
    await expect(p.getByText("Second answer")).toBeVisible({ timeout: 8000 })
    // The drawing call had its result when the next message was sent
    const draw = bodies[1].messages
        .flatMap((m: any) => m.parts ?? [])
        .find((part: any) => part.type === "tool-display_diagram")
    expect(draw?.state).toBe("output-available")
})

test("the request after a failed screenshot check keeps the model and diagram", async ({
    page: p,
}) => {
    // After a failed check the SDK sends the next request itself; it must
    // carry the turn's model headers and diagram
    await p.addInitScript(() => {
        localStorage.setItem("next-ai-draw-io-vlm-validation-enabled", "true")
    })
    const requests: { body: any; headers: Record<string, string> }[] = []
    await p.route("**/api/chat", async (route) => {
        requests.push({
            body: route.request().postDataJSON(),
            headers: route.request().headers(),
        })
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: drawReply(`d${requests.length}`, cell("a", "Alpha", 40)),
        })
    })
    let checks = 0
    await p.route("**/api/validate-diagram", async (route) => {
        checks++
        await new Promise((r) => setTimeout(r, 500))
        await route.fulfill({
            status: 200,
            contentType: "text/plain",
            body: JSON.stringify(
                checks === 1
                    ? FAILED_CHECK
                    : { valid: true, issues: [], suggestions: [] },
            ),
        })
    })
    await p.goto("/", { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    await sendMessage(p, "Draw a box")
    await expect.poll(() => requests.length, { timeout: 20000 }).toBe(2)
    const [first, retry] = requests
    expect(retry.body.sessionId).toBe(first.body.sessionId)
    expect(typeof retry.body.xml).toBe("string")
    for (const name of Object.keys(first.headers)) {
        if (name.startsWith("x-")) {
            expect(retry.headers[name], name).toBe(first.headers[name])
        }
    }
})

// A display_diagram cut off by the output limit: its last cell is half
// written, so the model has to continue with append_diagram
const CUT = toolCallEvents("d2", "display_diagram", {
    xml: `${cell("b", "Beta", 40)}<mxCell id="c" value="Gam`,
})
const cutReply = [
    sse([{ type: "start" }, CUT.start, ...CUT.deltas]),
    1500,
    `${sse([CUT.done, { type: "finish" }])}data: [DONE]\n\n`,
]

test("a cut off drawing stays while it is continued, and goes if that fails", async ({
    page: p,
}) => {
    const canvas = await chunkedReplies(p, [
        [drawReply("d1", cell("a", "Alpha", 40))],
        cutReply,
        [
            sse([{ type: "start" }]),
            ...KEEP_OPEN.slice(0, 10),
            `${sse([{ type: "error", errorText: "Upstream connection lost" }])}data: [DONE]\n\n`,
        ],
    ])
    await sendMessage(p, "Draw a box")
    await waitForCompleteCount(p, 1)
    await sendMessage(p, "Draw a bigger one")
    // The cut off call has its result; the continuation is running
    await expect(
        p.locator(
            '[data-tool-name="display_diagram"][data-tool-state="output-error"]',
        ),
    ).toBeVisible({ timeout: 15000 })
    await p.waitForTimeout(800)
    await expect(canvas.getByText("Beta", { exact: true })).toBeVisible()
    await expect(p.getByText("Upstream connection lost").first()).toBeVisible({
        timeout: 15000,
    })
    await expect(canvas.getByText("Beta", { exact: true })).toHaveCount(0)
    await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible()
})

test("a finished continuation is one change, undone back to the diagram before", async ({
    page: p,
}) => {
    const rest = toolCallEvents("a1", "append_diagram", {
        xml: `ma" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="220" y="40" width="120" height="60" as="geometry"/></mxCell>`,
    })
    const canvas = await chunkedReplies(p, [
        [drawReply("d1", cell("a", "Alpha", 40))],
        cutReply,
        [
            `${sse([{ type: "start" }, rest.start, ...rest.deltas, rest.done, { type: "finish" }])}data: [DONE]\n\n`,
        ],
    ])
    await sendMessage(p, "Draw a box")
    await waitForCompleteCount(p, 1)
    await sendMessage(p, "Draw a bigger one")
    await expect(canvas.getByText("Gamma", { exact: true })).toBeVisible({
        timeout: 15000,
    })
    await expect(canvas.getByText("Beta", { exact: true })).toBeVisible()
    await expect(p.locator('[data-testid="new-chat-button"]')).toBeEnabled({
        timeout: 15000,
    })
    await p.waitForTimeout(1500)
    await p.locator('[data-testid="version-undo"]').click()
    await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible()
    await expect(canvas.getByText("Beta", { exact: true })).toHaveCount(0)
})

test("a cut off drawing goes when the model stops without continuing", async ({
    page: p,
}) => {
    const canvas = await chunkedReplies(p, [
        [drawReply("d1", cell("a", "Alpha", 40))],
        cutReply,
        [textReply("I could not finish it.")],
    ])
    await sendMessage(p, "Draw a box")
    await waitForCompleteCount(p, 1)
    await sendMessage(p, "Draw a bigger one")
    await expect(p.getByText("I could not finish it.")).toBeVisible({
        timeout: 15000,
    })
    await expect(canvas.getByText("Beta", { exact: true })).toHaveCount(0)
    await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible()
    // The first drawing is on the canvas again: its card can still undo it
    await p.waitForTimeout(1500)
    await expect(p.locator('[data-testid="version-undo"]')).toBeVisible()
})

test("stopping a continuation leaves the diagram from before the cut off one", async ({
    page: p,
}) => {
    // The model draws anew instead of continuing, and the user stops it
    const redraw = toolCallEvents("d3", "display_diagram", {
        xml: cell("g", "Gamma", 400),
    })
    const canvas = await chunkedReplies(p, [
        [drawReply("d1", cell("a", "Alpha", 40))],
        cutReply,
        [
            sse([{ type: "start" }, redraw.start, ...redraw.deltas]),
            ...KEEP_OPEN,
        ],
    ])
    await sendMessage(p, "Draw a box")
    await waitForCompleteCount(p, 1)
    await sendMessage(p, "Draw a bigger one")
    await expect(canvas.getByText("Gamma", { exact: true })).toBeVisible({
        timeout: 15000,
    })
    await p.getByRole("button", { name: "Stop generation" }).click()
    await p.waitForTimeout(1000)
    await expect(canvas.getByText("Gamma", { exact: true })).toHaveCount(0)
    await expect(canvas.getByText("Beta", { exact: true })).toHaveCount(0)
    await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible()
})

test("a drawing that failed its screenshot check can still be restored", async ({
    page: p,
}) => {
    await p.addInitScript(() => {
        localStorage.setItem("next-ai-draw-io-vlm-validation-enabled", "true")
    })
    let chatRequests = 0
    await p.route("**/api/chat", async (route) => {
        chatRequests++
        if (chatRequests === 1) {
            await route.fulfill({
                status: 200,
                contentType: "text/event-stream",
                body: drawReply("d1", cell("a", "Alpha", 40)),
            })
            return
        }
        await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Model is overloaded" }),
        })
    })
    await p.route("**/api/validate-diagram", (route) =>
        route.fulfill({
            status: 200,
            contentType: "text/plain",
            body: JSON.stringify(FAILED_CHECK),
        }),
    )
    await p.goto("/", { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    await sendMessage(p, "Draw a box")
    await expect(p.getByText("Model is overloaded").first()).toBeVisible({
        timeout: 20000,
    })
    await expect(p.locator('[data-testid="version-thumb"]')).toHaveCount(1)
})

test("retrying after an error keeps what the failed turn drew", async ({
    page: p,
}) => {
    const draw = toolCallEvents("d1", "display_diagram", {
        xml: cell("a", "Alpha", 40),
    })
    const canvas = await chunkedReplies(p, [
        [
            sse([{ type: "start" }, draw.start, ...draw.deltas, draw.done]),
            `${sse([{ type: "error", errorText: "Model is overloaded" }])}data: [DONE]\n\n`,
        ],
        [textReply("Nothing to draw this time.")],
    ])
    await sendMessage(p, "Draw a box")
    await expect(p.getByText("Model is overloaded").first()).toBeVisible({
        timeout: 15000,
    })
    await p.locator('[data-testid="retry-button"]').click()
    await expect(p.getByText("Nothing to draw this time.")).toBeVisible({
        timeout: 15000,
    })
    // Its card went with the answer; the strip keeps the version, and the
    // retry started from the canvas with it
    const thumb = p.locator('[data-testid="version-thumb"]')
    await expect(thumb).toHaveCount(1)
    await expect(canvas.getByText("Alpha", { exact: true })).toBeVisible()
    await thumb.click()
    await expect(
        p.getByText("This version is what the canvas shows now."),
    ).toBeVisible()
})

test("the request after opening a compressed file has the cells", async ({
    page: p,
}) => {
    const requests: any[] = []
    await p.route("**/api/chat", async (route) => {
        requests.push(route.request().postDataJSON())
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: textReply("Looks fine."),
        })
    })
    await p.goto("/", { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    // draw.io's compressed page: raw deflate of the URI-encoded model
    const model = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cell("a", "Packed", 40)}</root></mxGraphModel>`
    const packed = zlib
        .deflateRawSync(Buffer.from(encodeURIComponent(model)))
        .toString("base64")
    await openDrawioFile(
        p,
        "packed.drawio",
        `<mxfile><diagram name="P" id="p">${packed}</diagram></mxfile>`,
    )
    await expect(
        p.frameLocator("iframe").getByText("Packed", { exact: true }),
    ).toBeVisible()
    await sendMessage(p, "What is this?")
    await expect(p.getByText("Looks fine.")).toBeVisible()
    // Regenerate sends the snapshot taken before the message
    await p.getByText("Looks fine.").hover()
    await p.getByRole("button", { name: "Regenerate response" }).click()
    await expect.poll(() => requests.length).toBe(2)
    expect(requests[1].xml).toContain('value="Packed"')
})

test("a rejected drawing stops saying it tries again once retries end", async ({
    page: p,
}) => {
    // Rejected by the checks every time: the automatic retries run out
    let calls = 0
    await p.route("**/api/chat", async (route) => {
        calls++
        await route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: drawReply(
                `r${calls}`,
                `<UserObject id="1" label="Bad" link="https://example.com"><mxCell vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell></UserObject>`,
            ),
        })
    })
    await p.goto("/", { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    await sendMessage(p, "Draw a box")
    await expect.poll(() => calls, { timeout: 20000 }).toBe(4)
    await expect(p.locator('[data-testid="new-chat-button"]')).toBeEnabled({
        timeout: 15000,
    })
    await p.waitForTimeout(500)
    expect(calls).toBe(4)
    await expect(p.getByText("trying again")).toHaveCount(0)
    await expect(p.getByText("This attempt failed").first()).toBeVisible()
})

test("the version strip stays away while the first drawing is checked", async ({
    page: p,
}) => {
    await p.addInitScript(() => {
        localStorage.setItem("next-ai-draw-io-vlm-validation-enabled", "true")
    })
    await p.route("**/api/chat", (route) =>
        route.fulfill({
            status: 200,
            contentType: "text/event-stream",
            body: drawReply("d1", cell("a", "Alpha", 40)),
        }),
    )
    let checking = false
    await p.route("**/api/validate-diagram", async (route) => {
        checking = true
        await new Promise((r) => setTimeout(r, 3000))
        await route
            .fulfill({
                status: 200,
                contentType: "text/plain",
                body: JSON.stringify({
                    valid: true,
                    issues: [],
                    suggestions: [],
                }),
            })
            .catch(() => {})
    })
    await p.goto("/", { waitUntil: "networkidle" })
    await getIframe(p).waitFor({ state: "visible", timeout: 30000 })
    await sendMessage(p, "Draw a box")
    await expect.poll(() => checking, { timeout: 15000 }).toBe(true)
    // The version exists already; its card comes when the check is done
    await p.waitForTimeout(1000)
    await expect(p.locator('[data-testid="version-thumb"]')).toHaveCount(0)
    await expect(p.locator('[data-testid="version-card"]')).toHaveCount(1, {
        timeout: 10000,
    })
    await expect(p.locator('[data-testid="version-thumb"]')).toHaveCount(0)
})
