import fs from "fs/promises"
import path from "path"
import { z } from "zod"
import type { ChatUsageMetadata } from "@/lib/chat-metadata"
import { PROVIDER_INFO, type ProviderName } from "@/lib/types/model-config"

const ProviderNameSchema: z.ZodType<ProviderName> = z
    .string()
    .refine((val): val is ProviderName => val in PROVIDER_INFO, {
        message: "Invalid provider name",
    })

export const PricingRuleSchema = z.object({
    provider: ProviderNameSchema.optional(),
    modelPattern: z.string().min(1),
    label: z.string().min(1).optional(),
    inputPerMillionUsd: z.number().min(0),
    outputPerMillionUsd: z.number().min(0),
    cachedInputPerMillionUsd: z.number().min(0).optional(),
    cacheWritePerMillionUsd: z.number().min(0).optional(),
})

export const PricingConfigSchema = z.object({
    rules: z.array(PricingRuleSchema),
})

export type PricingRule = z.infer<typeof PricingRuleSchema>
export type PricingConfig = z.infer<typeof PricingConfigSchema>

interface UsageLike {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    cachedInputTokens?: number
    inputTokenDetails?: {
        cacheWriteTokens?: number
    }
}

let pricingConfigPromise: Promise<PricingConfig | null> | null = null

function getConfigPath(): string {
    const custom = process.env.AI_PRICING_CONFIG_PATH
    if (custom && custom.trim().length > 0) return custom
    return path.join(process.cwd(), "ai-pricing.json")
}

async function loadPricingConfigUncached(): Promise<PricingConfig | null> {
    const envConfig = process.env.AI_PRICING_CONFIG
    if (
        envConfig &&
        envConfig !== "undefined" &&
        envConfig !== "null" &&
        envConfig.trim().length > 0
    ) {
        try {
            return PricingConfigSchema.parse(JSON.parse(envConfig))
        } catch (err) {
            console.error(
                "[model-pricing] Failed to parse AI_PRICING_CONFIG:",
                err,
            )
            return null
        }
    }

    const configPath = getConfigPath()
    try {
        const jsonStr = await fs.readFile(configPath, "utf8")
        return PricingConfigSchema.parse(JSON.parse(jsonStr))
    } catch (err: any) {
        if (err?.code === "ENOENT") {
            return null
        }
        console.error("[model-pricing] Failed to load ai-pricing.json:", err)
        return null
    }
}

export async function loadPricingConfig(): Promise<PricingConfig | null> {
    if (!pricingConfigPromise) {
        pricingConfigPromise = loadPricingConfigUncached()
    }
    return pricingConfigPromise
}

export function resetPricingConfigCache() {
    pricingConfigPromise = null
}

function findMatchingRule(
    rules: PricingRule[],
    provider: string,
    modelId: string,
): PricingRule | undefined {
    return rules.find((rule) => {
        if (rule.provider && rule.provider !== provider) {
            return false
        }

        try {
            return new RegExp(rule.modelPattern, "i").test(modelId)
        } catch (err) {
            console.error(
                `[model-pricing] Invalid modelPattern "${rule.modelPattern}":`,
                err,
            )
            return false
        }
    })
}

function tokensToUsd(tokens: number, perMillionUsd?: number): number {
    if (!perMillionUsd || tokens <= 0) return 0
    return (tokens / 1_000_000) * perMillionUsd
}

export function buildUsageMetadata(
    provider: string,
    modelId: string,
    usage: UsageLike | undefined,
    config: PricingConfig | null,
): ChatUsageMetadata {
    const inputTokens = usage?.inputTokens ?? 0
    const outputTokens = usage?.outputTokens ?? 0
    const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens
    const cachedInputTokens = usage?.cachedInputTokens ?? 0
    const cacheWriteTokens = usage?.inputTokenDetails?.cacheWriteTokens ?? 0

    if (!config) {
        return {
            inputTokens,
            outputTokens,
            totalTokens,
            cachedInputTokens,
            cacheWriteTokens,
            costAvailable: false,
        }
    }

    const rule = findMatchingRule(config.rules, provider, modelId)
    if (!rule) {
        return {
            inputTokens,
            outputTokens,
            totalTokens,
            cachedInputTokens,
            cacheWriteTokens,
            costAvailable: false,
        }
    }

    const estimatedCostUsd =
        tokensToUsd(inputTokens, rule.inputPerMillionUsd) +
        tokensToUsd(outputTokens, rule.outputPerMillionUsd) +
        tokensToUsd(
            cachedInputTokens,
            rule.cachedInputPerMillionUsd ?? rule.inputPerMillionUsd,
        ) +
        tokensToUsd(
            cacheWriteTokens,
            rule.cacheWritePerMillionUsd ?? rule.inputPerMillionUsd,
        )

    return {
        inputTokens,
        outputTokens,
        totalTokens,
        cachedInputTokens,
        cacheWriteTokens,
        estimatedCostUsd,
        costAvailable: true,
        pricingSource: rule.label || rule.modelPattern,
    }
}
