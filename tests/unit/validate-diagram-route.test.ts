// @vitest-environment node
import { MockLanguageModelV3 } from "ai/test"
import { afterEach, describe, expect, it, vi } from "vitest"
import { POST as validateDiagram } from "@/app/api/validate-diagram/route"

const RESULT = {
    valid: false,
    issues: [
        {
            type: "overlap",
            severity: "critical",
            description: "Box A covers box B",
        },
    ],
    suggestions: ["Move box B to the right"],
}

// A vision model that answers with the result as JSON text; told to wait,
// it answers only once its call is aborted
const model = vi.hoisted(() => ({ waitForAbort: false }))
vi.mock("@/lib/ai-providers", () => ({
    getValidationModel: () =>
        new MockLanguageModelV3({
            doGenerate: (async (options: { abortSignal?: AbortSignal }) => {
                if (model.waitForAbort) {
                    const signal = options.abortSignal
                    await new Promise((_, reject) => {
                        if (signal?.aborted) reject(signal.reason)
                        signal?.addEventListener("abort", () =>
                            reject(signal.reason),
                        )
                    })
                }
                return {
                    content: [{ type: "text", text: JSON.stringify(RESULT) }],
                    finishReason: { unified: "stop", raw: "stop" },
                    usage: {
                        inputTokens: { total: 1 },
                        outputTokens: { total: 1 },
                    },
                    warnings: [],
                }
            }) as any,
        }),
}))

// The quota, off unless a test turns it on
const quota = vi.hoisted(() => ({
    enabled: false,
    allowed: true,
    checks: [] as Array<{ limits: any; increment?: number }>,
    recorded: [] as number[],
}))
vi.mock("@/lib/dynamo-quota-manager", () => ({
    isQuotaEnabled: () => quota.enabled,
    checkAndIncrementRequest: async (
        _ip: string,
        limits: unknown,
        increment?: number,
    ) => {
        quota.checks.push({ limits, increment })
        return quota.allowed
            ? { allowed: true }
            : {
                  allowed: false,
                  type: "token",
                  error: "Daily token limit exceeded",
                  used: 10,
                  limit: 10,
              }
    },
    recordTokenUsage: async (_ip: string, tokens: number) => {
        quota.recorded.push(tokens)
    },
}))

const post = (signal?: AbortSignal) =>
    new Request("http://localhost/api/validate-diagram", {
        method: "POST",
        signal,
        headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "203.0.113.7",
        },
        body: JSON.stringify({ imageData: "data:image/png;base64,AAAA" }),
    })

afterEach(() => {
    model.waitForAbort = false
    quota.enabled = false
    quota.allowed = true
    quota.checks = []
    quota.recorded = []
})

describe("the quota", () => {
    it("refuses a check once the daily tokens are used up", async () => {
        quota.enabled = true
        quota.allowed = false
        const res = await validateDiagram(post())
        expect(res.status).toBe(429)
    })

    it("applies the token limits only, and records the tokens", async () => {
        // The request limit is for chats: the day's last chat must still
        // get its check, and the check does not count as a chat
        quota.enabled = true
        const res = await validateDiagram(post())
        expect(await res.json()).toEqual(RESULT)
        expect(quota.checks).toHaveLength(1)
        expect(quota.checks[0].increment).toBe(0)
        expect(quota.checks[0].limits.requests).toBe(0)
        expect(quota.recorded).toEqual([2])
    })
})

describe("POST /api/validate-diagram", () => {
    it("answers the model's result as JSON", async () => {
        const res = await validateDiagram(post())
        expect(res.headers.get("content-type")).toContain("application/json")
        expect(await res.json()).toEqual(RESULT)
    })

    it("ends its model call when the request is aborted", async () => {
        // The user pressed Stop: the browser aborts the request, and the
        // model call must not run on (and be paid for)
        model.waitForAbort = true
        const stop = new AbortController()
        const pending = validateDiagram(post(stop.signal))
        stop.abort()
        expect(await (await pending).json()).toEqual({
            valid: true,
            issues: [],
            suggestions: [],
        })
    })

    it("answers valid when the check is turned off", async () => {
        vi.stubEnv("ENABLE_VLM_VALIDATION", "false")
        const res = await validateDiagram(post())
        expect(await res.json()).toEqual({
            valid: true,
            issues: [],
            suggestions: [],
        })
    })
})
