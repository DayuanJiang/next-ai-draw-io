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

/**
 * Retry budget when a rejection names the budget parameter but no number we can
 * read. It is the default from before 64000, which these providers ran with.
 */
const FALLBACK_OUTPUT_TOKENS = 16000

/** Status codes that can carry a complaint about the requested budget. */
const BUDGET_REJECTION_STATUSES = new Set([400, 422])

function usableLimit(value: number): number | null {
    return value >= MIN_USABLE_OUTPUT_TOKENS ? value : null
}

/** Message and body of an error that may be about the budget, or null. */
export function rejectionText(error: unknown): string | null {
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

    return text.trim() ? text : null
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
 *   vLLM and SGLang send the same kind of ceiling, with the input written as
 *   "6000 in the messages", "has 6000 input tokens" or "6000 tokens from the input".
 * - Anthropic: "max_tokens: 200000 > 64000, which is the maximum allowed..."
 * - OpenAI: "This model supports at most 16384 completion tokens"
 * - Volcengine Ark: "The parameter `max_tokens` specified in the request are not
 *   valid: integer above maximum value, expected a value <= 32768, but got 64000"
 * - DashScope: "Range of max_tokens should be [1, 8192]"
 *
 * Every pattern names tokens explicitly. A generic one (an earlier draft matched
 * "lower than N") would reinterpret unrelated failures, and retrying on a bogus
 * number turns a readable error into an empty diagram.
 */
function readCeiling(text: string): number | null {
    // Combined input+output ceiling: subtract the input the provider counted,
    // plus a small margin because its estimate is approximate.
    const context = text.match(/maximum context length (?:is|of) (\d+)/i)
    if (context) {
        const input =
            text.match(/(\d+) of text input/i) ||
            text.match(/(\d+) in the messages/i) ||
            text.match(/(\d+) tokens from the input/i) ||
            text.match(/(\d+) input tokens/i)
        return Number(context[1]) - (input ? Number(input[1]) : 0) - 1024
    }

    const output =
        text.match(/model limit of (\d+)/i) ||
        text.match(/> (\d+), which is the maximum/i) ||
        text.match(/at most (\d+) completion tokens/i) ||
        text.match(/max_\w*tokens.*?expected a value (?:<=|\\u003c=) (\d+)/i) ||
        text.match(/Range of max_tokens should be \[1,\s*(\d+)\]/i)

    return output ? Number(output[1]) : null
}

/** The usable output ceiling named in a rejection, or null. */
export function parseOutputTokenLimit(error: unknown): number | null {
    const text = rejectionText(error)
    const ceiling = text ? readCeiling(text) : null
    return ceiling === null ? null : usableLimit(ceiling)
}

/**
 * Thinking budget the provider adds on top of maxOutputTokens. Bedrock and
 * Anthropic send maxOutputTokens + budgetTokens as max_tokens, so a ceiling in
 * their rejection covers both.
 */
function thinkingBudget(providerOptions: unknown): number {
    const options = providerOptions as
        | {
              bedrock?: {
                  reasoningConfig?: { type?: string; budgetTokens?: unknown }
              }
              anthropic?: {
                  thinking?: { type?: string; budgetTokens?: unknown }
              }
          }
        | undefined
    const config =
        options?.bedrock?.reasoningConfig ?? options?.anthropic?.thinking
    return config?.type === "enabled" && typeof config.budgetTokens === "number"
        ? config.budgetTokens
        : 0
}

/**
 * The budget to retry with after a rejection, or null to surface the error.
 */
export function retryOutputTokens(
    error: unknown,
    params: { maxOutputTokens?: number; providerOptions?: unknown },
): number | null {
    const requested = params.maxOutputTokens
    const text = rejectionText(error)
    if (!requested || !text) return null

    const ceiling = readCeiling(text)
    if (ceiling !== null) {
        // The ceiling applies to what was actually sent, thinking included,
        // so the retry has to leave room for the thinking too.
        const thinking = thinkingBudget(params.providerOptions)
        if (ceiling >= requested + thinking) return null
        return usableLimit(ceiling - thinking)
    }

    // Names the budget parameter, but in a format we cannot read a number from
    if (/max_\w*tokens/i.test(text) && requested > FALLBACK_OUTPUT_TOKENS) {
        return FALLBACK_OUTPUT_TOKENS
    }
    return null
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
                    const retry = retryOutputTokens(error, params)
                    if (!retry) throw error

                    console.warn(
                        `[maxOutputTokens] ${params.maxOutputTokens} rejected, retrying with ${retry}`,
                    )
                    return await inner.doStream({
                        ...params,
                        maxOutputTokens: retry,
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
 *
 * On the server's credentials the user setting can only lower the server value,
 * so MAX_OUTPUT_TOKENS keeps capping what the server pays for.
 */
export function resolveMaxOutputTokens(
    headerValue: string | null,
    usesServerCredentials: boolean,
): number {
    const header = validBudget(headerValue)
    const server =
        validBudget(process.env.MAX_OUTPUT_TOKENS) ?? DEFAULT_MAX_OUTPUT_TOKENS
    if (header === null) return server
    return usesServerCredentials ? Math.min(header, server) : header
}
