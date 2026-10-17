import type { LanguageModelUsage } from "ai"
import catalog from "@/lib/model-catalog.json"
import type { ProviderName } from "@/lib/types/model-config"

/**
 * What models.dev knows about a model (scripts/update-model-catalog.mjs).
 * Only used for hints, suggestions and estimates: requests are sent the
 * same way either way, since the data can be wrong or out of date.
 */
interface ModelInfo {
    tools: boolean
    images: boolean
    reasoning: boolean
    context?: number
    output?: number
    /** The official price in USD per million tokens */
    cost?: {
        input: number
        output: number
        cacheRead?: number
        cacheWrite?: number
    }
}

const CATALOG = catalog as Record<string, Record<string, ModelInfo>>

/**
 * The provider's models that models.dev lists with tool calls (drawing
 * needs them), offered when the provider's own list is not available
 */
export function listCatalogModels(provider: ProviderName): string[] {
    return Object.entries(CATALOG[provider] ?? {})
        .filter(([, info]) => info.tools)
        .map(([id]) => id)
}

/**
 * The entry for a model: an exact match ignoring case, else the longest id
 * the model id starts with, followed by "-", ":" or ".". So
 * claude-sonnet-4-5-20250929 finds claude-sonnet-4-5, but gpt-4 does not
 * find gpt-4o.
 */
export function getModelInfo(
    provider: ProviderName,
    modelId: string,
): ModelInfo | undefined {
    const models = CATALOG[provider]
    if (!models) return undefined
    const wanted = modelId.trim().toLowerCase()
    let best: string | undefined
    for (const id of Object.keys(models)) {
        const lower = id.toLowerCase()
        if (lower === wanted) return models[id]
        if (
            wanted.startsWith(lower) &&
            "-:.".includes(wanted[lower.length]) &&
            lower.length > (best?.length ?? 0)
        ) {
            best = id
        }
    }
    return best ? models[best] : undefined
}

/**
 * What a request cost in USD at the model's official price, or undefined
 * when models.dev has no price for it. Not for Ollama: local runs are free
 * and Ollama Cloud is a subscription.
 */
export function estimateCost(
    provider: ProviderName,
    modelId: string,
    usage: LanguageModelUsage,
): number | undefined {
    if (provider === "ollama") return undefined
    const cost = getModelInfo(provider, modelId)?.cost
    if (!cost) return undefined
    if (usage.inputTokens === undefined && usage.outputTokens === undefined)
        return undefined
    // The input tokens include those read from or written to the cache,
    // which have prices of their own
    const cacheRead = usage.inputTokenDetails.cacheReadTokens ?? 0
    const cacheWrite = usage.inputTokenDetails.cacheWriteTokens ?? 0
    const uncached = (usage.inputTokens ?? 0) - cacheRead - cacheWrite
    return (
        (uncached * cost.input +
            cacheRead * (cost.cacheRead ?? cost.input) +
            cacheWrite * (cost.cacheWrite ?? cost.input) +
            (usage.outputTokens ?? 0) * cost.output) /
        1_000_000
    )
}
