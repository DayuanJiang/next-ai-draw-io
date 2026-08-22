import { wrapLanguageModel } from "ai"

type WrappedModel = ReturnType<typeof wrapLanguageModel>

/**
 * Default output budget for a chat turn.
 *
 * This has to cover thinking + prose + the tool call, because reasoning models
 * spend it in that order. Measured on deepseek-v4-flash: refining an existing
 * diagram burned 16000 tokens on thinking alone and the request ended with
 * finishReason "length" before display_diagram was ever called (issue #924).
 * 64000 leaves room for the plan and the XML in one turn.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 64000

/** Ceiling for the user-supplied override, to catch typos like an extra zero. */
export const MAX_OUTPUT_TOKENS_LIMIT = 200000

/**
 * Below this a diagram cannot come out whole, so a retry would just produce
 * truncated XML instead of the provider's error. Better to surface the error.
 */
const MIN_USABLE_OUTPUT_TOKENS = 1024

/** Status codes that can carry a complaint about the requested budget. */
const BUDGET_REJECTION_STATUSES = new Set([400, 422])

function usableLimit(value: number): number | null {
    return value >= MIN_USABLE_OUTPUT_TOKENS ? value : null
}

/**
 * A budget this large exceeds what some models accept. Providers reject it with a
 * 400 that names the real limit, so we parse the number out and retry once
 * instead of failing the turn.
 *
 * Formats seen in the wild:
 * - Bedrock: "The maximum tokens you requested exceeds the model limit of 4096."
 * - OpenRouter: "This endpoint's maximum context length is 64000 tokens. However,
 *   you requested about 64025 tokens (25 of text input, 64000 in the output)."
 *   Note this one is an input+output ceiling, so the input has to be subtracted.
 * - Anthropic: "max_tokens: 200000 > 64000, which is the maximum allowed..."
 * - OpenAI: "This model supports at most 16384 completion tokens"
 *
 * Every pattern names tokens explicitly. A generic one (an earlier draft matched
 * "lower than N") would reinterpret unrelated failures, and retrying on a bogus
 * number turns a readable error into an empty diagram.
 */
export function parseOutputTokenLimit(error: unknown): number | null {
    const err = error as {
        message?: unknown
        responseBody?: unknown
        statusCode?: unknown
    }

    // An auth or rate-limit failure is not about the budget, so leave it alone.
    if (
        typeof err?.statusCode === "number" &&
        !BUDGET_REJECTION_STATUSES.has(err.statusCode)
    ) {
        return null
    }

    const text = [
        typeof err?.message === "string" ? err.message : "",
        typeof err?.responseBody === "string" ? err.responseBody : "",
    ].join(" ")

    if (!text) return null

    // Combined input+output ceiling: subtract the input the provider counted,
    // plus a small margin because its estimate is approximate.
    const context = text.match(/maximum context length is (\d+)/i)
    if (context) {
        const input = text.match(/(\d+) of text input/i)
        return usableLimit(
            Number(context[1]) - (input ? Number(input[1]) : 0) - 1024,
        )
    }

    const output =
        text.match(/model limit of (\d+)/i) ||
        text.match(/> (\d+), which is the maximum/i) ||
        text.match(/at most (\d+) completion tokens/i)

    return output ? usableLimit(Number(output[1])) : null
}

/**
 * Retry the stream once with a smaller budget when the provider rejects the
 * requested one. Without this, raising the default breaks every model whose
 * ceiling is below it (measured: bedrock claude-3-haiku 4096, nova-lite 10000,
 * openrouter deepseek-r1 64000 shared with the input).
 */
export function withOutputTokenLimitFallback(
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
                    const limit = parseOutputTokenLimit(error)
                    const requested = params.maxOutputTokens

                    if (!limit || !requested || limit >= requested) throw error

                    console.warn(
                        `[maxOutputTokens] ${requested} rejected, retrying with ${limit}`,
                    )
                    return await inner.doStream({
                        ...params,
                        maxOutputTokens: limit,
                    })
                }
            },
        },
    })
}

function validBudget(value: string | null | undefined): number | null {
    const parsed = Number(value)
    return Number.isInteger(parsed) &&
        parsed > 0 &&
        parsed <= MAX_OUTPUT_TOKENS_LIMIT
        ? parsed
        : null
}

/**
 * Resolve the output budget: user setting (sent as a header so it works in the
 * desktop app too), then server env, then the default. Both sources go through
 * the same validation, so a typo in either falls back instead of reaching the
 * provider.
 */
export function resolveMaxOutputTokens(headerValue: string | null): number {
    return (
        validBudget(headerValue) ??
        validBudget(process.env.MAX_OUTPUT_TOKENS) ??
        DEFAULT_MAX_OUTPUT_TOKENS
    )
}
