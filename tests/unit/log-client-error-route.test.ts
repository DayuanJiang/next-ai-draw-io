// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET, POST } from "@/app/api/log-client-error/route"

const batch = vi.fn(async (_body: { batch: any[] }) => ({}))
let langfuse: unknown = null
vi.mock("@/lib/langfuse", () => ({ getLangfuseClient: () => langfuse }))

function post(body: unknown, contentType = "application/json"): Request {
    return new Request("http://localhost/api/log-client-error", {
        method: "POST",
        headers: { "Content-Type": contentType, "User-Agent": "test-agent" },
        body: JSON.stringify(body),
    })
}

const sentTrace = () => batch.mock.calls[0][0].batch[0].body

beforeEach(() => {
    batch.mockClear()
    langfuse = { api: { ingestion: { batch } } }
})

describe("/api/log-client-error", () => {
    it("says whether reports are kept", async () => {
        expect(await (await GET()).json()).toEqual({ enabled: true })
        langfuse = null
        expect(await (await GET()).json()).toEqual({ enabled: false })
    })

    it("records an error the page saw as a client-error trace", async () => {
        const res = await POST(
            post({
                kind: "crash",
                message: "Cannot read properties of undefined",
                stack: "TypeError: x\n    at f (/_next/static/chunks/a.js:1:2)",
                page: "/zh",
                version: "0.5.1",
                sessionId: "session-1",
            }),
        )
        expect(await res.json()).toEqual({ success: true, logged: true })
        const trace = sentTrace()
        expect(trace).toMatchObject({
            name: "client-error",
            sessionId: "session-1",
            input: { message: "Cannot read properties of undefined" },
            metadata: { kind: "crash", page: "/zh", userAgent: "test-agent" },
            tags: ["crash"],
        })
        expect(trace.metadata.stack).toContain("/_next/")
    })

    it("keeps a chat error's code, model and the last actions", async () => {
        await POST(
            post({
                kind: "chat-error",
                message: "Network error",
                code: "network",
                model: "server default",
                actions: ["send (3s ago)", "answer failed (0s ago)"],
            }),
        )
        expect(sentTrace()).toMatchObject({
            name: "client-error",
            metadata: {
                code: "network",
                model: "server default",
                actions: ["send (3s ago)", "answer failed (0s ago)"],
            },
            tags: ["chat-error", "network"],
        })
    })

    it("names a report the user sent, even without a note", async () => {
        await POST(post({ kind: "chat-error", message: "boom", note: "" }))
        expect(sentTrace()).toMatchObject({
            name: "user-report",
            input: { note: "", message: "boom" },
        })
    })

    it("fails when Langfuse rejects the event", async () => {
        batch.mockResolvedValueOnce({
            successes: [],
            errors: [{ id: "e1", status: 400, message: "invalid" }],
        } as any)
        const res = await POST(post({ kind: "toast", message: "boom" }))
        expect(res.status).toBe(500)
    })

    it("keeps nothing when Langfuse is not set up", async () => {
        langfuse = null
        const res = await POST(post({ kind: "toast", message: "boom" }))
        expect(await res.json()).toEqual({ success: true, logged: false })
    })

    it("refuses other kinds and a text body", async () => {
        expect((await POST(post({ kind: "x", message: "boom" }))).status).toBe(
            400,
        )
        const text = await POST(
            post({ kind: "toast", message: "boom" }, "text/plain"),
        )
        expect(text.status).toBe(415)
        expect(batch).not.toHaveBeenCalled()
    })
})
