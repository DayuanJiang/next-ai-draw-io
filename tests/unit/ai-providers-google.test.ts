// @vitest-environment node
import { generateText } from "ai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getAIModel } from "@/lib/ai-providers"

const ENV = ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_TOP_K", "GOOGLE_TOP_P"]
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]))

afterEach(() => {
    for (const k of ENV) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
    }
    vi.unstubAllGlobals()
})

/** Send one request through the real Google provider and return its body */
async function googleRequestBody() {
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
    const { model } = getAIModel({
        provider: "google",
        modelId: "gemini-2.5-flash",
    })
    await generateText({ model, prompt: "hi", maxRetries: 0 })
    return body
}

describe("Google sampling settings", () => {
    it("sends GOOGLE_TOP_K and GOOGLE_TOP_P in the generation config", async () => {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key"
        process.env.GOOGLE_TOP_K = "40"
        process.env.GOOGLE_TOP_P = "0.9"
        const body = await googleRequestBody()
        expect(body.generationConfig).toMatchObject({ topK: 40, topP: 0.9 })
    })

    it("sends neither when they are not set", async () => {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key"
        delete process.env.GOOGLE_TOP_K
        delete process.env.GOOGLE_TOP_P
        const body = await googleRequestBody()
        expect(body.generationConfig?.topK).toBeUndefined()
        expect(body.generationConfig?.topP).toBeUndefined()
    })
})
