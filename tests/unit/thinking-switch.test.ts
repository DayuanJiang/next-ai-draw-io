// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ChatUIMessage } from "@/lib/chat-message"

vi.mock("@/lib/dynamo-quota-manager", () => ({
    isQuotaEnabled: () => false,
    checkAndIncrementRequest: async () => ({ allowed: true }),
    recordTokenUsage: async () => {},
}))

// No DNS in tests: only loopback addresses are private
vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async (url: string) =>
        /^https?:\/\/(127\.0\.0\.1|localhost)\b/.test(url),
}))

import { POST as chat } from "@/app/api/chat/route"
import { applyThinkingSwitch } from "@/lib/ai-providers"
import { thinkingSwitchOf } from "@/lib/thinking-capabilities"

afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
})

describe("thinkingSwitchOf", () => {
    it.each([
        ["openai", "gpt-5.1", "effort"],
        ["openai", "gpt-5.4-mini", "effort"],
        ["azure", "gpt-5.5", "effort"],
        ["openai", "gpt-6-sol", "effort"],
        ["anthropic", "claude-3-7-sonnet-20250219", "budget"],
        ["anthropic", "claude-sonnet-4-20250514", "budget"],
        ["anthropic", "claude-haiku-4-5-20251001", "budget"],
        ["anthropic", "claude-opus-4-6", "adaptive"],
        ["anthropic", "claude-sonnet-5", "adaptive"],
        ["bedrock", "us.anthropic.claude-haiku-5-5", "adaptive"],
        ["bedrock", "us.anthropic.claude-sonnet-4-5-20250929-v1:0", "budget"],
        ["bedrock", "global.anthropic.claude-opus-4-6-v1", "adaptive"],
        ["bedrock", "us.amazon.nova-2-lite-v1:0", "nova"],
        ["google", "gemini-2.5-flash-lite", "gemini"],
        ["vertexai", "gemini-2.5-flash", "gemini"],
        ["deepseek", "deepseek-v4-flash", "deepseek"],
        ["deepseek", "deepseek-flash", "deepseek"],
    ] as const)("%s %s: %s", (provider, modelId, kind) => {
        expect(thinkingSwitchOf(provider, modelId)).toBe(kind)
    })

    // Models whose API cannot turn thinking off, or that never think
    it.each([
        ["openai", "gpt-5"],
        ["openai", "gpt-5.2-pro"],
        ["openai", "gpt-5.3-codex"],
        ["openai", "o3"],
        ["openai", "gpt-6-astra"],
        ["anthropic", "claude-opus-5-5"],
        ["anthropic", "claude-sonnet-5-5"],
        ["anthropic", "claude-fable-5-1"],
        ["anthropic", "claude-3-5-sonnet-20241022"],
        ["google", "gemini-2.5-pro"],
        ["google", "gemini-3-pro-preview"],
        ["vertexai", "gemini-2.5-flash-image"],
        ["bedrock", "amazon.nova-pro-v1:0"],
        ["openrouter", "anthropic/claude-sonnet-4.5"],
    ] as const)("%s %s: none", (provider, modelId) => {
        expect(thinkingSwitchOf(provider, modelId)).toBeUndefined()
    })
})

describe("applyThinkingSwitch", () => {
    it("sets OpenAI's effort to none and drops the summary when off", () => {
        const env = { openai: { reasoningSummary: "auto" } }
        expect(applyThinkingSwitch(env, "openai", "gpt-5.1", false)).toEqual({
            openai: { reasoningEffort: "none" },
        })
        expect(applyThinkingSwitch(env, "openai", "gpt-5.1", true)).toEqual({
            openai: { reasoningSummary: "auto", reasoningEffort: "medium" },
        })
    })

    it("takes only the budget from the environment's config", () => {
        // ANTHROPIC_THINKING_TYPE=disabled with a budget
        expect(
            applyThinkingSwitch(
                {
                    anthropic: {
                        thinking: { type: "disabled", budgetTokens: 2048 },
                    },
                },
                "anthropic",
                "claude-sonnet-4-5-20250929",
                true,
            ),
        ).toEqual({
            anthropic: { thinking: { type: "enabled", budgetTokens: 2048 } },
        })
    })

    it("keeps the environment's Claude budget when on, and says off explicitly", () => {
        const env = {
            anthropic: { thinking: { type: "enabled", budgetTokens: 4000 } },
        }
        for (const model of ["claude-sonnet-4-5-20250929", "claude-opus-4-6"]) {
            expect(applyThinkingSwitch(env, "anthropic", model, true)).toEqual(
                env,
            )
            // Claude Sonnet 5 and Opus 5 think unless told not to
            expect(applyThinkingSwitch(env, "anthropic", model, false)).toEqual(
                { anthropic: { thinking: { type: "disabled" } } },
            )
        }
        expect(
            applyThinkingSwitch(
                undefined,
                "anthropic",
                "claude-sonnet-4-5-20250929",
                true,
            ),
        ).toEqual({
            anthropic: { thinking: { type: "enabled", budgetTokens: 1024 } },
        })
    })

    // BEDROCK_REASONING_EFFORT alone (for Nova) gives Claude a config
    // without a budget, which would not think at all
    it("gives Claude a budget when the environment's config has none", () => {
        expect(
            applyThinkingSwitch(
                { bedrock: { reasoningConfig: { type: "enabled" } } },
                "bedrock",
                "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
                true,
            ),
        ).toEqual({
            bedrock: {
                reasoningConfig: { type: "enabled", budgetTokens: 1024 },
            },
        })
    })

    it("asks newer Claude models for adaptive thinking", () => {
        expect(
            applyThinkingSwitch(
                undefined,
                "anthropic",
                "claude-opus-4-6",
                true,
            ),
        ).toEqual({
            anthropic: {
                thinking: { type: "adaptive", display: "summarized" },
            },
        })
    })

    it("keeps Bedrock's beta header while switching Claude's reasoning", () => {
        const beta = {
            anthropicBeta: ["fine-grained-tool-streaming-2025-05-14"],
        }
        const model = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
        expect(
            applyThinkingSwitch({ bedrock: beta }, "bedrock", model, true),
        ).toEqual({
            bedrock: {
                ...beta,
                reasoningConfig: { type: "enabled", budgetTokens: 1024 },
            },
        })
        expect(
            applyThinkingSwitch(
                {
                    bedrock: {
                        ...beta,
                        reasoningConfig: {
                            type: "enabled",
                            budgetTokens: 2048,
                        },
                    },
                },
                "bedrock",
                model,
                false,
            ),
        ).toEqual({
            bedrock: {
                ...beta,
                additionalModelRequestFields: {
                    thinking: { type: "disabled" },
                },
            },
        })
    })

    it("turns Gemini 2.5 Flash's thinking off with a zero budget", () => {
        const env = { google: { thinkingConfig: { includeThoughts: true } } }
        expect(
            applyThinkingSwitch(env, "google", "gemini-2.5-flash", false),
        ).toEqual({ google: { thinkingConfig: { thinkingBudget: 0 } } })
        // Flash-Lite thinks only with a budget: -1 lets it pick one
        expect(
            applyThinkingSwitch(env, "google", "gemini-2.5-flash-lite", true),
        ).toEqual({
            google: {
                thinkingConfig: { includeThoughts: true, thinkingBudget: -1 },
            },
        })
    })

    it("uses Nova 2's own reasoning switch", () => {
        const model = "us.amazon.nova-2-lite-v1:0"
        expect(applyThinkingSwitch(undefined, "bedrock", model, false)).toEqual(
            {
                bedrock: { reasoningConfig: { type: "disabled" } },
            },
        )
        expect(applyThinkingSwitch(undefined, "bedrock", model, true)).toEqual({
            bedrock: {
                reasoningConfig: {
                    type: "enabled",
                    maxReasoningEffort: "medium",
                },
            },
        })
    })

    it("leaves a model without a switch as it was", () => {
        const env = { openai: { reasoningSummary: "auto" } }
        expect(applyThinkingSwitch(env, "openai", "gpt-5", false)).toBe(env)
    })
})

describe("the chat route", () => {
    const user: ChatUIMessage = {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "Draw two boxes" }],
    }

    // The body the route sent to DeepSeek
    const sentBody = async (headers: Record<string, string>) => {
        let body: any
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init: RequestInit) => {
                body = JSON.parse(init.body as string)
                return new Response("data: [DONE]\n\n", {
                    headers: { "content-type": "text/event-stream" },
                })
            }),
        )
        const res = await chat(
            new Request("http://localhost/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ messages: [user], xml: "" }),
            }),
        )
        await res.text()
        return body
    }

    it("sends the switch for the user's own key", async () => {
        const body = await sentBody({
            "x-ai-provider": "deepseek",
            "x-ai-base-url": "https://api.deepseek.example/v1",
            "x-ai-api-key": "user-key",
            "x-ai-model": "deepseek-v4-flash",
            "x-ai-thinking-enabled": "false",
        })
        expect(body.thinking).toEqual({ type: "disabled" })
    })

    it("ignores it on the server's key", async () => {
        vi.stubEnv("AI_PROVIDER", "deepseek")
        vi.stubEnv("AI_MODEL", "deepseek-v4-flash")
        vi.stubEnv("DEEPSEEK_API_KEY", "server-key")
        vi.stubEnv("DEEPSEEK_BASE_URL", "http://127.0.0.1:9000/v1")
        const body = await sentBody({ "x-ai-thinking-enabled": "false" })
        expect(body.model).toBe("deepseek-v4-flash")
        expect(body.thinking).toBeUndefined()
    })

    it("ignores it on an endpoint of the server's network", async () => {
        const body = await sentBody({
            "x-ai-provider": "deepseek",
            "x-ai-base-url": "http://127.0.0.1:9000/v1",
            "x-ai-api-key": "dummy",
            "x-ai-model": "deepseek-v4-flash",
            "x-ai-thinking-enabled": "false",
        })
        expect(body.model).toBe("deepseek-v4-flash")
        expect(body.thinking).toBeUndefined()
    })
})
