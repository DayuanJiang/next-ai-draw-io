// @vitest-environment node
import { simulateReadableStream } from "ai"
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

// A vision model that answers with the JSON in a few text chunks
vi.mock("@/lib/ai-providers", () => ({
    getValidationModel: () =>
        new MockLanguageModelV3({
            doStream: (async () => {
                const json = JSON.stringify(RESULT)
                return {
                    stream: simulateReadableStream({
                        chunks: [
                            { type: "text-start", id: "t" },
                            ...[json.slice(0, 20), json.slice(20)].map(
                                (delta) => ({
                                    type: "text-delta",
                                    id: "t",
                                    delta,
                                }),
                            ),
                            { type: "text-end", id: "t" },
                            {
                                type: "finish",
                                finishReason: { unified: "stop", raw: "stop" },
                                usage: {
                                    inputTokens: { total: 1 },
                                    outputTokens: { total: 1 },
                                },
                            },
                        ],
                    }),
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

const post = () =>
    new Request("http://localhost/api/validate-diagram", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "203.0.113.7",
        },
        body: JSON.stringify({ imageData: "data:image/png;base64,AAAA" }),
    })

afterEach(() => {
    delete process.env.ENABLE_VLM_VALIDATION
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
        expect(JSON.parse(await res.text())).toEqual(RESULT)
        expect(quota.checks).toHaveLength(1)
        expect(quota.checks[0].increment).toBe(0)
        expect(quota.checks[0].limits.requests).toBe(0)
        await vi.waitFor(() => expect(quota.recorded).toEqual([2]))
    })
})

describe("POST /api/validate-diagram", () => {
    it("streams the model's result as JSON text for useObject", async () => {
        const res = await validateDiagram(post())
        expect(JSON.parse(await res.text())).toEqual(RESULT)
    })

    it("answers valid when the check is turned off", async () => {
        process.env.ENABLE_VLM_VALIDATION = "false"
        const res = await validateDiagram(post())
        expect(JSON.parse(await res.text())).toEqual({
            valid: true,
            issues: [],
            suggestions: [],
        })
    })
})
