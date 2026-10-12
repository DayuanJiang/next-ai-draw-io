// What the model settings show about providers: the groups of the provider
// picker, and how far a provider's setup has come

import {
    PROVIDER_NAMES,
    PROVIDERS,
    type ProviderGroup as ProviderGroupId,
} from "@/lib/providers"
import type { ProviderConfig, ProviderName } from "@/lib/types/model-config"

/** The provider picker's groups, each provider in exactly one, in record order */
export const PROVIDER_GROUPS: {
    id: ProviderGroupId
    providers: ProviderName[]
}[] = (["vendors", "aggregators", "cloud", "selfHosted"] as const).map(
    (id) => ({
        id,
        providers: PROVIDER_NAMES.filter((p) => PROVIDERS[p].group === id),
    }),
)

/** Shown when the user has no provider yet */
export const POPULAR_PROVIDERS: ProviderName[] = [
    "openai",
    "anthropic",
    "google",
    "deepseek",
    "openrouter",
    "qwen",
]

/** The groups with only the providers whose name matches the search */
export function filterProviderGroups(query: string) {
    const q = query.trim().toLowerCase()
    if (!q) return PROVIDER_GROUPS
    return PROVIDER_GROUPS.map((group) => ({
        ...group,
        providers: group.providers.filter(
            (p) =>
                PROVIDERS[p].label.toLowerCase().includes(q) || p.includes(q),
        ),
    })).filter((group) => group.providers.length > 0)
}

const LEGACY_AZURE_PLACEHOLDER = "https://your-resource.openai.azure.com/openai"

/** The credentials a test or a chat request needs are filled in */
export function hasCredentials(p: ProviderConfig): boolean {
    const def = PROVIDERS[p.provider]
    switch (def.credential) {
        case "aws":
            return (
                (!!p.apiKey ||
                    (!!p.awsAccessKeyId && !!p.awsSecretAccessKey)) &&
                !!p.awsRegion
            )
        case "vertexKey":
            return !!p.vertexApiKey
        case "none":
        case "optionalKey":
            return true
        case "apiKey": {
            // Without a default URL in the record (Azure, custom) the user's
            // own is part of the credentials. Entries saved while Azure still
            // had a placeholder default hold that placeholder; it names no
            // real resource
            const baseUrl =
                p.baseUrl === LEGACY_AZURE_PLACEHOLDER ? "" : p.baseUrl
            return !!p.apiKey && (!!def.defaultBaseUrl || !!baseUrl)
        }
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
