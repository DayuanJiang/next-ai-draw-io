// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST as logActions } from "@/app/api/log-actions/route"

interface TraceEvent {
    type: string
    body: {
        name: string
        sessionId?: string
        input: { name: string; at: string }[]
        metadata: Record<string, unknown>
        tags: string[]
    }
}

// A Langfuse client that takes every event, or none is set up
let configured = true
const batch = vi.fn(async (_request: { batch: TraceEvent[] }) => ({
    errors: [],
}))
vi.mock("@/lib/langfuse", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/langfuse")>()),
    getLangfuseClient: () =>
        configured ? { api: { ingestion: { batch } } } : null,
}))

function post(body: unknown, headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/api/log-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
    })
}

beforeEach(() => {
    configured = true
    batch.mockClear()
})

describe("POST /api/log-actions", () => {
    it("keeps the actions as one trace in the chat's session", async () => {
        const before = Date.now()
        const res = await logActions(
            post({
                actions: [
                    { name: "page open", ago: 60_000 },
                    { name: "send", ago: 5000 },
                    { name: "send", ago: 0 },
                ],
                page: "/en",
                version: "0.5.1",
                sessionId: "chat-1",
            }),
        )
        expect(await res.json()).toEqual({ success: true, logged: true })
        const trace = batch.mock.calls[0][0].batch[0]
        expect(trace.type).toBe("trace-create")
        expect(trace.body).toMatchObject({
            name: "user-actions",
            sessionId: "chat-1",
            metadata: { page: "/en", version: "0.5.1" },
            tags: ["page open", "send"],
        })
        expect(trace.body.input.map((action) => action.name)).toEqual([
            "page open",
            "send",
            "send",
        ])
        // Timed by the server: each as long ago as the page said
        const times = trace.body.input.map((action) => Date.parse(action.at))
        expect(times[2] - times[0]).toBe(60_000)
        expect(times[2] - times[1]).toBe(5000)
        expect(times[2]).toBeGreaterThanOrEqual(before)
    })

    it("answers without keeping anything when Langfuse is not set up", async () => {
        configured = false
        const res = await logActions(
            post({ actions: [{ name: "send", ago: 0 }] }),
        )
        expect(await res.json()).toEqual({ success: true, logged: false })
        expect(batch).not.toHaveBeenCalled()
    })

    it.each([
        ["no actions", { actions: [] }],
        ["a long name", { actions: [{ name: "x".repeat(61), ago: 0 }] }],
        [
            "too many actions",
            { actions: Array(51).fill({ name: "send", ago: 0 }) },
        ],
        ["a time in the future", { actions: [{ name: "send", ago: -5 }] }],
    ])("rejects %s", async (_what, body) => {
        const res = await logActions(post(body))
        expect(res.status).toBe(400)
        expect(batch).not.toHaveBeenCalled()
    })

    it("rejects a request that is not JSON, as a form on another site sends", async () => {
        const res = await logActions(
            post(
                { actions: [{ name: "send", ago: 0 }] },
                { "Content-Type": "text/plain" },
            ),
        )
        expect(res.status).toBe(415)
        expect(batch).not.toHaveBeenCalled()
    })
})
