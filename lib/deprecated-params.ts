import { wrapLanguageModel } from "ai"
import { rejectionText } from "@/lib/output-token-limit"

type WrappedModel = ReturnType<typeof wrapLanguageModel>

/**
 * Claude 4.7 and later answer a non-default temperature, top_p or top_k,
 * and the extended thinking budget (thinking type "enabled"), with a 400.
 * TEMPERATURE and the *_THINKING_BUDGET_TOKENS settings send exactly these.
 */
const DEPRECATED_PARAM =
    /`?(?:temperature|top_p|top_k)`? is deprecated for this model|"?thinking\.type\.enabled"? is not supported/i

interface CallParams {
    temperature?: number
    topP?: number
    topK?: number
    providerOptions?: Record<string, Record<string, unknown> | undefined>
}

// What these models take instead of a budget. Without display "summarized"
// they think but send no thinking text to show.
const ADAPTIVE_THINKING = { type: "adaptive", display: "summarized" }

/** Turn a thinking config of type "enabled" stored under key into adaptive */
function adaptiveThinking(
    options: Record<string, unknown> | undefined,
    key: string,
): Record<string, unknown> | undefined {
    const config = options?.[key] as { type?: string } | undefined
    if (config?.type !== "enabled") return options
    return { ...options, [key]: ADAPTIVE_THINKING }
}

/**
 * The params without the settings newer Claude models reject, or null when
 * the error is about something else or there is nothing to change. The
 * model then runs with its default sampling, and a thinking budget becomes
 * adaptive thinking.
 */
export function withoutDeprecatedParams<T extends CallParams>(
    error: unknown,
    params: T,
): T | null {
    const text = rejectionText(error)
    if (!text || !DEPRECATED_PARAM.test(text)) return null

    const { temperature, topP, topK, ...rest } = params
    const options = params.providerOptions
    const anthropic = adaptiveThinking(options?.anthropic, "thinking")
    const bedrock = adaptiveThinking(options?.bedrock, "reasoningConfig")
    const changed =
        temperature !== undefined ||
        topP !== undefined ||
        topK !== undefined ||
        anthropic !== options?.anthropic ||
        bedrock !== options?.bedrock
    if (!changed) return null

    return {
        ...rest,
        ...(options && {
            providerOptions: {
                ...options,
                ...(anthropic && { anthropic }),
                ...(bedrock && { bedrock }),
            },
        }),
    } as T
}

/** Retry the stream once without the settings newer Claude models reject. */
export function withDeprecatedParamsFallback(
    model: WrappedModel,
): WrappedModel {
    return wrapLanguageModel({
        model,
        middleware: {
            specificationVersion: "v3",
            async wrapStream({ doStream, params, model: inner }) {
                try {
                    return await doStream()
                } catch (error) {
                    const retry = withoutDeprecatedParams(error, params)
                    if (!retry) throw error
                    console.warn(
                        "[model params] Rejected sampling or thinking settings, retrying with default sampling and adaptive thinking",
                    )
                    return await inner.doStream(retry)
                }
            },
        },
    })
}
