import { describe, expect, it } from "vitest"
import {
    DEFAULT_MAX_OUTPUT_TOKENS,
    parseOutputTokenLimit,
    resolveMaxOutputTokens,
    withOutputTokenLimitFallback,
} from "@/lib/output-token-limit"

describe("parseOutputTokenLimit", () => {
    it("reads the ceiling from a Bedrock rejection", () => {
        const error = {
            message:
                "The maximum tokens you requested exceeds the model limit of 4096. Try again with a maximum tokens value that is lower than 4096.",
        }
        expect(parseOutputTokenLimit(error)).toBe(4096)
    })

    it("subtracts the input when the ceiling covers input plus output", () => {
        const error = {
            message:
                "This endpoint's maximum context length is 64000 tokens. However, you requested about 64025 tokens (25 of text input, 64000 in the output).",
        }
        // 64000 - 25 - 1024 margin
        expect(parseOutputTokenLimit(error)).toBe(62951)
    })

    it("reads the ceiling from an Anthropic rejection", () => {
        const error = {
            message:
                "max_tokens: 200000 > 64000, which is the maximum allowed number of output tokens for claude-sonnet-4-5",
        }
        expect(parseOutputTokenLimit(error)).toBe(64000)
    })

    it("reads the ceiling from an OpenAI rejection", () => {
        const error = {
            message:
                "max_tokens is too large: 64000. This model supports at most 16384 completion tokens",
        }
        expect(parseOutputTokenLimit(error)).toBe(16384)
    })

    it("looks in the response body too", () => {
        const error = {
            message: "Bad request",
            responseBody: '{"message":"exceeds the model limit of 10000."}',
        }
        expect(parseOutputTokenLimit(error)).toBe(10000)
    })

    it("returns null for unrelated errors", () => {
        expect(parseOutputTokenLimit({ message: "Invalid API key" })).toBeNull()
        expect(parseOutputTokenLimit(undefined)).toBeNull()
    })

    it("ignores a number that is not about tokens", () => {
        // An earlier draft matched "lower than N" generically, which turned any
        // message shaped like this into a bogus budget
        expect(
            parseOutputTokenLimit({
                message: "temperature must be lower than 2",
                statusCode: 400,
            }),
        ).toBeNull()
        expect(
            parseOutputTokenLimit({
                message: "reduce requests to lower than 60 per minute",
                statusCode: 429,
            }),
        ).toBeNull()
    })

    it("skips errors whose status is not a bad request", () => {
        const error = {
            message: "exceeds the model limit of 4096",
            statusCode: 429,
        }
        expect(parseOutputTokenLimit(error)).toBeNull()
    })

    it("rejects a ceiling too small to hold a diagram", () => {
        expect(
            parseOutputTokenLimit({ message: "model limit of 200" }),
        ).toBeNull()
        // Context ceiling that leaves almost nothing after the input
        expect(
            parseOutputTokenLimit({
                message:
                    "This endpoint's maximum context length is 64000 tokens. However, you requested about 128000 tokens (63500 of text input, 64000 in the output).",
            }),
        ).toBeNull()
    })

    it("returns null when the input alone fills the context", () => {
        const error = {
            message:
                "This endpoint's maximum context length is 1000 tokens. However, you requested about 65000 tokens (64000 of text input, 1000 in the output).",
        }
        expect(parseOutputTokenLimit(error)).toBeNull()
    })
})

describe("resolveMaxOutputTokens", () => {
    it("uses a valid header value", () => {
        expect(resolveMaxOutputTokens("32000")).toBe(32000)
    })

    it("falls back to the default for missing or bogus values", () => {
        expect(resolveMaxOutputTokens(null)).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
        expect(resolveMaxOutputTokens("")).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
        expect(resolveMaxOutputTokens("abc")).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
        expect(resolveMaxOutputTokens("0")).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
        expect(resolveMaxOutputTokens("-5")).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
        expect(resolveMaxOutputTokens("1.5")).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
        // Above the sanity ceiling, e.g. an extra zero
        expect(resolveMaxOutputTokens("640000")).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
    })

    it("uses the env value when no header is sent, and validates it too", () => {
        const original = process.env.MAX_OUTPUT_TOKENS
        try {
            process.env.MAX_OUTPUT_TOKENS = "24000"
            expect(resolveMaxOutputTokens(null)).toBe(24000)
            // Header still wins
            expect(resolveMaxOutputTokens("8000")).toBe(8000)

            process.env.MAX_OUTPUT_TOKENS = "-1"
            expect(resolveMaxOutputTokens(null)).toBe(DEFAULT_MAX_OUTPUT_TOKENS)
        } finally {
            if (original === undefined) delete process.env.MAX_OUTPUT_TOKENS
            else process.env.MAX_OUTPUT_TOKENS = original
        }
    })
})

/** Minimal stand-in for a v3 language model that records what it was asked for. */
function fakeModel(
    behaviors: Array<() => Promise<unknown>>,
): [any, Array<Record<string, unknown>>] {
    const calls: Array<Record<string, unknown>> = []
    let index = 0
    const model = {
        specificationVersion: "v3" as const,
        provider: "test",
        modelId: "test-model",
        supportedUrls: {},
        doGenerate: async () => {
            throw new Error("not used")
        },
        doStream: async (options: Record<string, unknown>) => {
            calls.push(options)
            const behavior = behaviors[index] ?? behaviors[behaviors.length - 1]
            index++
            return behavior()
        },
    }
    return [model, calls]
}

const STREAM_OK = { stream: new ReadableStream() }

describe("withOutputTokenLimitFallback", () => {
    it("retries once with the ceiling named in the rejection", async () => {
        const [model, calls] = fakeModel([
            () =>
                Promise.reject(
                    Object.assign(
                        new Error("exceeds the model limit of 4096"),
                        { statusCode: 400 },
                    ),
                ),
            () => Promise.resolve(STREAM_OK),
        ])

        const wrapped = withOutputTokenLimitFallback(model)
        await wrapped.doStream({ prompt: [], maxOutputTokens: 64000 } as any)

        expect(calls.map((c) => c.maxOutputTokens)).toEqual([64000, 4096])
    })

    it("does not retry an error it cannot attribute to the budget", async () => {
        const [model, calls] = fakeModel([
            () =>
                Promise.reject(
                    Object.assign(new Error("Invalid API key"), {
                        statusCode: 401,
                    }),
                ),
        ])

        const wrapped = withOutputTokenLimitFallback(model)
        await expect(
            wrapped.doStream({ prompt: [], maxOutputTokens: 64000 } as any),
        ).rejects.toThrow("Invalid API key")

        expect(calls).toHaveLength(1)
    })

    it("does not retry when the ceiling is not actually smaller", async () => {
        const [model, calls] = fakeModel([
            () =>
                Promise.reject(
                    Object.assign(
                        new Error("exceeds the model limit of 64000"),
                        { statusCode: 400 },
                    ),
                ),
        ])

        const wrapped = withOutputTokenLimitFallback(model)
        await expect(
            wrapped.doStream({ prompt: [], maxOutputTokens: 64000 } as any),
        ).rejects.toThrow()

        expect(calls).toHaveLength(1)
    })

    it("retries at most once, so a second rejection propagates", async () => {
        const [model, calls] = fakeModel([
            () =>
                Promise.reject(
                    Object.assign(
                        new Error("exceeds the model limit of 4096"),
                        { statusCode: 400 },
                    ),
                ),
            () =>
                Promise.reject(
                    Object.assign(
                        new Error("exceeds the model limit of 2048"),
                        { statusCode: 400 },
                    ),
                ),
        ])

        const wrapped = withOutputTokenLimitFallback(model)
        await expect(
            wrapped.doStream({ prompt: [], maxOutputTokens: 64000 } as any),
        ).rejects.toThrow("model limit of 2048")

        expect(calls).toHaveLength(2)
    })

    it("keeps the other call options when retrying", async () => {
        const [model, calls] = fakeModel([
            () =>
                Promise.reject(
                    Object.assign(
                        new Error("exceeds the model limit of 4096"),
                        { statusCode: 400 },
                    ),
                ),
            () => Promise.resolve(STREAM_OK),
        ])

        const wrapped = withOutputTokenLimitFallback(model)
        await wrapped.doStream({
            prompt: [],
            maxOutputTokens: 64000,
            temperature: 0.4,
            providerOptions: {
                bedrock: { reasoningConfig: { type: "enabled" } },
            },
        } as any)

        expect(calls[1].temperature).toBe(0.4)
        expect(calls[1].providerOptions).toEqual({
            bedrock: { reasoningConfig: { type: "enabled" } },
        })
    })
})
