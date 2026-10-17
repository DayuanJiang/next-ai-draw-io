import type { LanguageModelUsage } from "ai"
import { describe, expect, it, vi } from "vitest"
import { addReplyUsage, type ReplyUsage } from "@/lib/chat-message"
import { estimateCost } from "@/lib/model-catalog"

// A small catalog with made-up prices, so a refresh of the real one does
// not change these tests
vi.mock("@/lib/model-catalog.json", () => {
    const info = { tools: true, images: false, reasoning: true }
    return {
        default: {
            anthropic: {
                "claude-sonnet-4-5": {
                    ...info,
                    cost: {
                        input: 3,
                        output: 15,
                        cacheRead: 0.3,
                        cacheWrite: 4,
                    },
                },
            },
            openai: { "gpt-4.1": { ...info, cost: { input: 2, output: 8 } } },
            azure: { "gpt-5": { ...info, cost: { input: 1, output: 10 } } },
            doubao: {
                "doubao-seed": {
                    ...info,
                    cost: {
                        input: 1,
                        output: 2,
                        tiers: [
                            { above: 32000, input: 2, output: 4 },
                            { above: 128000, input: 3, output: 6 },
                        ],
                    },
                },
            },
            qwen: {
                "qwen-plus": {
                    ...info,
                    cost: { input: 1, output: 2, reasoning: 8 },
                },
            },
            openrouter: {
                "perplexity/sonar-deep-research": {
                    ...info,
                    cost: { input: 2, output: 8, reasoning: 3 },
                },
            },
            ollama: { "gpt-oss": { ...info, cost: { input: 1, output: 1 } } },
        },
    }
})

const usage = (
    input: number,
    output: number,
    { cacheRead = 0, cacheWrite = 0, reasoning = 0 } = {},
): LanguageModelUsage => ({
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
    inputTokenDetails: {
        noCacheTokens: input - cacheRead - cacheWrite,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
    },
    outputTokenDetails: {
        textTokens: output - reasoning,
        reasoningTokens: reasoning,
    },
})

describe("estimateCost", () => {
    it("prices cached input at the cache prices, and only there", () => {
        // 1,500 input tokens: 1,000 read from the cache, 300 written to it;
        // the date after the id still finds the model's price
        expect(
            estimateCost(
                "anthropic",
                "claude-sonnet-4-5-20250929",
                usage(1500, 40, { cacheRead: 1000, cacheWrite: 300 }),
            ),
        ).toBeCloseTo((200 * 3 + 1000 * 0.3 + 300 * 4 + 40 * 15) / 1e6, 12)
    })

    it("does not take a sibling model's price", () => {
        expect(
            estimateCost("openai", "gpt-4.1-nano", usage(1000, 100)),
        ).toBeUndefined()
        // A version number is not a date: gpt-4.1-4 is not gpt-4.1
        expect(
            estimateCost("openai", "gpt-4.1-4", usage(1000, 100)),
        ).toBeUndefined()
        // An Azure deployment name says nothing about the model behind it,
        // unless it is the model's name
        expect(
            estimateCost("azure", "gpt-5-2025-08-07", usage(1000, 100)),
        ).toBeUndefined()
        expect(estimateCost("azure", "gpt-5", usage(1000, 100))).toBeCloseTo(
            (1000 * 1 + 100 * 10) / 1e6,
            12,
        )
    })

    it("uses the price tier of the prompt's size", () => {
        expect(
            estimateCost("doubao", "doubao-seed", usage(40000, 1000)),
        ).toBeCloseTo((40000 * 2 + 1000 * 4) / 1e6, 12)
        expect(
            estimateCost("doubao", "doubao-seed", usage(20000, 1000)),
        ).toBeCloseTo((20000 * 1 + 1000 * 2) / 1e6, 12)
    })

    it("prices the thinking tokens at their own price", () => {
        expect(
            estimateCost(
                "openrouter",
                "perplexity/sonar-deep-research",
                usage(1000, 1000, { reasoning: 800 }),
            ),
        ).toBeCloseTo((1000 * 2 + 200 * 8 + 800 * 3) / 1e6, 12)
    })

    // Qwen's own API bills thinking mode's whole output at the higher price
    it("prices a Qwen answer that thought at the thinking price, all of it", () => {
        expect(
            estimateCost(
                "qwen",
                "qwen-plus",
                usage(1000, 1000, { reasoning: 800 }),
            ),
        ).toBeCloseTo((1000 * 1 + 1000 * 8) / 1e6, 12)
        expect(
            estimateCost("qwen", "qwen-plus", usage(1000, 1000)),
        ).toBeCloseTo((1000 * 1 + 1000 * 2) / 1e6, 12)
    })

    it("has no price for an unknown model or for Ollama", () => {
        expect(
            estimateCost("anthropic", "my-finetune", usage(10, 10)),
        ).toBeUndefined()
        expect(estimateCost("ollama", "gpt-oss", usage(10, 10))).toBeUndefined()
    })
})

describe("addReplyUsage", () => {
    const before: ReplyUsage = {
        inputTokens: 100,
        outputTokens: 10,
        cacheReadTokens: 0,
        reasoningTokens: 0,
        durationMs: 1000,
    }

    it("adds the cost of each request of the turn", () => {
        const first = addReplyUsage(undefined, usage(100, 10), 1000, 0.01)
        const both = addReplyUsage(first, usage(100, 10), 1000, 0.02)
        expect(both?.costUsd).toBeCloseTo(0.03, 12)
    })

    // Null, not left out: the chat merges metadata and would keep the old cost
    it("marks the cost unknown once a request of the turn had no price", () => {
        expect(
            addReplyUsage(
                { ...before, costUsd: 0.01 },
                usage(100, 10),
                1000,
                undefined,
            )?.costUsd,
        ).toBeNull()
        expect(
            addReplyUsage(
                { ...before, costUsd: null },
                usage(100, 10),
                1000,
                0.02,
            )?.costUsd,
        ).toBeNull()
        // A request that reported no usage
        const none = {
            ...usage(0, 0),
            inputTokens: undefined,
            outputTokens: undefined,
        }
        expect(
            addReplyUsage({ ...before, costUsd: 0.01 }, none, 1000, undefined),
        ).toEqual({ ...before, costUsd: null })
        // Saved before costs were kept
        expect(
            addReplyUsage(before, usage(100, 10), 1000, 0.02)?.costUsd,
        ).toBeNull()
    })
})
