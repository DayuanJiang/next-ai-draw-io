import { describe, expect, it } from "vitest"
import {
    DEFAULT_MAX_OUTPUT_TOKENS,
    parseOutputTokenLimit,
    resolveMaxOutputTokens,
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
})
