// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { onRequest } from "@/edge-functions/api/edgeai/chat/completions"

// EdgeOne's global AI object, answering with an empty stream
beforeEach(() => {
    vi.stubGlobal("AI", {
        chatCompletions: async () => new ReadableStream(),
    })
})
afterEach(() => {
    vi.unstubAllGlobals()
})

function request(headers: Record<string, string>): Request {
    return new Request("http://localhost/api/edgeai/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    })
}

const json = { "Content-Type": "application/json" }

// An accepted request streams the model's reply
function expectStream(res: Response) {
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
}

describe("EdgeOne chat completions function", () => {
    it("sends no CORS headers", async () => {
        const res = await onRequest({ request: request(json), env: {} })
        expectStream(res)
        expect(res.headers.get("access-control-allow-origin")).toBeNull()
    })

    it("rejects non-JSON requests", async () => {
        const res = await onRequest({
            request: request({ "Content-Type": "text/plain" }),
            env: {},
        })
        expect(res.status).toBe(400)
        // A plain-text type that only mentions JSON needs no CORS preflight
        const disguised = await onRequest({
            request: request({
                "Content-Type": "text/plain; x=application/json",
            }),
            env: {},
        })
        expect(disguised.status).toBe(400)
        const withCharset = await onRequest({
            request: request({
                "Content-Type": "application/json; charset=utf-8",
            }),
            env: {},
        })
        expectStream(withCharset)
    })

    it("checks the access code when ACCESS_CODE_LIST is set", async () => {
        const env = { ACCESS_CODE_LIST: "secret" }
        const missing = await onRequest({ request: request(json), env })
        expect(missing.status).toBe(401)

        const ok = await onRequest({
            request: request({ ...json, "x-access-code": "secret" }),
            env,
        })
        expectStream(ok)
    })

    it("lets requests through when env is unavailable", async () => {
        const res = await onRequest({ request: request(json) })
        expectStream(res)
    })
})
