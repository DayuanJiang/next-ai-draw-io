export const AIHUBMIX_MODELS_ENDPOINT = "https://aihubmix.com/api/v1/models"

const NON_CHAT_MODEL_TYPES = new Set([
    "embedding",
    "image_generation",
    "rerank",
    "transcription",
    "tts",
    "video",
])

type AihubmixModelListPayload = {
    data?: unknown
}

type AihubmixModelRecord = {
    model_id?: unknown
    types?: unknown
}

function getModelTypes(types: unknown): Set<string> {
    if (typeof types !== "string") {
        return new Set()
    }

    return new Set(
        types
            .split(",")
            .map((type) => type.trim())
            .filter(Boolean),
    )
}

function isChatModel(record: AihubmixModelRecord): record is {
    model_id: string
    types: string
} {
    if (typeof record.model_id !== "string" || !record.model_id.trim()) {
        return false
    }

    const types = getModelTypes(record.types)
    if (!types.has("llm")) {
        return false
    }

    return !Array.from(NON_CHAT_MODEL_TYPES).some((type) => types.has(type))
}

export function extractAihubmixModelIds(payload: unknown): string[] {
    const data = (payload as AihubmixModelListPayload)?.data
    if (!Array.isArray(data)) {
        return []
    }

    const seen = new Set<string>()
    const modelIds: string[] = []

    for (const item of data) {
        if (!item || typeof item !== "object") {
            continue
        }

        const record = item as AihubmixModelRecord
        if (!isChatModel(record)) {
            continue
        }

        const modelId = record.model_id.trim()
        if (seen.has(modelId)) {
            continue
        }

        seen.add(modelId)
        modelIds.push(modelId)
    }

    return modelIds
}
