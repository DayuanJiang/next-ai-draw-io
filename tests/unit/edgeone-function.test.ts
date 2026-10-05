// @vitest-environment node
import { describe, expect, it } from "vitest"
import { onRequest } from "@/edge-functions/api/edgeai/chat/completions"

function request(headers: Record<string, string>): Request {
    return new Request("http://localhost/api/edgeai/chat/completions", {
        method: "POST",
        headers,
        // Non-streaming requests return a mock reply without calling AI
        body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    })
}

const json = { "Content-Type": "application/json" }

describe("EdgeOne chat completions function", () => {
    it("sends no CORS headers", async () => {
        const res = await onRequest({ request: request(json), env: {} })
        expect(res.status).toBe(200)
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
        expect(withCharset.status).toBe(200)
    })

    it("checks the access code when ACCESS_CODE_LIST is set", async () => {
        const env = { ACCESS_CODE_LIST: "secret" }
        const missing = await onRequest({ request: request(json), env })
        expect(missing.status).toBe(401)

        const ok = await onRequest({
            request: request({ ...json, "x-access-code": "secret" }),
            env,
        })
        expect(ok.status).toBe(200)
    })

    it("lets requests through when env is unavailable", async () => {
        const res = await onRequest({ request: request(json) })
        expect(res.status).toBe(200)
    })
})
