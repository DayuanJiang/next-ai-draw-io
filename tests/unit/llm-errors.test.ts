// @vitest-environment node
import {
    APICallError,
    InvalidToolInputError,
    RetryError,
    simulateReadableStream,
    streamText,
    tool,
} from "ai"
import { MockLanguageModelV3 } from "ai/test"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
    classifyLLMError,
    isToolCallError,
    streamErrorText,
} from "@/lib/llm-errors"

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

    it("points to the model id when Bedrock wants an inference profile", () => {
        const error = apiError(
            400,
            "Invocation of model ID anthropic.claude-sonnet-5-5 with on-demand throughput isn’t supported. Retry your request with the ID or ARN of an inference profile that contains this model.",
        )
        expect(classifyLLMError(error).code).toBe("model_not_found")
    })

    it("reads Bedrock's token throttling as a rate limit", () => {
        const error = apiError(
            429,
            "Too many tokens, please wait before trying again.",
        )
        expect(classifyLLMError(error).code).toBe("rate_limited")
    })

    it("names a network error the SDK wrapped", () => {
        const error = new APICallError({
            message:
                "Cannot connect to API: Connect Timeout Error (attempted address: api.example.com:443, timeout: 10000ms)",
            url: "https://api.example.com/v1/chat/completions",
            requestBodyValues: {},
        })
        expect(classifyLLMError(error).code).toBe("cannot_connect")
    })

    it("reads an error object sent in the stream", () => {
        // OpenRouter, when the upstream provider is overloaded
        const error = {
            code: 503,
            message:
                "Upstream error from Nvidia: Service temporarily overloaded",
            metadata: { error_type: "provider_overloaded" },
        }
        expect(classifyLLMError(error)).toEqual({
            type: "provider",
            code: "provider_unavailable",
            message:
                "Upstream error from Nvidia: Service temporarily overloaded",
        })
    })

    it("adds the reason from a problem+json body", () => {
        // NVIDIA, for a retired model; the SDK's message is only "Gone"
        const body = JSON.stringify({
            title: "Gone",
            status: 410,
            detail: "The model 'deepseek-v4-flash' has reached its end of life",
        })
        expect(classifyLLMError(apiError(410, "Gone", body))).toEqual({
            type: "provider",
            code: "model_not_found",
            message:
                "Gone: The model 'deepseek-v4-flash' has reached its end of life",
        })
    })
})

describe("streamErrorText", () => {
    it("keeps the text of a tool call the model got wrong", async () => {
        // Seen with Claude Opus 5.5: a quote left unescaped in the input
        const model = new MockLanguageModelV3({
            doStream: (async () => ({
                stream: simulateReadableStream({
                    chunks: [
                        {
                            type: "tool-call",
                            toolCallId: "c1",
                            toolName: "edit_diagram",
                            input: '{"operations": [{"new_xml": "as="x""}]}',
                        },
                        {
                            type: "finish",
                            finishReason: {
                                unified: "tool-calls",
                                raw: "tool_use",
                            },
                            usage: {
                                inputTokens: { total: 1 },
                                outputTokens: { total: 1 },
                            },
                        },
                    ],
                }),
            })) as any,
        })
        const result = streamText({
            model: model as any,
            prompt: "edit",
            tools: {
                edit_diagram: tool({
                    inputSchema: z.object({ operations: z.array(z.any()) }),
                }),
            },
        })
        const errors: string[] = []
        for await (const chunk of result.toUIMessageStream({
            onError: streamErrorText,
        })) {
            if ("errorText" in chunk) errors.push(chunk.errorText)
        }
        expect(errors.length).toBeGreaterThan(0)
        for (const text of errors) {
            expect(text).toMatch(/^Invalid input for tool edit_diagram/)
        }
    })

    it("hides the provider's text on the server's keys", () => {
        const error = apiError(
            403,
            "User: arn:aws:sts::123456789012:assumed-role/app/s is not authorized to perform: bedrock:InvokeModel",
        )
        const hidden = JSON.parse(streamErrorText(error, true))
        expect(hidden.message).not.toMatch(/arn:aws|123456789012/)
        expect(JSON.parse(streamErrorText(error)).message).toMatch(
            /not authorized/,
        )
        const throttled = JSON.parse(
            streamErrorText(apiError(429, "Too many tokens"), true),
        )
        expect(throttled).toEqual({
            type: "provider",
            code: "rate_limited",
            message: "The provider returned an error.",
        })
    })

    it("names a 403 on the server's keys, e.g. a spend cap blocked them", () => {
        const error = apiError(403, "explicit deny in an identity-based policy")
        expect(JSON.parse(streamErrorText(error, true))).toEqual({
            type: "provider",
            code: "server_key_forbidden",
            message: "",
        })
        // On the user's own key it stays a plain refusal
        expect(JSON.parse(streamErrorText(error)).code).toBe("forbidden")
    })

    it("classifies a provider error", () => {
        expect(JSON.parse(streamErrorText(apiError(401, "bad key")))).toEqual({
            type: "provider",
            code: "invalid_api_key",
            message: "bad key",
        })
    })

    it("classifies a provider error sent as plain text", () => {
        // DeepSeek's SDK sends errors in the stream as a string
        const text = "Insufficient Balance for account 42"
        expect(JSON.parse(streamErrorText(text))).toEqual({
            type: "provider",
            code: "insufficient_quota",
            message: text,
        })
        expect(JSON.parse(streamErrorText(text, true)).message).not.toMatch(
            /account 42/,
        )
    })

    it("classifies Bedrock's throttling sent in the stream", () => {
        // Bedrock's ThrottlingException as a plain object, not an API error
        const throttled = {
            message: "Too many tokens, please wait before trying again.",
        }
        expect(JSON.parse(streamErrorText(throttled)).code).toBe("rate_limited")
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
