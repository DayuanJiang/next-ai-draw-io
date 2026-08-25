export const SSYCLOUD_DEFAULT_BASE_URL =
    "https://router.shengsuanyun.com/api/v1"

interface SSYCloudModelRecord {
    id?: unknown
    support_apis?: unknown
}

function supportsChatCompletions(value: unknown): boolean {
    if (value === undefined || value === null) return true

    if (Array.isArray(value)) {
        return value.some(
            (api) =>
                typeof api === "string" && api.includes("/v1/chat/completions"),
        )
    }

    return typeof value === "string" && value.includes("/v1/chat/completions")
}

/**
 * Extract model IDs that support the OpenAI-compatible Chat Completions API.
 * Older /models responses may omit support_apis, so those entries remain
 * selectable and can still be verified through the normal model test action.
 */
export function extractSSYCloudModelIds(payload: unknown): string[] {
    if (!payload || typeof payload !== "object") return []

    const data = (payload as { data?: unknown }).data
    if (!Array.isArray(data)) return []

    const ids = data.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return []

        const model = entry as SSYCloudModelRecord
        if (
            typeof model.id !== "string" ||
            !model.id.trim() ||
            !supportsChatCompletions(model.support_apis)
        ) {
            return []
        }

        return [model.id.trim()]
    })

    return [...new Set(ids)]
}
