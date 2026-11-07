// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST as logFeedback } from "@/app/api/log-feedback/route"

// A Langfuse client whose latest session trace is "latest"; the real
// scoreLatestTrace runs against it
const batch = vi.fn(async (_body: { batch: any[] }) => ({}))
const list = vi.fn(async () => ({ data: [{ id: "latest" }] }))
vi.mock("@/lib/langfuse", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/langfuse")>()),
    getLangfuseClient: () => ({
        api: { trace: { list }, ingestion: { batch } },
    }),
}))

const TRACE = "0123456789abcdef0123456789abcdef"

function post(body: object): Request {
    return new Request("http://localhost/api/log-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: "m1", sessionId: "s1", ...body }),
    })
}

const sentScore = () => batch.mock.calls[0][0].batch.at(-1).body

beforeEach(() => {
    batch.mockClear()
    list.mockClear()
})

describe("POST /api/log-feedback", () => {
    it("scores the answer's own trace, one score per answer", async () => {
        const res = await logFeedback(
            post({ feedback: "good", traceId: TRACE }),
        )
        expect(await res.json()).toEqual({ success: true, logged: true })
        expect(list).not.toHaveBeenCalled()
        expect(sentScore()).toMatchObject({
            id: "feedback-s1-m1",
            traceId: TRACE,
            value: 1,
        })
    })

    it("scores the session's latest trace for an answer without one", async () => {
        await logFeedback(post({ feedback: "bad" }))
        expect(sentScore()).toMatchObject({ traceId: "latest", value: 0 })
        expect(sentScore().metadata).toBeUndefined()
    })

    it("keeps the reasons and note of a thumbs down", async () => {
        await logFeedback(
            post({
                feedback: "bad",
                traceId: TRACE,
                reasons: ["wrong-diagram", "too-slow"],
                note: "  the arrows cross  ",
            }),
        )
        const score = sentScore()
        expect(score.id).toBe("feedback-s1-m1")
        expect(score.comment).toBe(
            "User gave bad feedback. Reasons: wrong-diagram, too-slow. Note: the arrows cross",
        )
        expect(score.metadata).toEqual({
            reasons: ["wrong-diagram", "too-slow"],
            note: "the arrows cross",
        })
    })

    it("refuses an unknown reason or a malformed trace id", async () => {
        const reason = await logFeedback(
            post({ feedback: "bad", reasons: ["ugly"] }),
        )
        expect(reason.status).toBe(400)
        const trace = await logFeedback(
            post({ feedback: "bad", traceId: "not-a-trace" }),
        )
        expect(trace.status).toBe(400)
        expect(batch).not.toHaveBeenCalled()
    })
})
