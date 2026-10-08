// What the model settings show about providers: the groups of the provider
// picker, and how far a provider's setup has come

import {
    PROVIDER_INFO,
    type ProviderConfig,
    type ProviderName,
} from "@/lib/types/model-config"

export type ProviderGroupId = "vendors" | "aggregators" | "cloud" | "selfHosted"

/** The provider picker's groups, each provider in exactly one */
export const PROVIDER_GROUPS: {
    id: ProviderGroupId
    providers: ProviderName[]
}[] = [
    {
        id: "vendors",
        providers: [
            "openai",
            "anthropic",
            "google",
            "deepseek",
            "qwen",
            "doubao",
            "glm",
            "kimi",
            "minimax",
            "mimo",
        ],
    },
    {
        id: "aggregators",
        providers: [
            "openrouter",
            "aihubmix",
            "siliconflow",
            "modelscope",
            "novita",
            "atlascloud",
            "qiniu",
            "gateway",
        ],
    },
    { id: "cloud", providers: ["bedrock", "vertexai", "azure", "edgeone"] },
    { id: "selfHosted", providers: ["ollama", "sglang"] },
]

/** Shown when the user has no provider yet */
export const POPULAR_PROVIDERS: ProviderName[] = [
    "openai",
    "anthropic",
    "google",
    "deepseek",
    "openrouter",
    "qwen",
]

/** Providers that need something other than a plain API key */
export const PROVIDER_NOTE_KEYS: Partial<Record<ProviderName, string>> = {
    bedrock: "noteBedrock",
    vertexai: "noteVertex",
    azure: "noteAzure",
    edgeone: "noteEdgeone",
    ollama: "noteOllama",
    sglang: "noteSglang",
}

/**
 * Providers whose base URL usually needs changing (Azure's default is only
 * an example; Ollama's is its cloud, SGLang's a local server) or comes with
 * a hint (MiniMax, MiMo): their folded options start open
 */
export const OPTIONS_OPEN: ProviderName[] = [
    "azure",
    "ollama",
    "sglang",
    "minimax",
    "mimo",
]

/** The groups with only the providers whose name matches the search */
export function filterProviderGroups(query: string) {
    const q = query.trim().toLowerCase()
    if (!q) return PROVIDER_GROUPS
    return PROVIDER_GROUPS.map((group) => ({
        ...group,
        providers: group.providers.filter(
            (p) =>
                PROVIDER_INFO[p].label.toLowerCase().includes(q) ||
                p.includes(q),
        ),
    })).filter((group) => group.providers.length > 0)
}

/** The credentials a test or a chat request needs are filled in */
export function hasCredentials(p: ProviderConfig): boolean {
    switch (p.provider) {
        case "bedrock":
            return (
                (!!p.apiKey ||
                    (!!p.awsAccessKeyId && !!p.awsSecretAccessKey)) &&
                !!p.awsRegion
            )
        case "vertexai":
            return !!p.vertexApiKey
        // Its default base URL names no real resource
        case "azure":
            return (
                !!p.apiKey &&
                !!p.baseUrl &&
                p.baseUrl !== PROVIDER_INFO.azure.defaultBaseUrl
            )
        case "edgeone":
        case "ollama":
            return true
        default:
            return !!p.apiKey
    }
}

export type ProviderStatus =
    | { kind: "error"; count: number }
    | { kind: "incomplete" }
    | { kind: "untested"; count: number }
    | { kind: "ok"; count: number }

/** The one thing about a provider that most needs the user's attention */
export function providerStatus(p: ProviderConfig): ProviderStatus {
    const failed = p.models.filter((m) => m.validated === false).length
    if (failed > 0) return { kind: "error", count: failed }
    if (!hasCredentials(p) || p.models.length === 0) {
        return { kind: "incomplete" }
    }
    const untested = p.models.filter((m) => m.validated !== true).length
    if (untested > 0) return { kind: "untested", count: untested }
    return { kind: "ok", count: p.models.length }
}
