import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    getAIModel,
    getValidationModel,
    usesServerCredentials,
} from "@/lib/ai-providers"

const settings = vi.hoisted(() => ({ values: {} as Record<string, string> }))

vi.mock("@/lib/admin/settings", () => ({
    loadSettings: () => settings.values,
}))

vi.mock("@ai-sdk/google-vertex", () => {
    const mockProviderFn = vi.fn(() => ({ modelId: "test-model" }))
    return { createVertex: vi.fn(() => mockProviderFn) }
})

vi.mock("@ai-sdk/openai", () => {
    const mockModel = { modelId: "test-model" }
    const mockProviderFn = vi.fn(() => mockModel) as any
    mockProviderFn.chat = vi.fn(() => mockModel)
    return {
        createOpenAI: vi.fn(() => mockProviderFn),
        openai: vi.fn(() => mockModel),
    }
})

vi.mock("@ai-sdk/amazon-bedrock", () => {
    const mockProviderFn = vi.fn(() => ({ modelId: "test-model" }))
    return { createAmazonBedrock: vi.fn(() => mockProviderFn) }
})

vi.mock("@aws-sdk/credential-providers", () => ({
    fromNodeProviderChain: vi.fn(() => "node-chain"),
}))

vi.mock("@openrouter/ai-sdk-provider", () => {
    const mockProviderFn = vi.fn(() => ({ modelId: "test-model" }))
    return { createOpenRouter: vi.fn(() => mockProviderFn) }
})

const ENV_KEYS = [
    "GOOGLE_VERTEX_API_KEY",
    "GOOGLE_VERTEX_BASE_URL",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENROUTER_API_KEY",
    "ADMIN_OPENAI_API_KEY",
    "ADMIN_OPENROUTER_API_KEY",
    "OLLAMA_API_KEY",
    "ADMIN_AWS_ACCESS_KEY_ID",
    "ADMIN_AWS_SECRET_ACCESS_KEY",
    "ADMIN_AWS_REGION",
    "AWS_REGION",
    "AI_PROVIDER",
    "AI_MODEL",
    "VALIDATION_MODEL",
]
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
    for (const key of ENV_KEYS) {
        savedEnv[key] = process.env[key]
        delete process.env[key]
    }
    settings.values = {}
    vi.clearAllMocks()
})

afterEach(() => {
    for (const key of ENV_KEYS) {
        if (savedEnv[key] === undefined) delete process.env[key]
        else process.env[key] = savedEnv[key]
    }
})

describe("Vertex AI key security", () => {
    it("never sends the server key to a client base URL", () => {
        process.env.GOOGLE_VERTEX_API_KEY = "server-vertex-key"

        // Any x-ai-api-key passes the outer guard; the branch must still refuse
        expect(() =>
            getAIModel({
                provider: "vertexai",
                apiKey: "x",
                baseUrl: "https://attacker.example",
                modelId: "gemini-2.5-flash",
            }),
        ).toThrow("Vertex AI requires an API key")
    })

    it("sends the client key to the client base URL", async () => {
        process.env.GOOGLE_VERTEX_API_KEY = "server-vertex-key"
        const { createVertex } = await import("@ai-sdk/google-vertex")

        getAIModel({
            provider: "vertexai",
            vertexApiKey: "client-key",
            baseUrl: "https://my-proxy.example",
            modelId: "gemini-2.5-flash",
        })

        expect(createVertex).toHaveBeenCalledWith({
            apiKey: "client-key",
            baseURL: "https://my-proxy.example",
        })
    })

    it("does not send the client key to the server's base URL", async () => {
        process.env.GOOGLE_VERTEX_BASE_URL = "https://server-proxy.internal"
        const { createVertex } = await import("@ai-sdk/google-vertex")

        getAIModel({
            provider: "vertexai",
            vertexApiKey: "client-key",
            modelId: "gemini-2.5-flash",
        })

        expect(createVertex).toHaveBeenCalledWith({ apiKey: "client-key" })
    })

    it("still uses the server key and base URL without client overrides", async () => {
        process.env.GOOGLE_VERTEX_API_KEY = "server-vertex-key"
        process.env.GOOGLE_VERTEX_BASE_URL = "https://server-proxy.internal"
        const { createVertex } = await import("@ai-sdk/google-vertex")

        getAIModel({ provider: "vertexai", modelId: "gemini-2.5-flash" })

        expect(createVertex).toHaveBeenCalledWith({
            apiKey: "server-vertex-key",
            baseURL: "https://server-proxy.internal",
        })
    })
})

describe("Bedrock admin panel credentials", () => {
    it("uses the ADMIN_AWS_* keys when the client sends none", async () => {
        process.env.ADMIN_AWS_ACCESS_KEY_ID = "panel-id"
        process.env.ADMIN_AWS_SECRET_ACCESS_KEY = "panel-secret"
        process.env.ADMIN_AWS_REGION = "eu-west-1"
        process.env.AWS_REGION = "us-east-1"
        const { createAmazonBedrock } = await import("@ai-sdk/amazon-bedrock")

        getAIModel({ provider: "bedrock", modelId: "amazon.nova-lite-v1:0" })

        expect(createAmazonBedrock).toHaveBeenCalledWith({
            region: "eu-west-1",
            accessKeyId: "panel-id",
            secretAccessKey: "panel-secret",
        })
    })

    it("prefers the client's keys and region", async () => {
        process.env.ADMIN_AWS_ACCESS_KEY_ID = "panel-id"
        process.env.ADMIN_AWS_SECRET_ACCESS_KEY = "panel-secret"
        process.env.ADMIN_AWS_REGION = "eu-west-1"
        const { createAmazonBedrock } = await import("@ai-sdk/amazon-bedrock")

        getAIModel({
            provider: "bedrock",
            modelId: "amazon.nova-lite-v1:0",
            awsAccessKeyId: "client-id",
            awsSecretAccessKey: "client-secret",
            awsRegion: "ap-northeast-1",
        })

        expect(createAmazonBedrock).toHaveBeenCalledWith({
            region: "ap-northeast-1",
            accessKeyId: "client-id",
            secretAccessKey: "client-secret",
        })
    })

    it("falls back to the default AWS credential chain", async () => {
        process.env.AWS_REGION = "us-east-1"
        const { createAmazonBedrock } = await import("@ai-sdk/amazon-bedrock")

        getAIModel({ provider: "bedrock", modelId: "amazon.nova-lite-v1:0" })

        expect(createAmazonBedrock).toHaveBeenCalledWith({
            region: "us-east-1",
            credentialProvider: "node-chain",
        })
    })
})

describe("usesServerCredentials", () => {
    it("is true when no key comes with the request", () => {
        expect(usesServerCredentials("openai", {})).toBe(true)
        expect(usesServerCredentials("openai", { apiKey: "k" })).toBe(false)
    })

    it("looks at the credential each provider actually uses", () => {
        // A stray x-ai-api-key does not replace the IAM role or Vertex key
        expect(usesServerCredentials("bedrock", { apiKey: "x" })).toBe(true)
        expect(
            usesServerCredentials("bedrock", {
                awsAccessKeyId: "id",
                awsSecretAccessKey: "secret",
            }),
        ).toBe(false)
        expect(usesServerCredentials("vertexai", { apiKey: "x" })).toBe(true)
        expect(usesServerCredentials("vertexai", { vertexApiKey: "k" })).toBe(
            false,
        )
    })

    it("treats keyless EdgeOne and local Ollama as free", () => {
        expect(usesServerCredentials("edgeone", {})).toBe(false)
        expect(usesServerCredentials("ollama", {})).toBe(false)
        expect(
            usesServerCredentials("ollama", {
                baseUrl: "http://localhost:11434",
            }),
        ).toBe(false)

        process.env.OLLAMA_API_KEY = "server-ollama-key"
        expect(usesServerCredentials("ollama", {})).toBe(true)
    })
})

describe("server model apiKeyEnv", () => {
    it("uses the custom env var on the official OpenAI endpoint", async () => {
        process.env.ADMIN_OPENAI_API_KEY = "panel-key"
        const { createOpenAI, openai } = await import("@ai-sdk/openai")

        getAIModel({
            provider: "openai",
            modelId: "gpt-4o",
            apiKeyEnv: "ADMIN_OPENAI_API_KEY",
        })

        // The default instance would read OPENAI_API_KEY instead
        expect(openai).not.toHaveBeenCalled()
        expect(createOpenAI).toHaveBeenCalledWith({ apiKey: "panel-key" })
    })
})

describe("getValidationModel", () => {
    it("uses the admin panel default's ADMIN_ key", async () => {
        settings.values = {
            ADMIN_PROVIDERS: JSON.stringify([
                {
                    id: "p1",
                    provider: "openrouter",
                    name: "My OpenRouter",
                    apiKey: "panel-key",
                    models: ["openai/gpt-4o"],
                    isDefault: true,
                },
            ]),
        }
        // What deriveEnvUpdates writes for that panel config
        process.env.AI_PROVIDER = "openrouter"
        process.env.AI_MODEL = "openai/gpt-4o"
        process.env.ADMIN_OPENROUTER_API_KEY = "panel-key"
        const { createOpenRouter } = await import("@openrouter/ai-sdk-provider")

        expect(() => getValidationModel()).not.toThrow()
        expect(createOpenRouter).toHaveBeenCalledWith({ apiKey: "panel-key" })
    })

    it("uses the standard env vars without a panel default", async () => {
        process.env.AI_PROVIDER = "openrouter"
        process.env.AI_MODEL = "openai/gpt-4o"
        process.env.OPENROUTER_API_KEY = "env-key"
        const { createOpenRouter } = await import("@openrouter/ai-sdk-provider")

        getValidationModel()

        expect(createOpenRouter).toHaveBeenCalledWith({ apiKey: "env-key" })
    })
})
