import type { LanguageModelUsage } from "ai"
import catalog from "@/lib/model-catalog.json"
import type { ProviderName } from "@/lib/types/model-config"

/** USD per million tokens */
interface Price {
    input: number
    output: number
    cacheRead?: number
    cacheWrite?: number
    /** Thinking output, where it costs more than the rest */
    reasoning?: number
}

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
    /** The official price; a tier replaces it above that many input tokens */
    cost?: Price & { tiers?: (Price & { above: number })[] }
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
function findEntry(
    provider: ProviderName,
    modelId: string,
): { id: string; info: ModelInfo } | undefined {
    const models = CATALOG[provider]
    if (!models) return undefined
    const wanted = modelId.trim().toLowerCase()
    let best: string | undefined
    for (const id of Object.keys(models)) {
        const lower = id.toLowerCase()
        if (lower === wanted) return { id, info: models[id] }
        if (
            wanted.startsWith(lower) &&
            "-:.".includes(wanted[lower.length]) &&
            lower.length > (best?.length ?? 0)
        ) {
            best = id
        }
    }
    return best ? { id: best, info: models[best] } : undefined
}

export function getModelInfo(
    provider: ProviderName,
    modelId: string,
): ModelInfo | undefined {
    return findEntry(provider, modelId)?.info
}

/**
 * The model's price, from its own entry or one it adds only a date or
 * version to (claude-sonnet-4-5-20250929, gpt-5.1-2025-11-13). A sibling's
 * price would be wrong: gpt-4.1 costs 20 times what gpt-4.1-nano does.
 */
function priceOf(provider: ProviderName, modelId: string) {
    const entry = findEntry(provider, modelId)
    if (!entry?.info.cost) return undefined
    const added = modelId.trim().slice(entry.id.length)
    return /^([-:.@](\d+|v\d+|latest))*$/i.test(added)
        ? entry.info.cost
        : undefined
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
    const cost = priceOf(provider, modelId)
    if (!cost) return undefined
    if (usage.inputTokens === undefined && usage.outputTokens === undefined)
        return undefined
    const input = usage.inputTokens ?? 0
    // Some models cost more for a long prompt (Doubao above 32,000 tokens)
    let price: Price = cost
    for (const tier of cost.tiers ?? []) if (input > tier.above) price = tier
    // The input tokens include those read from or written to the cache,
    // and the output tokens the thinking, which have prices of their own
    const cacheRead = usage.inputTokenDetails.cacheReadTokens ?? 0
    const cacheWrite = usage.inputTokenDetails.cacheWriteTokens ?? 0
    const reasoning = usage.outputTokenDetails.reasoningTokens ?? 0
    const output = usage.outputTokens ?? 0
    return (
        ((input - cacheRead - cacheWrite) * price.input +
            cacheRead * (price.cacheRead ?? price.input) +
            cacheWrite * (price.cacheWrite ?? price.input) +
            (output - reasoning) * price.output +
            reasoning * (price.reasoning ?? price.output)) /
        1_000_000
    )
}
