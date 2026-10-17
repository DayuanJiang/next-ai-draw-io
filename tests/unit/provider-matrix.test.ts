/**
 * A behavior snapshot of the provider layer. For every provider, every shape
 * of client override and every server environment it records what
 * getAIModel hands to the SDK factory (or the error it throws) together with
 * the answers of usesServerCredentials, usesServerEndpoint, globalBaseUrl
 * and chatRequestUrl. A change to the provider layer must leave the
 * existing rows unchanged (a new provider only adds rows); a diff names the
 * provider and the scenario whose behavior moved.
 *
 * Every SDK factory is mocked to return a plain description of its options.
 * redirectGuardedFetch returns a sentinel, so the snapshot shows whether
 * getAIModel asked for the redirect guard (the real function returns
 * undefined unless ALLOW_PRIVATE_URLS=false or DYNAMODB_QUOTA_TABLE is set).
 * isPrivateUrl answers by host name. Math.random is 0, so an array apiKeyEnv
 * picks its first variable with a value.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import {
    type ClientOverrides,
    getAIModel,
    getServerProvider,
    globalBaseUrl,
    usesServerCredentials,
    usesServerEndpoint,
} from "@/lib/ai-providers"
import { PROVIDERS, type ProviderName } from "@/lib/providers"
import { chatRequestUrl, normalizeBaseUrl } from "@/lib/types/model-config"

const hoisted = vi.hoisted(() => {
    /** An SDK factory whose models describe the factory call that made them */
    function factory(name: string, methods: string[] = []) {
        return (options: unknown) => {
            const provider = (modelId: string) => ({
                factory: name,
                method: "default",
                modelId,
                options,
            })
            for (const method of methods) {
                ;(provider as any)[method] = (modelId: string) => ({
                    factory: name,
                    method,
                    modelId,
                    options,
                })
            }
            return provider
        }
    }
    return { factory }
})

vi.mock("@/lib/admin/settings", () => ({
    loadSettings: () => ({}),
    getEnvFallback: (key: string) => process.env[key] ?? null,
}))

vi.mock("@/lib/ssrf-protection", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("@/lib/ssrf-protection")>()
    const guard = Object.assign(async () => new Response(), {
        sentinel: "guarded",
    })
    const privateHosts = new Set(["127.0.0.1", "localhost", "10.0.0.5"])
    return {
        ...actual,
        redirectGuardedFetch: () => guard,
        isPrivateUrl: async (url: string) =>
            privateHosts.has(new URL(url).hostname),
    }
})

vi.mock("ai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai")>()
    return {
        ...actual,
        createGateway: hoisted.factory("gateway"),
        wrapLanguageModel: ({ model, middleware }: any) => ({
            wrapped: model,
            middleware,
        }),
        extractReasoningMiddleware: (options: any) => ({
            middleware: "extractReasoning",
            ...options,
        }),
        defaultSettingsMiddleware: (options: any) => ({
            middleware: "defaultSettings",
            ...options,
        }),
    }
})
vi.mock("@ai-sdk/openai", () => ({
    createOpenAI: hoisted.factory("openai", ["chat", "responses"]),
}))
vi.mock("@ai-sdk/anthropic", () => ({
    createAnthropic: hoisted.factory("anthropic"),
}))
vi.mock("@ai-sdk/google", () => ({
    createGoogleGenerativeAI: hoisted.factory("google"),
}))
vi.mock("@ai-sdk/google-vertex", () => ({
    createVertex: hoisted.factory("vertex"),
}))
vi.mock("@ai-sdk/azure", () => ({
    createAzure: hoisted.factory("azure", ["chat", "responses"]),
}))
vi.mock("@ai-sdk/amazon-bedrock", () => ({
    createAmazonBedrock: hoisted.factory("bedrock"),
}))
vi.mock("@aws-sdk/credential-providers", () => ({
    fromNodeProviderChain: () => "node-chain",
}))
vi.mock("@ai-sdk/deepseek", () => ({
    createDeepSeek: hoisted.factory("deepseek"),
}))
vi.mock("@ai-sdk/openai-compatible", () => ({
    createOpenAICompatible: hoisted.factory("openai-compatible"),
}))
vi.mock("@aihubmix/ai-sdk-provider", () => ({
    createAihubmix: hoisted.factory("aihubmix"),
}))
vi.mock("@openrouter/ai-sdk-provider", () => ({
    createOpenRouter: hoisted.factory("openrouter"),
}))
vi.mock("ollama-ai-provider-v2", () => ({
    createOllama: hoisted.factory("ollama"),
}))

/**
 * The providers in the order they had before the record existed, then the
 * ones added since. Written out so the snapshot's row order does not follow
 * the order of the provider record.
 */
const MATRIX_PROVIDERS: ProviderName[] = [
    "openai",
    "anthropic",
    "google",
    "vertexai",
    "azure",
    "bedrock",
    "ollama",
    "openrouter",
    "aihubmix",
    "deepseek",
    "siliconflow",
    "sglang",
    "gateway",
    "edgeone",
    "doubao",
    "modelscope",
    "glm",
    "qwen",
    "qiniu",
    "kimi",
    "minimax",
    "novita",
    "mimo",
    "atlascloud",
    "custom",
]

/** The model id each provider runs in the matrix (the first of its former suggested list, or test-model) */
const MATRIX_MODEL_IDS: Record<ProviderName, string> = {
    openai: "gpt-6.1-sol",
    anthropic: "claude-opus-5-5",
    google: "gemini-3.1-pro",
    vertexai: "gemini-3.1-pro-preview",
    azure: "gpt-5.5",
    bedrock: "global.anthropic.claude-opus-5-5",
    ollama: "test-model",
    openrouter: "anthropic/claude-opus-5.5",
    aihubmix: "claude-fable-5",
    deepseek: "deepseek-v4-pro",
    siliconflow: "deepseek-ai/DeepSeek-V4-Pro",
    sglang: "default",
    gateway: "anthropic/claude-opus-5.5",
    edgeone: "@tx/deepseek-ai/deepseek-v32",
    doubao: "doubao-seed-2-0-pro-260215",
    modelscope: "deepseek-ai/DeepSeek-V4-Pro",
    glm: "test-model",
    qwen: "test-model",
    qiniu: "test-model",
    kimi: "test-model",
    minimax: "MiniMax-M3",
    novita: "minimax/minimax-m3",
    mimo: "mimo-v2.5-pro",
    atlascloud: "qwen/qwen3.5-flash",
    custom: "test-model",
}

/** Model ids whose providerOptions the snapshot records for openai and google */
const REASONING_PROBE_IDS: Partial<Record<ProviderName, string[]>> = {
    openai: [
        // The catalog says these reason, the name pattern does not
        "gpt-daybreak-blue-latest",
        "gpt-daybreak-red-latest",
        "gpt-realtime-2.1",
        // Matched by the pattern; unknown to the catalog; an alias by case
        "gpt-5",
        "gpt-unknown",
        "GPT-Realtime-2.1",
    ],
    google: [
        // The catalog says these reason, the name pattern does not
        "deep-research-max-preview-04-2026",
        "deep-research-preview-04-2026",
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
        "gemma-4-26b-a4b-it",
        "gemma-4-31b-it",
        // Matched by the pattern; unknown to the catalog; an alias by suffix
        "gemini-2.5-flash",
        "gemini-unknown",
        "gemini-flash-latest-001",
    ],
}

/** The server's key variable for a provider, as the code reads it today */
function keyVar(p: ProviderName): string {
    if (p === "google") return "GOOGLE_GENERATIVE_AI_API_KEY"
    if (p === "vertexai") return "GOOGLE_VERTEX_API_KEY"
    if (p === "gateway") return "AI_GATEWAY_API_KEY"
    return `${p.toUpperCase()}_API_KEY`
}

/** The server's base URL variable for a provider */
function urlVar(p: ProviderName): string {
    if (p === "vertexai") return "GOOGLE_VERTEX_BASE_URL"
    if (p === "gateway") return "AI_GATEWAY_BASE_URL"
    return `${p.toUpperCase()}_BASE_URL`
}

type Env = Record<string, string>

/** Nine server environments, each a function of the provider under test */
const ENVIRONMENTS: Record<string, (p: ProviderName) => Env> = {
    empty: () => ({}),
    serverKey: (p) => ({ [keyVar(p)]: "server-key" }),
    serverKeyAndUrl: (p) => ({
        [keyVar(p)]: "server-key",
        [urlVar(p)]: "https://server.example/v1",
    }),
    ollamaKey: () => ({ OLLAMA_API_KEY: "server-ollama-key" }),
    azureResource: () => ({ AZURE_RESOURCE_NAME: "server-resource" }),
    anthropicToken: () => ({ ANTHROPIC_AUTH_TOKEN: "server-token" }),
    adminAws: () => ({
        ADMIN_AWS_ACCESS_KEY_ID: "admin-id",
        ADMIN_AWS_SECRET_ACCESS_KEY: "admin-secret",
        ADMIN_AWS_REGION: "eu-west-1",
    }),
    desktop: (p) => ({
        NEXT_AI_DRAWIO_DESKTOP: "1",
        [keyVar(p)]: "server-key",
    }),
    everything: (p) => ({
        [keyVar(p)]: "server-key",
        [urlVar(p)]: "https://server.example/v1",
        OLLAMA_API_KEY: "server-ollama-key",
        AZURE_RESOURCE_NAME: "server-resource",
        ANTHROPIC_AUTH_TOKEN: "server-token",
        ADMIN_AWS_ACCESS_KEY_ID: "admin-id",
        ADMIN_AWS_SECRET_ACCESS_KEY: "admin-secret",
        AWS_REGION: "us-east-1",
    }),
}

const CLIENT_URL = "https://u.example/v1"
const CLIENT_KEY = "client-key"

/** Twenty-two shapes of client override; some need variables of their own */
const SHAPES: Record<
    string,
    { overrides: Omit<ClientOverrides, "provider" | "modelId">; env?: Env }
> = {
    none: { overrides: {} },
    key: { overrides: { apiKey: CLIENT_KEY } },
    url: { overrides: { baseUrl: CLIENT_URL } },
    keyAndUrl: { overrides: { apiKey: CLIENT_KEY, baseUrl: CLIENT_URL } },
    keyAndSlash: { overrides: { apiKey: CLIENT_KEY, baseUrl: "/" } },
    // normalizeBaseUrl drops one endpoint path per call: this URL shows
    // whether it ran once or twice
    keyAndPastedPath: {
        overrides: {
            apiKey: CLIENT_KEY,
            baseUrl: "https://u.example/v1/chat/completions/messages",
        },
    },
    keyEnv: {
        overrides: { apiKeyEnv: "CUSTOM_KEY" },
        env: { CUSTOM_KEY: "custom-env-key" },
    },
    keyEnvEmpty: { overrides: { apiKeyEnv: "CUSTOM_KEY_EMPTY" } },
    keyEnvArrayPartial: {
        overrides: { apiKeyEnv: ["CUSTOM_KEY_EMPTY", "CUSTOM_KEY"] },
        env: { CUSTOM_KEY: "custom-env-key" },
    },
    keyEnvArrayEmpty: {
        overrides: { apiKeyEnv: ["CUSTOM_KEY_EMPTY", "CUSTOM_KEY_EMPTY_2"] },
    },
    keyEnvAndUrlEnv: {
        overrides: { apiKeyEnv: "CUSTOM_KEY", baseUrlEnv: "CUSTOM_URL" },
        env: {
            CUSTOM_KEY: "custom-env-key",
            CUSTOM_URL: "https://custom-env.example/v1",
        },
    },
    awsPair: {
        overrides: {
            awsAccessKeyId: "client-id",
            awsSecretAccessKey: "client-secret",
            awsRegion: "ap-northeast-1",
        },
    },
    awsIdOnly: {
        overrides: { awsAccessKeyId: "client-id", awsRegion: "ap-northeast-1" },
    },
    vertexKeyAndUrl: {
        overrides: { vertexApiKey: "client-vertex-key", baseUrl: CLIENT_URL },
    },
    trustedUrl: { overrides: { baseUrl: CLIENT_URL, trustedBaseUrl: true } },
    // A private address: usesServerEndpoint counts it as the server's network
    keyAndPrivateUrl: {
        overrides: { apiKey: CLIENT_KEY, baseUrl: "http://10.0.0.5:8000/v1" },
    },
    // The Vertex key alone goes to the official endpoint
    vertexKeyOnly: { overrides: { vertexApiKey: "client-vertex-key" } },
    // Temporary AWS credentials carry a session token
    awsPairWithSession: {
        overrides: {
            awsAccessKeyId: "client-id",
            awsSecretAccessKey: "client-secret",
            awsSessionToken: "client-session",
            awsRegion: "ap-northeast-1",
        },
    },
    // The site's cookies and access code, as the routes pass them for EdgeOne
    headersAndUrl: {
        overrides: {
            baseUrl: CLIENT_URL,
            headers: { cookie: "eo_token=t", "x-access-code": "code" },
        },
    },
    // The admin panel's Test of an entry with a key and the server's own URL
    trustedUrlAndKey: {
        overrides: {
            apiKey: CLIENT_KEY,
            baseUrl: CLIENT_URL,
            trustedBaseUrl: true,
        },
    },
    // A user's key with a server model's own URL variable: the key must not
    // go to that URL
    keyAndUrlEnv: {
        overrides: { apiKey: CLIENT_KEY, baseUrlEnv: "CUSTOM_URL" },
        env: { CUSTOM_URL: "https://custom-env.example/v1" },
    },
    // "/" alone cleans up to no URL at all
    slashOnly: { overrides: { baseUrl: "/" } },
}

/** The shapes that carry a client URL, for the MiniMax /anthropic probe */
const URL_SHAPES = ["url", "keyAndUrl", "keyAndPastedPath", "trustedUrl"]

// Only the variables set by a row stay set; everything else is cleared
const touched = new Set<string>()
function setEnv(env: Env) {
    for (const name of touched) delete process.env[name]
    touched.clear()
    for (const [name, value] of Object.entries(env)) {
        process.env[name] = value
        touched.add(name)
    }
}

/** Plain data for the snapshot: functions become labels, undefined is dropped */
async function plain(value: unknown): Promise<unknown> {
    if (typeof value === "function") {
        if ((value as any).sentinel === "guarded") return "guarded"
        // Bedrock's credentialProvider for a client API key must refuse
        try {
            await (value as () => Promise<unknown>)()
            return "function"
        } catch (error) {
            return { rejects: (error as Error).message }
        }
    }
    if (Array.isArray(value)) return Promise.all(value.map(plain))
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {}
        for (const [key, inner] of Object.entries(value)) {
            if (inner !== undefined) out[key] = await plain(inner)
        }
        return out
    }
    return value
}

/** One getAIModel call and the four companion answers */
async function record(overrides: ClientOverrides) {
    let model: unknown
    try {
        const result = getAIModel(overrides)
        model = {
            provider: result.provider,
            modelId: result.modelId,
            model: await plain(result.model),
            ...(result.providerOptions && {
                providerOptions: result.providerOptions,
            }),
        }
    } catch (error) {
        model = { error: (error as Error).message }
    }
    const provider = overrides.provider as ProviderName | undefined
    if (!provider) return model
    const baseUrl = overrides.baseUrl ?? ""
    return {
        getAIModel: model,
        usesServerCredentials: usesServerCredentials(provider, overrides),
        usesServerEndpoint: await usesServerEndpoint(
            provider,
            normalizeBaseUrl(baseUrl),
            overrides.apiKey,
        ),
        globalBaseUrl: globalBaseUrl(provider),
        chatRequestUrl: chatRequestUrl(provider, baseUrl),
    }
}

const lines: string[] = []
function line(label: Record<string, unknown>, result: unknown) {
    lines.push(JSON.stringify({ ...label, ...(result as object) }))
}

/** Every shape in every environment for one provider and model id */
async function matrix(
    provider: ProviderName,
    modelId: string,
    shapes: string[] = Object.keys(SHAPES),
    urlOverride?: string,
) {
    for (const shape of shapes) {
        const { overrides, env } = SHAPES[shape]
        for (const [envName, environment] of Object.entries(ENVIRONMENTS)) {
            setEnv({ ...environment(provider), ...env })
            const row: ClientOverrides = { ...overrides, provider, modelId }
            if (urlOverride && row.baseUrl) row.baseUrl = urlOverride
            line({ provider, modelId, shape, env: envName }, await record(row))
        }
    }
}

// Variables the layer reads, cleared before the matrix runs so the
// machine's own environment cannot reach the snapshot
const AMBIENT =
    /_API_KEY|_BASE_URL|_RESOURCE_NAME|_AUTH_TOKEN|_REASONING_|_THINKING_|^AWS_|^ADMIN_|^AI_|^GOOGLE_TOP_|^OLLAMA_|^NEXT_AI_DRAWIO_DESKTOP$|^ALLOW_PRIVATE_URLS$|^DYNAMODB_QUOTA_TABLE$|^VALIDATION_MODEL$|^CUSTOM_KEY|^CUSTOM_URL$|^KEY_[ABC]$/
const saved: Record<string, string | undefined> = {}

beforeAll(() => {
    for (const name of Object.keys(process.env)) {
        if (AMBIENT.test(name)) {
            saved[name] = process.env[name]
            delete process.env[name]
        }
    }
    vi.spyOn(Math, "random").mockReturnValue(0)
    vi.spyOn(console, "log").mockImplementation(() => {})
})

afterAll(() => {
    setEnv({})
    for (const [name, value] of Object.entries(saved)) {
        if (value !== undefined) process.env[name] = value
    }
    vi.restoreAllMocks()
})

describe("provider behavior snapshot", () => {
    it("covers every provider", () => {
        expect([...MATRIX_PROVIDERS].sort()).toEqual(
            Object.keys(PROVIDERS).sort(),
        )
    })

    it("matches the recorded behavior", async () => {
        // The matrix: 25 providers, 22 shapes, 9 environments
        for (const provider of MATRIX_PROVIDERS) {
            await matrix(provider, MATRIX_MODEL_IDS[provider])
        }

        // Without a provider: auto-detection and the server's AI_PROVIDER
        const detectionEnvs: Record<string, Env> = {}
        for (const p of MATRIX_PROVIDERS) {
            if (["bedrock", "ollama", "edgeone"].includes(p)) continue
            detectionEnvs[`only ${keyVar(p)}`] = { [keyVar(p)]: "server-key" }
        }
        detectionEnvs["vertex and openai"] = {
            GOOGLE_VERTEX_API_KEY: "server-key",
            OPENAI_API_KEY: "server-key",
        }
        detectionEnvs["only OLLAMA_API_KEY"] = {
            OLLAMA_API_KEY: "server-ollama-key",
        }
        detectionEnvs["no key at all"] = {}
        for (const [envName, env] of Object.entries(detectionEnvs)) {
            setEnv(env)
            line(
                { noProvider: true, env: envName },
                {
                    serverProvider: getServerProvider(),
                    getAIModel: await record({ modelId: "test-model" }),
                },
            )
        }
        for (const p of MATRIX_PROVIDERS) {
            setEnv({ AI_PROVIDER: p })
            line(
                { noProvider: true, env: `AI_PROVIDER=${p}` },
                { getAIModel: await record({ modelId: "test-model" }) },
            )
        }

        // Model id probes: OpenAI's chat or responses choice, Doubao's
        // DeepSeek detection, MiniMax's protocol from the URL path
        for (const modelId of ["gpt-5", "gpt-4o"]) {
            await matrix("openai", modelId)
        }
        for (const modelId of ["deepseek-v3", "doubao-seed"]) {
            await matrix("doubao", modelId)
        }
        await matrix(
            "minimax",
            MATRIX_MODEL_IDS.minimax,
            URL_SHAPES,
            "https://u.example/anthropic",
        )

        // providerOptions probes: which model ids get reasoning options
        for (const provider of ["openai", "google"] as const) {
            setEnv(ENVIRONMENTS.serverKey(provider))
            for (const modelId of REASONING_PROBE_IDS[provider] ?? []) {
                const { providerOptions } = getAIModel({ provider, modelId })
                line(
                    { reasoningProbe: true, provider, modelId },
                    { providerOptions: providerOptions ?? null },
                )
            }
        }

        await expect(lines.join("\n") + "\n").toMatchFileSnapshot(
            "./__snapshots__/provider-matrix.jsonl",
        )
    })

    it("draws an array apiKeyEnv at random among the variables with a value", () => {
        setEnv({ KEY_A: "a", KEY_B: "b", KEY_C: "c" })
        const overrides = {
            provider: "openai",
            modelId: "gpt-4o",
            apiKeyEnv: ["KEY_A", "KEY_B", "KEY_C"],
        }
        vi.mocked(Math.random).mockReturnValue(0)
        expect((getAIModel(overrides).model as any).options.apiKey).toBe("a")
        vi.mocked(Math.random).mockReturnValue(0.999)
        expect((getAIModel(overrides).model as any).options.apiKey).toBe("c")
        vi.mocked(Math.random).mockReturnValue(0)
        // None set: the server credential check refuses before any fallback
        setEnv({ OPENAI_API_KEY: "default-key" })
        expect(() => getAIModel(overrides)).toThrow(/At least one of/)
    })
})
