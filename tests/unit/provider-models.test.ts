// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { POST as providerModels } from "@/app/api/provider-models/route"
import {
    canListModels,
    extractAihubmixModelIds,
    listProviderModels,
} from "@/lib/provider-models"

afterEach(() => {
    vi.unstubAllGlobals()
})

/** A fetch that answers with this JSON and records the request */
function answer(json: unknown, status = 200) {
    const calls: Array<{ url: string; headers: Record<string, string> }> = []
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, headers: (init?.headers ?? {}) as any })
        return new Response(JSON.stringify(json), { status })
    }) as unknown as typeof fetch
    return { fn, calls }
}

describe("listProviderModels", () => {
    it("reads an OpenAI-style list and drops models that are not for chat", async () => {
        const { fn, calls } = answer({
            data: [
                { id: "gpt-4.1" },
                { id: "text-embedding-3-small" },
                { id: "whisper-1" },
                { id: "gpt-image-1" },
            ],
        })
        const models = await listProviderModels("openai", { apiKey: "k" }, fn)
        expect(models.map((m) => m.id)).toEqual(["gpt-4.1"])
        // Tool support comes from models.dev when the list has none
        expect(models[0].tools).toBe(true)
        expect(calls[0].url).toBe("https://api.openai.com/v1/models")
        expect(calls[0].headers.Authorization).toBe("Bearer k")
    })

    it("uses the base URL the user gave, without a pasted path", async () => {
        const { fn, calls } = answer({ data: [{ id: "m" }] })
        await listProviderModels(
            "glm",
            {
                apiKey: "k",
                baseUrl: "https://proxy.example.com/v4/chat/completions",
            },
            fn,
        )
        expect(calls[0].url).toBe("https://proxy.example.com/v4/models")
    })

    it("asks Anthropic with its own headers", async () => {
        const { fn, calls } = answer({ data: [{ id: "claude-sonnet-4-5" }] })
        await listProviderModels("anthropic", { apiKey: "k" }, fn)
        expect(calls[0].url).toBe(
            "https://api.anthropic.com/v1/models?limit=1000",
        )
        expect(calls[0].headers["x-api-key"]).toBe("k")
    })

    it("keeps Gemini models that generate content, without models/", async () => {
        const { fn, calls } = answer({
            models: [
                {
                    name: "models/gemini-2.5-flash",
                    supportedGenerationMethods: ["generateContent"],
                },
                {
                    name: "models/text-embedding-004",
                    supportedGenerationMethods: ["embedContent"],
                },
            ],
        })
        const models = await listProviderModels("google", { apiKey: "k" }, fn)
        expect(models.map((m) => m.id)).toEqual(["gemini-2.5-flash"])
        // The key is a header, not part of the URL
        expect(calls[0].url).not.toContain("k&")
        expect(calls[0].headers["x-goog-api-key"]).toBe("k")
    })

    it("reads Ollama's tags and OpenRouter's tool support", async () => {
        const ollama = answer({ models: [{ name: "llama3.2" }] })
        await listProviderModels(
            "ollama",
            { baseUrl: "http://localhost:11434" },
            ollama.fn,
        )
        expect(ollama.calls[0].url).toBe("http://localhost:11434/api/tags")

        const openrouter = answer({
            data: [
                { id: "a/with-tools", supported_parameters: ["tools"] },
                { id: "b/no-tools", supported_parameters: ["temperature"] },
            ],
        })
        const models = await listProviderModels("openrouter", {}, openrouter.fn)
        expect(models).toEqual([
            { id: "a/with-tools", tools: true },
            { id: "b/no-tools", tools: false },
        ])
    })

    it("turns a failed request into an error with its status", async () => {
        const { fn } = answer({ error: "bad key" }, 401)
        await expect(
            listProviderModels("deepseek", { apiKey: "k" }, fn),
        ).rejects.toMatchObject({ statusCode: 401 })
    })
})

describe("extractAihubmixModelIds", () => {
    it("keeps unique chat models", () => {
        expect(
            extractAihubmixModelIds({
                data: [
                    { model_id: "claude-sonnet-4-5", types: "llm" },
                    { model_id: "gpt-5.1", types: "llm" },
                    { model_id: "gpt-5.1", types: "llm" },
                    { model_id: "gpt-image-2", types: "image_generation,llm" },
                    { model_id: "", types: "llm" },
                ],
            }),
        ).toEqual(["claude-sonnet-4-5", "gpt-5.1"])
        expect(extractAihubmixModelIds({ data: null })).toEqual([])
    })
})

describe("POST /api/provider-models", () => {
    const post = (body: unknown) =>
        providerModels(
            new Request("http://localhost/api/provider-models", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            }),
        )

    it("answers null for providers that cannot list models", async () => {
        expect(canListModels("bedrock")).toBe(false)
        expect(canListModels("toString" as never)).toBe(false)
        const res = await post({ provider: "bedrock" })
        expect(await res.json()).toEqual({ models: null })
    })

    it("needs the user's key where the list is not public", async () => {
        const res = await post({ provider: "deepseek" })
        expect(res.status).toBe(400)
    })

    it("explains a failure with the error hints", async () => {
        vi.stubGlobal("fetch", answer({}, 401).fn)
        const res = await post({ provider: "deepseek", apiKey: "k" })
        expect(await res.json()).toMatchObject({ code: "invalid_api_key" })
    })
})
