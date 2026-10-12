// @vitest-environment node
import { generateText } from "ai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getAIModel } from "@/lib/ai-providers"

afterEach(() => {
    vi.unstubAllGlobals()
})

/** Send one request through the real Google provider and return its body */
async function googleRequestBody(modelId = "gemini-2.5-flash") {
    let body: any
    vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
            body = JSON.parse(init.body as string)
            return new Response(
                JSON.stringify({
                    candidates: [
                        {
                            content: { role: "model", parts: [{ text: "ok" }] },
                            finishReason: "STOP",
                        },
                    ],
                }),
                { headers: { "content-type": "application/json" } },
            )
        }),
    )
    // providerOptions carry the thinking settings, as the chat route passes them
    const { model, providerOptions } = getAIModel({
        provider: "google",
        modelId,
    })
    await generateText({
        model,
        prompt: "hi",
        maxRetries: 0,
        ...(providerOptions && { providerOptions }),
    })
    return body
}

describe("Google sampling settings", () => {
    it("sends GOOGLE_TOP_K and GOOGLE_TOP_P in the generation config", async () => {
        vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key")
        vi.stubEnv("GOOGLE_TOP_K", "40")
        vi.stubEnv("GOOGLE_TOP_P", "0.9")
        const body = await googleRequestBody()
        expect(body.generationConfig).toMatchObject({ topK: 40, topP: 0.9 })
    })

    it("sends neither when they are not set", async () => {
        vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key")
        vi.stubEnv("GOOGLE_TOP_K", undefined)
        vi.stubEnv("GOOGLE_TOP_P", undefined)
        const body = await googleRequestBody()
        expect(body.generationConfig?.topK).toBeUndefined()
        expect(body.generationConfig?.topP).toBeUndefined()
    })
})

describe("Gemini thinking settings", () => {
    it("sends GOOGLE_THINKING_BUDGET as the Gemini 2.5 thinking budget", async () => {
        vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key")
        vi.stubEnv("GOOGLE_THINKING_BUDGET", "8192")
        vi.stubEnv("GOOGLE_THINKING_LEVEL", undefined)
        const body = await googleRequestBody("gemini-2.5-flash")
        expect(body.generationConfig.thinkingConfig).toEqual({
            includeThoughts: true,
            thinkingBudget: 8192,
        })
    })

    it("sends GOOGLE_THINKING_LEVEL as the Gemini 3 thinking level", async () => {
        vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key")
        vi.stubEnv("GOOGLE_THINKING_LEVEL", "high")
        vi.stubEnv("GOOGLE_THINKING_BUDGET", undefined)
        const body = await googleRequestBody("gemini-3-pro-preview")
        expect(body.generationConfig.thinkingConfig).toEqual({
            includeThoughts: true,
            thinkingLevel: "high",
        })
    })
})
