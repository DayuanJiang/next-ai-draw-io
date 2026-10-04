// @vitest-environment node
import { APICallError, InvalidToolInputError, RetryError } from "ai"
import { describe, expect, it } from "vitest"
import { classifyLLMError, isToolCallError } from "@/lib/llm-errors"

const apiError = (statusCode: number, message: string, responseBody = "") =>
    new APICallError({
        message,
        url: "https://api.example.com/v1/chat/completions",
        requestBodyValues: {},
        statusCode,
        responseBody,
    })

describe("classifyLLMError", () => {
    it("reads the status code, not the message", () => {
        // Providers rarely put the number in their message
        expect(
            classifyLLMError(apiError(401, "Authentication Fails")).code,
        ).toBe("invalid_api_key")
        expect(classifyLLMError(apiError(404, "Unknown")).code).toBe(
            "model_not_found",
        )
        expect(classifyLLMError(apiError(503, "busy")).code).toBe(
            "provider_unavailable",
        )
    })

    it("lets a specific text win over the status code", () => {
        expect(
            classifyLLMError(
                apiError(429, "You exceeded your current quota, check billing"),
            ).code,
        ).toBe("insufficient_quota")
        expect(
            classifyLLMError(
                apiError(400, "This model's maximum context length is 128000"),
            ).code,
        ).toBe("context_too_long")
        expect(
            classifyLLMError(
                apiError(400, "bad", '{"message":"toolUse.input is invalid"}'),
            ).code,
        ).toBe("output_truncated")
    })

    it("does not call a 403 an invalid key", () => {
        expect(classifyLLMError(apiError(403, "Forbidden")).code).toBe(
            "forbidden",
        )
    })

    it("uses the last attempt after retries", () => {
        const retry = new RetryError({
            message: "Failed after 3 attempts",
            reason: "maxRetriesExceeded",
            errors: [apiError(500, "x"), apiError(429, "slow down")],
        })
        expect(classifyLLMError(retry).code).toBe("rate_limited")
    })

    it("keeps the message but hides secrets in it", () => {
        const { code, message } = classifyLLMError(
            apiError(
                401,
                "Incorrect API key provided: sk-proj-abcdefghijklmnop. Header Bearer abc.def",
            ),
        )
        expect(code).toBe("invalid_api_key")
        expect(message).toContain("Incorrect API key provided")
        expect(message).not.toContain("abcdefghijklmnop")
        expect(message).not.toContain("abc.def")
    })

    it("leaves our own messages readable", () => {
        // This one used to be replaced by "Authentication failed" for
        // containing the word key
        const { message } = classifyLLMError(
            new Error(
                "API key is required when using a custom base URL. Please provide your own API key in Settings.",
            ),
        )
        expect(message).toContain("API key is required when using a custom")
    })

    it("names a timeout", () => {
        const timeout = new Error("The operation was aborted due to timeout")
        timeout.name = "TimeoutError"
        expect(classifyLLMError(timeout).code).toBe("timeout")
    })
})

describe("isToolCallError", () => {
    it("spots errors the model must see unchanged", () => {
        const invalid = new InvalidToolInputError({
            toolName: "display_diagram",
            toolInput: "{",
            cause: new Error("bad JSON"),
        })
        expect(isToolCallError(invalid)).toBe(true)
        expect(isToolCallError(apiError(500, "x"))).toBe(false)
    })
})
