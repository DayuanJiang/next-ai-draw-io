export const DEFAULT_MODEL_VALIDATION_MAX_TOKENS = 1000
export const MAX_MODEL_VALIDATION_MAX_TOKENS = 64000

export function parseModelValidationMaxTokens(value: unknown): number | null {
    if (value === undefined || value === null || value === "") return null

    const numeric =
        typeof value === "number" ? value : Number(String(value).trim())

    if (
        !Number.isFinite(numeric) ||
        !Number.isInteger(numeric) ||
        numeric < 1
    ) {
        return null
    }

    return Math.min(numeric, MAX_MODEL_VALIDATION_MAX_TOKENS)
}

export function resolveModelValidationMaxTokens(...sources: unknown[]): number {
    for (const source of sources) {
        const parsed = parseModelValidationMaxTokens(source)
        if (parsed !== null) return parsed
    }

    return DEFAULT_MODEL_VALIDATION_MAX_TOKENS
}
