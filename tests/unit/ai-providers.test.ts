import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    getAIModel,
    resolveBaseURL,
    supportsImageInput,
    supportsPromptCaching,
} from "@/lib/ai-providers"

describe("resolveBaseURL", () => {
    const SERVER_BASE_URL = "https://server-proxy.example.com"
    const USER_BASE_URL = "https://user-proxy.example.com"
    const DEFAULT_BASE_URL = "https://api.provider.com/v1"
    const USER_API_KEY = "user-api-key-123"

    describe("when user provides their own API key", () => {
        it("uses user's baseUrl when provided", () => {
            const result = resolveBaseURL(
                USER_API_KEY,
                USER_BASE_URL,
                SERVER_BASE_URL,
                DEFAULT_BASE_URL,
            )
            expect(result).toBe(USER_BASE_URL)
        })

        it("uses default baseUrl when user provides no baseUrl", () => {
            const result = resolveBaseURL(
                USER_API_KEY,
                null,
                SERVER_BASE_URL,
                DEFAULT_BASE_URL,
            )
            expect(result).toBe(DEFAULT_BASE_URL)
        })

        it("returns undefined when user provides no baseUrl and no default exists", () => {
            const result = resolveBaseURL(
                USER_API_KEY,
                null,
                SERVER_BASE_URL,
                undefined,
            )
            expect(result).toBeUndefined()
        })

        it("does NOT use server's baseUrl even when available", () => {
            const result = resolveBaseURL(
                USER_API_KEY,
                undefined,
                SERVER_BASE_URL,
                undefined,
            )
            // Should NOT return SERVER_BASE_URL
            expect(result).not.toBe(SERVER_BASE_URL)
            expect(result).toBeUndefined()
        })

        it("prefers user's baseUrl over default", () => {
            const result = resolveBaseURL(
                USER_API_KEY,
                USER_BASE_URL,
                SERVER_BASE_URL,
                DEFAULT_BASE_URL,
            )
            expect(result).toBe(USER_BASE_URL)
        })
    })

    describe("when using server credentials (no user API key)", () => {
        it("uses user's baseUrl when provided (overrides server)", () => {
            const result = resolveBaseURL(
                null,
                USER_BASE_URL,
                SERVER_BASE_URL,
                DEFAULT_BASE_URL,
            )
            expect(result).toBe(USER_BASE_URL)
        })

        it("falls back to server's baseUrl when no user baseUrl", () => {
            const result = resolveBaseURL(
                null,
                null,
                SERVER_BASE_URL,
                DEFAULT_BASE_URL,
            )
            expect(result).toBe(SERVER_BASE_URL)
        })

        it("falls back to default when no user or server baseUrl", () => {
            const result = resolveBaseURL(
                null,
                null,
                undefined,
                DEFAULT_BASE_URL,
            )
            expect(result).toBe(DEFAULT_BASE_URL)
        })

        it("returns undefined when no baseUrl available anywhere", () => {
            const result = resolveBaseURL(null, null, undefined, undefined)
            expect(result).toBeUndefined()
        })

        it("handles undefined apiKey same as null", () => {
            const result = resolveBaseURL(
                undefined,
                null,
                SERVER_BASE_URL,
                DEFAULT_BASE_URL,
            )
            expect(result).toBe(SERVER_BASE_URL)
        })
    })

    describe("edge cases", () => {
        it("handles empty string apiKey as falsy (uses server config)", () => {
            const result = resolveBaseURL(
                "",
                null,
                SERVER_BASE_URL,
                DEFAULT_BASE_URL,
            )
            // Empty string is falsy, so should use server config
            expect(result).toBe(SERVER_BASE_URL)
        })

        it("handles empty string baseUrl as falsy", () => {
            const result = resolveBaseURL(
                USER_API_KEY,
                "",
                SERVER_BASE_URL,
                DEFAULT_BASE_URL,
            )
            // Empty string baseUrl is falsy, should fall back to default
            expect(result).toBe(DEFAULT_BASE_URL)
        })
    })
})

describe("supportsPromptCaching", () => {
    it("returns true for Claude models", () => {
        expect(supportsPromptCaching("claude-sonnet-4-5")).toBe(true)
        expect(supportsPromptCaching("anthropic.claude-3-5-sonnet")).toBe(true)
        expect(supportsPromptCaching("us.anthropic.claude-3-5-sonnet")).toBe(
            true,
        )
        expect(supportsPromptCaching("eu.anthropic.claude-3-5-sonnet")).toBe(
            true,
        )
    })

    it("returns false for non-Claude models", () => {
        expect(supportsPromptCaching("gpt-4o")).toBe(false)
        expect(supportsPromptCaching("gemini-pro")).toBe(false)
        expect(supportsPromptCaching("deepseek-chat")).toBe(false)
    })
})

describe("supportsImageInput", () => {
    it("returns true for models with vision capability", () => {
        expect(supportsImageInput("gpt-4-vision")).toBe(true)
        expect(supportsImageInput("qwen-vl")).toBe(true)
        expect(supportsImageInput("deepseek-vl")).toBe(true)
    })

    it("returns false for Kimi K2 models without vision", () => {
        expect(supportsImageInput("kimi-k2")).toBe(false)
        expect(supportsImageInput("moonshot/kimi-k2")).toBe(false)
    })

    it("returns true for Kimi K2.5 models (supports vision)", () => {
        expect(supportsImageInput("kimi-k2.5")).toBe(true)
        expect(supportsImageInput("moonshotai/kimi-k2.5")).toBe(true)
    })

    it("returns false for DeepSeek text models", () => {
        expect(supportsImageInput("deepseek-chat")).toBe(false)
        expect(supportsImageInput("deepseek-coder")).toBe(false)
    })

    it("returns false for Qwen text models", () => {
        expect(supportsImageInput("qwen-turbo")).toBe(false)
        expect(supportsImageInput("qwen-plus")).toBe(false)
    })

    it("returns true for Claude and GPT models by default", () => {
        expect(supportsImageInput("claude-sonnet-4-5")).toBe(true)
        expect(supportsImageInput("gpt-4o")).toBe(true)
        expect(supportsImageInput("gemini-pro")).toBe(true)
    })
})

vi.mock("ollama-ai-provider-v2", () => {
    const mockModel = { modelId: "test-model" }
    const mockProviderFn = vi.fn(() => mockModel)
    const mockCreateOllama = vi.fn(() => mockProviderFn)
    const mockOllama = vi.fn(() => mockModel)
    return { createOllama: mockCreateOllama, ollama: mockOllama }
})

describe("Ollama API key security", () => {
    let createOllamaMock: ReturnType<typeof vi.fn>
    const savedEnv: Record<string, string | undefined> = {}

    beforeEach(async () => {
        savedEnv.OLLAMA_API_KEY = process.env.OLLAMA_API_KEY
        savedEnv.OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL
        delete process.env.OLLAMA_BASE_URL

        const mod = await import("ollama-ai-provider-v2")
        createOllamaMock = mod.createOllama as ReturnType<typeof vi.fn>
        createOllamaMock.mockClear()
    })

    afterEach(() => {
        process.env.OLLAMA_API_KEY = savedEnv.OLLAMA_API_KEY
        process.env.OLLAMA_BASE_URL = savedEnv.OLLAMA_BASE_URL
    })

    it("applies server OLLAMA_API_KEY when no client baseUrl is provided", () => {
        process.env.OLLAMA_API_KEY = "server-secret-key"

        getAIModel({ provider: "ollama", modelId: "llama2" })

        expect(createOllamaMock).toHaveBeenCalledWith(
            expect.objectContaining({
                headers: { Authorization: "Bearer server-secret-key" },
            }),
        )
    })

    it("does NOT leak server OLLAMA_API_KEY when client provides a custom baseUrl", () => {
        process.env.OLLAMA_API_KEY = "server-secret-key"

        getAIModel({
            provider: "ollama",
            baseUrl: "https://evil-server.com",
            modelId: "llama2",
        })

        expect(createOllamaMock).toHaveBeenCalledTimes(1)
        const callArgs = createOllamaMock.mock.calls[0][0]
        expect(callArgs).not.toHaveProperty("headers")
    })

    it("uses client API key when client provides both baseUrl and apiKey", () => {
        process.env.OLLAMA_API_KEY = "server-secret-key"

        getAIModel({
            provider: "ollama",
            baseUrl: "https://my-ollama.com",
            apiKey: "client-key",
            modelId: "llama2",
        })

        expect(createOllamaMock).toHaveBeenCalledWith(
            expect.objectContaining({
                baseURL: "https://my-ollama.com",
                headers: { Authorization: "Bearer client-key" },
            }),
        )
    })
})
