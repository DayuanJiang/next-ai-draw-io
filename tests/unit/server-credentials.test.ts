/**
 * The server credential check getAIModel runs when the request brings no
 * key of its own, and the auto-detection of the server's provider. Written
 * against the pre-refactor validateProviderCredentials and detectProvider;
 * the refactor merges both into serverCredentialError, which must keep every
 * answer and every error text below.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { envVarsOf, getAIModel, getServerProvider } from "@/lib/ai-providers"
import { PROVIDER_NAMES, PROVIDERS } from "@/lib/providers"

vi.mock("@/lib/admin/settings", () => ({
    loadSettings: () => ({}),
    getEnvFallback: (key: string) => process.env[key] ?? null,
}))

const { factory } = vi.hoisted(() => ({
    factory: () => (modelId: string) => ({ modelId }),
}))
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: factory }))
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: factory }))
vi.mock("@ai-sdk/azure", () => ({ createAzure: factory }))
vi.mock("@ai-sdk/google-vertex", () => ({ createVertex: factory }))
vi.mock("ollama-ai-provider-v2", () => ({ createOllama: factory }))

// Every provider's key and URL variables, the alternative and resource
// variables, and this file's own: the machine's environment must not reach
// the checks under test
const VARS = [
    "AI_PROVIDER",
    "AI_MODEL",
    "MY_KEY",
    "MY_KEY_2",
    "MY_URL",
    ...PROVIDER_NAMES.flatMap((p) => {
        const { apiKey, baseUrl } = envVarsOf(p)
        const { altKeyEnv, resourceNameEnv } = PROVIDERS[p]
        return [apiKey, baseUrl, altKeyEnv, resourceNameEnv].filter(
            (name): name is string => !!name,
        )
    }),
]

beforeEach(() => {
    for (const name of VARS) vi.stubEnv(name, undefined)
    vi.spyOn(console, "log").mockImplementation(() => {})
})

const run = (overrides: Parameters<typeof getAIModel>[0]) => () =>
    getAIModel({ modelId: "m", ...overrides })

describe("server credentials", () => {
    it("accepts ANTHROPIC_AUTH_TOKEN alone for Anthropic", () => {
        vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "token")
        expect(run({ provider: "anthropic" })).not.toThrow()
        vi.stubEnv("ANTHROPIC_AUTH_TOKEN", undefined)
        expect(run({ provider: "anthropic" })).toThrow(
            "Either ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN environment variable is required for anthropic provider. Please set one in your .env.local file.",
        )
    })

    it("holds a server model to its own variable, even for Anthropic", () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "k")
        vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "token")
        expect(run({ provider: "anthropic", apiKeyEnv: "MY_KEY" })).toThrow(
            "MY_KEY environment variable is required for anthropic provider. Please set it in your .env.local file.",
        )
    })

    it("does not fall back to the default variable from an empty custom one", () => {
        vi.stubEnv("OPENAI_API_KEY", "k")
        expect(run({ provider: "openai", apiKeyEnv: "MY_KEY" })).toThrow(
            "MY_KEY environment variable is required for openai provider. Please set it in your .env.local file.",
        )
        vi.stubEnv("MY_KEY", "custom")
        expect(run({ provider: "openai", apiKeyEnv: "MY_KEY" })).not.toThrow()
    })

    it("needs a URL or a resource name for Azure after the key", () => {
        expect(run({ provider: "azure" })).toThrow(
            "AZURE_API_KEY environment variable is required for azure provider. Please set it in your .env.local file.",
        )
        vi.stubEnv("AZURE_API_KEY", "k")
        expect(run({ provider: "azure" })).toThrow(
            "Azure requires either AZURE_BASE_URL or AZURE_RESOURCE_NAME to be set. Please set one in your .env.local file.",
        )
        vi.stubEnv("AZURE_RESOURCE_NAME", "res")
        expect(run({ provider: "azure" })).not.toThrow()
    })

    it("lets a server model's own URL variable stand in for Azure's", () => {
        vi.stubEnv("MY_KEY", "k")
        vi.stubEnv("MY_URL", "https://res.openai.azure.com/openai")
        expect(
            run({
                provider: "azure",
                apiKeyEnv: "MY_KEY",
                baseUrlEnv: "MY_URL",
            }),
        ).not.toThrow()
        vi.stubEnv("MY_URL", undefined)
        expect(
            run({
                provider: "azure",
                apiKeyEnv: "MY_KEY",
                baseUrlEnv: "MY_URL",
            }),
        ).toThrow(/AZURE_BASE_URL or AZURE_RESOURCE_NAME/)
    })

    it("passes an array apiKeyEnv on any value and checks nothing else", () => {
        vi.stubEnv("MY_KEY_2", "k")
        // No Azure URL anywhere, and the key check still passes
        expect(
            run({ provider: "azure", apiKeyEnv: ["MY_KEY", "MY_KEY_2"] }),
        ).not.toThrow()
        vi.stubEnv("MY_KEY_2", undefined)
        expect(
            run({ provider: "azure", apiKeyEnv: ["MY_KEY", "MY_KEY_2"] }),
        ).toThrow(
            "At least one of [MY_KEY, MY_KEY_2] environment variables is required for azure provider. Please set at least one in your .env.local file.",
        )
    })

    it("asks nothing of providers without a required key variable", () => {
        expect(run({ provider: "ollama" })).not.toThrow()
        // A custom variable is still checked
        expect(run({ provider: "ollama", apiKeyEnv: "MY_KEY" })).toThrow(
            "MY_KEY environment variable is required for ollama provider. Please set it in your .env.local file.",
        )
    })

    it("names Vertex AI's key variable", () => {
        expect(run({ provider: "vertexai" })).toThrow(
            "GOOGLE_VERTEX_API_KEY environment variable is required for vertexai provider. Please set it in your .env.local file.",
        )
        vi.stubEnv("GOOGLE_VERTEX_API_KEY", "k")
        expect(run({ provider: "vertexai" })).not.toThrow()
    })
})

describe("server provider auto-detection", () => {
    it("finds the one provider with a key", () => {
        vi.stubEnv("GOOGLE_VERTEX_API_KEY", "k")
        expect(getServerProvider()).toBe("vertexai")
        expect(run({})).not.toThrow()
    })

    it("needs AI_PROVIDER when two have keys", () => {
        vi.stubEnv("GOOGLE_VERTEX_API_KEY", "k")
        vi.stubEnv("OPENAI_API_KEY", "k")
        expect(getServerProvider()).toBeNull()
        expect(run({})).toThrow(
            "Multiple AI providers configured (openai, vertexai). Please set AI_PROVIDER to specify which one to use.",
        )
    })

    it("accepts AI_PROVIDER=ollama with no key at all", () => {
        vi.stubEnv("AI_PROVIDER", "ollama")
        expect(getServerProvider()).toBe("ollama")
        expect(run({})).not.toThrow()
    })

    it("only counts Azure with a URL or a resource name", () => {
        vi.stubEnv("AZURE_API_KEY", "k")
        expect(getServerProvider()).toBeNull()
        vi.stubEnv("AZURE_RESOURCE_NAME", "res")
        expect(getServerProvider()).toBe("azure")
    })
})
