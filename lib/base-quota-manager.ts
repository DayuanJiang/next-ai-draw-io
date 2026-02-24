import "server-only"

export interface QuotaLimits {
    requests: number // Daily request limit
    tokens: number // Daily token limit
    tpm: number // Tokens per minute
}

export interface QuotaCheckResult {
    allowed: boolean
    error?: string
    type?: "request" | "token" | "tpm"
    used?: number
    limit?: number
}

/**
 * Abstract base class for quota management implementations.
 * Provides common interface for quota tracking across different storage backends.
 */
export abstract class BaseQuotaManager {
    /**
     * Check if quota tracking is enabled for this manager.
     */
    abstract isQuotaEnabled(): boolean

    /**
     * Check all quotas and increment request count atomically.
     * @param user User identifier (typically base64 encoded IP)
     * @param limits Quota limits to enforce
     * @returns Result indicating if request is allowed
     */
    abstract checkAndIncrementRequest(
        user: string,
        limits: QuotaLimits,
    ): Promise<QuotaCheckResult>

    /**
     * Record token usage after response completes.
     * @param user User identifier (typically base64 encoded IP)
     * @param tokens Number of tokens consumed
     */
    abstract recordTokenUsage(user: string, tokens: number): Promise<void>
}
