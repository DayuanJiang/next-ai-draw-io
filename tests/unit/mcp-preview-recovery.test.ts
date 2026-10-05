import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The MCP preview page's script, run in this document with a stubbed
// server (fetch) and draw.io iframe (its postMessage), so the tab's side of
// a recreated session can be driven step by step
const dir = join(process.cwd(), "packages/mcp-server/src/preview")
const DRAWIO = "https://embed.diagrams.net"
const html = readFileSync(join(dir, "index.html"), "utf8")
    .replace("{{CSS}}", "")
    .replace("{{SESSION_BADGE}}", "")
    .replaceAll("{{DISABLED}}", "")
    .replace("{{DRAWIO_URL}}", "about:blank")
    .replace("{{SESSION_JSON}}", '"mcp-test"')
    .replace("{{ORIGIN_JSON}}", JSON.stringify(DRAWIO))
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) =>
    m[1].replace("{{SCRIPT}}", ""),
)
const preview = readFileSync(join(dir, "preview.js"), "utf8")

const pageListeners: Array<[string, EventListener]> = []

type Answer = { status: number; body: unknown }
interface Call {
    url: string
    method: string
    body: any
    answer: (a: Answer) => void
    fail: () => void
}

function openPage() {
    document.body.innerHTML = html.replace(/<script>[\s\S]*?<\/script>/g, "")
    const toDrawio: any[] = []
    const iframe = document.getElementById("drawio") as HTMLIFrameElement
    Object.defineProperty(iframe, "contentWindow", {
        value: { postMessage: (m: string) => toDrawio.push(JSON.parse(m)) },
    })
    // Every request waits until the test answers it
    const calls: Call[] = []
    vi.stubGlobal(
        "fetch",
        vi.fn(
            (url: string, init?: RequestInit) =>
                new Promise((resolve, reject) => {
                    calls.push({
                        url,
                        method: init?.method ?? "GET",
                        body: init?.body ? JSON.parse(String(init.body)) : null,
                        answer: ({ status, body }) =>
                            resolve(
                                new Response(JSON.stringify(body), { status }),
                            ),
                        fail: () => reject(new TypeError("Failed to fetch")),
                    })
                }),
        ),
    )
    // The page's window listeners, removed after the test
    const addListener = window.addEventListener
    window.addEventListener = ((type: string, listener: any, options?: any) => {
        pageListeners.push([type, listener])
        addListener.call(window, type, listener, options)
    }) as typeof window.addEventListener
    const run = new Function(
        `${scripts.join("\n")}\n${preview}\nreturn { poll, read: () => ({ stateId, currentVersion, lastXml, latestXml }) }`,
    )
    let created: unknown
    try {
        created = run()
    } finally {
        window.addEventListener = addListener
    }
    const page = created as {
        poll: () => Promise<void>
        read: () => {
            stateId: string | null
            currentVersion: number
            lastXml: string | null
            latestXml: string | null
        }
    }
    const fromDrawio = (msg: object) =>
        window.dispatchEvent(
            new MessageEvent("message", {
                data: JSON.stringify(msg),
                origin: DRAWIO,
            }),
        )
    const settle = () => new Promise((r) => setTimeout(r, 0))
    const next = (method: string) => {
        const call = calls.find((c) => c.method === method)
        if (!call) throw new Error(`no pending ${method}`)
        calls.splice(calls.indexOf(call), 1)
        return call
    }
    return { page, toDrawio, calls, fromDrawio, settle, next }
}

const state = (
    stateId: string,
    version: number,
    xml: string,
    blank = false,
) => ({
    status: 200,
    body: { stateId, version, xml, blank, syncRequested: false },
})

/** A tab in step with state S1 at version 2, showing diagram A */
async function inStep() {
    const t = openPage()
    t.next("GET").answer(state("S1", 2, "<mxfile>A</mxfile>"))
    await t.settle()
    t.fromDrawio({ event: "init" })
    await t.settle()
    expect(t.page.read().lastXml).toBe("<mxfile>A</mxfile>")
    return t
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval"] })
})
afterEach(() => {
    for (const [type, listener] of pageListeners.splice(0)) {
        window.removeEventListener(type, listener)
    }
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe("MCP preview after the server recreated its session", () => {
    it("keeps edits made while the server was down", async () => {
        const t = await inStep()
        // The user edits; the server is gone
        t.fromDrawio({ event: "autosave", xml: "<mxfile>B</mxfile>" })
        // draw.io's SVG export answers, then the push fails
        t.fromDrawio({ event: "export", data: "<svg/>" })
        await t.settle()
        t.next("POST").fail()
        await t.settle()
        // A new process recovered the file, which holds A
        const poll = t.page.poll()
        t.next("GET").answer(state("S2", 1, "<mxfile>A</mxfile>"))
        await poll
        const push = t.next("POST")
        expect(push.body).toMatchObject({
            xml: "<mxfile>B</mxfile>",
            stateId: "S2",
            baseVersion: 1,
        })
    })

    it("shows the server's diagram and keeps the tab's in History", async () => {
        const t = await inStep()
        const poll = t.page.poll()
        t.next("GET").answer(state("S2", 1, "<mxfile>C</mxfile>"))
        await poll
        expect(t.toDrawio.at(-1)).toMatchObject({
            action: "load",
            xml: "<mxfile>C</mxfile>",
        })
        expect(t.next("POST").body).toMatchObject({
            xml: "<mxfile>A</mxfile>",
            source: "recover",
            stateId: "S2",
        })
    })

    it("sends an edit of the replaced canvas to History, until draw.io loaded", async () => {
        const t = await inStep()
        const poll = t.page.poll()
        t.next("GET").answer(state("S2", 1, "<mxfile>C</mxfile>"))
        await poll
        t.next("POST") // the tab's copy, to History
        // An autosave the old canvas sent before the load
        t.fromDrawio({ event: "autosave", xml: "<mxfile>A edited</mxfile>" })
        await t.settle()
        expect(t.next("POST").body).toMatchObject({
            xml: "<mxfile>A edited</mxfile>",
            source: "recover",
        })
        // After the load, edits are edits again
        t.fromDrawio({ event: "load" })
        t.fromDrawio({ event: "autosave", xml: "<mxfile>C edited</mxfile>" })
        t.fromDrawio({ event: "export", data: "<svg/>" })
        await t.settle()
        expect(t.next("POST").body).toMatchObject({
            xml: "<mxfile>C edited</mxfile>",
            source: "edit",
        })
    })

    it("ignores the late answer to an old state's push", async () => {
        const t = await inStep()
        t.fromDrawio({ event: "autosave", xml: "<mxfile>B</mxfile>" })
        t.fromDrawio({ event: "export", data: "<svg/>" })
        await t.settle()
        const oldPush = t.next("POST")
        const poll = t.page.poll()
        t.next("GET").answer(state("S2", 1, "<mxfile>B</mxfile>"))
        await poll
        oldPush.answer({ status: 200, body: { success: true, version: 21 } })
        await t.settle()
        expect(t.page.read()).toMatchObject({
            stateId: "S2",
            currentVersion: 1,
        })
    })

    it("drops a poll answer older than one already handled", async () => {
        const t = await inStep()
        const first = t.page.poll()
        const firstGet = t.next("GET")
        const second = t.page.poll()
        t.next("GET").answer(state("S2", 1, "<mxfile>A</mxfile>"))
        await second
        // The answer from before the restart comes last
        firstGet.answer(state("S1", 3, "<mxfile>old</mxfile>"))
        await first
        expect(t.page.read().stateId).toBe("S2")
    })

    it("saves an undo made while a push was on its way", async () => {
        const t = await inStep()
        t.fromDrawio({ event: "autosave", xml: "<mxfile>B</mxfile>" })
        t.fromDrawio({ event: "export", data: "<svg/>" })
        await t.settle()
        const pushB = t.next("POST")
        // Undo back to A: equal to the last saved diagram, so no push
        t.fromDrawio({ event: "autosave", xml: "<mxfile>A</mxfile>" })
        await t.settle()
        expect(t.calls.filter((c) => c.method === "POST")).toHaveLength(0)
        pushB.answer({ status: 200, body: { success: true, version: 3 } })
        await t.settle()
        await t.settle()
        expect(t.next("POST").body.xml).toBe("<mxfile>A</mxfile>")
    })

    it("ignores an edit's answer that comes after a newer AI write loaded", async () => {
        const t = await inStep()
        t.fromDrawio({ event: "autosave", xml: "<mxfile>B</mxfile>" })
        t.fromDrawio({ event: "export", data: "<svg/>" })
        await t.settle()
        const pushB = t.next("POST")
        // The AI wrote X after B; the poll's answer comes first
        const poll = t.page.poll()
        t.next("GET").answer(state("S1", 4, "<mxfile>X</mxfile>"))
        await poll
        pushB.answer({ status: 200, body: { success: true, version: 3 } })
        await t.settle()
        await t.settle()
        expect(t.page.read()).toMatchObject({
            currentVersion: 4,
            lastXml: "<mxfile>X</mxfile>",
        })
        // No push of the AI's diagram as the user's edit
        expect(t.calls.filter((c) => c.method === "POST")).toHaveLength(0)
    })

    it("keeps an undo when a poll sees the tab's own push first", async () => {
        const t = await inStep()
        t.fromDrawio({ event: "autosave", xml: "<mxfile>B</mxfile>" })
        t.fromDrawio({ event: "export", data: "<svg/>" })
        await t.settle()
        const pushB = t.next("POST")
        // Undo back to A while B is on its way (equal to the saved A: not sent)
        t.fromDrawio({ event: "autosave", xml: "<mxfile>A</mxfile>" })
        // The server already has B, and the poll's answer comes first
        const loadsBefore = t.toDrawio.filter((m) => m.action === "load").length
        const poll = t.page.poll()
        t.next("GET").answer(state("S1", 3, "<mxfile>B</mxfile>"))
        await poll
        expect(t.toDrawio.filter((m) => m.action === "load")).toHaveLength(
            loadsBefore,
        )
        pushB.answer({ status: 200, body: { success: true, version: 3 } })
        await t.settle()
        await t.settle()
        // The undo is saved
        expect(t.next("POST").body.xml).toBe("<mxfile>A</mxfile>")
    })

    it("sends nothing more after a sync reply", async () => {
        const t = await inStep()
        const poll = t.page.poll()
        t.next("GET").answer({
            status: 200,
            body: {
                ...state("S1", 2, "<mxfile>A</mxfile>").body,
                syncRequested: true,
            },
        })
        await poll
        const request = t.toDrawio.at(-1)
        expect(request).toMatchObject({ action: "export", format: "xml" })
        // draw.io's export of the canvas, formatted unlike its autosave
        t.fromDrawio({
            event: "export",
            format: "xml",
            xml: '<mxfile host="drawio">A</mxfile>',
            message: request,
        })
        await t.settle()
        const sync = t.next("POST")
        expect(sync.body.source).toBe("sync")
        sync.answer({ status: 200, body: { success: true, version: 3 } })
        await t.settle()
        await t.settle()
        expect(t.calls.filter((c) => c.method === "POST")).toHaveLength(0)
    })
})

describe("MCP preview thumbnails and downloads", () => {
    /** The tab loads the server write B at version 3 and asks for its image */
    async function loadedB() {
        const t = await inStep()
        const poll = t.page.poll()
        t.next("GET").answer(state("S1", 3, "<mxfile>B</mxfile>"))
        await poll
        await new Promise((r) => setTimeout(r, 600))
        const request = t.toDrawio.at(-1)
        expect(request).toMatchObject({ action: "export", format: "svg" })
        return { t, n: request.thumbExport as number }
    }
    const thumbnailPosts = (t: ReturnType<typeof openPage>) =>
        t.calls.filter((c) => c.url === "/api/history-svg")

    it("sends the image with the state and version it shows", async () => {
        const { t, n } = await loadedB()
        t.fromDrawio({
            event: "export",
            data: "<svg/>",
            message: { thumbExport: n },
        })
        await t.settle()
        expect(thumbnailPosts(t).map((c) => c.body)).toEqual([
            expect.objectContaining({ stateId: "S1", version: 3 }),
        ])
    })

    it("drops the reply to an older thumbnail export", async () => {
        const { t, n } = await loadedB()
        // The next AI write loads before draw.io answered the first export
        const poll = t.page.poll()
        t.next("GET").answer(state("S1", 4, "<mxfile>C</mxfile>"))
        await poll
        await new Promise((r) => setTimeout(r, 600))
        const newer = t.toDrawio.at(-1).thumbExport
        expect(newer).toBeGreaterThan(n)
        t.fromDrawio({
            event: "export",
            data: "<svg>B</svg>",
            message: { thumbExport: n },
        })
        await t.settle()
        expect(thumbnailPosts(t)).toHaveLength(0)
        t.fromDrawio({
            event: "export",
            data: "<svg>C</svg>",
            message: { thumbExport: newer },
        })
        await t.settle()
        expect(thumbnailPosts(t).map((c) => c.body.version)).toEqual([4])
    })

    it("drops the image when the user changed the canvas since the load", async () => {
        const { t, n } = await loadedB()
        t.fromDrawio({ event: "autosave", xml: "<mxfile>B edited</mxfile>" })
        t.fromDrawio({
            event: "export",
            data: "<svg>thumbnail</svg>",
            message: { thumbExport: n },
        })
        await t.settle()
        expect(thumbnailPosts(t)).toHaveLength(0)
        // The edit is saved with the image of its own export
        t.fromDrawio({ event: "export", data: "<svg>edit</svg>" })
        await t.settle()
        const push = t.next("POST")
        expect(push.body.xml).toBe("<mxfile>B edited</mxfile>")
        expect(atob(push.body.svg.split(",")[1])).toBe("<svg>edit</svg>")
    })

    it("downloads the canvas with an edit the server did not get", async () => {
        const t = await inStep()
        t.fromDrawio({ event: "autosave", xml: "<mxfile>B</mxfile>" })
        t.fromDrawio({ event: "export", data: "<svg/>" })
        await t.settle()
        t.next("POST").fail()
        await t.settle()
        let saved: Blob | undefined
        URL.createObjectURL = vi.fn((blob: Blob) => {
            saved = blob
            return "blob:test"
        })
        URL.revokeObjectURL = vi.fn()
        ;(document.getElementById("save-format") as HTMLSelectElement).value =
            "drawio"
        document.getElementById("save-confirm-btn")?.click()
        const text = await new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.readAsText(saved as Blob)
        })
        expect(text).toBe("<mxfile>B</mxfile>")
    })
})

describe("MCP preview with a diagram over the size limit", () => {
    it("retries without the image, then tells the user", async () => {
        const t = await inStep()
        t.fromDrawio({ event: "autosave", xml: "<mxfile>huge</mxfile>" })
        t.fromDrawio({ event: "export", data: "<svg/>" })
        await t.settle()
        const first = t.next("POST")
        expect(first.body.svg).not.toBe("")
        first.answer({ status: 413, body: { error: "Payload too large" } })
        await t.settle()
        const retry = t.next("POST")
        expect(retry.body).toMatchObject({
            xml: "<mxfile>huge</mxfile>",
            svg: "",
        })
        expect(
            document.getElementById("notice")?.classList.contains("open"),
        ).toBe(false)
        retry.answer({ status: 413, body: { error: "Payload too large" } })
        await t.settle()
        expect(t.calls.filter((c) => c.method === "POST")).toHaveLength(0)
        expect(document.getElementById("notice")?.textContent).toContain(
            "too large",
        )
    })
})
