import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    changedPageId,
    createMcpSync,
    decideLoad,
    type ExportRequest,
    type LoadDecision,
    type SyncNotice,
    type SyncStatus,
    tokenFromPage,
} from "@/packages/mcp-server/shell/mcp-sync-core"
import type { SelectionAnswer } from "@/packages/mcp-server/src/selection"

// The shell's side of the MCP server protocol, driven step by step with a
// stubbed server (fetch) and canvas, as tests/unit/mcp-preview-recovery.test.ts
// drives the classic page. Timers are faked; settle() lets promises run.

// A string body is sent as it is (a page's HTML); anything else as JSON
type Answer = { status: number; body?: unknown }
interface Call {
    url: string
    method: string
    headers: Record<string, string>
    body: any
    answer: (a: Answer) => void
    fail: () => void
}
interface PendingExport {
    request: ExportRequest
    answer: (result: { data?: string; xml?: string } | null) => void
}

const realSetTimeout = globalThis.setTimeout

function open(
    options: { currentPageId?: string | null; isHidden?: () => boolean } = {},
) {
    const calls: Call[] = []
    const fetchStub = vi.fn(
        (url: string, init?: RequestInit) =>
            new Promise<Response>((resolve, reject) => {
                calls.push({
                    url,
                    method: init?.method ?? "GET",
                    headers: (init?.headers ?? {}) as Record<string, string>,
                    body: init?.body ? JSON.parse(String(init.body)) : null,
                    answer: ({ status, body }) =>
                        resolve(
                            new Response(
                                typeof body === "string"
                                    ? body
                                    : JSON.stringify(body),
                                { status },
                            ),
                        ),
                    fail: () => reject(new TypeError("Failed to fetch")),
                })
            }),
    )
    const loads: { xml: string; decision: LoadDecision }[] = []
    const transients: string[] = []
    const exports: PendingExport[] = []
    const notices: SyncNotice[] = []
    const statuses: SyncStatus[] = []
    let recreated = 0
    const canvas: {
        xml: string
        pageId: string | null
        loadPending: boolean
        selection: SelectionAnswer
    } = {
        xml: "",
        pageId: options.currentPageId ?? null,
        loadPending: false,
        selection: { pageId: "p1", pageName: "Page-1", cells: [] },
    }
    const sync = createMcpSync({
        sessionId: "mcp-test",
        apiBase: "/api",
        token: "test-token",
        fetch: fetchStub as unknown as typeof fetch,
        canvas: {
            load: (xml, decision) => {
                loads.push({ xml, decision })
                canvas.xml = xml
            },
            showTransient: (xml) => transients.push(xml),
            export: (request, timeoutMs) =>
                new Promise((resolve) => {
                    const pending = { request, answer: resolve }
                    exports.push(pending)
                    // As DiagramProvider.requestExport: null when draw.io
                    // does not answer in time
                    setTimeout(() => {
                        if (exports.includes(pending)) {
                            exports.splice(exports.indexOf(pending), 1)
                            resolve(null)
                        }
                    }, timeoutMs)
                }),
            currentXml: () => canvas.xml,
            currentPageId: () => canvas.pageId,
            loadPending: () => canvas.loadPending,
            readSelection: () => canvas.selection,
        },
        onNotice: (notice) => notices.push(notice),
        onStatus: (status) => statuses.push(status),
        onStateRecreated: () => recreated++,
        isHidden: options.isHidden,
    })
    const settle = () => new Promise((r) => realSetTimeout(r, 0))
    const next = (method: string, prefix = "/api/") => {
        const call = calls.find(
            (c) => c.method === method && c.url.startsWith(prefix),
        )
        if (!call) throw new Error(`no pending ${method} ${prefix}`)
        calls.splice(calls.indexOf(call), 1)
        return call
    }
    const nextExport = () => {
        const pending = exports.shift()
        if (!pending) throw new Error("no pending export")
        return pending
    }
    const posts = () => calls.filter((c) => c.method === "POST")
    return {
        sync,
        calls,
        loads,
        transients,
        exports,
        notices,
        statuses,
        canvas,
        recreated: () => recreated,
        settle,
        next,
        nextExport,
        posts,
    }
}

const state = (
    stateId: string,
    version: number,
    xml: string,
    extra: Record<string, unknown> = {},
) => ({
    status: 200,
    body: {
        stateId,
        version,
        xml,
        blank: false,
        syncRequested: false,
        exportFormat: null,
        exportXml: null,
        exportOptions: null,
        exportId: null,
        ...extra,
    },
})

/** A tab in step with state S1 at version 2, showing diagram A, draw.io ready */
async function inStep(
    options: { currentPageId?: string | null; isHidden?: () => boolean } = {},
) {
    const t = open(options)
    t.sync.setReady(true)
    const poll = t.sync.poll()
    t.next("GET").answer(state("S1", 2, "<mxfile>A</mxfile>"))
    await poll
    expect(t.sync.read().lastXml).toBe("<mxfile>A</mxfile>")
    expect(t.loads).toHaveLength(1)
    // The thumbnail of the loaded write is taken and sent
    await vi.advanceTimersByTimeAsync(500)
    t.nextExport().answer({ data: "<svg>A</svg>" })
    await t.settle()
    t.next("POST", "/api/history-svg").answer({ status: 200, body: {} })
    await t.settle()
    return t
}

/** The user edits to xml and draw.io answers the SVG export of it */
async function edit(t: Awaited<ReturnType<typeof inStep>>, xml: string) {
    t.sync.onAutoSave(xml)
    t.nextExport().answer({ data: "<svg/>" })
    await t.settle()
}

beforeEach(() => {
    vi.useFakeTimers()
})
afterEach(() => {
    vi.useRealTimers()
})

describe("MCP sync after the server recreated its session", () => {
    it("keeps edits made while the server was down", async () => {
        const t = await inStep()
        // The user edits; the server is gone
        await edit(t, "<mxfile>B</mxfile>")
        t.next("POST").fail()
        await t.settle()
        expect(t.notices).toEqual(["unreachable"])
        expect(t.sync.read().status).toBe("offline")
        // A new process recovered the file, which holds A
        const poll = t.sync.poll()
        t.next("GET").answer(state("S2", 1, "<mxfile>A</mxfile>"))
        await poll
        const push = t.next("POST")
        expect(push.body).toMatchObject({
            xml: "<mxfile>B</mxfile>",
            stateId: "S2",
            baseVersion: 1,
        })
        expect(t.recreated()).toBe(1)
    })

    it("fetches the new process's token after a 403 and then recovers", async () => {
        const t = await inStep()
        await edit(t, "<mxfile>B</mxfile>")
        const refused = t.next("POST")
        expect(refused.headers["X-Drawio-Token"]).toBe("test-token")
        refused.answer({ status: 403 })
        await t.settle()
        // The page reads its own HTML again for the token
        const reload = t.next("GET", location.href)
        expect(reload.headers["X-Drawio-Token"]).toBeUndefined()
        reload.answer({
            status: 200,
            body: '<script>window.__MCP_CONFIG__ = {"sessionId":"mcp-test","token":"0123abcd"};</script>',
        })
        await t.settle()
        await t.settle()
        // The push is retried with the new token; the new process refuses
        // it for its state id, and the poll that follows recovers
        const retried = t.next("POST")
        expect(retried.headers["X-Drawio-Token"]).toBe("0123abcd")
        retried.answer({
            status: 409,
            body: { error: "Session was recreated" },
        })
        await t.settle()
        const poll = t.next("GET")
        expect(poll.headers["X-Drawio-Token"]).toBe("0123abcd")
        poll.answer(state("S2", 1, "<mxfile>A</mxfile>"))
        await t.settle()
        await t.settle()
        expect(t.sync.read().stateId).toBe("S2")
        const push = t.next("POST")
        expect(push.headers["X-Drawio-Token"]).toBe("0123abcd")
        expect(push.body).toMatchObject({
            xml: "<mxfile>B</mxfile>",
            stateId: "S2",
            baseVersion: 1,
        })
    })

    it("takes the picture of the recovered diagram, whose History entry came back without one", async () => {
        const t = await inStep()
        // The process restarted and read the file back: the text the tab
        // last saw, so the canvas stays; History is saved without pictures
        const poll = t.sync.poll()
        t.next("GET").answer(state("S2", 1, "<mxfile>A</mxfile>"))
        await poll
        expect(t.loads).toHaveLength(1)
        expect(t.posts()).toHaveLength(0)
        t.nextExport().answer({ data: "<svg>A</svg>" })
        await t.settle()
        expect(t.next("POST", "/api/history-svg").body).toMatchObject({
            stateId: "S2",
            version: 1,
        })
    })

    it("shows the server's diagram and keeps the tab's in History", async () => {
        const t = await inStep()
        const poll = t.sync.poll()
        t.next("GET").answer(state("S2", 1, "<mxfile>C</mxfile>"))
        await poll
        expect(t.loads.at(-1)).toMatchObject({
            xml: "<mxfile>C</mxfile>",
            decision: { mode: "load" },
        })
        expect(t.next("POST").body).toMatchObject({
            xml: "<mxfile>A</mxfile>",
            source: "recover",
            stateId: "S2",
        })
    })

    it("sends an edit of the replaced canvas to History, until draw.io loaded", async () => {
        const t = await inStep()
        const poll = t.sync.poll()
        t.next("GET").answer(state("S2", 1, "<mxfile>C</mxfile>"))
        await poll
        t.next("POST") // the tab's copy, to History
        // An autosave the old canvas sent before the load
        t.sync.onAutoSave("<mxfile>A edited</mxfile>")
        await t.settle()
        expect(t.next("POST").body).toMatchObject({
            xml: "<mxfile>A edited</mxfile>",
            source: "recover",
        })
        // After the load, edits are edits again
        t.sync.onDrawioLoad()
        await edit(t, "<mxfile>C edited</mxfile>")
        expect(t.next("POST").body).toMatchObject({
            xml: "<mxfile>C edited</mxfile>",
            source: "edit",
        })
    })

    it("ignores the late answer to an old state's push", async () => {
        const t = await inStep()
        await edit(t, "<mxfile>B</mxfile>")
        const oldPush = t.next("POST")
        const poll = t.sync.poll()
        t.next("GET").answer(state("S2", 1, "<mxfile>B</mxfile>"))
        await poll
        oldPush.answer({ status: 200, body: { success: true, version: 21 } })
        await t.settle()
        expect(t.sync.read()).toMatchObject({
            stateId: "S2",
            currentVersion: 1,
        })
    })

    it("drops a poll answer older than one already handled", async () => {
        const t = await inStep()
        const first = t.sync.poll()
        const firstGet = t.next("GET")
        const second = t.sync.poll()
        t.next("GET").answer(state("S2", 1, "<mxfile>A</mxfile>"))
        await second
        // The answer from before the restart comes last
        firstGet.answer(state("S1", 3, "<mxfile>old</mxfile>"))
        await first
        expect(t.sync.read().stateId).toBe("S2")
    })

    it("saves an undo made while a push was on its way", async () => {
        const t = await inStep()
        await edit(t, "<mxfile>B</mxfile>")
        const pushB = t.next("POST")
        // Undo back to A: equal to the last saved diagram, so no push
        t.sync.onAutoSave("<mxfile>A</mxfile>")
        await t.settle()
        expect(t.posts()).toHaveLength(0)
        pushB.answer({ status: 200, body: { success: true, version: 3 } })
        await t.settle()
        await t.settle()
        expect(t.next("POST").body.xml).toBe("<mxfile>A</mxfile>")
    })

    it("ignores an edit's answer that comes after a newer AI write loaded", async () => {
        const t = await inStep()
        await edit(t, "<mxfile>B</mxfile>")
        const pushB = t.next("POST")
        // The AI wrote X after B; the poll's answer comes first
        const poll = t.sync.poll()
        t.next("GET").answer(state("S1", 4, "<mxfile>X</mxfile>"))
        await poll
        pushB.answer({ status: 200, body: { success: true, version: 3 } })
        await t.settle()
        await t.settle()
        expect(t.sync.read()).toMatchObject({
            currentVersion: 4,
            lastXml: "<mxfile>X</mxfile>",
        })
        // No push of the AI's diagram as the user's edit
        expect(t.posts()).toHaveLength(0)
    })

    it("keeps an undo when a poll sees the tab's own push first", async () => {
        const t = await inStep()
        await edit(t, "<mxfile>B</mxfile>")
        const pushB = t.next("POST")
        // Undo back to A while B is on its way (equal to the saved A: not sent)
        t.sync.onAutoSave("<mxfile>A</mxfile>")
        // The server already has B, and the poll's answer comes first
        const loadsBefore = t.loads.length
        const poll = t.sync.poll()
        t.next("GET").answer(state("S1", 3, "<mxfile>B</mxfile>"))
        await poll
        expect(t.loads).toHaveLength(loadsBefore)
        pushB.answer({ status: 200, body: { success: true, version: 3 } })
        await t.settle()
        await t.settle()
        // The undo is saved
        expect(t.next("POST").body.xml).toBe("<mxfile>A</mxfile>")
    })

    it("sends nothing more after a sync reply", async () => {
        const t = await inStep()
        const poll = t.sync.poll()
        t.next("GET").answer(
            state("S1", 2, "<mxfile>A</mxfile>", { syncRequested: true }),
        )
        await poll
        const request = t.nextExport()
        expect(request.request).toEqual({ format: "xml" })
        // draw.io's export of the canvas, formatted unlike its autosave
        request.answer({ xml: '<mxfile host="drawio">A</mxfile>' })
        await t.settle()
        const sync = t.next("POST")
        expect(sync.body).toMatchObject({
            source: "sync",
            baseVersion: 2,
            stateId: "S1",
        })
        sync.answer({ status: 200, body: { success: true, version: 3 } })
        await t.settle()
        await t.settle()
        expect(t.posts()).toHaveLength(0)
        expect(t.sync.read().currentVersion).toBe(3)
    })

    it("recovers from a stale push: the newer write loads, the edit is kept", async () => {
        const t = await inStep()
        await edit(t, "<mxfile>B</mxfile>")
        // The AI wrote version 3 meanwhile: the push based on 2 is refused
        t.next("POST").answer({
            status: 409,
            body: { error: "changed", version: 3, savedToHistory: true },
        })
        await t.settle()
        expect(t.notices).toEqual(["aiChanged"])
        // The 409 handler polls, and the poll loads the AI's write
        t.next("GET").answer(state("S1", 3, "<mxfile>X</mxfile>"))
        await t.settle()
        await t.settle()
        expect(t.sync.read()).toMatchObject({
            currentVersion: 3,
            lastXml: "<mxfile>X</mxfile>",
        })
        expect(t.loads.at(-1)?.xml).toBe("<mxfile>X</mxfile>")
    })
})

describe("MCP sync status", () => {
    it("waits for the first poll, then reports the connection", async () => {
        const t = open()
        expect(t.sync.read().status).toBe("waiting")
        const poll = t.sync.poll()
        t.next("GET").answer(state("S1", 1, "<mxfile>A</mxfile>"))
        await poll
        expect(t.statuses).toEqual(["connected"])
        const failing = t.sync.poll()
        t.next("GET").fail()
        await failing
        expect(t.statuses).toEqual(["connected", "offline"])
    })

    it("reports offline when the server refuses the poll", async () => {
        const t = await inStep()
        expect(t.statuses).toEqual(["connected"])
        // Another process took the port: it refuses our token, and its page
        // (an older version without the shell) has none to read
        const poll = t.sync.poll()
        t.next("GET").answer({ status: 403, body: { error: "Forbidden" } })
        await t.settle()
        t.next("GET", location.href).answer({ status: 404, body: "Not Found" })
        await t.settle()
        await t.settle()
        t.next("GET").answer({ status: 403, body: { error: "Forbidden" } })
        await poll
        expect(t.statuses).toEqual(["connected", "offline"])
    })

    it("polls every 2 seconds once started", async () => {
        const t = open()
        t.sync.start()
        expect(t.calls.filter((c) => c.method === "GET")).toHaveLength(1)
        await vi.advanceTimersByTimeAsync(2000)
        expect(t.calls.filter((c) => c.method === "GET")).toHaveLength(2)
        t.sync.stop()
        await vi.advanceTimersByTimeAsync(4000)
        expect(t.calls.filter((c) => c.method === "GET")).toHaveLength(2)
    })

    it("reads the token the server wrote into the shell page", () => {
        expect(
            tokenFromPage(
                '<script>window.__MCP_CONFIG__ = {"sessionId":"mcp-a","token":"abcd0123","apiBase":"/api"};</script>',
            ),
        ).toBe("abcd0123")
        expect(tokenFromPage("<html></html>")).toBeNull()
        expect(tokenFromPage("window.__MCP_CONFIG__ = {nope};")).toBeNull()
    })
})

describe("MCP sync thumbnails", () => {
    /** The tab loads the server write B at version 3 and asks for its image */
    async function loadedB() {
        const t = await inStep()
        const poll = t.sync.poll()
        t.next("GET").answer(state("S1", 3, "<mxfile>B</mxfile>"))
        await poll
        await vi.advanceTimersByTimeAsync(500)
        const request = t.nextExport()
        expect(request.request).toEqual({ format: "svg" })
        return { t, request }
    }
    const thumbnailPosts = (t: ReturnType<typeof open>) =>
        t.calls.filter((c) => c.url === "/api/history-svg")

    it("sends the image with the state and version it shows", async () => {
        const { t, request } = await loadedB()
        request.answer({ data: "<svg/>" })
        await t.settle()
        expect(thumbnailPosts(t).map((c) => c.body)).toEqual([
            expect.objectContaining({ stateId: "S1", version: 3 }),
        ])
        expect(atob(thumbnailPosts(t)[0].body.svg.split(",")[1])).toBe("<svg/>")
    })

    it("drops the reply to an older thumbnail export", async () => {
        const { t, request } = await loadedB()
        // The next AI write loads before draw.io answered the first export
        const poll = t.sync.poll()
        t.next("GET").answer(state("S1", 4, "<mxfile>C</mxfile>"))
        await poll
        await vi.advanceTimersByTimeAsync(500)
        const newer = t.nextExport()
        request.answer({ data: "<svg>B</svg>" })
        await t.settle()
        expect(thumbnailPosts(t)).toHaveLength(0)
        newer.answer({ data: "<svg>C</svg>" })
        await t.settle()
        expect(thumbnailPosts(t).map((c) => c.body.version)).toEqual([4])
    })

    it("drops the image when the user changed the canvas since the load", async () => {
        const { t, request } = await loadedB()
        t.sync.onAutoSave("<mxfile>B edited</mxfile>")
        request.answer({ data: "<svg>thumbnail</svg>" })
        await t.settle()
        expect(thumbnailPosts(t)).toHaveLength(0)
        // The edit is saved with the image of its own export
        t.nextExport().answer({ data: "<svg>edit</svg>" })
        await t.settle()
        const push = t.next("POST")
        expect(push.body.xml).toBe("<mxfile>B edited</mxfile>")
        expect(atob(push.body.svg.split(",")[1])).toBe("<svg>edit</svg>")
    })

    it("takes the image once the user comes back to the write (an edit came before it)", async () => {
        const { t, request } = await loadedB()
        t.sync.onAutoSave("<mxfile>B edited</mxfile>")
        request.answer({ data: "<svg>thumbnail</svg>" })
        await t.settle()
        expect(thumbnailPosts(t)).toHaveLength(0)
        t.nextExport().answer({ data: "<svg>edit</svg>" })
        await t.settle()
        t.next("POST").answer({
            status: 200,
            body: { success: true, version: 4 },
        })
        await t.settle()
        // Ctrl+Z: the canvas shows the write again
        t.sync.onAutoSave("<mxfile>B</mxfile>")
        t.nextExport().answer({ data: "<svg>B</svg>" })
        await t.settle()
        expect(thumbnailPosts(t).map((c) => c.body.version)).toEqual([3])
        // The undo is pushed as any edit
        t.nextExport().answer({ data: "<svg>B</svg>" })
        await t.settle()
        expect(t.next("POST", "/api/state").body.xml).toBe("<mxfile>B</mxfile>")
    })

    it("takes the image of a write loaded before draw.io was ready, once it is", async () => {
        const t = open()
        const poll = t.sync.poll()
        t.next("GET").answer(state("S1", 1, "<mxfile>A</mxfile>"))
        await poll
        await vi.advanceTimersByTimeAsync(500)
        expect(t.exports).toHaveLength(0)
        t.sync.setReady(true)
        t.nextExport().answer({ data: "<svg/>" })
        await t.settle()
        expect(thumbnailPosts(t).map((c) => c.body.version)).toEqual([1])
    })
})

describe("MCP sync with a diagram over the size limit", () => {
    it("retries without the image, then tells the user", async () => {
        const t = await inStep()
        await edit(t, "<mxfile>huge</mxfile>")
        const first = t.next("POST")
        expect(first.body.svg).not.toBe("")
        first.answer({ status: 413, body: { error: "Payload too large" } })
        await t.settle()
        const retry = t.next("POST")
        expect(retry.body).toMatchObject({
            xml: "<mxfile>huge</mxfile>",
            svg: "",
        })
        expect(t.notices).toEqual([])
        retry.answer({ status: 413, body: { error: "Payload too large" } })
        await t.settle()
        expect(t.posts()).toHaveLength(0)
        expect(t.notices).toEqual(["tooLarge"])
    })

    it("pushes an edit without its image when draw.io does not export in time", async () => {
        const t = await inStep()
        t.sync.onAutoSave("<mxfile>B</mxfile>")
        await vi.advanceTimersByTimeAsync(2000)
        expect(t.next("POST").body).toMatchObject({
            xml: "<mxfile>B</mxfile>",
            svg: "",
            baseVersion: 2,
        })
    })
})

describe("MCP sync export requests", () => {
    const exportState = (extra: Record<string, unknown> = {}) =>
        state("S1", 2, "<mxfile>A</mxfile>", {
            exportFormat: "png",
            exportId: "e1",
            exportOptions: { width: 1000 },
            ...extra,
        })

    it("answers an export request once, with the server's id", async () => {
        const t = await inStep()
        const poll = t.sync.poll()
        t.next("GET").answer(exportState())
        await poll
        const request = t.nextExport()
        expect(request.request).toEqual({
            format: "png",
            scale: 2,
            currentPage: true,
            width: 1000,
        })
        // The server still shows the request on the next poll: not again
        const again = t.sync.poll()
        t.next("GET").answer(exportState())
        await again
        expect(t.exports).toHaveLength(0)
        request.answer({ data: "data:image/png;base64,AAAA" })
        await t.settle()
        const result = t.next("POST")
        expect(result.body).toEqual({
            sessionId: "mcp-test",
            exportData: "data:image/png;base64,AAAA",
            exportId: "e1",
        })
        result.answer({ status: 200, body: { success: true } })
        await t.settle()
        await t.settle()
        // The next request is a new export
        const later = t.sync.poll()
        t.next("GET").answer(exportState({ exportId: "e2" }))
        await later
        expect(t.exports).toHaveLength(1)
    })

    it("passes the server's margin and background choice to draw.io as they are", async () => {
        const t = await inStep()
        const poll = t.sync.poll()
        t.next("GET").answer(
            exportState({ exportOptions: { border: 20, transparent: true } }),
        )
        await poll
        expect(t.nextExport().request).toEqual({
            format: "png",
            scale: 2,
            currentPage: true,
            border: 20,
            transparent: true,
        })
    })

    it("renders a page by its id without touching the canvas", async () => {
        const t = await inStep()
        const poll = t.sync.poll()
        t.next("GET").answer(
            exportState({ exportOptions: { width: 700, pageId: "p2" } }),
        )
        await poll
        expect(t.nextExport().request).toEqual({
            format: "png",
            scale: 2,
            currentPage: false,
            width: 700,
            pageId: "p2",
        })
        expect(t.transients).toEqual([])
    })

    it("shows a projection for a page export, ignoring edits meanwhile, then loads the document back", async () => {
        const t = await inStep()
        const poll = t.sync.poll()
        t.next("GET").answer(
            exportState({
                exportFormat: "svg",
                exportXml: "<mxfile>page 2 only</mxfile>",
                exportOptions: { border: 20 },
            }),
        )
        await poll
        expect(t.transients).toEqual(["<mxfile>page 2 only</mxfile>"])
        expect(t.sync.read().projectionActive).toBe(true)
        // draw.io gets a moment to render before the export
        expect(t.exports).toHaveLength(0)
        await vi.advanceTimersByTimeAsync(600)
        const request = t.nextExport()
        // The server's margin goes to draw.io as it is
        expect(request.request).toEqual({ format: "svg", border: 20 })
        // An autosave of the projection is not the document
        t.sync.onAutoSave("<mxfile>page 2 edited</mxfile>")
        await t.settle()
        expect(t.posts()).toHaveLength(0)
        // A newer version does not fight the projection
        const during = t.sync.poll()
        t.next("GET").answer(
            exportState({
                version: 3,
                xml: "<mxfile>A2</mxfile>",
                exportFormat: "svg",
                exportXml: "<mxfile>page 2 only</mxfile>",
            }),
        )
        await during
        expect(t.loads).toHaveLength(1)
        request.answer({ data: "<svg>page 2</svg>" })
        await t.settle()
        const result = t.next("POST")
        expect(result.body.exportData).toBe("<svg>page 2</svg>")
        result.answer({ status: 200, body: { success: true } })
        await t.settle()
        await t.settle()
        // The restore reloads the server's document in full
        t.next("GET").answer(state("S1", 3, "<mxfile>A2</mxfile>"))
        await t.settle()
        await t.settle()
        expect(t.loads.at(-1)).toEqual({
            xml: "<mxfile>A2</mxfile>",
            decision: { mode: "load" },
        })
        // Until draw.io reports that load, an autosave is still of the
        // projection (the user moved a shape as the export ended)
        expect(t.sync.read().projectionActive).toBe(true)
        t.sync.onAutoSave("<mxfile>page 2 moved</mxfile>")
        await t.settle()
        expect(t.posts()).toHaveLength(0)
        t.sync.onDrawioLoad()
        expect(t.sync.read()).toMatchObject({
            projectionActive: false,
            currentVersion: 3,
        })
        // Edits are pushed again
        await edit(t, "<mxfile>A2 edited</mxfile>")
        expect(t.next("POST").body.xml).toBe("<mxfile>A2 edited</mxfile>")
    })

    /** A projection export whose result reached the server; the restore
     * poll is pending */
    async function projectionExported() {
        const t = await inStep()
        const poll = t.sync.poll()
        t.next("GET").answer(
            exportState({
                exportFormat: "svg",
                exportXml: "<mxfile>page 2 only</mxfile>",
            }),
        )
        await poll
        await vi.advanceTimersByTimeAsync(600)
        t.nextExport().answer({ data: "<svg>page 2</svg>" })
        await t.settle()
        const result = t.next("POST")
        return { t, result }
    }

    it("ends the projection 5 s after the restore load if draw.io never reports it", async () => {
        const { t, result } = await projectionExported()
        result.answer({ status: 200, body: { success: true } })
        await t.settle()
        await t.settle()
        t.next("GET").answer(state("S1", 2, "<mxfile>A</mxfile>"))
        await t.settle()
        await t.settle()
        expect(t.sync.read().projectionActive).toBe(true)
        // No new export or sync starts over the projection meanwhile
        const again = t.sync.poll()
        t.next("GET").answer(
            exportState({
                exportId: "e2",
                exportFormat: "svg",
                exportXml: "<mxfile>page 2 only</mxfile>",
                syncRequested: true,
            }),
        )
        await again
        expect(t.transients).toHaveLength(1)
        expect(t.exports).toHaveLength(0)
        await vi.advanceTimersByTimeAsync(5000)
        expect(t.sync.read().projectionActive).toBe(false)
    })

    it("restores the document when the result POST never answers", async () => {
        const { t, result } = await projectionExported()
        // The result POST hangs; the server gives the export up at 15 s
        await vi.advanceTimersByTimeAsync(15000)
        expect(t.sync.read().projectionActive).toBe(true)
        // The restore poll
        t.next("GET").answer(state("S1", 3, "<mxfile>A3</mxfile>"))
        await t.settle()
        await t.settle()
        expect(t.loads.at(-1)).toEqual({
            xml: "<mxfile>A3</mxfile>",
            decision: { mode: "load" },
        })
        t.sync.onDrawioLoad()
        expect(t.sync.read().projectionActive).toBe(false)
        // A new export request is answered
        const later = t.sync.poll()
        t.next("GET").answer(exportState({ version: 3, exportId: "e2" }))
        await later
        expect(t.exports).toHaveLength(1)
        // The late answer changes nothing
        result.answer({ status: 200, body: { success: true } })
        await t.settle()
        expect(t.exports).toHaveLength(1)
        expect(t.sync.read().projectionActive).toBe(false)
    })

    it("does not restore the document twice when the result POST answers after the 15 s", async () => {
        const { t, result } = await projectionExported()
        await vi.advanceTimersByTimeAsync(15000)
        t.next("GET").answer(state("S1", 2, "<mxfile>A</mxfile>"))
        await t.settle()
        await t.settle()
        expect(t.loads).toHaveLength(2)
        // The POST answers before draw.io reports the restore load: no
        // second restore poll, no second load
        result.answer({ status: 200, body: { success: true } })
        await t.settle()
        await t.settle()
        expect(t.calls.filter((c) => c.method === "GET")).toHaveLength(0)
        expect(t.loads).toHaveLength(2)
        t.sync.onDrawioLoad()
        expect(t.sync.read().projectionActive).toBe(false)
    })

    it("drops an export and reloads the document when draw.io starts over", async () => {
        const t = await inStep()
        const poll = t.sync.poll()
        t.next("GET").answer(
            exportState({
                exportFormat: "svg",
                exportXml: "<mxfile>page 2 only</mxfile>",
            }),
        )
        await poll
        await vi.advanceTimersByTimeAsync(600)
        const request = t.nextExport()
        // The frame remounts (an external draw.io on a theme switch): the
        // projection is gone with it, the old frame's answer means nothing
        t.sync.setReady(false)
        request.answer({ data: "<svg>page 2</svg>" })
        await t.settle()
        expect(t.posts()).toHaveLength(0)
        // The next poll puts the document back, in full
        const restore = t.sync.poll()
        t.next("GET").answer(
            exportState({
                exportFormat: "svg",
                exportXml: "<mxfile>page 2 only</mxfile>",
            }),
        )
        await restore
        expect(t.loads.at(-1)).toEqual({
            xml: "<mxfile>A</mxfile>",
            decision: { mode: "load" },
        })
        expect(t.transients).toHaveLength(1)
        // The new frame is ready: the server's export starts again
        t.sync.setReady(true)
        t.nextExport().answer({ data: "<svg>thumb</svg>" })
        await t.settle()
        t.next("POST", "/api/history-svg").answer({ status: 200, body: {} })
        t.sync.onDrawioLoad()
        const again = t.sync.poll()
        t.next("GET").answer(
            exportState({
                exportFormat: "svg",
                exportXml: "<mxfile>page 2 only</mxfile>",
                exportOptions: { border: 20 },
            }),
        )
        await again
        expect(t.transients).toHaveLength(2)
        await vi.advanceTimersByTimeAsync(600)
        expect(t.exports.map((e) => e.request)).toEqual([
            { format: "svg", border: 20 },
        ])
    })

    it("gives up on an export draw.io never answers and restores the document", async () => {
        const t = await inStep()
        const poll = t.sync.poll()
        t.next("GET").answer(
            exportState({
                exportFormat: "svg",
                exportXml: "<mxfile>page 2 only</mxfile>",
            }),
        )
        await poll
        await vi.advanceTimersByTimeAsync(600)
        expect(t.exports).toHaveLength(1)
        await vi.advanceTimersByTimeAsync(10000)
        expect(t.posts()).toHaveLength(0)
        // The restore poll
        t.next("GET").answer(state("S1", 2, "<mxfile>A</mxfile>"))
        await t.settle()
        await t.settle()
        expect(t.loads.at(-1)).toEqual({
            xml: "<mxfile>A</mxfile>",
            decision: { mode: "load" },
        })
    })

    it("waits for the icons of a write that came with the export", async () => {
        const t = await inStep()
        const poll = t.sync.poll()
        t.next("GET").answer(
            exportState({ version: 3, xml: "<mxfile>B</mxfile>" }),
        )
        await poll
        expect(t.loads.at(-1)?.xml).toBe("<mxfile>B</mxfile>")
        expect(t.exports).toHaveLength(0)
        // The write's thumbnail comes first (500 ms), the screenshot at 600
        await vi.advanceTimersByTimeAsync(599)
        expect(t.exports.map((e) => e.request.format)).toEqual(["svg"])
        await vi.advanceTimersByTimeAsync(1)
        expect(t.exports.map((e) => e.request.format)).toEqual(["svg", "png"])
    })
})

describe("MCP sync selection requests (get_selection)", () => {
    const selectionState = (extra: Record<string, unknown> = {}) =>
        state("S1", 2, "<mxfile>A</mxfile>", { selectionId: "sel-1", ...extra })
    const picked: SelectionAnswer = {
        pageId: "p1",
        pageName: "Page-1",
        cells: [
            {
                id: "3",
                label: "Login",
                edge: false,
                geometry: { x: 100, y: 100, width: 120, height: 60 },
            },
            { id: "5", label: "", edge: true, source: "3", target: "4" },
        ],
    }

    it("answers a request once, with what the editor has selected", async () => {
        const t = await inStep()
        t.canvas.selection = picked
        const poll = t.sync.poll()
        t.next("GET").answer(selectionState())
        await poll
        const answer = t.next("POST")
        expect(answer.body).toEqual({
            sessionId: "mcp-test",
            selectionId: "sel-1",
            selection: picked,
        })
        answer.answer({ status: 200, body: { success: true } })
        // The server still shows the request on the next poll: not again
        const again = t.sync.poll()
        t.next("GET").answer(selectionState())
        await again
        expect(t.posts()).toHaveLength(0)
        // A new request is answered
        t.canvas.selection = { pageId: "p1", pageName: "Page-1", cells: [] }
        const later = t.sync.poll()
        t.next("GET").answer(selectionState({ selectionId: "sel-2" }))
        await later
        expect(t.next("POST").body).toMatchObject({
            selectionId: "sel-2",
            selection: { cells: [] },
        })
    })

    it("says when the page cannot reach the editor", async () => {
        const t = await inStep()
        t.canvas.selection = {
            pageId: null,
            pageName: null,
            cells: [],
            unavailable: true,
        }
        const poll = t.sync.poll()
        t.next("GET").answer(selectionState())
        await poll
        expect(t.next("POST").body.selection).toEqual({
            pageId: null,
            pageName: null,
            cells: [],
            unavailable: true,
        })
    })

    it("waits until draw.io is up, where the editor is reached", async () => {
        const t = open()
        t.canvas.selection = picked
        let poll = t.sync.poll()
        t.next("GET").answer(selectionState())
        await poll
        expect(t.posts()).toHaveLength(0)
        t.sync.setReady(true)
        // The thumbnail of the write loaded before draw.io was ready
        t.nextExport().answer(null)
        await t.settle()
        poll = t.sync.poll()
        t.next("GET").answer(selectionState())
        await poll
        expect(t.next("POST").body).toMatchObject({
            selectionId: "sel-1",
            selection: picked,
        })
    })

    it("answers again at the next poll when the answer was not delivered", async () => {
        const t = await inStep()
        t.canvas.selection = picked
        let poll = t.sync.poll()
        t.next("GET").answer(selectionState())
        await poll
        t.next("POST").fail()
        await t.settle()
        // The server still shows the request: answered again
        poll = t.sync.poll()
        t.next("GET").answer(selectionState())
        await poll
        const retry = t.next("POST")
        expect(retry.body.selectionId).toBe("sel-1")
        retry.answer({ status: 500, body: {} })
        await t.settle()
        poll = t.sync.poll()
        t.next("GET").answer(selectionState())
        await poll
        t.next("POST").answer({ status: 200, body: { success: true } })
        await t.settle()
        // Delivered: not again
        poll = t.sync.poll()
        t.next("GET").answer(selectionState())
        await poll
        expect(t.posts()).toHaveLength(0)
    })

    it("waits for a full load to reach the editor before reading the selection", async () => {
        // The poll that brings the request may also bring a new document,
        // loaded in full: until draw.io reports it, the editor shows the old
        // one, whose cells and pages the answer would name
        const t = await inStep()
        t.canvas.selection = picked
        t.canvas.loadPending = true
        let poll = t.sync.poll()
        t.next("GET").answer(
            state("S1", 3, "<mxfile>B</mxfile>", { selectionId: "sel-1" }),
        )
        await poll
        expect(t.loads.at(-1)?.xml).toBe("<mxfile>B</mxfile>")
        expect(t.posts()).toHaveLength(0)
        t.canvas.loadPending = false
        poll = t.sync.poll()
        t.next("GET").answer(
            state("S1", 3, "<mxfile>B</mxfile>", { selectionId: "sel-1" }),
        )
        await poll
        expect(t.next("POST").body).toMatchObject({
            selectionId: "sel-1",
            selection: picked,
        })
    })

    it("lets a tab in front answer first when this one is hidden", async () => {
        // The same session open twice: the hidden tab's selection is not
        // the user's; it answers a poll later, in case it is the only tab
        const t = await inStep({ isHidden: () => true })
        t.canvas.selection = picked
        const poll = t.sync.poll()
        t.next("GET").answer(selectionState())
        await poll
        expect(t.posts()).toHaveLength(0)
        await vi.advanceTimersByTimeAsync(2500)
        expect(t.next("POST").body).toEqual({
            sessionId: "mcp-test",
            selectionId: "sel-1",
            selection: picked,
        })
    })

    it("holds a hidden tab's answer when a projection started meanwhile, and answers once it ended", async () => {
        const t = await inStep({ isHidden: () => true })
        t.canvas.selection = picked
        let poll = t.sync.poll()
        t.next("GET").answer(selectionState())
        await poll
        // The next poll, 2 s later, brings an export of another page: the
        // projection replaces the user's page before the answer is due
        await vi.advanceTimersByTimeAsync(2000)
        poll = t.sync.poll()
        t.next("GET").answer(
            selectionState({
                exportFormat: "svg",
                exportId: "e1",
                exportXml: "<mxfile>page 2 only</mxfile>",
            }),
        )
        await poll
        expect(t.sync.read().projectionActive).toBe(true)
        t.canvas.selection = { pageId: "p2", pageName: "Page-2", cells: [] }
        await vi.advanceTimersByTimeAsync(500)
        expect(t.posts()).toHaveLength(0)
        // The export answers and the document comes back
        await vi.advanceTimersByTimeAsync(100)
        t.nextExport().answer({ data: "<svg>page 2</svg>" })
        await t.settle()
        t.next("POST").answer({ status: 200, body: { success: true } })
        await t.settle()
        await t.settle()
        t.next("GET").answer(selectionState())
        await t.settle()
        await t.settle()
        t.sync.onDrawioLoad()
        t.canvas.selection = picked
        // The request is still pending: this poll schedules it again
        poll = t.sync.poll()
        t.next("GET").answer(selectionState())
        await poll
        expect(t.posts()).toHaveLength(0)
        await vi.advanceTimersByTimeAsync(2500)
        expect(t.next("POST").body).toMatchObject({
            selectionId: "sel-1",
            selection: picked,
        })
    })

    it("holds a hidden tab's answer while a full load has yet to reach the editor", async () => {
        const t = await inStep({ isHidden: () => true })
        t.canvas.selection = picked
        let poll = t.sync.poll()
        t.next("GET").answer(selectionState())
        await poll
        // A new version arrives before the answer is due: loaded in full,
        // the editor still shows the old document
        await vi.advanceTimersByTimeAsync(2000)
        t.canvas.loadPending = true
        poll = t.sync.poll()
        t.next("GET").answer(
            state("S1", 3, "<mxfile>B</mxfile>", { selectionId: "sel-1" }),
        )
        await poll
        expect(t.loads.at(-1)?.xml).toBe("<mxfile>B</mxfile>")
        await vi.advanceTimersByTimeAsync(500)
        expect(t.posts()).toHaveLength(0)
        // draw.io reports the load: the next poll answers
        t.canvas.loadPending = false
        poll = t.sync.poll()
        t.next("GET").answer(
            state("S1", 3, "<mxfile>B</mxfile>", { selectionId: "sel-1" }),
        )
        await poll
        await vi.advanceTimersByTimeAsync(2500)
        expect(t.next("POST").body).toMatchObject({
            selectionId: "sel-1",
            selection: picked,
        })
    })

    it("never answers while a projection is on screen", async () => {
        const t = await inStep()
        t.canvas.selection = picked
        // A projection shows another page: its selection is not the user's
        let poll = t.sync.poll()
        t.next("GET").answer(
            selectionState({
                exportFormat: "svg",
                exportId: "e1",
                exportXml: "<mxfile>page 2 only</mxfile>",
            }),
        )
        await poll
        expect(t.sync.read().projectionActive).toBe(true)
        expect(t.posts()).toHaveLength(0)
        // The export answers and the document comes back
        await vi.advanceTimersByTimeAsync(600)
        t.nextExport().answer({ data: "<svg>page 2</svg>" })
        await t.settle()
        t.next("POST").answer({ status: 200, body: { success: true } })
        await t.settle()
        await t.settle()
        t.next("GET").answer(selectionState())
        await t.settle()
        await t.settle()
        expect(t.posts()).toHaveLength(0)
        t.sync.onDrawioLoad()
        expect(t.sync.read().projectionActive).toBe(false)
        // The request is still pending: answered now
        poll = t.sync.poll()
        t.next("GET").answer(selectionState())
        await poll
        expect(t.next("POST").body).toMatchObject({
            selectionId: "sel-1",
            selection: picked,
        })
    })
})

describe("MCP sync History", () => {
    const historyList = {
        status: 200,
        body: {
            entries: [{ id: 5, index: 0, svg: "" }],
            count: 1,
            stateId: "S1",
            currentId: null,
        },
    }

    it("drops a History list asked for before the session was recreated", async () => {
        const t = await inStep()
        const history = t.sync.fetchHistory()
        const list = t.next("GET", "/api/history")
        // The server restarts before the list arrives: its ids are old
        const poll = t.sync.poll()
        t.next("GET", "/api/state").answer(state("S2", 1, "<mxfile>A</mxfile>"))
        await poll
        list.answer(historyList)
        expect(await history).toBeNull()
    })

    it("names the state its History list belongs to when restoring", async () => {
        const t = await inStep()
        const history = t.sync.fetchHistory()
        t.next("GET", "/api/history").answer(historyList)
        const list = await history
        expect(list).toEqual({
            entries: [{ id: 5, index: 0, svg: "" }],
            stateId: "S1",
            currentId: null,
        })
        const restore = t.sync.restoreEntry(5, list?.stateId ?? null)
        await t.settle()
        const request = t.next("POST", "/api/restore")
        expect(request.body).toEqual({
            sessionId: "mcp-test",
            id: 5,
            stateId: "S1",
        })
        request.answer({ status: 200, body: { success: true, newVersion: 3 } })
        await t.settle()
        // The restore polls for the restored diagram
        t.next("GET", "/api/state").answer(
            state("S1", 3, "<mxfile>old</mxfile>"),
        )
        expect(await restore).toBe("ok")
        expect(t.loads.at(-1)?.xml).toBe("<mxfile>old</mxfile>")
    })

    it("restores from an old list with that list's state, which the server refuses", async () => {
        const t = await inStep()
        const history = t.sync.fetchHistory()
        t.next("GET", "/api/history").answer(historyList)
        const list = await history
        // The server restarts; the list on screen is from S1
        const poll = t.sync.poll()
        t.next("GET", "/api/state").answer(state("S2", 1, "<mxfile>A</mxfile>"))
        await poll
        expect(t.recreated()).toBe(1)
        const restore = t.sync.restoreEntry(5, list?.stateId ?? null)
        await t.settle()
        const request = t.next("POST", "/api/restore")
        expect(request.body.stateId).toBe("S1")
        request.answer({
            status: 409,
            body: { error: "Session was recreated" },
        })
        expect(await restore).toBe("stale")
        expect(t.notices).toEqual(["historyChanged"])
    })

    it("reports a restore that failed", async () => {
        const t = await inStep()
        const restore = t.sync.restoreEntry(5, "S1")
        await t.settle()
        t.next("POST", "/api/restore").fail()
        expect(await restore).toBe("failed")
        expect(t.notices).toEqual(["restoreFailed"])
    })

    it("drops a History list of a state the poll has not seen yet", async () => {
        // Another process answers on the port; its History has other ids.
        // Its state is seen at the next poll, which tells the cards again
        const t = await inStep()
        const history = t.sync.fetchHistory()
        t.next("GET", "/api/history").answer({
            ...historyList,
            body: { ...historyList.body, stateId: "S2" },
        })
        expect(await history).toBeNull()
    })

    it("passes on the entry the server says is on the canvas", async () => {
        const t = await inStep()
        const history = t.sync.fetchHistory()
        t.next("GET", "/api/history").answer({
            status: 200,
            body: { entries: [{ id: 7 }], count: 1, currentId: 7 },
        })
        expect((await history)?.currentId).toBe(7)
    })
})

// The version cards read History again when the server changed
describe("MCP sync server change listener", () => {
    it("tells once per History key: the first poll, a write, the tab's first edit, not its next", async () => {
        // The server's key names History (count, newest id) and the entry
        // on the canvas; the version cards read History only when it changes
        const t = open()
        let changes = 0
        const stop = t.sync.onServerChange(() => changes++)
        t.sync.setReady(true)
        let poll = t.sync.poll()
        t.next("GET").answer(
            state("S1", 2, "<mxfile>A</mxfile>", { historyKey: "1:0:0" }),
        )
        await poll
        expect(changes).toBe(1)
        // The same key again: nothing new
        poll = t.sync.poll()
        t.next("GET").answer(
            state("S1", 2, "<mxfile>A</mxfile>", { historyKey: "1:0:0" }),
        )
        await poll
        expect(changes).toBe(1)
        // The thumbnail of the write is stored: its entry has a picture now
        await vi.advanceTimersByTimeAsync(500)
        t.nextExport().answer({ data: "<svg>A</svg>" })
        await t.settle()
        t.next("POST", "/api/history-svg").answer({ status: 200, body: {} })
        await t.settle()
        expect(changes).toBe(2)
        // An AI write
        poll = t.sync.poll()
        t.next("GET").answer(
            state("S1", 3, "<mxfile>B</mxfile>", { historyKey: "2:1:1" }),
        )
        await poll
        expect(changes).toBe(3)
        // The user's edit is saved: the canvas is at no version now
        await edit(t, "<mxfile>C</mxfile>")
        t.next("POST", "/api/state").answer({
            status: 200,
            body: { success: true, version: 4, historyKey: "2:1:null" },
        })
        await t.settle()
        expect(changes).toBe(4)
        // The next poll sees the key the push already told about
        poll = t.sync.poll()
        t.next("GET").answer(
            state("S1", 4, "<mxfile>C</mxfile>", { historyKey: "2:1:null" }),
        )
        await poll
        expect(changes).toBe(4)
        // A further edit changes History not at all: no download of it
        await edit(t, "<mxfile>C2</mxfile>")
        t.next("POST", "/api/state").answer({
            status: 200,
            body: { success: true, version: 5, historyKey: "2:1:null" },
        })
        await t.settle()
        expect(changes).toBe(4)
        stop()
        poll = t.sync.poll()
        t.next("GET").answer(
            state("S1", 6, "<mxfile>D</mxfile>", { historyKey: "3:2:2" }),
        )
        await poll
        expect(changes).toBe(4)
    })

    it("tells once per server version when the server sends no key", async () => {
        const t = open()
        let changes = 0
        t.sync.onServerChange(() => changes++)
        let poll = t.sync.poll()
        t.next("GET").answer(state("S1", 2, "<mxfile>A</mxfile>"))
        await poll
        poll = t.sync.poll()
        t.next("GET").answer(state("S1", 2, "<mxfile>A</mxfile>"))
        await poll
        expect(changes).toBe(1)
        poll = t.sync.poll()
        t.next("GET").answer(state("S1", 3, "<mxfile>B</mxfile>"))
        await poll
        expect(changes).toBe(2)
    })

    it("tells again at the next poll when a History read failed", async () => {
        // The cards would otherwise keep the old list until the next write
        const t = await inStep()
        let changes = 0
        t.sync.onServerChange(() => changes++)
        const history = t.sync.fetchHistory()
        t.next("GET", "/api/history").answer({ status: 500, body: {} })
        expect(await history).toBeNull()
        const poll = t.sync.poll()
        t.next("GET", "/api/state").answer(state("S1", 2, "<mxfile>A</mxfile>"))
        await poll
        expect(changes).toBe(1)
        // Also when the request itself fails
        const again = t.sync.fetchHistory()
        t.next("GET", "/api/history").fail()
        expect(await again).toBeNull()
        const next = t.sync.poll()
        t.next("GET", "/api/state").answer(state("S1", 2, "<mxfile>A</mxfile>"))
        await next
        expect(changes).toBe(2)
    })

    it("tells when a rejected edit was kept in History, and when the state was recreated", async () => {
        const t = await inStep()
        let changes = 0
        t.sync.onServerChange(() => changes++)
        await edit(t, "<mxfile>B</mxfile>")
        t.next("POST", "/api/state").answer({
            status: 409,
            body: { error: "changed", version: 3, savedToHistory: true },
        })
        await t.settle()
        expect(changes).toBe(1)
        // The 409 handler polls and loads the newer write
        t.next("GET").answer(state("S1", 3, "<mxfile>AI</mxfile>"))
        await t.settle()
        expect(changes).toBe(2)
        // The server restarted: History has new ids
        const poll = t.sync.poll()
        t.next("GET").answer(state("S2", 1, "<mxfile>AI</mxfile>"))
        await poll
        expect(changes).toBe(3)
    })
})

// Documents as the server writes them (one page per call)
const cell = (id: string, label: string, x = 40) =>
    `<mxCell id="${id}" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="${x}" y="40" width="120" height="60" as="geometry"/></mxCell>`
const page = (id: string, name: string, cells: string, attrs = "") =>
    `<diagram id="${id}" name="${name}"><mxGraphModel${attrs}><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram>`
const file = (pages: string, attrs = "") =>
    `<mxfile host="app.diagrams.net"${attrs}>${pages}</mxfile>`
// The same page as draw.io saves it: other attribute order, view settings
const drawioPage = (id: string, name: string, cells: string) =>
    `<diagram name="${name}" id="${id}"><mxGraphModel dx="1000" dy="600" grid="1" gridSize="10" page="1"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram>`

describe("decideLoad: one undo step on the page on screen, or a full load", () => {
    const onCanvas = file(
        page("p1", "One", cell("a", "A")) + page("p2", "Two", cell("b", "B")),
    )

    it.each([
        [
            "the page on screen changed, the other did not",
            file(
                page("p1", "One", cell("a", "A2")) +
                    page("p2", "Two", cell("b", "B")),
            ),
            "p1",
            { mode: "commit", pageId: "p1" },
        ],
        [
            "the change is on the second page, which is on screen",
            file(
                page("p1", "One", cell("a", "A")) +
                    page("p2", "Two", cell("b", "B2")),
            ),
            "p2",
            { mode: "commit", pageId: "p2" },
        ],
        [
            "another page than the one on screen changed",
            file(
                page("p1", "One", cell("a", "A")) +
                    page("p2", "Two", cell("b", "B2")),
            ),
            "p1",
            { mode: "load" },
        ],
        [
            "a page was added",
            file(
                page("p1", "One", cell("a", "A")) +
                    page("p2", "Two", cell("b", "B")) +
                    page("p3", "Three", ""),
            ),
            "p1",
            { mode: "load" },
        ],
        [
            "a page was removed",
            file(page("p1", "One", cell("a", "A"))),
            "p1",
            { mode: "load" },
        ],
        [
            "the other page was renamed",
            file(
                page("p1", "One", cell("a", "A2")) +
                    page("p2", "Deux", cell("b", "B")),
            ),
            "p1",
            { mode: "load" },
        ],
        [
            "the file variables changed",
            file(
                page("p1", "One", cell("a", "A2")) +
                    page("p2", "Two", cell("b", "B")),
                ' vars="{&quot;x&quot;:&quot;1&quot;}"',
            ),
            "p1",
            { mode: "load" },
        ],
        [
            "the page needs a setting only a full load applies",
            file(
                page("p1", "One", cell("a", "A2"), ' shadow="1"') +
                    page("p2", "Two", cell("b", "B")),
            ),
            "p1",
            { mode: "load" },
        ],
        [
            "the page on screen has another id in the written document",
            file(
                page("p9", "One", cell("a", "A2")) +
                    page("p2", "Two", cell("b", "B")),
            ),
            "p1",
            { mode: "load" },
        ],
        [
            "the page on screen is unknown with several pages: a full load",
            file(
                page("p1", "One", cell("a", "A2")) +
                    page("p2", "Two", cell("b", "B")),
            ),
            null,
            { mode: "load" },
        ],
    ] as [string, string, string | null, LoadDecision][])(
        "%s",
        (_name, written, pageId, expected) => {
            expect(decideLoad(onCanvas, written, pageId)).toEqual(expected)
        },
    )

    it("loads in full when the canvas is empty or either side is no document", () => {
        const written = file(page("p1", "One", cell("a", "A")))
        expect(decideLoad("", written, null)).toEqual({ mode: "load" })
        expect(decideLoad(written, "<mxfile>A</mxfile>", "p1")).toEqual({
            mode: "load",
        })
        expect(decideLoad("<not xml", written, "p1")).toEqual({ mode: "load" })
    })

    it("commits a one-page write over a one-page canvas whatever the page ids", () => {
        const canvas = file(drawioPage("abc", "Page-1", cell("a", "A")))
        const written = file(
            page("xyz", "Page-1", cell("a", "A") + cell("c", "C", 300)),
        )
        expect(decideLoad(canvas, written, "abc")).toEqual({
            mode: "commit",
            pageId: "xyz",
        })
    })

    it("reads the other pages as draw.io saved them", () => {
        // draw.io's own serialization of page two is the same page
        const canvas = file(
            drawioPage("p1", "One", cell("a", "A")) +
                drawioPage("p2", "Two", cell("b", "B")),
        )
        const written = file(
            page("p1", "One", cell("a", "A2")) +
                page("p2", "Two", cell("b", "B")),
        )
        expect(decideLoad(canvas, written, "p1")).toEqual({
            mode: "commit",
            pageId: "p1",
        })
    })
})

describe("MCP sync with server writes taken in place", () => {
    const canvasXml = file(
        drawioPage("p1", "One", cell("a", "A")) +
            drawioPage("p2", "Two", cell("b", "B")),
    )
    const written = file(
        page("p1", "One", cell("a", "A") + cell("c", "C", 300)) +
            page("p2", "Two", cell("b", "B")),
    )

    it("commits a write that changes the page on screen", async () => {
        const t = await inStep({ currentPageId: "p1" })
        t.canvas.xml = canvasXml
        const poll = t.sync.poll()
        t.next("GET").answer(state("S1", 3, written))
        await poll
        expect(t.loads.at(-1)).toEqual({
            xml: written,
            decision: { mode: "commit", pageId: "p1" },
        })
    })

    it("does not push draw.io's own copy of the write, and keeps its thumbnail", async () => {
        const t = await inStep({ currentPageId: "p1" })
        t.canvas.xml = canvasXml
        const poll = t.sync.poll()
        t.next("GET").answer(state("S1", 3, written))
        await poll
        // Replacing the page in place makes draw.io autosave the result,
        // serialized its way
        const drawioCopy = file(
            drawioPage("p1", "One", cell("a", "A") + cell("c", "C", 300)) +
                drawioPage("p2", "Two", cell("b", "B")),
        )
        t.sync.onAutoSave(drawioCopy)
        await t.settle()
        expect(t.posts()).toHaveLength(0)
        expect(t.exports).toHaveLength(0)
        // The thumbnail still pictures the write
        await vi.advanceTimersByTimeAsync(500)
        t.nextExport().answer({ data: "<svg/>" })
        await t.settle()
        expect(t.next("POST", "/api/history-svg").body).toMatchObject({
            version: 3,
        })
        // A real edit is pushed
        await edit(
            t,
            file(
                drawioPage("p1", "One", cell("c", "C", 300)) +
                    drawioPage("p2", "Two", cell("b", "B")),
            ),
        )
        expect(t.next("POST").body.source).toBe("edit")
    })

    it("after a restart, loads the server's diagram in full and keeps the tab's copy", async () => {
        const t = await inStep({ currentPageId: "p1" })
        t.canvas.xml = canvasXml
        t.sync.onAutoSave(canvasXml)
        t.nextExport().answer({ data: "<svg/>" })
        await t.settle()
        t.next("POST").answer({
            status: 200,
            body: { success: true, version: 3 },
        })
        await t.settle()
        const poll = t.sync.poll()
        t.next("GET").answer(state("S2", 1, written))
        await poll
        // Even a write the page on screen could take in place: whether it
        // does is decided in DiagramProvider, and an autosave before
        // draw.io reports the load is of the canvas being replaced
        expect(t.loads.at(-1)?.decision).toEqual({ mode: "load" })
        expect(t.next("POST").body).toMatchObject({
            xml: canvasXml,
            source: "recover",
            stateId: "S2",
        })
        t.sync.onAutoSave(
            file(
                drawioPage("p1", "One", cell("a", "A2")) +
                    drawioPage("p2", "Two", cell("b", "B")),
            ),
        )
        await t.settle()
        expect(t.next("POST").body.source).toBe("recover")
        t.sync.onDrawioLoad()
        await edit(
            t,
            file(
                drawioPage("p1", "One", cell("c", "C", 300)) +
                    drawioPage("p2", "Two", cell("b", "B")),
            ),
        )
        expect(t.next("POST").body.source).toBe("edit")
    })

    it("after a restart, an autosave of the old one-page canvas goes to History (external draw.io)", async () => {
        // An external draw.io: the page on screen is unknown, so decideLoad
        // would call a one-page write a commit; the provider loads in full
        // anyway (no editor access), and draw.io applies the load later
        const t = open({ currentPageId: null })
        const canvasB = file(drawioPage("abc", "Page-1", cell("a", "B")))
        const canvasC = file(page("xyz", "Page-1", cell("a", "C")))
        t.sync.setReady(true)
        let poll = t.sync.poll()
        t.next("GET").answer(state("S1", 2, canvasB))
        await poll
        expect(decideLoad(canvasB, canvasC, null).mode).toBe("commit")
        // The server restarts and recovers C, a one-page document like B
        poll = t.sync.poll()
        t.next("GET").answer(state("S2", 1, canvasC))
        await poll
        expect(t.loads.at(-1)?.decision).toEqual({ mode: "load" })
        expect(t.next("POST").body).toMatchObject({
            xml: canvasB,
            source: "recover",
        })
        // An edit of B that draw.io queued before the load of C
        const editedB = file(drawioPage("abc", "Page-1", cell("a", "B2")))
        t.sync.onAutoSave(editedB)
        await t.settle()
        expect(t.next("POST").body).toMatchObject({
            xml: editedB,
            source: "recover",
            baseVersion: 1,
            stateId: "S2",
        })
        expect(t.sync.read().lastXml).toBe(canvasC)
        t.sync.onDrawioLoad()
        await edit(t, file(drawioPage("xyz", "Page-1", cell("a", "C2"))))
        expect(t.next("POST").body.source).toBe("edit")
    })

    it("a change of the paper size alone is pushed", async () => {
        const t = await inStep({ currentPageId: "p1" })
        t.canvas.xml = canvasXml
        const poll = t.sync.poll()
        t.next("GET").answer(state("S1", 3, written))
        await poll
        expect(t.loads.at(-1)?.decision.mode).toBe("commit")
        // draw.io's copy of the write names the paper size the write left
        // out: the same document, not an edit
        const sized = (width: number, height: number) =>
            file(
                page(
                    "p1",
                    "One",
                    cell("a", "A") + cell("c", "C", 300),
                    ` dx="1000" dy="600" grid="1" pageWidth="${width}" pageHeight="${height}"`,
                ) + drawioPage("p2", "Two", cell("b", "B")),
            )
        t.sync.onAutoSave(sized(850, 1100))
        await t.settle()
        expect(t.posts()).toHaveLength(0)
        expect(t.exports).toHaveLength(0)
        // The user picks A4: the same document to isSameDocument, an edit
        // to the user
        t.sync.onAutoSave(sized(827, 1169))
        expect(t.exports.map((e) => e.request.format)).toEqual(["svg"])
        t.nextExport().answer({ data: "<svg/>" })
        await t.settle()
        expect(t.next("POST").body).toMatchObject({
            xml: sized(827, 1169),
            source: "edit",
            baseVersion: 3,
        })
    })

    it("a change of the paper size after a write that changed nothing is pushed", async () => {
        const t = await inStep({ currentPageId: "p1" })
        t.canvas.xml = canvasXml
        let poll = t.sync.poll()
        t.next("GET").answer(state("S1", 3, written))
        await poll
        const drawioCopy = file(
            drawioPage("p1", "One", cell("a", "A") + cell("c", "C", 300)) +
                drawioPage("p2", "Two", cell("b", "B")),
        )
        t.sync.onAutoSave(drawioCopy)
        t.canvas.xml = drawioCopy
        await t.settle()
        expect(t.posts()).toHaveLength(0)
        // The same document written again (the file loaded once more): the
        // server has a new version, draw.io sees no change and sends no copy
        poll = t.sync.poll()
        t.next("GET").answer(state("S1", 4, written))
        await poll
        expect(t.loads.at(-1)?.decision.mode).toBe("commit")
        // The user picks A4: an edit, not the copy of the write
        const a4 = file(
            page(
                "p1",
                "One",
                cell("a", "A") + cell("c", "C", 300),
                ' dx="1000" dy="600" grid="1" pageWidth="827" pageHeight="1169"',
            ) + drawioPage("p2", "Two", cell("b", "B")),
        )
        t.sync.onAutoSave(a4)
        expect(t.exports.map((e) => e.request.format)).toEqual(["svg"])
        t.nextExport().answer({ data: "<svg/>" })
        await t.settle()
        expect(t.next("POST").body).toMatchObject({
            xml: a4,
            source: "edit",
            baseVersion: 4,
        })
    })
})

describe("MCP sync with a write on another page than the one on screen", () => {
    const canvasXml = file(
        drawioPage("p1", "One", cell("a", "A")) +
            drawioPage("p2", "Two", cell("b", "B")),
    )
    const onPage2 = (label: string) =>
        file(
            page("p1", "One", cell("a", "A")) +
                page("p2", "Two", cell("b", "B") + cell("c", label, 300)),
        )

    it("names the one page a write changed", () => {
        expect(changedPageId(canvasXml, onPage2("C"))).toBe("p2")
        const added = file(
            page("p1", "One", cell("a", "A")) +
                page("p2", "Two", cell("b", "B")) +
                page("p3", "Three", ""),
        )
        expect(changedPageId(canvasXml, added)).toBe("p3")
        // Two pages, none, or a first load: no single page
        const both = file(
            page("p1", "One", cell("a", "A2")) +
                page("p2", "Two", cell("b", "B2")),
        )
        expect(changedPageId(canvasXml, both)).toBeNull()
        const same = file(
            page("p1", "One", cell("a", "A")) +
                page("p2", "Two", cell("b", "B")),
        )
        expect(changedPageId(canvasXml, same)).toBeNull()
        expect(changedPageId("", onPage2("C"))).toBeNull()
    })

    it("shows that page after the load and pictures it as a PNG of that page", async () => {
        const t = await inStep({ currentPageId: "p1" })
        t.canvas.xml = canvasXml
        const poll = t.sync.poll()
        t.next("GET").answer(state("S1", 3, onPage2("C")))
        await poll
        expect(t.loads.at(-1)?.decision).toEqual({
            mode: "load",
            pageId: "p2",
        })
        await vi.advanceTimersByTimeAsync(500)
        const thumbnail = t.nextExport()
        expect(thumbnail.request).toEqual({
            format: "png",
            pageId: "p2",
            width: 600,
        })
        thumbnail.answer({ data: "data:image/png;base64,AAAA" })
        await t.settle()
        expect(t.next("POST", "/api/history-svg").body).toMatchObject({
            svg: "data:image/png;base64,AAAA",
            version: 3,
        })
    })

    it("leaves the user on their page while they edit by hand", async () => {
        const t = await inStep({ currentPageId: "p1" })
        await edit(t, canvasXml)
        t.next("POST").answer({
            status: 200,
            body: { success: true, version: 3 },
        })
        await t.settle()
        t.canvas.xml = canvasXml
        let poll = t.sync.poll()
        t.next("GET").answer(state("S1", 4, onPage2("C")))
        await poll
        expect(t.loads.at(-1)?.decision).toEqual({ mode: "load" })
        // Ten seconds without an edit: the next write's page is shown
        await vi.advanceTimersByTimeAsync(10_001)
        poll = t.sync.poll()
        t.next("GET").answer(state("S1", 5, onPage2("C2")))
        await poll
        expect(t.loads.at(-1)?.decision).toEqual({
            mode: "load",
            pageId: "p2",
        })
    })
})

describe("MCP sync file name", () => {
    it("reads the file the server names and tells the listeners when it changes", async () => {
        const t = await inStep()
        let changes = 0
        t.sync.onServerChange(() => changes++)
        const named = (path: string | null) =>
            state("S1", 2, "<mxfile>A</mxfile>", { file: path })
        let poll = t.sync.poll()
        t.next("GET").answer(named("/work/docs/architecture.drawio"))
        await poll
        expect(t.sync.read().file).toBe("/work/docs/architecture.drawio")
        expect(changes).toBe(1)
        // The same file again is no change
        poll = t.sync.poll()
        t.next("GET").answer(named("/work/docs/architecture.drawio"))
        await poll
        expect(changes).toBe(1)
        // A new diagram is in no file
        poll = t.sync.poll()
        t.next("GET").answer(named(null))
        await poll
        expect(t.sync.read().file).toBeNull()
        expect(changes).toBe(2)
    })

    it("tells the listeners when the diagram changed since its file", async () => {
        const t = await inStep()
        let changes = 0
        t.sync.onServerChange(() => changes++)
        const file = (fileChanged: boolean) =>
            state("S1", 2, "<mxfile>A</mxfile>", {
                file: "/work/arch.drawio",
                fileChanged,
            })
        let poll = t.sync.poll()
        t.next("GET").answer(file(false))
        await poll
        expect(t.sync.read().fileChanged).toBe(false)
        expect(changes).toBe(1)
        poll = t.sync.poll()
        t.next("GET").answer(file(true))
        await poll
        expect(t.sync.read().fileChanged).toBe(true)
        expect(changes).toBe(2)
    })
})
