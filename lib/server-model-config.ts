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
})

export const ServerModelsConfigSchema = z.object({
    version: z.number().optional(),
    providers: z.array(ServerProviderSchema),
})

export type ServerProviderConfig = z.infer<typeof ServerProviderSchema>
export type ServerModelsConfig = z.infer<typeof ServerModelsConfigSchema>

export interface FlattenedServerModel {
    id: string // "server:<provider>:<modelId>"
    modelId: string
    provider: ProviderName
    providerLabel: string
    isDefault: boolean
}

function getConfigPath(): string {
    const custom = process.env.AI_MODELS_CONFIG_PATH
    if (custom && custom.trim().length > 0) return custom
    return path.join(process.cwd(), "ai-models.json")
}

export async function loadRawServerModelsConfig(): Promise<ServerModelsConfig | null> {
    const configPath = getConfigPath()
    try {
        const jsonStr = await fs.readFile(configPath, "utf8")
        const json = JSON.parse(jsonStr)
        return ServerModelsConfigSchema.parse(json)
    } catch (err: any) {
        if (err?.code === "ENOENT") {
            return null
        }
        console.error(
            "[server-model-config] Failed to load ai-models.json:",
            err,
        )
        return null
    }
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

        for (const modelId of p.models) {
            const id = `server:${p.provider}:${modelId}`

            const isDefault =
                !!defaultModelId &&
                modelId === defaultModelId &&
                (!defaultProvider || defaultProvider === p.provider)

            flattened.push({
                id,
                modelId,
                provider: p.provider,
                providerLabel,
                isDefault,
            })
        }
    }

    return flattened
}
