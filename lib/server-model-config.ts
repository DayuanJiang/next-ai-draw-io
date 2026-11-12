import fs from "fs/promises"
import path from "path"
import { z } from "zod"
import { getEnvFallback } from "@/lib/admin/settings"
import { PROVIDERS, type ProviderName } from "@/lib/providers"

export const ProviderNameSchema: z.ZodType<ProviderName> = z
    .string()
    .refine((val): val is ProviderName => Object.hasOwn(PROVIDERS, val), {
        message: "Invalid provider name",
    })

const ServerProviderSchema = z.object({
    name: z.string().min(1),
    provider: ProviderNameSchema,
    models: z.array(z.string().min(1)),
    // Optional: custom environment variable name(s) for API key
    // Can be a single string or array of strings for load balancing
    // e.g., "OPENAI_API_KEY_TEAM_A" or ["OPENAI_KEY_1", "OPENAI_KEY_2"]
    apiKeyEnv: z
        .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
        .optional(),
    // Optional: custom environment variable name for base URL
    baseUrlEnv: z.string().min(1).optional(),
    // Optional: mark the first model in this provider as the default
    default: z.boolean().optional(),
})

export const ServerModelsConfigSchema = z.object({
    providers: z.array(ServerProviderSchema),
})

export type ServerModelsConfig = z.infer<typeof ServerModelsConfigSchema>

export interface FlattenedServerModel {
    id: string // "server:<slugified-name>:<modelId>" - name ensures uniqueness for multiple API keys per provider
    modelId: string
    provider: ProviderName
    providerLabel: string
    isDefault: boolean
    // Custom env var name(s) for API key (optional)
    // Can be a single string or array of strings for load balancing
    apiKeyEnv?: string | string[]
    baseUrlEnv?: string
}

/**
 * Convert provider name to URL-safe slug for use in model ID
 * e.g., "OpenAI Production" → "openai-production", "主力" → "4e3b-529b"
 * Non-ASCII characters become their hex code point so CJK names stay
 * distinct; the id is sent in HTTP headers, which must be ASCII.
 */
export function slugify(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^\p{ASCII}]/gu, (c) => `-${c.codePointAt(0)?.toString(16)}-`)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
}

function getConfigPath(): string {
    const custom = process.env.AI_MODELS_CONFIG_PATH
    if (custom && custom.trim().length > 0) return custom
    return path.join(process.cwd(), "ai-models.json")
}

/**
 * Synthesize a config from a comma-separated AI_MODEL value (Priority 3 fallback).
 * Lets users expose multiple models without authoring AI_MODELS_CONFIG / ai-models.json.
 * Triggers only when AI_MODEL contains a comma AND AI_PROVIDER is set to a known provider.
 * With lone, only when AI_MODEL is one model instead (see
 * loadRawServerModelsConfig); without AI_PROVIDER that model runs on
 * detected, the one provider the server has a key for.
 * Reads the environment's own values: a default set in the admin panel
 * overlays AI_PROVIDER and AI_MODEL on process.env with its one model.
 */
function configFromAiModel(
    lone = false,
    detected: ProviderName | null = null,
): ServerModelsConfig | null {
    const aiModel = getEnvFallback("AI_MODEL")
    if (!aiModel || aiModel.includes(",") === lone) return null

    const aiProvider = getEnvFallback("AI_PROVIDER") ?? detected
    if (!aiProvider) {
        if (!lone) {
            console.warn(
                "[server-model-config] AI_MODEL contains commas but AI_PROVIDER is not set; " +
                    "skipping multi-model fallback. Set AI_PROVIDER, or use AI_MODELS_CONFIG / ai-models.json.",
            )
        }
        return null
    }
    if (!Object.hasOwn(PROVIDERS, aiProvider)) {
        console.warn(
            `[server-model-config] AI_PROVIDER="${aiProvider}" is not a known provider; skipping multi-model fallback.`,
        )
        return null
    }

    const models = Array.from(
        new Set(
            aiModel
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
        ),
    )
    if (models.length === 0) return null

    const providerName = aiProvider as ProviderName
    return {
        providers: [
            {
                name: PROVIDERS[providerName].label,
                provider: providerName,
                models,
                default: true,
            },
        ],
    }
}

export async function loadEnvServerModelsConfig(): Promise<ServerModelsConfig | null> {
    // Priority 1: AI_MODELS_CONFIG env var (JSON string) - for cloud deployments
    const envConfig = process.env.AI_MODELS_CONFIG
    if (envConfig && envConfig.trim().length > 0) {
        try {
            const json = JSON.parse(envConfig)
            return ServerModelsConfigSchema.parse(json)
        } catch (err) {
            console.error(
                "[server-model-config] Failed to parse AI_MODELS_CONFIG:",
                err,
            )
            return null
        }
    }

    // Priority 2: ai-models.json file
    const configPath = getConfigPath()
    try {
        // turbopackIgnore: see getSettingsPath in lib/admin/settings.ts
        const jsonStr = await fs.readFile(
            /* turbopackIgnore: true */ configPath,
            "utf8",
        )
        const json = JSON.parse(jsonStr)
        return ServerModelsConfigSchema.parse(json)
    } catch (err: any) {
        if (err?.code !== "ENOENT") {
            console.error(
                "[server-model-config] Failed to load ai-models.json:",
                err,
            )
            return null
        }
    }

    // Priority 3: AI_MODEL with comma-separated values + AI_PROVIDER
    return configFromAiModel()
}

export async function loadRawServerModelsConfig(): Promise<ServerModelsConfig | null> {
    const envConfig = await loadEnvServerModelsConfig()

    // Merge in providers managed via the admin panel (settings.json).
    // Dynamic import to avoid a module-init cycle with lib/admin/providers.
    const { adminProvidersToConfig, loadAdminProviders } = await import(
        "./admin/providers"
    )
    const adminConfig = adminProvidersToConfig(loadAdminProviders())

    if (adminConfig.providers.length === 0) return envConfig

    // A lone AI_MODEL is in no list: clients use it by selecting nothing,
    // which they only do while the server lists no models. The panel's
    // providers end that, so the environment's model joins the list as its
    // default; without it the model would leave the picker and every user
    // would move to the panel's first model. Left out when a panel provider
    // of the same name already lists it (it would have the same id).
    let env = envConfig
    if (!env) {
        // Dynamic import: lib/ai-providers imports lib/admin/providers
        const { detectProvider } = await import("./ai-providers")
        const lone = configFromAiModel(true, detectProvider())?.providers[0]
        const listed =
            lone &&
            adminConfig.providers.some(
                (p) =>
                    slugify(p.name) === slugify(lone.name) &&
                    p.models.includes(lone.models[0]),
            )
        if (lone && !listed) env = { providers: [lone] }
    }
    if (!env) return adminConfig

    // A panel default overrides an env default
    const adminHasDefault = adminConfig.providers.some((p) => p.default)
    const envProviders = adminHasDefault
        ? env.providers.map((p) =>
              p.default ? { ...p, default: undefined } : p,
          )
        : env.providers
    return { providers: [...envProviders, ...adminConfig.providers] }
}

export async function loadFlattenedServerModels(): Promise<
    FlattenedServerModel[]
> {
    const cfg = await loadRawServerModelsConfig()
    if (!cfg) return []

    const defaultProvider = process.env.AI_PROVIDER as ProviderName | undefined
    const defaultModelId = process.env.AI_MODEL
    const hasDefaultProvider = cfg.providers.some((p) => p.default === true)

    const flattened: FlattenedServerModel[] = []
    const seenIds = new Set<string>()

    for (const p of cfg.providers) {
        const providerLabel = p.name

        // Use slugified name for unique ID (supports multiple API keys per provider)
        const nameSlug = slugify(p.name)

        for (const modelId of p.models) {
            const id = `server:${nameSlug}:${modelId}`
            // Names that differ only in case or punctuation share a slug.
            // A repeated id would always resolve to the first provider's
            // credentials, so drop it instead.
            if (seenIds.has(id)) {
                console.warn(
                    `[server-model-config] Skipping duplicate model id "${id}". Provider names must differ in letters or digits.`,
                )
                continue
            }
            seenIds.add(id)

            // Default model priority:
            // 1. From ai-models.json: first model of provider with default: true
            // 2. From env vars: AI_MODEL matches (legacy behavior)
            // Only one of the two: a panel default is also written to
            // AI_PROVIDER and AI_MODEL, where it would mark an environment
            // entry of the same provider and model as well, listed first.
            const isDefault = hasDefaultProvider
                ? p.default === true && modelId === p.models[0]
                : !!defaultModelId &&
                  modelId === defaultModelId &&
                  (!defaultProvider || defaultProvider === p.provider)

            flattened.push({
                id,
                modelId,
                provider: p.provider,
                providerLabel,
                isDefault,
                apiKeyEnv: p.apiKeyEnv,
                baseUrlEnv: p.baseUrlEnv,
            })
        }
    }

    return flattened
}

/**
 * Find a server model by its ID (format: "server:<slugified-name>:<modelId>")
 * Returns the model config including apiKeyEnv/baseUrlEnv if configured
 */
export async function findServerModelById(
    modelId: string,
): Promise<FlattenedServerModel | null> {
    const models = await loadFlattenedServerModels()
    return models.find((m) => m.id === modelId) || null
}
