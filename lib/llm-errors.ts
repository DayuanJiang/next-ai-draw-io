import {
    APICallError,
    InvalidToolInputError,
    LoadAPIKeyError,
    NoSuchToolError,
    RetryError,
    ToolCallRepairError,
} from "ai"

/**
 * What went wrong with a model call, for a hint the user can act on. The
 * provider's own message always goes along, because a guess can be wrong.
 */
export type LLMErrorCode =
    | "invalid_api_key"
    | "forbidden"
    | "model_not_found"
    | "insufficient_quota"
    | "rate_limited"
    | "context_too_long"
    | "images_unsupported"
    | "tools_unsupported"
    | "output_truncated"
    | "provider_unavailable"
    | "cannot_connect"
    | "timeout"
    | "unknown"

export interface LLMError {
    type: "provider"
    code: LLMErrorCode
    message: string
}

// Texts that name the cause more precisely than the status code: a quota
// error can come as 403 or 429, a context or image error as a plain 400
const SPECIFIC_TEXTS: Array<[RegExp, LLMErrorCode]> = [
    [
        /context length|context window|maximum context|prompt is too long|input is too long|too many (?:input )?tokens/i,
        "context_too_long",
    ],
    [
        /image content block|image_url|does not support image|image input is not supported/i,
        "images_unsupported",
    ],
    [
        /does not support tools|tool use is not supported|tools? (?:are|is) not supported|function calling is not supported/i,
        "tools_unsupported",
    ],
    // Bedrock, when the output limit cut the tool call's JSON short
    [/toolUse\.input is invalid/i, "output_truncated"],
    [
        /insufficient[_ ]quota|insufficient balance|exceeded your current quota|credit balance is too low|余额不足/i,
        "insufficient_quota",
    ],
]

const STATUS_CODES: Record<number, LLMErrorCode> = {
    401: "invalid_api_key",
    402: "insufficient_quota",
    // Not "invalid key": a valid key can lack access to a model or region
    403: "forbidden",
    404: "model_not_found",
    408: "timeout",
    413: "context_too_long",
    429: "rate_limited",
}

const GENERAL_TEXTS: Array<[RegExp, LLMErrorCode]> = [
    [
        /model[_ ]not[_ ]found|model .*does not exist|unknown model|no such model/i,
        "model_not_found",
    ],
    [
        /invalid[_ ]api[_ ]key|incorrect api key|unauthorized/i,
        "invalid_api_key",
    ],
    [/rate limit|too many requests/i, "rate_limited"],
    [/ECONNREFUSED|ENOTFOUND|ECONNRESET|fetch failed/i, "cannot_connect"],
]

/** Secrets a provider may echo back: API keys, Bearer tokens, key=value */
function redact(text: string): string {
    return text
        .replace(/\b(sk|pk|rk|ak)-[A-Za-z0-9_-]{8,}/g, "$1-[redacted]")
        .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
        .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redacted]")
        .replace(
            /\b(api[_-]?key|access[_-]?key|secret|token|password|signature)(["']?\s*[:=]\s*["']?)[^\s"',&}]+/gi,
            "$1$2[redacted]",
        )
}

/**
 * Model and tool errors the SDK sends back to the model as the tool result,
 * so it can fix its call. Their text has to stay as it is.
 */
export function isToolCallError(error: unknown): boolean {
    return (
        InvalidToolInputError.isInstance(error) ||
        NoSuchToolError.isInstance(error) ||
        ToolCallRepairError.isInstance(error)
    )
}

export function classifyLLMError(error: unknown): LLMError {
    // After the SDK's retries, the last attempt says what happened
    const e = RetryError.isInstance(error) ? error.lastError : error
    const raw = e instanceof Error ? e.message : String(e)
    const message = redact(raw).slice(0, 500)
    const body = APICallError.isInstance(e) ? (e.responseBody ?? "") : ""
    const text = `${raw} ${body}`
    const status = APICallError.isInstance(e)
        ? e.statusCode
        : (e as { statusCode?: number })?.statusCode

    const find = (rules: Array<[RegExp, LLMErrorCode]>) =>
        rules.find(([pattern]) => pattern.test(text))?.[1]
    const code =
        (e instanceof Error && e.name === "TimeoutError" && "timeout") ||
        (LoadAPIKeyError.isInstance(e) && "invalid_api_key") ||
        find(SPECIFIC_TEXTS) ||
        (status && STATUS_CODES[status]) ||
        (status && status >= 500 && "provider_unavailable") ||
        find(GENERAL_TEXTS) ||
        "unknown"
    return { type: "provider", code, message }
}
