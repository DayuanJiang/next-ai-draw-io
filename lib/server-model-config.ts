import fs from "fs/promises"
import path from "path"
import { z } from "zod"
import type { ProviderName } from "@/lib/types/model-config"
import { PROVIDER_INFO } from "@/lib/types/model-config"

export const ProviderNameSchema: z.ZodType<ProviderName> = z
    .string()
    .refine((val): val is ProviderName => val in PROVIDER_INFO, {
        message: "Invalid provider name",
    })

export const ServerProviderSchema = z.object({
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

export type ServerProviderConfig = z.infer<typeof ServerProviderSchema>
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
 * e.g., "OpenAI Production" → "openai-production"
 */
function slugify(name: string): string {
    return name
        .toLowerCase()
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
 */
function configFromCommaSeparatedAiModel(): ServerModelsConfig | null {
    const aiModel = process.env.AI_MODEL
    if (!aiModel || !aiModel.includes(",")) return null

    const aiProvider = process.env.AI_PROVIDER
    if (!aiProvider) {
        console.warn(
            "[server-model-config] AI_MODEL contains commas but AI_PROVIDER is not set; " +
                "skipping multi-model fallback. Set AI_PROVIDER, or use AI_MODELS_CONFIG / ai-models.json.",
        )
        return null
    }
    if (!(aiProvider in PROVIDER_INFO)) {
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
                name: PROVIDER_INFO[providerName]?.label || providerName,
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
        const jsonStr = await fs.readFile(configPath, "utf8")
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
    return configFromCommaSeparatedAiModel()
}

export async function loadRawServerModelsConfig(): Promise<ServerModelsConfig | null> {
    const envConfig = await loadEnvServerModelsConfig()

    // Merge in providers managed via the admin panel (settings.json).
    // Dynamic import to avoid a module-init cycle with lib/admin/providers.
    let adminConfig: ServerModelsConfig | null = null
    try {
        const { adminProvidersToConfig, loadAdminProviders } = await import(
            "./admin/providers"
        )
        const adminProviders = loadAdminProviders()
        if (adminProviders.length > 0) {
            adminConfig = adminProvidersToConfig(adminProviders)
        }
    } catch (err) {
        console.error(
            "[server-model-config] Failed to load admin providers:",
            err,
        )
    }

    if (!adminConfig || adminConfig.providers.length === 0) return envConfig
    if (!envConfig) return adminConfig

    // A panel default overrides an env default
    const adminHasDefault = adminConfig.providers.some((p) => p.default)
    const envProviders = adminHasDefault
        ? envConfig.providers.map((p) =>
              p.default ? { ...p, default: undefined } : p,
          )
        : envConfig.providers
    return { providers: [...envProviders, ...adminConfig.providers] }
}

export async function loadFlattenedServerModels(): Promise<
    FlattenedServerModel[]
> {
    const cfg = await loadRawServerModelsConfig()
    if (!cfg) return []

    const defaultProvider = process.env.AI_PROVIDER as ProviderName | undefined
    const defaultModelId = process.env.AI_MODEL

    const flattened: FlattenedServerModel[] = []

    for (const p of cfg.providers) {
        const providerLabel =
            p.name || PROVIDER_INFO[p.provider]?.label || p.provider

        // Use slugified name for unique ID (supports multiple API keys per provider)
        const nameSlug = slugify(p.name)

        for (const modelId of p.models) {
            const id = `server:${nameSlug}:${modelId}`

            // Default model priority:
            // 1. From ai-models.json: first model of provider with default: true
            // 2. From env vars: AI_MODEL matches (legacy behavior)
            const isDefault =
                (p.default === true && modelId === p.models[0]) ||
                (!!defaultModelId &&
                    modelId === defaultModelId &&
                    (!defaultProvider || defaultProvider === p.provider))

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
    if (!modelId.startsWith("server:")) return null

    const models = await loadFlattenedServerModels()
    return models.find((m) => m.id === modelId) || null
}
