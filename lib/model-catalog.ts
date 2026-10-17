import type { LanguageModelUsage } from "ai"
import catalog from "@/lib/model-catalog.json"
import type { ProviderName } from "@/lib/types/model-config"

/** USD per million tokens */
interface Price {
    input: number
    output: number
    cacheRead?: number
    cacheWrite?: number
    /** Output of an answer that thought, where it costs more */
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
 * version to (claude-sonnet-4-5-20250929, gpt-5.1-2025-11-13, -v1:0). A
 * sibling's price would be wrong: gpt-4.1 costs 20 times what gpt-4.1-nano
 * does, and gpt-5-4 is not gpt-5. On Azure the id is a deployment name, so
 * only one that is exactly a model's name gets its price.
 */
function priceOf(provider: ProviderName, modelId: string) {
    const entry = findEntry(provider, modelId)
    if (!entry?.info.cost) return undefined
    const added = modelId.trim().slice(entry.id.length)
    if (provider === "azure" && added) return undefined
    return /^(-(\d{8}|\d{4}(-\d{2}-\d{2})?|v\d+|latest)|:\d+)*$/i.test(added)
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
    // which have prices of their own
    const cacheRead = usage.inputTokenDetails.cacheReadTokens ?? 0
    const cacheWrite = usage.inputTokenDetails.cacheWriteTokens ?? 0
    // A reasoning price covers the thinking tokens, except on Qwen's own API,
    // which bills the whole output of an answer that thought at it
    const output = usage.outputTokens ?? 0
    const thinking = usage.outputTokenDetails.reasoningTokens ?? 0
    const atReasoning =
        provider === "qwen" ? (thinking > 0 ? output : 0) : thinking
    return (
        ((input - cacheRead - cacheWrite) * price.input +
            cacheRead * (price.cacheRead ?? price.input) +
            cacheWrite * (price.cacheWrite ?? price.input) +
            (output - atReasoning) * price.output +
            atReasoning * (price.reasoning ?? price.output)) /
        1_000_000
    )
}
