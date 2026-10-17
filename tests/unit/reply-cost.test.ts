import type { LanguageModelUsage } from "ai"
import { describe, expect, it } from "vitest"
import { addReplyUsage, type ReplyUsage } from "@/lib/chat-message"
import { estimateCost, getModelInfo } from "@/lib/model-catalog"

const usage = (
    input: number,
    output: number,
    cacheRead = 0,
    cacheWrite = 0,
): LanguageModelUsage => ({
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
    inputTokenDetails: {
        noCacheTokens: input - cacheRead - cacheWrite,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
    },
    outputTokenDetails: { textTokens: output, reasoningTokens: 0 },
})

describe("estimateCost", () => {
    const model = "claude-sonnet-4-5-20250929"

    it("prices cached input at the cache prices, and only there", () => {
        const { input, output, cacheRead, cacheWrite } =
            getModelInfo("anthropic", model)?.cost ?? {}
        if (!input || !output || !cacheRead || !cacheWrite) {
            throw new Error("the catalog lost Claude Sonnet 4.5's price")
        }
        // 1,500 input tokens: 1,000 read from the cache, 300 written to it
        expect(
            estimateCost("anthropic", model, usage(1500, 40, 1000, 300)),
        ).toBeCloseTo(
            (200 * input + 1000 * cacheRead + 300 * cacheWrite + 40 * output) /
                1_000_000,
            10,
        )
    })

    it("has no price for an unknown model or for Ollama", () => {
        expect(
            estimateCost("anthropic", "my-finetune", usage(10, 10)),
        ).toBeUndefined()
        expect(
            estimateCost("ollama", "deepseek-v4-flash", usage(10, 10)),
        ).toBeUndefined()
    })
})

describe("addReplyUsage", () => {
    it("adds the cost of each request of the turn", () => {
        const first = addReplyUsage(undefined, usage(100, 10), 1000, 0.01)
        const both = addReplyUsage(first, usage(100, 10), 1000, 0.02)
        expect(both?.costUsd).toBeCloseTo(0.03, 10)
    })

    it("drops the cost once a request of the turn had no price", () => {
        const before: ReplyUsage = {
            inputTokens: 100,
            outputTokens: 10,
            cacheReadTokens: 0,
            reasoningTokens: 0,
            durationMs: 1000,
        }
        expect(
            addReplyUsage(before, usage(100, 10), 1000, 0.02)?.costUsd,
        ).toBeUndefined()
        expect(
            addReplyUsage(
                { ...before, costUsd: 0.01 },
                usage(100, 10),
                1000,
                undefined,
            )?.costUsd,
        ).toBeUndefined()
    })
})
