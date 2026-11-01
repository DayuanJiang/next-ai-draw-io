/**
 * Tests for the embedded HTTP server (browser bridge).
 *
 * The server runs in-process on a random high port (never 6002, which is
 * also the default port of the Next.js dev server). Requests go through
 * node:http so tests can set raw paths and Host/Origin headers.
 */

import {
    mkdirSync,
    mkdtempSync,
    rmSync,
    utimesSync,
    writeFileSync,
} from "node:fs"
import http from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { addHistory, getHistory } from "../src/history.ts"
import {
    activePreviewUi,
    drawioEmbedParams,
    getApiToken,
    getState,
    isSameOriginDrawio,
    keepInHistory,
    onSessionRecreate,
    onStateChange,
    previewUiFromEnv,
    previewUrl,
    readSelection,
    requestExport,
    requestSelection,
    requestSync,
    restoreHistoryEntry,
    setDrawioDir,
    setSessionFile,
    setShellDir,
    setState,
    shellConfig,
    shutdown,
    startHttpServer,
    waitForSelection,
    waitForSync,
} from "../src/http-server.ts"

let port = 0
// A stand-in for the bundled draw.io copy (dist/drawio), with a server-side
// part of the war that must never be served
let drawioDir = ""
// A stand-in for the built canvas shell (dist/shell)
let shellDir = ""

beforeAll(async () => {
    drawioDir = mkdtempSync(join(tmpdir(), "drawio-static-"))
    mkdirSync(join(drawioDir, "js"))
    mkdirSync(join(drawioDir, "WEB-INF"))
    writeFileSync(join(drawioDir, "index.html"), "<html>draw.io</html>")
    writeFileSync(join(drawioDir, ".version"), "v1\n")
    writeFileSync(join(drawioDir, "js/app.min.js"), "// app")
    writeFileSync(join(drawioDir, "WEB-INF/web.xml"), "<web-app/>")
    setDrawioDir(drawioDir)
    shellDir = mkdtempSync(join(tmpdir(), "shell-static-"))
    writeFileSync(
        join(shellDir, "index.html"),
        "<html><script>window.__MCP_CONFIG__ = {{CONFIG_JSON}};</script></html>",
    )
    writeFileSync(join(shellDir, "shell.js"), "// shell")
    writeFileSync(join(shellDir, "shell.css"), "body{}")
    setShellDir(shellDir)
    port = await startHttpServer(40000 + Math.floor(Math.random() * 10000))
})

afterAll(() => {
    shutdown()
    rmSync(drawioDir, { recursive: true, force: true })
    rmSync(shellDir, { recursive: true, force: true })
})

interface Response {
    status: number
    headers: http.IncomingHttpHeaders
    body: string
}

/**
 * Send a request as the preview page does (same Host, the API token);
 * `body` may be split into several writes.
 */
function request(
    path: string,
    opts: {
        method?: string
        headers?: Record<string, string>
        body?: Buffer[]
    } = {},
): Promise<Response> {
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                host: "127.0.0.1",
                port,
                path,
                method: opts.method ?? "GET",
                headers: {
                    host: `localhost:${port}`,
                    "x-drawio-token": getApiToken(),
                    ...opts.headers,
                },
            },
            (res) => {
                const chunks: Buffer[] = []
                res.on("data", (c: Buffer) => chunks.push(c))
                res.on("end", () =>
                    resolve({
                        status: res.statusCode ?? 0,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString("utf8"),
                    }),
                )
            },
        )
        req.on("error", reject)
        const parts = opts.body ?? []
        // Pause between parts so the server reads them as separate chunks
        const writeNext = (i: number) => {
            if (i >= parts.length) return req.end()
            req.write(parts[i])
            setTimeout(() => writeNext(i + 1), 30)
        }
        writeNext(0)
    })
}

const postJson = (path: string, data: unknown, headers = {}) =>
    request(path, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: [Buffer.from(JSON.stringify(data))],
    })

describe("session id in the page URL", () => {
    it("rejects a session id that could inject script", async () => {
        const res = await request(`/?mcp=${encodeURIComponent('";alert(1)//')}`)
        expect(res.status).toBe(400)
        expect(res.body).not.toContain("alert")
    })

    it("writes a valid session id into the page script as a JSON string", async () => {
        const res = await request("/?mcp=mcp-test-page")
        expect(res.status).toBe(200)
        expect(res.body).toContain('const sessionId = "mcp-test-page";')
    })
})

describe("requests that used to crash the process", () => {
    it("answers 400 for a path that is not a valid URL", async () => {
        const res = await request("//")
        expect(res.status).toBe(400)
        // The server is still alive
        expect((await request("/api/state?sessionId=mcp-alive")).status).toBe(
            200,
        )
    })

    it("never creates sessions with ids unsafe for the Location header", async () => {
        const badId = "mcp-中"
        await request(`/api/state?sessionId=${encodeURIComponent(badId)}`)
        expect(getState(badId)).toBeUndefined()
        const post = await postJson("/api/state", {
            sessionId: badId,
            xml: "<mxfile/>",
        })
        expect(post.status).toBe(400)
        expect(getState(badId)).toBeUndefined()

        const res = await request("/")
        expect([200, 302]).toContain(res.status)
    })
})

describe("request origin checks", () => {
    it("refuses a foreign Host header (DNS rebinding)", async () => {
        const res = await request("/api/state?sessionId=mcp-alive", {
            headers: { host: `evil.example:${port}` },
        })
        expect(res.status).toBe(403)
    })

    it("refuses writes from another website", async () => {
        const res = await postJson(
            "/api/state",
            { sessionId: "mcp-csrf", xml: "<mxfile/>" },
            { origin: "https://evil.example" },
        )
        expect(res.status).toBe(403)
        expect(getState("mcp-csrf")).toBeUndefined()
    })

    it("accepts writes from the page itself", async () => {
        const res = await postJson(
            "/api/state",
            { sessionId: "mcp-same-origin", xml: "<mxfile/>" },
            { origin: `http://localhost:${port}` },
        )
        expect(res.status).toBe(200)
        // Opened as 127.0.0.1, or through a forwarded port: Origin and
        // Host name the same host
        for (const host of [`127.0.0.1:${port}`, "localhost:7000"]) {
            const page = await postJson(
                "/api/state",
                { sessionId: "mcp-same-origin", xml: "<mxfile/>" },
                { origin: `http://${host}`, host },
            )
            expect(page.status).toBe(200)
        }
    })

    it("refuses writes from a page on another localhost port", async () => {
        // A plain text POST needs no CORS preflight, so the server must
        // refuse it itself
        setState("mcp-other-port", "<mxfile>kept</mxfile>")
        for (const path of ["/api/state", "/api/history-svg"]) {
            const res = await postJson(
                path,
                {
                    sessionId: "mcp-other-port",
                    xml: "<mxfile>replaced</mxfile>",
                    svg: "x",
                },
                { origin: "http://localhost:3000" },
            )
            expect(res.status).toBe(403)
        }
        expect(getState("mcp-other-port")?.xml).toBe("<mxfile>kept</mxfile>")
        expect(getState("mcp-other-port")?.svg).toBeUndefined()
    })
})

describe("POST /api/state", () => {
    it("refuses a push without xml and keeps the diagram", async () => {
        setState("mcp-no-xml", "<mxfile>kept</mxfile>")
        const res = await postJson("/api/state", {
            sessionId: "mcp-no-xml",
            baseVersion: 99,
        })
        expect(res.status).toBe(400)
        expect(getState("mcp-no-xml")?.xml).toBe("<mxfile>kept</mxfile>")
    })

    it("decodes UTF-8 characters split across body chunks", async () => {
        const xml = `<mxfile>${"数据".repeat(30000)}</mxfile>`
        const body = Buffer.from(JSON.stringify({ sessionId: "mcp-utf8", xml }))
        // Cut inside a 3-byte character
        const cut = body.indexOf(Buffer.from("数")) + 1
        const res = await request("/api/state", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: [body.subarray(0, cut), body.subarray(cut)],
        })
        expect(res.status).toBe(200)
        expect(getState("mcp-utf8")?.xml).toBe(xml)
    })

    it("rejects a browser push based on a version older than an AI write", async () => {
        const id = "mcp-conflict"
        setState(id, "<mxfile>user v1</mxfile>", undefined, true)
        const aiVersion = setState(id, "<mxfile>AI edit</mxfile>")

        const stale = await postJson("/api/state", {
            sessionId: id,
            xml: "<mxfile>user edit on old version</mxfile>",
            baseVersion: aiVersion - 1,
        })
        expect(stale.status).toBe(409)
        expect(getState(id)?.xml).toBe("<mxfile>AI edit</mxfile>")

        // Pushes based on the AI version are accepted, including a second
        // push sent before the first one's response updated the browser
        for (const xml of ["<mxfile>a</mxfile>", "<mxfile>b</mxfile>"]) {
            const ok = await postJson("/api/state", {
                sessionId: id,
                xml,
                baseVersion: aiVersion,
            })
            expect(ok.status).toBe(200)
            expect(getState(id)?.xml).toBe(xml)
        }
    })

    it("keeps a rejected user edit in history", async () => {
        const id = "mcp-conflict-history"
        setState(id, "<mxfile>user v1</mxfile>", undefined, true)
        const aiVersion = setState(id, "<mxfile>AI edit</mxfile>")
        const before = getHistory(id).length

        const stale = await postJson("/api/state", {
            sessionId: id,
            xml: "<mxfile>lost user edit</mxfile>",
            baseVersion: aiVersion - 1,
        })
        expect(stale.status).toBe(409)
        expect(JSON.parse(stale.body).savedToHistory).toBe(true)
        const history = getHistory(id)
        expect(history).toHaveLength(before + 1)
        expect(history.at(-1)?.xml).toBe("<mxfile>lost user edit</mxfile>")
    })

    it("asks for a save when a lost user edit is kept in history", async () => {
        const id = "mcp-conflict-save"
        setState(id, "<mxfile>user v1</mxfile>", undefined, true)
        const aiVersion = setState(id, "<mxfile>AI edit</mxfile>")
        const saves: string[] = []
        onStateChange((sessionId, xml) => saves.push(`${sessionId} ${xml}`))
        try {
            await postJson("/api/state", {
                sessionId: id,
                xml: "<mxfile>lost user edit</mxfile>",
                baseVersion: aiVersion - 1,
            })
        } finally {
            onStateChange(() => {})
        }
        // The canvas stays the AI write; the save takes the new History
        expect(saves).toEqual([`${id} <mxfile>AI edit</mxfile>`])
    })

    it("ends a pending sync when the sync reply is older than an AI write", async () => {
        const id = "mcp-stale-sync"
        setState(id, "<mxfile>before</mxfile>", undefined, true)
        const aiVersion = setState(id, "<mxfile>AI edit</mxfile>")
        requestSync(id)
        const before = getHistory(id).length

        // The browser exported its old diagram, then loaded the AI write
        const stale = await postJson("/api/state", {
            sessionId: id,
            xml: "<mxfile>before</mxfile>",
            baseVersion: aiVersion - 1,
            source: "sync",
        })
        expect(stale.status).toBe(409)
        expect(JSON.parse(stale.body).savedToHistory).toBe(false)
        expect(getState(id)?.xml).toBe("<mxfile>AI edit</mxfile>")
        expect(getState(id)?.syncRequested).toBeUndefined()
        expect(getHistory(id)).toHaveLength(before)
        expect(await waitForSync(id, 200)).toBe(true)
    })

    it("ignores a sync reply older than a user edit saved meanwhile", async () => {
        const id = "mcp-late-sync"
        const version = setState(id, "<mxfile>A</mxfile>", undefined, true)
        requestSync(id)
        // The user's edit is saved before the sync reply arrives
        const edit = await postJson("/api/state", {
            sessionId: id,
            xml: "<mxfile>B</mxfile>",
            baseVersion: version,
        })
        expect(edit.status).toBe(200)
        const late = await postJson("/api/state", {
            sessionId: id,
            xml: "<mxfile>A</mxfile>",
            baseVersion: version,
            source: "sync",
        })
        expect(late.status).toBe(409)
        expect(getState(id)?.xml).toBe("<mxfile>B</mxfile>")
    })
})

describe("the file named in the preview's header", () => {
    const fileOf = async (id: string) => {
        const res = await request(`/api/state?sessionId=${id}`)
        const { file, fileChanged } = JSON.parse(res.body)
        return { file, fileChanged }
    }

    it("tells when the diagram changed since the file was opened or saved", async () => {
        const id = "mcp-file-changed"
        const version = setState(id, "<mxfile>opened</mxfile>")
        setSessionFile(id, "/work/arch.drawio")
        expect(await fileOf(id)).toEqual({
            file: "/work/arch.drawio",
            fileChanged: false,
        })
        // A sync reply is draw.io's copy of the same diagram
        await postJson("/api/state", {
            sessionId: id,
            xml: "<mxfile>opened, as draw.io writes it</mxfile>",
            baseVersion: version,
            source: "sync",
        })
        expect((await fileOf(id)).fileChanged).toBe(false)
        // A hand edit
        await postJson("/api/state", {
            sessionId: id,
            xml: "<mxfile>edited by hand</mxfile>",
            baseVersion: version,
        })
        expect((await fileOf(id)).fileChanged).toBe(true)
        // Saved to the file again (export_diagram), then an AI write
        setSessionFile(id, "/work/arch.drawio")
        expect((await fileOf(id)).fileChanged).toBe(false)
        setState(id, "<mxfile>AI edit</mxfile>")
        expect((await fileOf(id)).fileChanged).toBe(true)
        // A new diagram is in no file
        setSessionFile(id, null)
        expect(await fileOf(id)).toEqual({ file: null, fileChanged: false })
    })
})

describe("export requests", () => {
    it("hands draw.io export options to the page and clears them after", async () => {
        const id = "mcp-export-options"
        setState(id, "<mxfile>x</mxfile>")
        requestExport(id, "png", undefined, { width: 1000, pageId: "p2" })
        const poll = JSON.parse(
            (await request(`/api/state?sessionId=${id}`)).body,
        )
        expect(poll.exportFormat).toBe("png")
        expect(poll.exportOptions).toEqual({ width: 1000, pageId: "p2" })

        await postJson("/api/state", {
            sessionId: id,
            exportData: "data:image/png;base64,AAAA",
            exportId: poll.exportId,
        })
        expect(getState(id)?.exportFormat).toBeUndefined()
    })

    it("ignores a late result of an export that already timed out", async () => {
        const id = "mcp-export-late"
        setState(id, "<mxfile>x</mxfile>")
        requestExport(id, "png")
        const first = JSON.parse(
            (await request(`/api/state?sessionId=${id}`)).body,
        )
        // The server gave up on the first export and asked for the next
        requestExport(id, "svg")
        await postJson("/api/state", {
            sessionId: id,
            exportData: "data:image/png;base64,LATE",
            exportId: first.exportId,
        })
        expect(getState(id)?.exportData).toBeUndefined()
        expect(getState(id)?.exportFormat).toBe("svg")
    })

    it("names exports at random, so a result meant for another process is not taken", async () => {
        const id = "mcp-export-random-id"
        setState(id, "<mxfile>x</mxfile>")
        requestExport(id, "svg")
        const poll = JSON.parse(
            (await request(`/api/state?sessionId=${id}`)).body,
        )
        expect(poll.exportId).toMatch(/^[0-9a-f-]{36}$/)
        // The page retries a result refused with 403 against the process
        // that took over the port; a per-process counter would restart at 1
        await postJson("/api/state", {
            sessionId: id,
            exportData: "<svg>OLD</svg>",
            exportId: 1,
        })
        expect(getState(id)?.exportData).toBeUndefined()
        expect(getState(id)?.exportFormat).toBe("svg")
    })
})

describe("selection requests (get_selection)", () => {
    const picked = {
        pageId: "p1",
        pageName: "Page-1",
        cells: [{ id: "3", label: "Login", edge: false }],
    }

    it("shows the request to the page and takes its answer once", async () => {
        const id = "mcp-selection"
        setState(id, "<mxfile>x</mxfile>")
        expect(requestSelection(id)).toBe(true)
        const poll = JSON.parse(
            (await request(`/api/state?sessionId=${id}`)).body,
        )
        expect(poll.selectionId).toMatch(/^[0-9a-f-]{36}$/)
        // The request survives a write meanwhile
        setState(id, "<mxfile>y</mxfile>")
        const waiting = waitForSelection(id, 3000)
        const answer = await postJson("/api/state", {
            sessionId: id,
            selectionId: poll.selectionId,
            selection: picked,
        })
        expect(answer.status).toBe(200)
        expect(await waiting).toEqual(picked)
        // Taken: the next poll shows no request
        const after = JSON.parse(
            (await request(`/api/state?sessionId=${id}`)).body,
        )
        expect(after.selectionId).toBeNull()
        expect(getState(id)?.xml).toBe("<mxfile>y</mxfile>")
    })

    it("ignores an answer to another request, and gives up in time", async () => {
        const id = "mcp-selection-late"
        setState(id, "<mxfile>x</mxfile>")
        requestSelection(id)
        const first = JSON.parse(
            (await request(`/api/state?sessionId=${id}`)).body,
        )
        requestSelection(id)
        await postJson("/api/state", {
            sessionId: id,
            selectionId: first.selectionId,
            selection: picked,
        })
        expect(getState(id)?.selection).toBeUndefined()
        expect(getState(id)?.selectionId).not.toBe(first.selectionId)
        // A malformed answer is not taken either
        const second = getState(id)?.selectionId
        await postJson("/api/state", {
            sessionId: id,
            selectionId: second,
            selection: { cells: "3" },
        })
        expect(getState(id)?.selection).toBeUndefined()
        expect(await waitForSelection(id, 250)).toBeNull()
        // The request is withdrawn with the timeout
        expect(getState(id)?.selectionId).toBeUndefined()
        expect(requestSelection("mcp-unknown-session")).toBe(false)
    })

    it("takes no answer while no request is pending", async () => {
        const id = "mcp-selection-unasked"
        setState(id, "<mxfile>x</mxfile>")
        // Both undefined would compare equal
        await postJson("/api/state", { sessionId: id, selection: picked })
        expect(getState(id)?.selection).toBeUndefined()
        requestSelection(id)
        const { selectionId } = getState(id) ?? {}
        await postJson("/api/state", { sessionId: id, selection: picked })
        expect(getState(id)?.selection).toBeUndefined()
        expect(getState(id)?.selectionId).toBe(selectionId)
        await waitForSelection(id, 50)
    })

    it("keeps the first answer when two tabs answer the same request", async () => {
        const id = "mcp-selection-two-tabs"
        setState(id, "<mxfile>x</mxfile>")
        requestSelection(id)
        const { selectionId } = getState(id) ?? {}
        await postJson("/api/state", {
            sessionId: id,
            selectionId,
            selection: picked,
        })
        const other = { ...picked, cells: [] }
        await postJson("/api/state", {
            sessionId: id,
            selectionId,
            selection: other,
        })
        expect(await waitForSelection(id, 1000)).toEqual(picked)
    })

    it("lets overlapping get_selection calls take turns, each getting its own answer", async () => {
        const id = "mcp-selection-overlap"
        setState(id, "<mxfile>x</mxfile>")
        const poll = async () =>
            JSON.parse((await request(`/api/state?sessionId=${id}`)).body)
        const first = readSelection(id, 3000)
        const second = readSelection(id, 3000)
        // The tab sees one request and answers it
        let shown = await poll()
        expect(shown.selectionId).toMatch(/^[0-9a-f-]{36}$/)
        await postJson("/api/state", {
            sessionId: id,
            selectionId: shown.selectionId,
            selection: picked,
        })
        expect(await first).toEqual(picked)
        // Then the second call's request, another id, answered in turn
        await new Promise((r) => setTimeout(r, 150))
        const next = await poll()
        expect(next.selectionId).toMatch(/^[0-9a-f-]{36}$/)
        expect(next.selectionId).not.toBe(shown.selectionId)
        const other = { ...picked, cells: [] }
        await postJson("/api/state", {
            sessionId: id,
            selectionId: next.selectionId,
            selection: other,
        })
        expect(await second).toEqual(other)
        shown = await poll()
        expect(shown.selectionId).toBeNull()
        expect(await readSelection("mcp-unknown-session", 100)).toBeNull()
    })
})

describe("a session state recreated after it was lost", () => {
    const SAVED = `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="saved" vertex="1" parent="1"/></root></mxGraphModel></diagram></mxfile>`
    const getJson = async (id: string) =>
        JSON.parse((await request(`/api/state?sessionId=${id}`)).body)

    it("names each state, and says when it was made blank", async () => {
        const first = await getJson("mcp-sid-blank")
        expect(first.stateId).toMatch(/^[0-9a-f-]{36}$/)
        expect(first.blank).toBe(true)
        setState("mcp-sid-blank", "<mxfile>AI write</mxfile>")
        const after = await getJson("mcp-sid-blank")
        // Same state, no longer blank
        expect(after.stateId).toBe(first.stateId)
        expect(after.blank).toBe(false)
    })

    it("refuses a push made for another state, also before any poll", async () => {
        // The MCP process restarted; the tab's push comes before its poll
        onSessionRecreate((id) => (id === "mcp-sid-restart" ? SAVED : null))
        try {
            for (const stateId of ["from-before", null]) {
                const res = await postJson("/api/state", {
                    sessionId: "mcp-sid-restart",
                    xml: "<mxfile>tab's old copy</mxfile>",
                    baseVersion: 7,
                    stateId,
                })
                expect(res.status).toBe(409)
                expect(JSON.parse(res.body).error).toBe("Session was recreated")
                // The saved file was recovered first and is kept
                expect(getState("mcp-sid-restart")?.xml).toBe(SAVED)
            }
        } finally {
            onSessionRecreate(() => null)
        }
    })

    it("accepts a push for the current state", async () => {
        const { stateId, version } = await getJson("mcp-sid-ok")
        const res = await postJson("/api/state", {
            sessionId: "mcp-sid-ok",
            xml: "<mxfile>user edit</mxfile>",
            baseVersion: version,
            stateId,
        })
        expect(res.status).toBe(200)
        expect(getState("mcp-sid-ok")?.xml).toBe("<mxfile>user edit</mxfile>")
    })

    it("keeps a recovering tab's copy in history, never on the canvas", async () => {
        setState("mcp-sid-recover", SAVED)
        const { stateId, version } = await getJson("mcp-sid-recover")
        const before = getHistory("mcp-sid-recover").length
        const res = await postJson("/api/state", {
            sessionId: "mcp-sid-recover",
            xml: "<mxfile>what the tab showed</mxfile>",
            baseVersion: version,
            stateId,
            source: "recover",
        })
        expect(res.status).toBe(409)
        expect(JSON.parse(res.body).savedToHistory).toBe(true)
        expect(getState("mcp-sid-recover")?.xml).toBe(SAVED)
        expect(getHistory("mcp-sid-recover")).toHaveLength(before + 1)
        expect(getHistory("mcp-sid-recover").at(-1)?.xml).toBe(
            "<mxfile>what the tab showed</mxfile>",
        )
    })

    it("keeps the old rules for a tab from an older version", async () => {
        // Its pushes have no stateId field
        const version = setState("mcp-sid-legacy", "<mxfile>AI</mxfile>")
        const res = await postJson("/api/state", {
            sessionId: "mcp-sid-legacy",
            xml: "<mxfile>edit</mxfile>",
            baseVersion: version,
        })
        expect(res.status).toBe(200)
    })
})

describe("preview page", () => {
    it("shows the saved diagram of a session whose state expired", async () => {
        const saved = `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="kept" vertex="1" parent="1"/></root></mxGraphModel></diagram></mxfile>`
        onSessionRecreate((id) => (id === "mcp-expired" ? saved : null))
        try {
            await request("/?mcp=mcp-expired")
            expect(getState("mcp-expired")?.xml).toBe(saved)
            await request("/?mcp=mcp-never-saved")
            expect(getState("mcp-never-saved")?.xml).not.toContain("kept")
        } finally {
            onSessionRecreate(() => null)
        }
    })

    it("serves scripts that parse, with every placeholder filled", async () => {
        const res = await request("/?mcp=mcp-test-script")
        expect(res.body).not.toContain("{{")
        // Both scripts share one global scope in the page
        const scripts = [...res.body.matchAll(/<script>([\s\S]*?)<\/script>/g)]
            .map((m) => m[1])
            .join("\n")
        expect(scripts).toContain('const sessionId = "mcp-test-script";')
        expect(scripts).toContain(`let API_TOKEN = "${getApiToken()}";`)
        expect(() => new Function(scripts)).not.toThrow()
    })

    it("embeds the bundled draw.io from its own origin, else the external one", async () => {
        expect(isSameOriginDrawio()).toBe(true)
        const res = await request("/?mcp=mcp-test-origin")
        expect(res.body).toContain('src="/drawio/index.html?embed=1&')
        // The page takes its own origin for draw.io's messages
        expect(res.body).toContain(
            'const DRAWIO_ORIGIN = "" || location.origin;',
        )

        setDrawioDir(null)
        try {
            expect(isSameOriginDrawio()).toBe(false)
            const external = await request("/?mcp=mcp-test-origin")
            expect(external.body).toContain(
                'src="https://embed.diagrams.net/?embed=1&',
            )
            expect(external.body).toContain(
                'const DRAWIO_ORIGIN = "https://embed.diagrams.net" || location.origin;',
            )
        } finally {
            setDrawioDir(drawioDir)
        }
    })

    it("sends the security headers with the page, which is never cached", async () => {
        const res = await request("/?mcp=mcp-test-headers")
        expect(res.headers["content-security-policy"]).toBe(
            "frame-ancestors 'self'",
        )
        expect(res.headers["x-content-type-options"]).toBe("nosniff")
        // It holds the process's token
        expect(res.headers["cache-control"]).toBe("no-store")
    })

    it("lets pages on this machine frame the preview with DRAWIO_ALLOW_EMBED=true", async () => {
        process.env.DRAWIO_ALLOW_EMBED = "true"
        try {
            const res = await request("/?mcp=mcp-test-embed")
            expect(res.headers["content-security-policy"]).toBe(
                "frame-ancestors 'self' localhost:* 127.0.0.1:*",
            )
        } finally {
            delete process.env.DRAWIO_ALLOW_EMBED
        }
    })
})

describe("API token", () => {
    it("refuses an API request without the token, or with another one", async () => {
        setState("mcp-token", "<mxfile>kept</mxfile>")
        for (const headers of [
            { "x-drawio-token": "" },
            { "x-drawio-token": "0123456789abcdef0123456789abcdef" },
        ]) {
            const get = await request("/api/state?sessionId=mcp-token", {
                headers,
            })
            expect(get.status).toBe(403)
            const post = await postJson(
                "/api/state",
                { sessionId: "mcp-token", xml: "<mxfile>replaced</mxfile>" },
                headers,
            )
            expect(post.status).toBe(403)
            const history = await request("/api/history?sessionId=mcp-token", {
                headers,
            })
            expect(history.status).toBe(403)
        }
        expect(getState("mcp-token")?.xml).toBe("<mxfile>kept</mxfile>")
    })

    it("is not needed for the page and the draw.io files", async () => {
        const headers = { "x-drawio-token": "" }
        expect((await request("/?mcp=mcp-token", { headers })).status).toBe(200)
        expect((await request("/drawio/index.html", { headers })).status).toBe(
            200,
        )
    })
})

describe("bundled draw.io files", () => {
    it("serves a file with its MIME type, cache and nosniff headers", async () => {
        const res = await request("/drawio/js/app.min.js")
        expect(res.status).toBe(200)
        expect(res.body).toBe("// app")
        expect(res.headers["content-type"]).toBe(
            "text/javascript; charset=utf-8",
        )
        // Revalidated on every use: the file names stay the same across
        // draw.io versions, so a package upgrade must reach the browser
        expect(res.headers["cache-control"]).toBe("no-cache")
        expect(res.headers.etag).toMatch(/^"v1-[0-9a-f]+-[0-9a-f]+"$/)
        expect(res.headers["x-content-type-options"]).toBe("nosniff")
        expect(res.headers["content-security-policy"]).toBeUndefined()
    })

    it("changes the ETag with the draw.io version, whatever the file dates say", async () => {
        // An install that keeps the archive's dates gives the upgraded file
        // the same date and, here, the same size as before
        const file = join(drawioDir, "js/same-size.js")
        const date = new Date("2020-01-01T00:00:00Z")
        writeFileSync(file, "// v1")
        utimesSync(file, date, date)
        const first = await request("/drawio/js/same-size.js")
        writeFileSync(file, "// v2")
        utimesSync(file, date, date)
        writeFileSync(join(drawioDir, ".version"), "v2\n")
        setDrawioDir(drawioDir)
        try {
            const again = await request("/drawio/js/same-size.js", {
                headers: { "if-none-match": first.headers.etag as string },
            })
            expect(again.status).toBe(200)
            expect(again.body).toBe("// v2")
            expect(again.headers.etag).not.toBe(first.headers.etag)
        } finally {
            writeFileSync(join(drawioDir, ".version"), "v1\n")
            setDrawioDir(drawioDir)
            rmSync(file, { force: true })
        }
    })

    it("answers 304 to a matching If-None-Match, and HEAD without a body", async () => {
        const first = await request("/drawio/js/app.min.js")
        const again = await request("/drawio/js/app.min.js", {
            headers: { "if-none-match": first.headers.etag as string },
        })
        expect(again.status).toBe(304)
        expect(again.body).toBe("")
        expect(again.headers.etag).toBe(first.headers.etag)
        const changed = await request("/drawio/js/app.min.js", {
            headers: { "if-none-match": '"0-0"' },
        })
        expect(changed.status).toBe(200)
        const head = await request("/drawio/js/app.min.js", {
            method: "HEAD",
        })
        expect(head.status).toBe(200)
        expect(head.body).toBe("")
        expect(head.headers["content-length"]).toBe("6")
    })

    it("keeps running when a file cannot be read", async () => {
        // Readable for stat, not for open (root reads anything: skipped)
        if (process.getuid?.() === 0) return
        const file = join(drawioDir, "js/locked.js")
        writeFileSync(file, "// locked", { mode: 0o000 })
        try {
            // The connection is dropped (the headers may be out already)
            const res = await request("/drawio/js/locked.js").catch(() => null)
            expect(res?.body ?? "").toBe("")
        } finally {
            rmSync(file, { force: true })
        }
        const next = await request("/drawio/js/app.min.js")
        expect(next.status).toBe(200)
        expect(next.body).toBe("// app")
    })

    it("frames the editor page only from this origin", async () => {
        const res = await request("/drawio/index.html")
        expect(res.status).toBe(200)
        expect(res.headers["content-type"]).toBe("text/html; charset=utf-8")
        expect(res.headers["content-security-policy"]).toBe(
            "frame-ancestors 'self'",
        )
    })

    it("never serves the war's server-side parts or files outside the copy", async () => {
        for (const path of [
            "/drawio/WEB-INF/web.xml",
            "/drawio/web-inf/web.xml",
            "/drawio/js/../WEB-INF/web.xml",
            "/drawio/META-INF/MANIFEST.MF",
            "/drawio/../package.json",
            "/drawio/%2e%2e/package.json",
            "/drawio/js/%2e%2e/%2e%2e/package.json",
            "/drawio/js/..%5c..%5cpackage.json",
            "/drawio/",
            "/drawio/js",
            "/drawio/missing.js",
        ]) {
            const res = await request(path)
            expect([403, 404], path).toContain(res.status)
            expect(res.body).not.toContain("web-app")
            expect(res.body).not.toContain('"name"')
        }
    })

    it("answers 404 when no copy is bundled", async () => {
        setDrawioDir(null)
        try {
            expect((await request("/drawio/index.html")).status).toBe(404)
        } finally {
            setDrawioDir(drawioDir)
        }
    })
})

describe("canvas shell page", () => {
    /** The config the served page carries */
    const configOf = (body: string) => {
        const match = body.match(
            /window\.__MCP_CONFIG__ = (\{.*?\});<\/script>/s,
        )
        if (!match) throw new Error(`no config in ${body}`)
        return JSON.parse(match[1])
    }

    it("writes the session, the token and where draw.io comes from into the page", async () => {
        const res = await request("/shell/?mcp=mcp-shell-page")
        expect(res.status).toBe(200)
        expect(res.headers["content-type"]).toBe("text/html; charset=utf-8")
        expect(res.body).not.toContain("{{")
        expect(configOf(res.body)).toEqual({
            sessionId: "mcp-shell-page",
            token: getApiToken(),
            apiBase: "/api",
            drawioBaseUrl: "/drawio/index.html",
            drawioUi: "",
            drawioLang: "",
            drawioDark: "auto",
            lang: "",
        })
        // The page creates the session, as the classic page does
        expect(getState("mcp-shell-page")).toBeDefined()
        // The same page at its index.html name
        const index = await request("/shell/index.html?mcp=mcp-shell-page")
        expect(index.status).toBe(200)
        expect(configOf(index.body).sessionId).toBe("mcp-shell-page")
    })

    it("passes the host's editor settings on, in the shell's own terms", () => {
        const config = shellConfig("mcp-s", {
            DRAWIO_UI: "Sketch",
            DRAWIO_LANG: "zh-Hant",
            DRAWIO_DARK: "1",
        })
        expect(config.drawioUi).toBe("sketch")
        expect(config.drawioLang).toBe("zh-tw")
        expect(config.drawioDark).toBe("dark")
        // The language as given, for the shell's own texts
        expect(config.lang).toBe("zh-Hant")
        expect(shellConfig("mcp-s", { DRAWIO_DARK: "light" }).drawioDark).toBe(
            "light",
        )
        expect(shellConfig("mcp-s", { DRAWIO_UI: "dark" }).drawioDark).toBe(
            "dark",
        )
        expect(shellConfig("mcp-s", { DRAWIO_UI: "neon" }).drawioUi).toBe("")
    })

    it("names the external draw.io when there is no bundled copy", async () => {
        setDrawioDir(null)
        try {
            const res = await request("/shell/?mcp=mcp-shell-external")
            expect(configOf(res.body).drawioBaseUrl).toBe(
                "https://embed.diagrams.net/",
            )
        } finally {
            setDrawioDir(drawioDir)
        }
    })

    it("escapes a value that could close the script element", async () => {
        const before = process.env.DRAWIO_LANG
        process.env.DRAWIO_LANG = "</script><script>alert(1)</script>"
        try {
            const res = await request("/shell/?mcp=mcp-shell-escape")
            expect(res.body).not.toContain("</script><script>alert")
            expect(res.body).toContain("\\u003c/script>")
            expect(configOf(res.body).lang).toBe(process.env.DRAWIO_LANG)
        } finally {
            if (before === undefined) delete process.env.DRAWIO_LANG
            else process.env.DRAWIO_LANG = before
        }
    })

    it("sends the security headers, is never cached and needs no token", async () => {
        const res = await request("/shell/?mcp=mcp-shell-headers", {
            headers: { "x-drawio-token": "" },
        })
        expect(res.status).toBe(200)
        expect(res.headers["content-security-policy"]).toBe(
            "frame-ancestors 'self'",
        )
        expect(res.headers["x-content-type-options"]).toBe("nosniff")
        expect(res.headers["cache-control"]).toBe("no-store")
    })

    it("rejects a bad session id and goes to the most recent session without one", async () => {
        const bad = await request(
            `/shell/?mcp=${encodeURIComponent('";alert(1)//')}`,
        )
        expect(bad.status).toBe(400)
        setState("mcp-shell-recent", "<mxfile>recent</mxfile>")
        const res = await request("/shell/")
        expect(res.status).toBe(302)
        // (other tests of this file create sessions in the same millisecond)
        expect(res.headers.location).toMatch(/^\/shell\/\?mcp=mcp-/)
        // Without the trailing slash the assets would resolve elsewhere
        const slash = await request("/shell?mcp=mcp-shell-recent")
        expect(slash.status).toBe(302)
        expect(slash.headers.location).toBe("/shell/?mcp=mcp-shell-recent")
    })

    it("goes to the session id a link starts with when text is glued onto it", async () => {
        // DSH's chat made "…?mcp=mcp-mvx2w3vx-njlslo。截图…" one link
        const res = await request(
            `/shell/?mcp=${encodeURIComponent("mcp-mvx2w3vx-njlslo。截图因为预览页没打开")}`,
        )
        expect(res.status).toBe(302)
        expect(res.headers.location).toBe("/shell/?mcp=mcp-mvx2w3vx-njlslo")
    })

    it("serves the shell's files with their MIME types, without a token", async () => {
        const js = await request("/shell/shell.js", {
            headers: { "x-drawio-token": "" },
        })
        expect(js.status).toBe(200)
        expect(js.body).toBe("// shell")
        expect(js.headers["content-type"]).toBe(
            "text/javascript; charset=utf-8",
        )
        expect(js.headers["x-content-type-options"]).toBe("nosniff")
        expect(js.headers["cache-control"]).toBe("no-cache")
        expect(js.headers.etag).toMatch(/^"\d+\.\d+\.\d+-[0-9a-f]+-[0-9a-f]+"$/)
        const css = await request("/shell/shell.css")
        expect(css.headers["content-type"]).toBe("text/css; charset=utf-8")
        for (const path of [
            "/shell/../package.json",
            "/shell/%2e%2e/package.json",
            "/shell/missing.js",
        ]) {
            const res = await request(path)
            expect(res.status, path).toBe(404)
            expect(res.body).not.toContain('"name"')
        }
    })

    it("says so when the shell is not built", async () => {
        setShellDir(null)
        try {
            const page = await request("/shell/?mcp=mcp-shell-unbuilt")
            expect(page.status).toBe(404)
            expect(page.body).toContain("npm run build")
            expect((await request("/shell/shell.js")).status).toBe(404)
        } finally {
            setShellDir(shellDir)
        }
    })

    it("is what start_session opens, unless DRAWIO_PREVIEW_UI=classic", () => {
        expect(previewUiFromEnv({})).toBe("shell")
        expect(previewUiFromEnv({ DRAWIO_PREVIEW_UI: "shell" })).toBe("shell")
        expect(previewUiFromEnv({ DRAWIO_PREVIEW_UI: "classic" })).toBe(
            "classic",
        )
        expect(previewUiFromEnv({ DRAWIO_PREVIEW_UI: "Classic" })).toBe(
            "classic",
        )
        expect(previewUrl(6002, "mcp-x", "shell")).toBe(
            "http://localhost:6002/shell/?mcp=mcp-x",
        )
        expect(previewUrl(6002, "mcp-x", "classic")).toBe(
            "http://localhost:6002?mcp=mcp-x",
        )
        // Not built: the classic page, which works, rather than a 404; the
        // tools that need the shell (get_selection) see the classic page too
        expect(activePreviewUi("shell")).toBe("shell")
        expect(activePreviewUi("classic")).toBe("classic")
        setShellDir(null)
        try {
            expect(previewUrl(6002, "mcp-x", "shell")).toBe(
                "http://localhost:6002?mcp=mcp-x",
            )
            expect(activePreviewUi("shell")).toBe("classic")
        } finally {
            setShellDir(shellDir)
        }
    })
})

describe("draw.io embed parameters from the host config", () => {
    it("follows the system dark mode and fixes nothing else by default", () => {
        expect(drawioEmbedParams({})).toBe("dark=auto")
    })

    it("turns dark mode on with the dark theme", () => {
        // draw.io ignores ui=dark for dark mode once a dark parameter is sent
        const params = drawioEmbedParams({ DRAWIO_UI: "dark" })
        expect(params).toContain("dark=1")
        expect(params).toContain("ui=dark")
        // Unless the user asked for light mode
        expect(drawioEmbedParams({ DRAWIO_UI: "dark", DRAWIO_DARK: "0" })).toBe(
            "dark=0&ui=dark",
        )
    })

    it("reads the theme in any case", () => {
        expect(drawioEmbedParams({ DRAWIO_UI: "Dark" })).toBe("dark=1&ui=dark")
    })

    it("ignores a theme or language draw.io does not know", () => {
        expect(drawioEmbedParams({ DRAWIO_UI: "neon" })).toBe("dark=auto")
        expect(drawioEmbedParams({ DRAWIO_LANG: "en;drop" })).toBe("dark=auto")
        expect(drawioEmbedParams({ DRAWIO_LANG: "english" })).toBe("dark=auto")
    })

    it("uses draw.io's name for Traditional Chinese", () => {
        for (const value of ["zh-Hant", "zh-hant"]) {
            expect(drawioEmbedParams({ DRAWIO_LANG: value })).toBe(
                "dark=auto&lang=zh-tw",
            )
        }
        expect(drawioEmbedParams({ DRAWIO_LANG: "ja" })).toBe(
            "dark=auto&lang=ja",
        )
        // and "zh" for Simplified Chinese
        expect(drawioEmbedParams({ DRAWIO_LANG: "zh-Hans" })).toBe(
            "dark=auto&lang=zh",
        )
    })

    it("reads dark mode in any spelling", () => {
        expect(drawioEmbedParams({ DRAWIO_DARK: "TRUE" })).toBe("dark=1")
        expect(drawioEmbedParams({ DRAWIO_DARK: "light" })).toBe("dark=0")
        expect(drawioEmbedParams({ DRAWIO_DARK: "maybe" })).toBe("dark=auto")
    })
})

describe("history restore", () => {
    it("restores the entry the user picked after older entries drop", async () => {
        const id = "mcp-history"
        setState(id, "<mxfile/>")
        for (let i = 0; i < 20; i++) addHistory(id, `<mxfile>${i}</mxfile>`)

        const list = await request(`/api/history?sessionId=${id}`)
        const picked = JSON.parse(list.body).entries[5]

        // A new AI edit shifts the buffer before the user clicks Restore
        addHistory(id, "<mxfile>new</mxfile>")

        const res = await postJson("/api/restore", {
            sessionId: id,
            id: picked.id,
        })
        expect(res.status).toBe(200)
        expect(getState(id)?.xml).toBe("<mxfile>5</mxfile>")
    })

    const page = (cellId: string) =>
        `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="${cellId}" vertex="1" parent="1"/></root></mxGraphModel></diagram></mxfile>`

    it("refuses a restore picked from a state the server has since lost", async () => {
        const id = "mcp-history-stale-state"
        setState(id, page("now"))
        addHistory(id, page("old"))
        const [entry] = getHistory(id)
        const stale = await postJson("/api/restore", {
            sessionId: id,
            id: entry.id,
            stateId: "a-lost-state",
        })
        expect(stale.status).toBe(409)
        // A list taken before the tab knew the state
        const unknown = await postJson("/api/restore", {
            sessionId: id,
            id: entry.id,
            stateId: null,
        })
        expect(unknown.status).toBe(409)
        expect(getState(id)?.xml).toBe(page("now"))
        const fresh = await postJson("/api/restore", {
            sessionId: id,
            id: entry.id,
            stateId: getState(id)?.stateId,
        })
        expect(fresh.status).toBe(200)
        expect(getState(id)?.xml).toBe(page("old"))
    })

    // A thumbnail the tab took after loading the server write at `version`
    const thumbnail = (id: string, svg: string, version: number) =>
        postJson("/api/history-svg", {
            sessionId: id,
            svg,
            stateId: getState(id)?.stateId,
            version,
        })

    it("gives a thumbnail only to the entry it shows", async () => {
        const id = "mcp-history-thumb"
        const version = setState(id, page("shown"))
        // The last entry is another diagram (a tab's copy kept on recovery)
        addHistory(id, page("other"))
        await thumbnail(id, "SVG-OF-SHOWN", version)
        expect(getHistory(id).at(-1)?.svg).toBe("")
        addHistory(id, page("shown"))
        await thumbnail(id, "SVG-OF-SHOWN", version)
        expect(getHistory(id).at(-1)?.svg).toBe("SVG-OF-SHOWN")
        expect(getState(id)?.svg).toBe("SVG-OF-SHOWN")
    })

    it("drops a thumbnail that arrives after the next AI write", async () => {
        const id = "mcp-history-thumb-late"
        const first = setState(id, page("first"))
        addHistory(id, page("first"))
        setState(id, page("second"))
        addHistory(id, page("second"))
        await thumbnail(id, "SVG-OF-FIRST", first)
        expect(getHistory(id).map((e) => e.svg)).toEqual(["", ""])
        expect(getState(id)?.svg).toBeUndefined()
    })

    it("drops a thumbnail of a state the server has since lost", async () => {
        const id = "mcp-history-thumb-state"
        const version = setState(id, page("shown"))
        addHistory(id, page("shown"))
        await postJson("/api/history-svg", {
            sessionId: id,
            svg: "SVG-OF-SHOWN",
            stateId: "another-state",
            version,
        })
        expect(getHistory(id).at(-1)?.svg).toBe("")
    })

    it("keeps a thumbnail in time after a sync reply", async () => {
        const id = "mcp-history-thumb-sync"
        const version = setState(id, page("ai"))
        addHistory(id, page("ai"))
        // draw.io's copy of the same diagram, sent back for a sync
        const synced = page("ai").replace(
            "<mxGraphModel>",
            '<mxGraphModel dx="10">',
        )
        await postJson("/api/state", {
            sessionId: id,
            xml: synced,
            baseVersion: version,
            source: "sync",
            stateId: getState(id)?.stateId,
        })
        await thumbnail(id, "SVG-OF-AI", version)
        expect(getHistory(id).at(-1)?.svg).toBe("SVG-OF-AI")
        // The state's own image is of the synced XML only
        expect(getState(id)?.svg).toBeUndefined()
    })

    it("keeps the image when a write repeats the same XML", async () => {
        const id = "mcp-history-thumb-same"
        const version = setState(id, page("same"))
        await thumbnail(id, "SVG-OF-SAME", version)
        setState(id, page("same"), undefined, true)
        expect(getState(id)?.svg).toBe("SVG-OF-SAME")
        setState(id, page("changed"), undefined, true)
        expect(getState(id)?.svg).toBeUndefined()
    })

    it("never pairs the image of an older diagram with a newer one", async () => {
        const id = "mcp-history-stale-svg"
        const version = setState(id, page("user"))
        await postJson("/api/state", {
            sessionId: id,
            xml: page("user2"),
            svg: "SVG-OF-USER2",
            baseVersion: version,
        })
        // An AI write without an image of its own
        setState(id, page("ai"))
        addHistory(id, page("older"))
        const [entry] = getHistory(id)
        await postJson("/api/restore", { sessionId: id, id: entry.id })
        const kept = getHistory(id).find((e) => e.xml === page("ai"))
        expect(kept?.svg).toBe("")
    })

    it("keeps a cleared document with renamed pages before restoring", async () => {
        const id = "mcp-history-empty-pages"
        const emptyPage = (name: string) =>
            `<diagram id="${name}" name="${name}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram>`
        const cleared = `<mxfile>${emptyPage("Planning")}${emptyPage("Notes")}</mxfile>`
        addHistory(id, page("before"))
        setState(id, cleared, undefined, true)
        const [entry] = getHistory(id)
        await postJson("/api/restore", { sessionId: id, id: entry.id })
        expect(getHistory(id).map((e) => e.xml)).toContain(cleared)
    })

    it("adds no entry for a copy of the last one", () => {
        const id = "mcp-history-dedupe"
        addHistory(id, page("same"))
        addHistory(id, page("same"), "SVG")
        expect(getHistory(id)).toHaveLength(1)
        // The missing image is filled in
        expect(getHistory(id)[0].svg).toBe("SVG")
    })
})

// What the shell's version cards read (the classic page uses index, id
// and svg of the same list)
describe("GET /api/history for the version cards", () => {
    const page = (cellId: string) =>
        `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="${cellId}" vertex="1" parent="1"/></root></mxGraphModel></diagram></mxfile>`

    it("lists each entry's document, maker and first copy, with the state and the entry on the canvas", async () => {
        const id = "mcp-history-cards"
        addHistory(id, page("a"))
        addHistory(id, page("b"), "SVG-B", "user")
        setState(id, page("b"))
        const res = await request(`/api/history?sessionId=${id}`)
        expect(res.status).toBe(200)
        const d = JSON.parse(res.body)
        const [a, b] = getHistory(id)
        expect(d.count).toBe(2)
        expect(d.stateId).toBe(getState(id)?.stateId)
        expect(d.currentId).toBe(b.id)
        expect(d.entries[0]).toEqual({
            index: 0,
            id: a.id,
            svg: "",
            xml: page("a"),
            source: null,
            firstId: a.id,
        })
        expect(d.entries[1]).toMatchObject({
            id: b.id,
            svg: "SVG-B",
            source: "user",
            firstId: b.id,
        })
    })

    it("gives the state a History key, which a hand edit changes once and a further one not at all", async () => {
        // The shell reads History (every entry's XML and picture) again
        // only when the key changes
        const id = "mcp-history-key"
        setState(id, page("a"))
        addHistory(id, page("a"))
        const [a] = getHistory(id)
        const first = JSON.parse(
            (await request(`/api/state?sessionId=${id}`)).body,
        )
        expect(first.historyKey).toBe(`1:${a.id}:${a.id}`)
        // A hand edit: the canvas is at no entry now, History is the same
        const push = await postJson("/api/state", {
            sessionId: id,
            xml: page("b"),
            baseVersion: first.version,
            stateId: first.stateId,
        })
        expect(push.status).toBe(200)
        expect(JSON.parse(push.body).historyKey).toBe(`1:${a.id}:null`)
        const again = await postJson("/api/state", {
            sessionId: id,
            xml: page("c"),
            baseVersion: first.version + 1,
            stateId: first.stateId,
        })
        expect(JSON.parse(again.body).historyKey).toBe(`1:${a.id}:null`)
        const polled = JSON.parse(
            (await request(`/api/state?sessionId=${id}`)).body,
        )
        expect(polled.historyKey).toBe(`1:${a.id}:null`)
        // A write keeps the edit in History: the key names the new entry
        keepInHistory(id, page("c"))
        setState(id, page("d"))
        addHistory(id, page("d"))
        const [, c, d] = getHistory(id)
        expect(c.xml).toBe(page("c"))
        const after = JSON.parse(
            (await request(`/api/state?sessionId=${id}`)).body,
        )
        expect(after.historyKey).toBe(`3:${d.id}:${d.id}`)
    })

    it("names the entry a restored copy stands for, and marks the copy as a restore", async () => {
        const id = "mcp-history-cards-restore"
        addHistory(id, page("a"))
        addHistory(id, page("b"))
        setState(id, page("b"))
        const [a, b] = getHistory(id)
        const restore = await postJson("/api/restore", {
            sessionId: id,
            id: a.id,
            stateId: getState(id)?.stateId,
        })
        expect(restore.status).toBe(200)
        const d = JSON.parse(
            (await request(`/api/history?sessionId=${id}`)).body,
        )
        // History: a, b, a' (the copy); the canvas shows a's content
        expect(d.entries.map((e: { firstId: number }) => e.firstId)).toEqual([
            a.id,
            b.id,
            a.id,
        ])
        expect(d.entries[2].source).toBe("restore")
        expect(d.currentId).toBe(d.entries[2].id)
    })

    it("marks the user's edit that a write replaces, and one that lost the race", async () => {
        const id = "mcp-history-cards-user"
        const version = setState(id, page("ai"))
        addHistory(id, page("ai"))
        // The user edits in the browser; the AI writes over it
        await postJson("/api/state", {
            sessionId: id,
            xml: page("user"),
            baseVersion: version,
            stateId: getState(id)?.stateId,
        })
        keepInHistory(id, page("user"))
        const ai2 = setState(id, page("ai2"))
        addHistory(id, page("ai2"))
        // A tab that had not loaded the write yet pushes another edit
        await postJson("/api/state", {
            sessionId: id,
            xml: page("late"),
            baseVersion: ai2 - 1,
            stateId: getState(id)?.stateId,
        })
        const d = JSON.parse(
            (await request(`/api/history?sessionId=${id}`)).body,
        )
        expect(
            d.entries.map((e: { xml: string; source: string | null }) => [
                e.xml === page("user")
                    ? "user"
                    : e.xml === page("late")
                      ? "late"
                      : "ai",
                e.source,
            ]),
        ).toEqual([
            ["ai", null],
            ["user", "user"],
            ["ai", null],
            ["late", "user"],
        ])
        // The canvas shows the write, not an edit
        expect(d.currentId).toBe(getHistory(id)[2].id)
    })

    it("reports no state and no current entry for a session it does not know", async () => {
        const d = JSON.parse(
            (await request("/api/history?sessionId=mcp-never-seen")).body,
        )
        expect(d).toEqual({
            entries: [],
            count: 0,
            stateId: null,
            currentId: null,
        })
    })

    // draw.io's own copy of a diagram, as a sync reply or an edit brings it
    const drawioCopy = (xml: string, attrs = 'pageWidth="850"') =>
        xml.replace(
            "<mxGraphModel>",
            `<mxGraphModel dx="1244" dy="534" grid="1" ${attrs}>`,
        )

    it("keeps no copy of a server write that a sync brought back", async () => {
        const id = "mcp-history-keep-sync"
        const version = setState(id, page("ai"))
        addHistory(id, page("ai"))
        await postJson("/api/state", {
            sessionId: id,
            xml: drawioCopy(page("ai")),
            baseVersion: version,
            source: "sync",
            stateId: getState(id)?.stateId,
        })
        // The next AI write keeps the state it replaces
        keepInHistory(id, getState(id)?.xml ?? "")
        expect(getHistory(id)).toHaveLength(1)
    })

    it("keeps a change of page settings only before a write", async () => {
        const id = "mcp-history-keep-settings"
        const version = setState(id, page("ai"))
        addHistory(id, page("ai"))
        // The user turns the page to A3 in the preview
        await postJson("/api/state", {
            sessionId: id,
            xml: drawioCopy(page("ai"), 'pageWidth="1169" pageHeight="1654"'),
            baseVersion: version,
            stateId: getState(id)?.stateId,
        })
        keepInHistory(id, getState(id)?.xml ?? "")
        expect(getHistory(id)).toHaveLength(2)
        expect(getHistory(id).at(-1)?.xml).toContain('pageWidth="1169"')
    })

    it("keeps a diagram restored from its file before a write", () => {
        const id = "mcp-history-keep-restored"
        // As restoreSavedSession puts it back after a restart
        setState(id, page("from file"), undefined, false, false)
        keepInHistory(id, page("from file"))
        expect(getHistory(id).map((e) => e.xml)).toEqual([page("from file")])
    })

    it("keeps a version that changed only the background", () => {
        const id = "mcp-history-background"
        addHistory(id, page("same"))
        addHistory(
            id,
            page("same").replace(
                "<mxGraphModel>",
                '<mxGraphModel background="#FFE6CC">',
            ),
        )
        expect(getHistory(id)).toHaveLength(2)
    })

    it("keeps manual edits in history before restoring", async () => {
        const id = "mcp-history-manual"
        const doc = (cellId: string) =>
            `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="${cellId}" vertex="1" parent="1"/></root></mxGraphModel></diagram></mxfile>`
        const version = setState(id, doc("ai"))
        addHistory(id, doc("ai"))
        // An edit in the browser is not a history entry by itself
        const push = await postJson("/api/state", {
            sessionId: id,
            xml: doc("manual"),
            baseVersion: version,
        })
        expect(push.status).toBe(200)

        const [entry] = getHistory(id)
        await postJson("/api/restore", { sessionId: id, id: entry.id })
        expect(getState(id)?.xml).toBe(doc("ai"))
        expect(getHistory(id).map((e) => e.xml)).toContain(doc("manual"))
    })

    it("restoreHistoryEntry leaves the canvas alone for an unknown entry", () => {
        const id = "mcp-restore-unknown"
        setState(id, page("x"))
        addHistory(id, page("x"))
        expect(restoreHistoryEntry(id, 999999)).toBeNull()
        expect(getState(id)?.xml).toBe(page("x"))
        expect(getHistory(id)).toHaveLength(1)
    })

    it("restoreHistoryEntry restores an entry and keeps the canvas in History", () => {
        const id = "mcp-restore-entry"
        addHistory(id, page("old"))
        const [entry] = getHistory(id)
        // The canvas is a later state that is not in History yet
        setState(id, page("ai"))

        const newVersion = restoreHistoryEntry(id, entry.id)
        expect(newVersion).toBe(getState(id)?.version)
        expect(getState(id)?.xml).toBe(page("old"))
        expect(getHistory(id).map((e) => e.xml)).toEqual([
            page("old"),
            page("ai"),
            page("old"),
        ])
    })
})

describe("bodies over the size limit", () => {
    it("answers 413 after reading the whole body", async () => {
        const mib = Buffer.alloc(1024 * 1024, "x")
        // Still sending when the limit is passed, as a browser would be.
        // A browser whose upload is cut off reports a network error.
        const result = await new Promise<{ status?: number; sent: boolean }>(
            (resolve) => {
                let sent = false
                const req = http.request(
                    {
                        host: "127.0.0.1",
                        port,
                        path: "/api/state",
                        method: "POST",
                        headers: {
                            host: `localhost:${port}`,
                            "x-drawio-token": getApiToken(),
                            "content-type": "application/json",
                        },
                    },
                    (res) => {
                        res.resume()
                        res.on("end", () =>
                            resolve({ status: res.statusCode, sent }),
                        )
                    },
                )
                req.on("error", () => resolve({ sent }))
                const writeNext = (i: number) => {
                    if (i === 15) {
                        req.end(() => {
                            sent = true
                        })
                        return
                    }
                    req.write(mib, () => setTimeout(() => writeNext(i + 1), 10))
                }
                writeNext(0)
            },
        )
        expect(result).toEqual({ status: 413, sent: true })
    })
})
