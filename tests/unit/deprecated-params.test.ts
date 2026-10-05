// @vitest-environment node
import { simulateReadableStream, streamText } from "ai"
import { MockLanguageModelV3 } from "ai/test"
import { describe, expect, it } from "vitest"
import {
    withDeprecatedParamsFallback,
    withoutDeprecatedParams,
} from "@/lib/deprecated-params"

// The error texts Claude 4.7 and later return (the Anthropic API and Bedrock)
const rejection = (message: string) => ({
    statusCode: 400,
    message,
    responseBody: JSON.stringify({ error: { message } }),
})
const TEMPERATURE = rejection("`temperature` is deprecated for this model.")
const THINKING = rejection(
    '"thinking.type.enabled" is not supported for this model. Use "thinking.type.adaptive" and "output_config.effort" to control thinking behavior.',
)

describe("withoutDeprecatedParams", () => {
    const params = {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 1000,
        providerOptions: {
            anthropic: {
                thinking: { type: "enabled", budgetTokens: 4000 },
                cacheControl: { type: "ephemeral" },
            },
        },
    }

    // Measured on Bedrock: Opus 4.7, 4.8 and every Claude 5 model accept
    // adaptive thinking, and return its text only with display "summarized"
    const ADAPTIVE = { type: "adaptive", display: "summarized" }

    it("drops sampling settings and switches to adaptive thinking", () => {
        for (const error of [TEMPERATURE, THINKING]) {
            expect(withoutDeprecatedParams(error, params)).toEqual({
                maxOutputTokens: 1000,
                providerOptions: {
                    anthropic: {
                        thinking: ADAPTIVE,
                        cacheControl: { type: "ephemeral" },
                    },
                },
            })
        }
    })

    it("switches a Bedrock thinking budget to adaptive thinking", () => {
        const bedrock = {
            providerOptions: {
                bedrock: {
                    reasoningConfig: { type: "enabled", budgetTokens: 4000 },
                },
            },
        }
        expect(withoutDeprecatedParams(THINKING, bedrock)).toEqual({
            providerOptions: { bedrock: { reasoningConfig: ADAPTIVE } },
        })
    })

    it("leaves other errors and requests with nothing to drop alone", () => {
        expect(withoutDeprecatedParams(rejection("bad key"), params)).toBeNull()
        expect(
            withoutDeprecatedParams(
                { ...TEMPERATURE, statusCode: 401 },
                params,
            ),
        ).toBeNull()
        const nothingToDrop = {
            providerOptions: {
                anthropic: { cacheControl: { type: "ephemeral" } },
            },
        }
        expect(withoutDeprecatedParams(TEMPERATURE, nothingToDrop)).toBeNull()
    })
})

describe("withDeprecatedParamsFallback", () => {
    it("retries the stream once without the rejected settings", async () => {
        const calls: any[] = []
        const model = new MockLanguageModelV3({
            // The test stream only has the parts this check needs
            doStream: (async (options: any) => {
                calls.push(options)
                if (options.temperature !== undefined) throw TEMPERATURE
                return {
                    stream: simulateReadableStream({
                        chunks: [
                            { type: "text-start", id: "t" },
                            { type: "text-delta", id: "t", delta: "ok" },
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
        })
        const result = streamText({
            model: withDeprecatedParamsFallback(model as any),
            prompt: "hi",
            temperature: 0.2,
            maxRetries: 0,
        })
        expect(await result.text).toBe("ok")
        expect(calls).toHaveLength(2)
        expect(calls[1].temperature).toBeUndefined()
    })
})
