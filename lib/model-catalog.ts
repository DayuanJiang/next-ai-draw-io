import catalog from "@/lib/model-catalog.json"
import type { ProviderName } from "@/lib/types/model-config"

/**
 * What models.dev knows about a model (scripts/update-model-catalog.mjs).
 * Only used for hints: requests are sent the same way either way, since
 * the data can be wrong or out of date.
 */
export interface ModelInfo {
    tools: boolean
    images: boolean
    reasoning: boolean
    context?: number
    output?: number
}

const CATALOG = catalog as Record<string, Record<string, ModelInfo>>

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
