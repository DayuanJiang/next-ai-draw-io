/**
 * Tests for the embedded HTTP server (browser bridge).
 *
 * The server runs in-process on a random high port (never 6002, which is
 * also the default port of the Next.js dev server). Requests go through
 * node:http so tests can set raw paths and Host/Origin headers.
 */

import http from "node:http"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { addHistory } from "../src/history.js"
import {
    getState,
    setState,
    shutdown,
    startHttpServer,
} from "../src/http-server.js"

let port = 0

beforeAll(async () => {
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
    })
})

describe("POST /api/state", () => {
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
})
