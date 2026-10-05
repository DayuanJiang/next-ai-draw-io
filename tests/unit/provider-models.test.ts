// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

// No DNS in tests: only loopback addresses are private
vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async (url: string) =>
        /^https?:\/\/(127\.0\.0\.1|localhost)\b/.test(url),
}))

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

    it("lists Ollama from where chat goes without a base URL", async () => {
        const { fn, calls } = answer({ models: [{ name: "llama3.2" }] })
        process.env.OLLAMA_BASE_URL = "http://ollama.internal:11434"
        try {
            await listProviderModels("ollama", {}, fn)
        } finally {
            delete process.env.OLLAMA_BASE_URL
        }
        await listProviderModels("ollama", {}, fn)
        expect(calls.map((c) => c.url)).toEqual([
            "http://ollama.internal:11434/api/tags",
            "http://127.0.0.1:11434/api/tags",
        ])
    })

    it("lists Ollama Cloud with a user's key, like chat", async () => {
        // The user's key must not go to the server's Ollama
        const { fn, calls } = answer({ models: [{ name: "gpt-oss:120b" }] })
        process.env.OLLAMA_BASE_URL = "http://ollama.internal:11434"
        try {
            await listProviderModels("ollama", { apiKey: "user-key" }, fn)
        } finally {
            delete process.env.OLLAMA_BASE_URL
        }
        expect(calls[0].url).toBe("https://ollama.com/api/tags")
    })

    it("does not use SGLang's local address as a default", async () => {
        const { fn, calls } = answer({ data: [] })
        await expect(
            listProviderModels("sglang", { apiKey: "k" }, fn),
        ).rejects.toThrow(/base URL/)
        expect(calls).toHaveLength(0)
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

    // The base URL is the caller's, and private addresses are allowed by
    // default (local Ollama), so the answer must not reveal what an
    // internal address sent back
    const text = (body: string) =>
        vi.fn(
            async () => new Response(body, { status: 200 }),
        ) as unknown as typeof fetch

    it("does not repeat a body that is not JSON", async () => {
        vi.stubGlobal("fetch", text("ROLE-NAME-OF-THE-SERVER"))
        const res = await post({
            provider: "ollama",
            baseUrl: "http://169.254.169.254/latest/meta-data/x?",
        })
        const data = await res.json()
        expect(data.error).toBe("The model list was not valid JSON.")
        expect(JSON.stringify(data)).not.toContain("ROLE")
    })

    it("stops reading a list over 2 MB, also through the Gateway SDK", async () => {
        const huge = JSON.stringify({ data: [{ id: "x".repeat(3_000_000) }] })
        for (const body of [
            { provider: "ollama", baseUrl: "https://big.example.com" },
            {
                provider: "gateway",
                apiKey: "k",
                baseUrl: "https://big.example.com/v3/ai",
            },
        ]) {
            vi.stubGlobal("fetch", text(huge))
            const data = await (await post(body)).json()
            expect(data.error).toBe("The model list is too large.")
            expect(data.models).toBeUndefined()
        }
    })

    it("ends the download of a list that is too large", async () => {
        // The answer announces 4 MB and never finishes
        let signal: AbortSignal | undefined
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init?: RequestInit) => {
                signal = init?.signal ?? undefined
                const body = new ReadableStream({ start() {} })
                return new Response(body, {
                    headers: { "content-length": String(4 * 1024 * 1024) },
                })
            }),
        )
        const data = await (
            await post({
                provider: "ollama",
                baseUrl: "https://big.example.com",
            })
        ).json()
        expect(data.error).toBe("The model list is too large.")
        expect(signal?.aborted).toBe(true)
    })

    it("handles answers without a body", async () => {
        for (const status of [204, 304]) {
            vi.stubGlobal(
                "fetch",
                vi.fn(async () => new Response(null, { status })),
            )
            const data = await (
                await post({ provider: "ollama", baseUrl: "https://x.example" })
            ).json()
            expect(data.error).toMatch(/not valid JSON|failed \(304\)/)
        }
    })

    it("explains a refused redirect", async () => {
        process.env.ALLOW_PRIVATE_URLS = "false"
        try {
            vi.stubGlobal(
                "fetch",
                vi.fn(
                    async () =>
                        new Response(null, {
                            status: 301,
                            headers: { location: "https://elsewhere.example" },
                        }),
                ),
            )
            const data = await (
                await post({ provider: "ollama", baseUrl: "https://x.example" })
            ).json()
            expect(data.error).toMatch(/Redirects are not allowed/)
        } finally {
            delete process.env.ALLOW_PRIVATE_URLS
        }
    })

    it("keeps its own explanations and hides other error texts", async () => {
        // Our own: no base URL for SGLang
        const own = await (
            await post({ provider: "sglang", apiKey: "k" })
        ).json()
        expect(own.error).toMatch(/needs a base URL/)
        // Not ours: an exception text from the network layer
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw new Error("connect ECONNREFUSED 10.1.2.3:8080")
            }),
        )
        const other = await (
            await post({ provider: "ollama", baseUrl: "http://10.1.2.3:8080" })
        ).json()
        expect(other.error).toBe("The model list request failed.")
    })
})
