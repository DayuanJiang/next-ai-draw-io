import { createOpenAI } from "@ai-sdk/openai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AWS_REGIONS } from "@/components/provider-credentials-fields"
import {
    getAIModel,
    getValidationModel,
    usesServerCredentials,
} from "@/lib/ai-providers"

const settings = vi.hoisted(() => ({ values: {} as Record<string, string> }))

vi.mock("@/lib/admin/settings", () => ({
    loadSettings: () => settings.values,
    getEnvFallback: (key: string) => process.env[key] ?? null,
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

vi.mock("@ai-sdk/azure", () => {
    const mockModel = { modelId: "test-model" }
    const mockProviderFn = vi.fn(() => mockModel) as any
    mockProviderFn.chat = vi.fn(() => mockModel)
    mockProviderFn.responses = vi.fn(() => mockModel)
    return { createAzure: vi.fn(() => mockProviderFn) }
})

vi.mock("@ai-sdk/amazon-bedrock", () => {
    const mockProviderFn = vi.fn(() => ({ modelId: "test-model" }))
    return { createAmazonBedrock: vi.fn(() => mockProviderFn) }
})

vi.mock("@aws-sdk/credential-providers", () => ({
    fromNodeProviderChain: vi.fn(() => "node-chain"),
}))

vi.mock("ollama-ai-provider-v2", () => {
    const mockProviderFn = vi.fn(() => ({ modelId: "test-model" }))
    return { createOllama: vi.fn(() => mockProviderFn) }
})

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
    "NEXT_AI_DRAWIO_DESKTOP",
    "SGLANG_API_KEY",
    "SGLANG_BASE_URL",
    "AZURE_RESOURCE_NAME",
    "OLLAMA_BASE_URL",
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
            // The keys the Test button checked, not AWS_BEARER_TOKEN_BEDROCK
            apiKey: "",
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
            // The SDK would otherwise use the server's AWS_BEARER_TOKEN_BEDROCK
            apiKey: "",
            // and the server's AWS_ENDPOINT_URL_BEDROCK_RUNTIME
            baseURL: "https://bedrock-runtime.ap-northeast-1.amazonaws.com",
        })
    })

    it("uses the client's Bedrock API key before any keys", async () => {
        process.env.ADMIN_AWS_ACCESS_KEY_ID = "panel-id"
        process.env.ADMIN_AWS_SECRET_ACCESS_KEY = "panel-secret"
        const { createAmazonBedrock } = await import("@ai-sdk/amazon-bedrock")

        getAIModel({
            provider: "bedrock",
            modelId: "amazon.nova-lite-v1:0",
            apiKey: "bedrock-api-key",
            awsAccessKeyId: "client-id",
            awsSecretAccessKey: "client-secret",
            awsRegion: "ap-northeast-1",
        })

        expect(createAmazonBedrock).toHaveBeenCalledWith({
            region: "ap-northeast-1",
            apiKey: "bedrock-api-key",
            // Not the server's AWS_ENDPOINT_URL_BEDROCK_RUNTIME
            baseURL: "https://bedrock-runtime.ap-northeast-1.amazonaws.com",
            // Nor its AWS keys, should the SDK drop the key
            credentialProvider: expect.any(Function),
        })
    })

    it("refuses a region that is not a region name", async () => {
        // It becomes part of the endpoint's host name, with the server's
        // credentials too
        process.env.ADMIN_AWS_ACCESS_KEY_ID = "panel-id"
        process.env.ADMIN_AWS_SECRET_ACCESS_KEY = "panel-secret"
        const { createAmazonBedrock } = await import("@ai-sdk/amazon-bedrock")
        for (const awsRegion of [
            "us-east-1.attacker.example/",
            "x/#",
            "US-EAST-1",
            "us-east-1 ",
        ]) {
            expect(() =>
                getAIModel({
                    provider: "bedrock",
                    modelId: "amazon.nova-lite-v1:0",
                    awsRegion,
                }),
            ).toThrow(/Invalid AWS region/)
            expect(() =>
                getAIModel({
                    provider: "bedrock",
                    modelId: "amazon.nova-lite-v1:0",
                    awsAccessKeyId: "client-id",
                    awsSecretAccessKey: "client-secret",
                    awsRegion,
                }),
            ).toThrow(/Invalid AWS region/)
        }
        expect(createAmazonBedrock).not.toHaveBeenCalled()
    })

    it("accepts every region the settings offer, and other partitions", () => {
        for (const awsRegion of [
            ...AWS_REGIONS.map(([region]) => region),
            "us-gov-west-1",
            "cn-northwest-1",
            "us-iso-east-1",
            "eusc-de-east-1",
        ]) {
            expect(() =>
                getAIModel({
                    provider: "bedrock",
                    modelId: "amazon.nova-lite-v1:0",
                    awsAccessKeyId: "client-id",
                    awsSecretAccessKey: "client-secret",
                    awsRegion,
                }),
            ).not.toThrow()
        }
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
        // A Bedrock API key is the client's own; a stray x-ai-api-key
        // does not replace the Vertex key
        expect(usesServerCredentials("bedrock", { apiKey: "x" })).toBe(false)
        expect(usesServerCredentials("bedrock", {})).toBe(true)
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

describe("whose keys a request uses", () => {
    it("cleans the base URL like the request does", () => {
        // "/" and a pasted path clean up to no base URL: the server's Ollama
        process.env.OLLAMA_API_KEY = "server-ollama-key"
        expect(usesServerCredentials("ollama", { baseUrl: "/" })).toBe(true)
        expect(
            usesServerCredentials("ollama", { baseUrl: "/chat/completions" }),
        ).toBe(true)
    })

    it("counts the desktop app's keys as the user's own", () => {
        // Electron passes the user's preset keys as server env vars
        process.env.NEXT_AI_DRAWIO_DESKTOP = "1"
        expect(usesServerCredentials("openai", {})).toBe(false)
    })

    it("sends a user's OpenAI key to the official endpoint", () => {
        // The SDK would otherwise read the server's OPENAI_BASE_URL
        process.env.OPENAI_BASE_URL = "https://operator-proxy.example.com/v1"
        getAIModel({
            provider: "openai",
            apiKey: "user-key",
            modelId: "gpt-5.5",
        })
        expect(createOpenAI).toHaveBeenLastCalledWith(
            expect.objectContaining({
                apiKey: "user-key",
                baseURL: "https://api.openai.com/v1",
            }),
        )
        // Still the Responses API, like without a base URL
        const provider = vi.mocked(createOpenAI).mock.results.at(-1)?.value
        expect(provider.chat).not.toHaveBeenCalled()
    })

    it("uses Chat Completions for any configured base URL", () => {
        // The settings form fills in the official URL for a new provider
        getAIModel({
            provider: "openai",
            apiKey: "user-key",
            baseUrl: "https://api.openai.com/v1",
            modelId: "gpt-5.5",
        })
        const provider = vi.mocked(createOpenAI).mock.results.at(-1)?.value
        expect(provider.chat).toHaveBeenCalledWith("gpt-5.5")
    })

    it("sends a user's Ollama key to Ollama Cloud, not the server's Ollama", async () => {
        process.env.OLLAMA_BASE_URL = "http://ollama.internal:11434/api"
        const { createOllama } = await import("ollama-ai-provider-v2")
        getAIModel({ provider: "ollama", apiKey: "user-key", modelId: "m" })
        expect(createOllama).toHaveBeenLastCalledWith(
            expect.objectContaining({ baseURL: "https://ollama.com/api" }),
        )
        // Without a key: the server's Ollama
        getAIModel({ provider: "ollama", modelId: "m" })
        expect(createOllama).toHaveBeenLastCalledWith(
            expect.objectContaining({
                baseURL: "http://ollama.internal:11434/api",
            }),
        )
    })

    it("sends the server's Ollama key where OLLAMA_BASE_URL says, or to local Ollama", async () => {
        // The desktop app's "Ollama (Local)" preset puts its API Key field
        // into OLLAMA_API_KEY; with no base URL that is the local Ollama
        process.env.OLLAMA_API_KEY = "server-key"
        const { createOllama } = await import("ollama-ai-provider-v2")
        getAIModel({ provider: "ollama", modelId: "m" })
        expect(vi.mocked(createOllama).mock.lastCall?.[0]).not.toHaveProperty(
            "baseURL",
        )
        process.env.OLLAMA_BASE_URL = "https://ollama.com/api"
        getAIModel({ provider: "ollama", modelId: "m" })
        expect(createOllama).toHaveBeenLastCalledWith(
            expect.objectContaining({ baseURL: "https://ollama.com/api" }),
        )
    })

    it("uses a server model's own Ollama URL variable", async () => {
        process.env.OLLAMA_BASE_URL = "http://other.internal:11434/api"
        process.env.MY_OLLAMA_URL = "https://ollama.proxy.example/api"
        process.env.MY_OLLAMA_KEY = "proxy-key"
        try {
            const { createOllama } = await import("ollama-ai-provider-v2")
            getAIModel({
                provider: "ollama",
                modelId: "m",
                apiKeyEnv: "MY_OLLAMA_KEY",
                baseUrlEnv: "MY_OLLAMA_URL",
            })
            expect(createOllama).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    baseURL: "https://ollama.proxy.example/api",
                    headers: { Authorization: "Bearer proxy-key" },
                }),
            )
        } finally {
            delete process.env.MY_OLLAMA_URL
            delete process.env.MY_OLLAMA_KEY
        }
    })

    it("runs an Azure entry set up only in the admin panel", async () => {
        // No AZURE_BASE_URL or AZURE_RESOURCE_NAME: the entry's own
        // variables hold the key and the resource URL
        process.env.ADMIN_AZURE_API_KEY = "panel-key"
        process.env.ADMIN_AZURE_BASE_URL = "https://res.openai.azure.com/openai"
        try {
            const { createAzure } = await import("@ai-sdk/azure")
            expect(() =>
                getAIModel({
                    provider: "azure",
                    modelId: "gpt-4o",
                    apiKeyEnv: "ADMIN_AZURE_API_KEY",
                    baseUrlEnv: "ADMIN_AZURE_BASE_URL",
                }),
            ).not.toThrow()
            expect(createAzure).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    apiKey: "panel-key",
                    baseURL: "https://res.openai.azure.com/openai",
                }),
            )
            // Without any URL it still says what is missing
            delete process.env.ADMIN_AZURE_BASE_URL
            expect(() =>
                getAIModel({
                    provider: "azure",
                    modelId: "gpt-4o",
                    apiKeyEnv: "ADMIN_AZURE_API_KEY",
                    baseUrlEnv: "ADMIN_AZURE_BASE_URL",
                }),
            ).toThrow(/AZURE_BASE_URL/)
        } finally {
            delete process.env.ADMIN_AZURE_API_KEY
            delete process.env.ADMIN_AZURE_BASE_URL
        }
    })

    it("needs a base URL with a user's Azure key", () => {
        // The SDK would otherwise read the server's AZURE_RESOURCE_NAME
        process.env.AZURE_RESOURCE_NAME = "operator-resource"
        expect(() =>
            getAIModel({ provider: "azure", apiKey: "k", modelId: "gpt-4o" }),
        ).toThrow(/base URL/)
    })

    it("needs a base URL for SGLang instead of using 127.0.0.1", () => {
        expect(() =>
            getAIModel({ provider: "sglang", apiKey: "k", modelId: "m" }),
        ).toThrow(/base URL/)
    })
})
