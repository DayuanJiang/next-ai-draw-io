// @vitest-environment node
import { generateText, type ModelMessage } from "ai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CACHE_POINT, getAIModel } from "@/lib/ai-providers"

const ENV = ["ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"]
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]))

afterEach(() => {
    for (const k of ENV) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
    }
    vi.unstubAllGlobals()
})

// The chat route marks its system messages like this
const messages: ModelMessage[] = [
    { role: "system", content: "Instructions", providerOptions: CACHE_POINT },
    { role: "user", content: "hi" },
]

/** Send the messages through a real provider and return the request body */
async function requestBody(
    provider: "anthropic" | "openrouter",
    reply: unknown,
) {
    let body: any
    vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
            body = JSON.parse(init.body as string)
            return new Response(JSON.stringify(reply), {
                headers: { "content-type": "application/json" },
            })
        }),
    )
    const { model } = getAIModel({
        provider,
        modelId:
            provider === "anthropic"
                ? "claude-sonnet-4-5"
                : "anthropic/claude-sonnet-4.5",
    })
    await generateText({ model, messages, maxRetries: 0 }).catch(() => {})
    return body
}

describe("prompt cache breakpoints", () => {
    it("reach the Anthropic API", async () => {
        process.env.ANTHROPIC_API_KEY = "test-key"
        const body = await requestBody("anthropic", {
            id: "msg_1",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "ok" }],
            stop_reason: "end_turn",
            usage: { input_tokens: 1, output_tokens: 1 },
        })
        expect(body.system).toEqual([
            {
                type: "text",
                text: "Instructions",
                cache_control: { type: "ephemeral" },
            },
        ])
    })

    it("reach OpenRouter", async () => {
        process.env.OPENROUTER_API_KEY = "test-key"
        const body = await requestBody("openrouter", {
            id: "gen-1",
            choices: [
                {
                    index: 0,
                    message: { role: "assistant", content: "ok" },
                    finish_reason: "stop",
                },
            ],
        })
        expect(JSON.stringify(body.messages[0])).toContain(
            '"cache_control":{"type":"ephemeral"}',
        )
    })
})
