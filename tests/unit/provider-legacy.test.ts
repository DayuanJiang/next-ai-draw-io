/**
 * Differential tests for the provider refactor. The two quota functions'
 * bodies as they were before the refactor are copied here; every equivalence
 * class of their inputs is enumerated and the live functions must agree.
 * These copies go away once the functions read the provider record (step 4c);
 * the snapshot in provider-matrix.test.ts keeps their answers after that.
 *
 * The last block checks that every provider-keyed table names only known
 * providers, so a typo in one table cannot hide behind a Partial type.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import {
    type ClientOverrides,
    resolveEndpoint,
    SINGLE_SYSTEM_PROVIDERS,
    usesServerCredentials,
    usesServerEndpoint,
} from "@/lib/ai-providers"
import {
    OPTIONS_OPEN,
    POPULAR_PROVIDERS,
    PROVIDER_GROUPS,
    PROVIDER_NOTE_KEYS,
} from "@/lib/provider-setup"
import {
    FIXED_CRED_PROVIDERS,
    normalizeBaseUrl,
    PROVIDER_INFO,
    PROVIDER_LOGO_MAP,
    type ProviderName,
    SUGGESTED_MODELS,
} from "@/lib/types/model-config"

vi.mock("@/lib/admin/settings", () => ({
    loadSettings: () => ({}),
    getEnvFallback: (key: string) => process.env[key] ?? null,
}))

const PRIVATE_HOSTS = new Set(["10.0.0.5", "localhost"])
const isPrivate = (url: string) => PRIVATE_HOSTS.has(new URL(url).hostname)

vi.mock("@/lib/ssrf-protection", async (importOriginal) => {
    const actual =
        await importOriginal<typeof import("@/lib/ssrf-protection")>()
    return {
        ...actual,
        isPrivateUrl: async (url: string) =>
            new Set(["10.0.0.5", "localhost"]).has(new URL(url).hostname),
    }
})

const PROVIDERS = Object.keys(PROVIDER_INFO) as ProviderName[]

// lib/ai-providers.ts usesServerCredentials, copied before the refactor
function legacyUsesServerCredentials(
    provider: ProviderName,
    overrides?: ClientOverrides,
): boolean {
    // The desktop app's local server only has the user's own keys (its .env)
    if (process.env.NEXT_AI_DRAWIO_DESKTOP === "1") return false
    // Cleaned like getAIModel does: "/" means no base URL
    const baseUrl = normalizeBaseUrl(overrides?.baseUrl ?? "")
    switch (provider) {
        case "bedrock":
            return !(
                overrides?.apiKey ||
                (overrides?.awsAccessKeyId && overrides?.awsSecretAccessKey)
            )
        case "vertexai":
            return !overrides?.vertexApiKey
        case "edgeone":
            // The platform's own endpoint, no key involved
            return false
        case "ollama":
            // Only a server key costs money; a keyless local server or the
            // client's own server does not
            return (
                !baseUrl &&
                !overrides?.apiKey &&
                !!(overrides?.apiKeyEnv || process.env.OLLAMA_API_KEY)
            )
        default:
            return !overrides?.apiKey
    }
}

// lib/ai-providers.ts usesServerEndpoint, copied before the refactor, with
// isPrivateUrl replaced by a synchronous host name check
function legacyUsesServerEndpoint(
    provider: ProviderName | null | undefined,
    clientBaseUrl: string,
    apiKey: string | null | undefined,
): boolean {
    if (process.env.NEXT_AI_DRAWIO_DESKTOP === "1") return false
    if (provider === "edgeone") return true
    if (provider === "ollama" && !clientBaseUrl && !apiKey) return true
    return provider !== "bedrock" && !!clientBaseUrl && isPrivate(clientBaseUrl)
}

const saved: Record<string, string | undefined> = {}
const VARS = [
    "NEXT_AI_DRAWIO_DESKTOP",
    "OLLAMA_API_KEY",
    "SET_VAR",
    "EMPTY_VAR",
]

beforeAll(() => {
    for (const name of VARS) {
        saved[name] = process.env[name]
        delete process.env[name]
    }
    process.env.SET_VAR = "a-value"
})

afterAll(() => {
    for (const name of VARS) {
        if (saved[name] === undefined) delete process.env[name]
        else process.env[name] = saved[name]
    }
})

function setFlag(name: string, on: boolean) {
    if (on) process.env[name] = "1"
    else delete process.env[name]
}

describe("usesServerCredentials against its pre-refactor body", () => {
    it("agrees on all 30720 input classes", () => {
        const apiKeys = [undefined, "k"]
        const baseUrls = [
            undefined,
            "/",
            "https://u.example",
            "https://u.example/v1/chat/completions/messages",
        ]
        const awsIds = [undefined, "id"]
        const awsSecrets = [undefined, "s"]
        const vertexKeys = [undefined, "v"]
        const apiKeyEnvs: (string | string[] | undefined)[] = [
            undefined,
            "SET_VAR",
            "EMPTY_VAR",
            ["EMPTY_VAR", "SET_VAR"],
            ["EMPTY_VAR", "EMPTY_VAR_2"],
        ]
        let count = 0
        for (const desktop of [false, true]) {
            setFlag("NEXT_AI_DRAWIO_DESKTOP", desktop)
            for (const ollamaKey of [false, true]) {
                if (ollamaKey) process.env.OLLAMA_API_KEY = "server-ollama-key"
                else delete process.env.OLLAMA_API_KEY
                for (const provider of PROVIDERS)
                    for (const apiKey of apiKeys)
                        for (const baseUrl of baseUrls)
                            for (const awsAccessKeyId of awsIds)
                                for (const awsSecretAccessKey of awsSecrets)
                                    for (const vertexApiKey of vertexKeys)
                                        for (const apiKeyEnv of apiKeyEnvs) {
                                            const overrides: ClientOverrides = {
                                                apiKey,
                                                baseUrl,
                                                awsAccessKeyId,
                                                awsSecretAccessKey,
                                                vertexApiKey,
                                                apiKeyEnv,
                                            }
                                            const expected =
                                                legacyUsesServerCredentials(
                                                    provider,
                                                    overrides,
                                                )
                                            const actual =
                                                usesServerCredentials(
                                                    provider,
                                                    overrides,
                                                )
                                            if (actual !== expected) {
                                                expect.fail(
                                                    `${provider} ${JSON.stringify(overrides)} desktop=${desktop} ollamaKey=${ollamaKey}: ${actual} instead of ${expected}`,
                                                )
                                            }
                                            // resolveEndpoint's keySource is
                                            // what the function will read;
                                            // the desktop rule stays outside
                                            const fromEndpoint =
                                                !desktop &&
                                                resolveEndpoint(provider, {
                                                    ...overrides,
                                                    baseUrl: normalizeBaseUrl(
                                                        baseUrl ?? "",
                                                    ),
                                                }).keySource === "server"
                                            if (fromEndpoint !== expected) {
                                                expect.fail(
                                                    `resolveEndpoint ${provider} ${JSON.stringify(overrides)} ollamaKey=${ollamaKey}: ${fromEndpoint} instead of ${expected}`,
                                                )
                                            }
                                            count++
                                        }
            }
        }
        expect(count).toBe(30720)
    })
})

describe("usesServerEndpoint against its pre-refactor body", () => {
    it("agrees on all 288 input classes", async () => {
        let count = 0
        for (const desktop of [false, true]) {
            setFlag("NEXT_AI_DRAWIO_DESKTOP", desktop)
            for (const provider of PROVIDERS) {
                for (const clientBaseUrl of [
                    "",
                    "https://u.example",
                    "http://10.0.0.5:8000",
                ]) {
                    for (const apiKey of [undefined, "k"]) {
                        const expected = legacyUsesServerEndpoint(
                            provider,
                            clientBaseUrl,
                            apiKey,
                        )
                        const actual = await usesServerEndpoint(
                            provider,
                            clientBaseUrl,
                            apiKey,
                        )
                        if (actual !== expected) {
                            expect.fail(
                                `${provider} url=${clientBaseUrl} key=${apiKey} desktop=${desktop}: ${actual} instead of ${expected}`,
                            )
                        }
                        count++
                    }
                }
            }
        }
        expect(count).toBe(288)
    })
})

describe("provider-keyed tables", () => {
    const names = new Set<string>(PROVIDERS)
    const onlyKnown = (list: Iterable<string>, table: string) => {
        const items = [...list]
        for (const p of items) {
            if (!names.has(p)) expect.fail(`${table} names unknown "${p}"`)
        }
        expect(new Set(items).size, `${table} has duplicates`).toBe(
            items.length,
        )
    }

    it("name only known providers, each once", () => {
        onlyKnown(SINGLE_SYSTEM_PROVIDERS, "SINGLE_SYSTEM_PROVIDERS")
        onlyKnown(FIXED_CRED_PROVIDERS, "FIXED_CRED_PROVIDERS")
        onlyKnown(Object.keys(PROVIDER_LOGO_MAP), "PROVIDER_LOGO_MAP")
        onlyKnown(Object.keys(SUGGESTED_MODELS), "SUGGESTED_MODELS")
        onlyKnown(POPULAR_PROVIDERS, "POPULAR_PROVIDERS")
        onlyKnown(Object.keys(PROVIDER_NOTE_KEYS), "PROVIDER_NOTE_KEYS")
        onlyKnown(OPTIONS_OPEN, "OPTIONS_OPEN")
        const grouped = PROVIDER_GROUPS.flatMap((g) => g.providers)
        onlyKnown(grouped, "PROVIDER_GROUPS")
        expect(grouped.length).toBe(PROVIDERS.length)
    })
})
