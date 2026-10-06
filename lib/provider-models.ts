import { createGateway } from "ai"
import { getModelInfo } from "@/lib/model-catalog"
import { readLimitedBody } from "@/lib/read-limited-body"
import {
    normalizeBaseUrl,
    ollamaApiUrl,
    PROVIDER_INFO,
    type ProviderName,
} from "@/lib/types/model-config"

/** A model a provider offers. tools is false when it cannot call tools. */
export interface ListedModel {
    id: string
    tools?: boolean
}

export const AIHUBMIX_MODELS_ENDPOINT = "https://aihubmix.com/api/v1/models"

export function canListModels(provider: ProviderName): boolean {
    return (
        Object.hasOwn(PROVIDER_INFO, provider) &&
        !!PROVIDER_INFO[provider].modelList
    )
}

// Models in OpenAI-style lists that are not for chat
const NON_CHAT =
    /(?:^|[-/_])(?:embed(?:ding)?s?|whisper|tts|transcribe|dall-e|moderation|rerank|realtime|sora)(?:$|[-/_])|gpt-image/i

const NON_CHAT_AIHUBMIX_TYPES = new Set([
    "embedding",
    "image_generation",
    "rerank",
    "transcription",
    "tts",
    "video",
])

/** Chat model ids from AIHubMix's public model list */
export function extractAihubmixModelIds(payload: unknown): string[] {
    const data = (payload as { data?: unknown })?.data
    if (!Array.isArray(data)) return []
    const ids = new Set<string>()
    for (const item of data) {
        const record = item as { model_id?: unknown; types?: unknown }
        if (typeof record?.model_id !== "string" || !record.model_id.trim()) {
            continue
        }
        const types = new Set(
            typeof record.types === "string"
                ? record.types.split(",").map((t) => t.trim())
                : [],
        )
        if (!types.has("llm")) continue
        if ([...NON_CHAT_AIHUBMIX_TYPES].some((t) => types.has(t))) continue
        ids.add(record.model_id.trim())
    }
    return [...ids]
}

/**
 * An error this module wrote itself. Only these texts reach the caller:
 * the base URL is the caller's and may be an internal address, so anything
 * else (a parse error quoting the body, a network error naming a host)
 * stays in the server log.
 */
export class ModelListError extends Error {
    constructor(
        message: string,
        readonly statusCode?: number,
    ) {
        super(message)
        this.name = "ModelListError"
    }
}

const MAX_LIST_BYTES = 2 * 1024 * 1024

/** A fetch that reads at most MAX_LIST_BYTES of each response */
function sizeLimitedFetch(fetchFn: typeof fetch): typeof fetch {
    return async (input, init) => {
        // Ends a download that is too large (the Gateway SDK passes no
        // signal of its own)
        const download = new AbortController()
        const signal = init?.signal
            ? AbortSignal.any([init.signal, download.signal])
            : download.signal
        const response = await fetchFn(input, { ...init, signal })
        const body = await readLimitedBody(response, MAX_LIST_BYTES)
        if (body === null) {
            download.abort()
            throw new ModelListError("The model list is too large.")
        }
        // The body is already decoded and has its own length now
        const headers = new Headers(response.headers)
        headers.delete("content-encoding")
        headers.delete("content-length")
        // Some statuses must have no body at all
        const noBody = [101, 204, 205, 304].includes(response.status)
        return new Response(noBody ? null : body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        })
    }
}

/** GET a JSON list; a failed request carries its status for the error hint */
async function getJson(
    url: string,
    headers: Record<string, string>,
    fetchFn: typeof fetch,
): Promise<any> {
    const response = await fetchFn(url, {
        headers,
        signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
        throw new ModelListError(
            `The model list request failed (${response.status})`,
            response.status,
        )
    }
    const text = await response.text()
    try {
        return JSON.parse(text)
    } catch {
        throw new ModelListError("The model list was not valid JSON.")
    }
}

/**
 * Where to list from without the user's base URL: where chat goes then. For
 * Ollama without a key that is the server's Ollama, else the SDK's local
 * default; a local default in PROVIDER_INFO (SGLang's) only fills the
 * settings form.
 */
function listFallbackUrl(provider: ProviderName, apiKey?: string): string {
    if (provider === "ollama" && !apiKey) {
        return process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/api"
    }
    const url = PROVIDER_INFO[provider].defaultBaseUrl
    return url?.startsWith("https://") ? url : ""
}

/**
 * The provider's chat models, with tool support from the provider's own
 * data or else models.dev. Only the client's key is used, so the server's
 * keys never go to a URL the client chose.
 */
export async function listProviderModels(
    provider: ProviderName,
    { apiKey, baseUrl }: { apiKey?: string; baseUrl?: string },
    unlimitedFetch: typeof fetch = fetch,
): Promise<ListedModel[]> {
    const fetchFn = sizeLimitedFetch(unlimitedFetch)
    const base = normalizeBaseUrl(baseUrl || listFallbackUrl(provider, apiKey))
    const bearer: Record<string, string> = apiKey
        ? { Authorization: `Bearer ${apiKey}` }
        : {}
    let models: ListedModel[]

    // AIHubMix has a public list, unless the user points to another
    // endpoint, which is OpenAI-compatible
    const style =
        provider === "aihubmix" &&
        baseUrl &&
        !/^https:\/\/aihubmix\.com(\/v1)?$/.test(base)
            ? "openai"
            : PROVIDER_INFO[provider].modelList

    switch (style) {
        case "anthropic": {
            const data = await getJson(
                `${base}/models?limit=1000`,
                {
                    "x-api-key": apiKey ?? "",
                    "anthropic-version": "2023-06-01",
                },
                fetchFn,
            )
            models = (data.data ?? []).map((m: { id: string }) => ({
                id: m.id,
            }))
            break
        }
        case "google": {
            // The key goes in a header: in the URL it would end up in logs
            const data = await getJson(
                `${base}/models?pageSize=1000`,
                { "x-goog-api-key": apiKey ?? "" },
                fetchFn,
            )
            models = (data.models ?? [])
                .filter((m: { supportedGenerationMethods?: string[] }) =>
                    m.supportedGenerationMethods?.includes("generateContent"),
                )
                .map((m: { name: string }) => ({
                    id: m.name.replace(/^models\//, ""),
                }))
            break
        }
        case "ollama": {
            const data = await getJson(
                `${ollamaApiUrl(base)}/tags`,
                bearer,
                fetchFn,
            )
            models = (data.models ?? []).map((m: { name: string }) => ({
                id: m.name,
            }))
            break
        }
        case "openrouter": {
            const data = await getJson(`${base}/models`, bearer, fetchFn)
            models = (data.data ?? []).map(
                (m: { id: string; supported_parameters?: string[] }) => ({
                    id: m.id,
                    ...(m.supported_parameters && {
                        tools: m.supported_parameters.includes("tools"),
                    }),
                }),
            )
            break
        }
        case "gateway": {
            const { models: entries } = await createGateway({
                ...(apiKey && { apiKey }),
                ...(baseUrl && { baseURL: base }),
                fetch: fetchFn,
            }).getAvailableModels()
            models = entries
                .filter((m) => !m.modelType || m.modelType === "language")
                .map((m) => ({ id: m.id }))
            break
        }
        case "aihubmix": {
            const data = await getJson(AIHUBMIX_MODELS_ENDPOINT, {}, fetchFn)
            models = extractAihubmixModelIds(data).map((id) => ({ id }))
            break
        }
        default: {
            if (!base) {
                throw new ModelListError(
                    `${PROVIDER_INFO[provider].label} needs a base URL to list its models.`,
                )
            }
            const data = await getJson(`${base}/models`, bearer, fetchFn)
            models = (data.data ?? [])
                .map((m: { id: string }) => ({ id: m.id }))
                .filter((m: ListedModel) => !NON_CHAT.test(m.id))
        }
    }

    return models.map((m) => ({
        ...m,
        tools: m.tools ?? getModelInfo(provider, m.id)?.tools,
    }))
}
