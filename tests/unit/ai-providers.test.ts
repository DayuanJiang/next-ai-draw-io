import { beforeEach, describe, expect, it, vi } from "vitest"
import {
    getAIModel,
    isAihubmixStandardBaseURL,
    resolveBaseURL,
    supportsPromptCaching,
} from "@/lib/ai-providers"

describe("resolveBaseURL", () => {
    const SERVER_BASE_URL = "https://server-proxy.example.com"
    const USER_BASE_URL = "https://user-proxy.example.com"
    const USER_API_KEY = "user-api-key-123"

    describe("when user provides their own API key", () => {
        it("uses user's baseUrl when provided", () => {
            const result = resolveBaseURL(
                USER_API_KEY,
                USER_BASE_URL,
                SERVER_BASE_URL,
            )
            expect(result).toBe(USER_BASE_URL)
        })

        it("does NOT use server's baseUrl even when available", () => {
            const result = resolveBaseURL(
                USER_API_KEY,
                undefined,
                SERVER_BASE_URL,
            )
            expect(result).toBeUndefined()
        })
    })

    describe("when using server credentials (no user API key)", () => {
        it("uses user's baseUrl when provided (overrides server)", () => {
            const result = resolveBaseURL(null, USER_BASE_URL, SERVER_BASE_URL)
            expect(result).toBe(USER_BASE_URL)
        })

        it("falls back to server's baseUrl when no user baseUrl", () => {
            const result = resolveBaseURL(null, null, SERVER_BASE_URL)
            expect(result).toBe(SERVER_BASE_URL)
        })

        it("returns undefined when no baseUrl available anywhere", () => {
            const result = resolveBaseURL(null, null, undefined)
            expect(result).toBeUndefined()
        })

        it("handles undefined apiKey same as null", () => {
            const result = resolveBaseURL(undefined, null, SERVER_BASE_URL)
            expect(result).toBe(SERVER_BASE_URL)
        })
    })

    describe("edge cases", () => {
        it("handles empty string apiKey as falsy (uses server config)", () => {
            const result = resolveBaseURL("", null, SERVER_BASE_URL)
            // Empty string is falsy, so should use server config
            expect(result).toBe(SERVER_BASE_URL)
        })

        it("handles empty string baseUrl as falsy", () => {
            const result = resolveBaseURL(USER_API_KEY, "", SERVER_BASE_URL)
            // Empty string baseUrl is falsy; a user's key never goes to the
            // server's URL, so nothing is left
            expect(result).toBeUndefined()
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

vi.mock("ollama-ai-provider-v2", () => {
    const mockModel = { modelId: "test-model" }
    const mockProviderFn = vi.fn(() => mockModel)
    const mockCreateOllama = vi.fn(() => mockProviderFn)
    const mockOllama = vi.fn(() => mockModel)
    return { createOllama: mockCreateOllama, ollama: mockOllama }
})

vi.mock("@ai-sdk/deepseek", () => {
    const mockModel = { modelId: "test-model" }
    const mockProviderFn = vi.fn(() => mockModel)
    const mockCreateDeepSeek = vi.fn(() => mockProviderFn)
    const mockDeepseek = vi.fn(() => mockModel)
    return { createDeepSeek: mockCreateDeepSeek, deepseek: mockDeepseek }
})

vi.mock("@aihubmix/ai-sdk-provider", () => {
    const mockModel = { modelId: "test-model" }
    const mockProviderFn = vi.fn(() => mockModel)
    const mockCreateAihubmix = vi.fn(() => mockProviderFn)
    const mockAihubmix = vi.fn(() => mockModel)
    return { aihubmix: mockAihubmix, createAihubmix: mockCreateAihubmix }
})

vi.mock("@ai-sdk/openai", () => {
    const mockModel = { modelId: "test-model" }
    const mockChat = vi.fn(() => mockModel)
    const mockProviderFn = vi.fn(() => mockModel) as any
    mockProviderFn.chat = mockChat
    const mockCreateOpenAI = vi.fn(() => mockProviderFn)
    const mockOpenai = vi.fn(() => mockModel)
    return { createOpenAI: mockCreateOpenAI, openai: mockOpenai }
})

describe("AIHubMix provider", () => {
    let createAihubmixMock: ReturnType<typeof vi.fn>
    beforeEach(async () => {
        vi.stubEnv("AIHUBMIX_BASE_URL", undefined)

        const mod = await import("@aihubmix/ai-sdk-provider")
        createAihubmixMock = mod.createAihubmix as ReturnType<typeof vi.fn>
        createAihubmixMock.mockClear()
    })

    it("uses AIHUBMIX_API_KEY for server configured AIHubMix", () => {
        vi.stubEnv("AIHUBMIX_API_KEY", "server-aihubmix-key")

        getAIModel({
            provider: "aihubmix",
            modelId: "claude-sonnet-4-5-20250929",
        })

        expect(createAihubmixMock).toHaveBeenCalledWith({
            apiKey: "server-aihubmix-key",
            appCode: "MSBS9675",
        })
    })

    it("uses client BYOK API key for AIHubMix", () => {
        getAIModel({
            provider: "aihubmix",
            apiKey: "client-aihubmix-key",
            modelId: "gpt-5.1",
        })

        expect(createAihubmixMock).toHaveBeenCalledWith({
            apiKey: "client-aihubmix-key",
            appCode: "MSBS9675",
        })
    })

    it("recognizes AIHubMix standard endpoints", () => {
        expect(isAihubmixStandardBaseURL(undefined)).toBe(true)
        expect(isAihubmixStandardBaseURL("https://aihubmix.com")).toBe(true)
        expect(isAihubmixStandardBaseURL("https://aihubmix.com/v1/")).toBe(true)
        expect(isAihubmixStandardBaseURL("https://proxy.example.com/v1")).toBe(
            false,
        )
    })
})

vi.mock("@ai-sdk/openai-compatible", () => {
    const mockModel = { specificationVersion: "v3", modelId: "test-model" }
    const mockProviderFn = vi.fn(() => mockModel)
    const mockCreate = vi.fn(() => mockProviderFn)
    return { createOpenAICompatible: mockCreate }
})

describe("Atlas Cloud provider", () => {
    let createCompatibleMock: ReturnType<typeof vi.fn>
    beforeEach(async () => {
        vi.stubEnv("ATLASCLOUD_BASE_URL", undefined)

        const mod = await import("@ai-sdk/openai-compatible")
        createCompatibleMock = mod.createOpenAICompatible as ReturnType<
            typeof vi.fn
        >
        createCompatibleMock.mockClear()
    })

    it("uses Atlas Cloud default endpoint with ATLASCLOUD_API_KEY", () => {
        vi.stubEnv("ATLASCLOUD_API_KEY", "server-atlas-key")

        getAIModel({
            provider: "atlascloud",
            modelId: "qwen/qwen3.5-flash",
        })

        // An OpenAI-compatible API; includeUsage keeps quota tracking working
        expect(createCompatibleMock).toHaveBeenCalledWith({
            name: "atlascloud",
            apiKey: "server-atlas-key",
            baseURL: "https://api.atlascloud.ai/v1",
            includeUsage: true,
        })
    })

    it("uses custom Atlas Cloud base URL when provided", () => {
        getAIModel({
            provider: "atlascloud",
            apiKey: "client-atlas-key",
            baseUrl: "https://proxy.example.com/v1",
            modelId: "deepseek-ai/deepseek-v4-pro",
        })

        expect(createCompatibleMock).toHaveBeenCalledWith({
            name: "atlascloud",
            apiKey: "client-atlas-key",
            baseURL: "https://proxy.example.com/v1",
            includeUsage: true,
        })
    })

    it("drops an endpoint path pasted along with the base URL", () => {
        getAIModel({
            provider: "atlascloud",
            apiKey: "client-atlas-key",
            baseUrl: "https://proxy.example.com/v1/chat/completions/",
            modelId: "deepseek-ai/deepseek-v4-pro",
        })

        expect(createCompatibleMock).toHaveBeenCalledWith(
            expect.objectContaining({
                baseURL: "https://proxy.example.com/v1",
            }),
        )
    })
})

describe("Kimi provider uses createDeepSeek for reasoning_content support", () => {
    let createDeepSeekMock: ReturnType<typeof vi.fn>
    beforeEach(async () => {
        vi.stubEnv("KIMI_BASE_URL", undefined)

        const mod = await import("@ai-sdk/deepseek")
        createDeepSeekMock = mod.createDeepSeek as ReturnType<typeof vi.fn>
        createDeepSeekMock.mockClear()
    })

    it("uses createDeepSeek with Kimi default base URL for reasoning_content support", () => {
        vi.stubEnv("KIMI_API_KEY", "test-kimi-key")

        getAIModel({
            provider: "kimi",
            apiKey: "test-kimi-key",
            modelId: "moonshot-v1-8k",
        })

        expect(createDeepSeekMock).toHaveBeenCalledWith(
            expect.objectContaining({
                baseURL: "https://api.moonshot.cn/v1",
            }),
        )
    })

    it("uses custom base URL when provided for kimi provider", () => {
        vi.stubEnv("KIMI_API_KEY", "test-kimi-key")

        getAIModel({
            provider: "kimi",
            apiKey: "test-kimi-key",
            baseUrl: "https://custom-kimi-endpoint.com/v1",
            modelId: "kimi-k2.6",
        })

        expect(createDeepSeekMock).toHaveBeenCalledWith(
            expect.objectContaining({
                baseURL: "https://custom-kimi-endpoint.com/v1",
            }),
        )
    })
})

describe("Ollama API key security", () => {
    let createOllamaMock: ReturnType<typeof vi.fn>
    beforeEach(async () => {
        vi.stubEnv("OLLAMA_BASE_URL", undefined)

        const mod = await import("ollama-ai-provider-v2")
        createOllamaMock = mod.createOllama as ReturnType<typeof vi.fn>
        createOllamaMock.mockClear()
    })

    it("does NOT leak server OLLAMA_API_KEY when client provides a custom baseUrl", () => {
        vi.stubEnv("OLLAMA_API_KEY", "server-secret-key")

        // When server has OLLAMA_API_KEY, the SSRF guard rejects
        // client-provided baseUrl without an apiKey outright
        expect(() =>
            getAIModel({
                provider: "ollama",
                baseUrl: "https://evil-server.com",
                modelId: "llama2",
            }),
        ).toThrow("API key is required")
    })

    it("uses client API key when client provides both baseUrl and apiKey", () => {
        vi.stubEnv("OLLAMA_API_KEY", "server-secret-key")

        getAIModel({
            provider: "ollama",
            baseUrl: "https://my-ollama.com",
            apiKey: "client-key",
            modelId: "llama2",
        })

        expect(createOllamaMock).toHaveBeenCalledWith(
            expect.objectContaining({
                baseURL: "https://my-ollama.com/api",
                headers: { Authorization: "Bearer client-key" },
            }),
        )
    })

    it("applies both server OLLAMA_BASE_URL and OLLAMA_API_KEY when no client overrides", () => {
        vi.stubEnv("OLLAMA_BASE_URL", "https://cloud.ollama.com")
        vi.stubEnv("OLLAMA_API_KEY", "server-key")

        getAIModel({ provider: "ollama", modelId: "llama2" })

        expect(createOllamaMock).toHaveBeenCalledWith(
            expect.objectContaining({
                baseURL: "https://cloud.ollama.com/api",
                headers: { Authorization: "Bearer server-key" },
            }),
        )
    })

    it("works when OLLAMA_API_KEY is set but OLLAMA_BASE_URL is not", () => {
        vi.stubEnv("OLLAMA_API_KEY", "server-key")
        vi.stubEnv("OLLAMA_BASE_URL", undefined)

        getAIModel({ provider: "ollama", modelId: "llama2" })

        expect(createOllamaMock).toHaveBeenCalledTimes(1)
        const callArgs = createOllamaMock.mock.calls[0][0]
        // The SDK's local default: the desktop app's "Ollama (Local)"
        // preset puts its API Key field into OLLAMA_API_KEY
        expect(callArgs).not.toHaveProperty("baseURL")
        expect(callArgs).toEqual(
            expect.objectContaining({
                headers: { Authorization: "Bearer server-key" },
            }),
        )
    })

    it("allows client custom baseUrl without apiKey when no server OLLAMA_API_KEY", () => {
        vi.stubEnv("OLLAMA_API_KEY", undefined)

        getAIModel({
            provider: "ollama",
            baseUrl: "https://my-ollama.com",
            modelId: "llama2",
        })

        expect(createOllamaMock).toHaveBeenCalledTimes(1)
        const callArgs = createOllamaMock.mock.calls[0][0]
        expect(callArgs.baseURL).toBe("https://my-ollama.com/api")
        expect(callArgs).not.toHaveProperty("headers")
    })

    it("sends chat to Ollama's /api for a server address or a /v1 URL", () => {
        vi.stubEnv("OLLAMA_API_KEY", undefined)

        for (const baseUrl of [
            "http://localhost:11434",
            "http://localhost:11434/",
            "http://localhost:11434/v1",
            "http://localhost:11434/api",
        ]) {
            createOllamaMock.mockClear()
            getAIModel({ provider: "ollama", baseUrl, modelId: "llama3.2" })
            expect(createOllamaMock.mock.calls[0][0].baseURL).toBe(
                "http://localhost:11434/api",
            )
        }
    })
})
