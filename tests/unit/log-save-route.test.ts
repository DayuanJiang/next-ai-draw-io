// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { POST as logSave } from "@/app/api/log-save/route"

// A Langfuse client with a trace to attach the save score to
const batch = vi.fn(async () => ({}))
vi.mock("@/lib/langfuse", () => ({
    getLangfuseClient: () => ({
        api: {
            trace: { list: async () => ({ data: [{ id: "trace-1" }] }) },
            ingestion: { batch },
        },
    }),
}))

function post(body: unknown): Request {
    return new Request("http://localhost/api/log-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })
}

describe("POST /api/log-save", () => {
    it.each(["drawio", "png", "svg", "xmlsvg"])(
        "logs a save in %s format",
        async (format) => {
            const res = await logSave(
                post({ filename: "diagram", format, sessionId: "s1" }),
            )
            expect(res.status).toBe(200)
            expect(await res.json()).toEqual({ success: true, logged: true })
        },
    )

    it("rejects an unknown format", async () => {
        const res = await logSave(
            post({ filename: "diagram", format: "pdf", sessionId: "s1" }),
        )
        expect(res.status).toBe(400)
    })
})
