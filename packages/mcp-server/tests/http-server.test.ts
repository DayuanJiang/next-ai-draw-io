/**
 * Tests for the embedded HTTP server (browser bridge).
 *
 * The server runs in-process on a random high port (never 6002, which is
 * also the default port of the Next.js dev server). Requests go through
 * node:http so tests can set raw paths and Host/Origin headers.
 */

import http from "node:http"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { installDomPolyfill } from "../src/dom.ts"
import { addHistory, getHistory } from "../src/history.ts"
import {
    getState,
    keepInHistory,
    onSessionRecreate,
    requestExport,
    requestSync,
    setState,
    shutdown,
    startHttpServer,
    waitForSync,
} from "../src/http-server.ts"

let port = 0

beforeAll(async () => {
    // XML parsing, as the server installs it at startup
    installDomPolyfill()
    port = await startHttpServer(40000 + Math.floor(Math.random() * 10000))
})

afterAll(() => {
    shutdown()
})

interface Response {
    status: number
    headers: http.IncomingHttpHeaders
    body: string
}

/** Send a request; `body` may be split into several writes. */
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
                headers: { host: `localhost:${port}`, ...opts.headers },
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
        expect(getState(id)?.exportOptions).toBeUndefined()
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
                expect(JSON.parse(res.body).stateChanged).toBe(true)
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
        expect(() => new Function(scripts)).not.toThrow()
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
