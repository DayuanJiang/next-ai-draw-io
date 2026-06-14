import { z } from "zod"
import {
    ProviderNameSchema,
    type ServerModelsConfig,
} from "@/lib/server-model-config"
import {
    FIXED_CRED_PROVIDERS,
    PROVIDER_INFO,
    type ProviderName,
} from "@/lib/types/model-config"
import { type MaskedSecret, maskSecret } from "./auth"
import { loadSettings } from "./settings"

// Admin-configured providers, mirroring the user ModelConfigDialog's data
// model but stored server-side (settings.json, ADMIN_PROVIDERS key).
//
// They COEXIST with an env-based AI_MODELS_CONFIG / ai-models.json:
// loadRawServerModelsConfig() merges the env baseline with the panel's
// providers at read time, so .env stays authoritative for its own entries.
// Panel credentials are written to ADMIN_-prefixed env vars (wired up via
// apiKeyEnv/baseUrlEnv) so they never shadow standard vars like
// OPENAI_API_KEY that env-based entries may rely on.

export const ADMIN_PROVIDERS_KEY = "ADMIN_PROVIDERS"

// A secret field in transit: plaintext string (new value) or an
// {isSet} marker meaning "keep the stored value".
const SecretInputSchema = z
    .union([z.string(), z.object({ isSet: z.literal(true), hint: z.string() })])
    .optional()

export const AdminProviderSchema = z.object({
    id: z.string().min(1),
    provider: ProviderNameSchema,
    name: z.string().optional(),
    apiKey: SecretInputSchema,
    baseUrl: z.string().optional(),
    awsAccessKeyId: SecretInputSchema,
    awsSecretAccessKey: SecretInputSchema,
    awsRegion: z.string().optional(),
    vertexApiKey: SecretInputSchema,
    models: z.array(z.string().min(1)),
    isDefault: z.boolean().optional(),
})

export const AdminProvidersSchema = z.array(AdminProviderSchema)

// Stored shape: secrets are plain strings (never {isSet} markers, which
// only exist in transit). Used to validate ADMIN_PROVIDERS on load so a
// hand-edited/corrupted value can't slip a marker object past maskSecret.
const StoredAdminProviderSchema = AdminProviderSchema.extend({
    apiKey: z.string().optional(),
    awsAccessKeyId: z.string().optional(),
    awsSecretAccessKey: z.string().optional(),
    vertexApiKey: z.string().optional(),
})

export type AdminProviderInput = z.infer<typeof AdminProviderSchema>

// Stored form: secrets are plain strings
export interface StoredAdminProvider {
    id: string
    provider: ProviderName
    name?: string
    apiKey?: string
    baseUrl?: string
    awsAccessKeyId?: string
    awsSecretAccessKey?: string
    awsRegion?: string
    vertexApiKey?: string
    models: string[]
    isDefault?: boolean
}

const SECRET_FIELDS = [
    "apiKey",
    "awsAccessKeyId",
    "awsSecretAccessKey",
    "vertexApiKey",
] as const

// ADMIN_-prefixed env var names for instance `index` (0-based) of a provider
function credEnvNames(
    provider: ProviderName,
    index: number,
): { key?: string; url?: string } {
    if (FIXED_CRED_PROVIDERS.includes(provider) || provider === "edgeone") {
        return {}
    }
    const prefix =
        provider === "gateway" ? "AI_GATEWAY" : provider.toUpperCase()
    const suffix = index === 0 ? "" : `_${index + 1}`
    return {
        key: `ADMIN_${prefix}_API_KEY${suffix}`,
        url: `ADMIN_${prefix}_BASE_URL${suffix}`,
    }
}

export function loadAdminProviders(): StoredAdminProvider[] {
    const raw = loadSettings()[ADMIN_PROVIDERS_KEY]
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        // Validate each entry's shape — a malformed/hand-edited value must
        // not reach runtime code that assumes provider/models exist.
        return parsed.flatMap((entry) => {
            const result = StoredAdminProviderSchema.safeParse(entry)
            return result.success ? [result.data as StoredAdminProvider] : []
        })
    } catch {
        console.error("[admin-providers] Failed to parse stored providers")
        return []
    }
}

export type MaskedAdminProvider = Omit<
    StoredAdminProvider,
    (typeof SECRET_FIELDS)[number]
> & {
    apiKey?: MaskedSecret
    awsAccessKeyId?: MaskedSecret
    awsSecretAccessKey?: MaskedSecret
    vertexApiKey?: MaskedSecret
}

export function maskAdminProviders(
    list: StoredAdminProvider[],
): MaskedAdminProvider[] {
    return list.map((p) => {
        const masked: MaskedAdminProvider = { ...p } as MaskedAdminProvider
        for (const field of SECRET_FIELDS) {
            const value = p[field]
            masked[field] = value ? maskSecret(value) : undefined
        }
        return masked
    })
}

// Resolve {isSet} markers in incoming secrets against the stored list
export function mergeSecrets(
    incoming: AdminProviderInput[],
    stored: StoredAdminProvider[],
): StoredAdminProvider[] {
    const storedById = new Map(stored.map((p) => [p.id, p]))
    return incoming.map((p) => {
        const prev = storedById.get(p.id)
        const merged = { ...p } as StoredAdminProvider
        for (const field of SECRET_FIELDS) {
            const value = p[field]
            if (typeof value === "string") {
                merged[field] = value || undefined
            } else if (value?.isSet) {
                merged[field] = prev?.[field]
            } else {
                merged[field] = undefined
            }
        }
        return merged
    })
}

function displayName(p: StoredAdminProvider): string {
    return p.name?.trim() || PROVIDER_INFO[p.provider].label
}

export function validateAdminProviders(
    list: StoredAdminProvider[],
    envConfig: ServerModelsConfig | null = null,
): string | null {
    const envProviders = envConfig?.providers ?? []
    for (const single of FIXED_CRED_PROVIDERS) {
        if (list.filter((p) => p.provider === single).length > 1) {
            return `Only one ${PROVIDER_INFO[single].label} provider is supported (its credentials use fixed environment variables).`
        }
        // Its credentials are global; a panel instance would silently
        // override the credentials env-configured models rely on
        if (
            list.some((p) => p.provider === single) &&
            envProviders.some((p) => p.provider === single)
        ) {
            return `${PROVIDER_INFO[single].label} is already configured in AI_MODELS_CONFIG / ai-models.json and shares global credentials. Manage it via the environment configuration instead.`
        }
    }
    const names = list.map((p) => displayName(p))
    if (new Set(names).size !== names.length) {
        return "Provider display names must be unique."
    }
    const envNames = new Set(envProviders.map((p) => p.name))
    const clash = names.find((n) => envNames.has(n))
    if (clash) {
        return `"${clash}" is already defined in AI_MODELS_CONFIG / ai-models.json. Use a different display name.`
    }
    if (list.filter((p) => p.isDefault).length > 1) {
        return "Only one provider can be the default."
    }
    return null
}

// The panel's contribution to the server models config, derived at read
// time and merged with the env baseline by loadRawServerModelsConfig().
export function adminProvidersToConfig(
    list: StoredAdminProvider[],
): ServerModelsConfig {
    const config: ServerModelsConfig = { providers: [] }
    const indexByProvider = new Map<ProviderName, number>()
    for (const p of list) {
        const index = indexByProvider.get(p.provider) ?? 0
        indexByProvider.set(p.provider, index + 1)
        if (p.models.length === 0) continue
        const env = credEnvNames(p.provider, index)
        config.providers.push({
            name: displayName(p),
            provider: p.provider,
            models: p.models,
            ...(env.key && p.apiKey ? { apiKeyEnv: env.key } : {}),
            ...(env.url && p.baseUrl ? { baseUrlEnv: env.url } : {}),
            ...(p.isDefault ? { default: true } : {}),
        })
    }
    return config
}

// Settings updates derived from the provider list: credential env vars,
// the stored list itself, and AI_PROVIDER/AI_MODEL when a default is set.
// Keys derived from `previous` but absent now are set to null (removed,
// falling back to the environment).
export function deriveEnvUpdates(
    list: StoredAdminProvider[],
    previous: StoredAdminProvider[],
): Record<string, string | null> {
    const updates: Record<string, string | null> = {}

    // Clear everything the previous list owned, then overwrite below
    for (const key of derivedEnvKeys(previous)) updates[key] = null

    const indexByProvider = new Map<ProviderName, number>()
    for (const p of list) {
        const index = indexByProvider.get(p.provider) ?? 0
        indexByProvider.set(p.provider, index + 1)

        if (p.provider === "bedrock") {
            if (p.awsAccessKeyId) updates.AWS_ACCESS_KEY_ID = p.awsAccessKeyId
            if (p.awsSecretAccessKey)
                updates.AWS_SECRET_ACCESS_KEY = p.awsSecretAccessKey
            if (p.awsRegion) updates.AWS_REGION = p.awsRegion
        } else if (p.provider === "vertexai") {
            if (p.vertexApiKey) updates.GOOGLE_VERTEX_API_KEY = p.vertexApiKey
            if (p.baseUrl) updates.GOOGLE_VERTEX_BASE_URL = p.baseUrl
        } else if (p.provider === "ollama") {
            if (p.apiKey) updates.OLLAMA_API_KEY = p.apiKey
            if (p.baseUrl) updates.OLLAMA_BASE_URL = p.baseUrl
        } else {
            const env = credEnvNames(p.provider, index)
            if (env.key && p.apiKey) updates[env.key] = p.apiKey
            if (env.url && p.baseUrl) updates[env.url] = p.baseUrl
        }
    }

    updates[ADMIN_PROVIDERS_KEY] = list.length > 0 ? JSON.stringify(list) : null

    // The panel's default also becomes the server-wide default model;
    // without one, the env-configured default applies.
    const defaultEntry = list.find((p) => p.isDefault && p.models.length > 0)
    if (defaultEntry) {
        updates.AI_PROVIDER = defaultEntry.provider
        updates.AI_MODEL = defaultEntry.models[0]
    }

    return updates
}

// Every settings key the panel may have written for a given list.
// AI_MODELS_CONFIG is included to clean up values written by older
// versions of the panel (it is no longer written).
function derivedEnvKeys(list: StoredAdminProvider[]): string[] {
    const keys = new Set<string>([
        "AI_MODELS_CONFIG",
        "AI_PROVIDER",
        "AI_MODEL",
    ])
    const indexByProvider = new Map<ProviderName, number>()
    for (const p of list) {
        const index = indexByProvider.get(p.provider) ?? 0
        indexByProvider.set(p.provider, index + 1)
        if (p.provider === "bedrock") {
            keys.add("AWS_ACCESS_KEY_ID")
            keys.add("AWS_SECRET_ACCESS_KEY")
            keys.add("AWS_REGION")
        } else if (p.provider === "vertexai") {
            keys.add("GOOGLE_VERTEX_API_KEY")
            keys.add("GOOGLE_VERTEX_BASE_URL")
        } else if (p.provider === "ollama") {
            keys.add("OLLAMA_API_KEY")
            keys.add("OLLAMA_BASE_URL")
        } else {
            const env = credEnvNames(p.provider, index)
            if (env.key) keys.add(env.key)
            if (env.url) keys.add(env.url)
        }
    }
    return [...keys]
}
