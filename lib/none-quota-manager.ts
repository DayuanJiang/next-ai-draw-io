import "server-only"

import {
    BaseQuotaManager,
    type QuotaCheckResult,
    type QuotaLimits,
} from "./base-quota-manager"

/**
 * Quota manager that enforces no quota
 */
export class NoneQuotaManager extends BaseQuotaManager {
    isQuotaEnabled(): boolean {
        return false
    }

    async checkAndIncrementRequest(
        _user: string,
        _limits: QuotaLimits,
    ): Promise<QuotaCheckResult> {
        // Set allowed: false to test quota popup in UI
        return {
            allowed: true,
            error: "No quota provider configured, all requests are allowed",
            type: "request",
            used: 0,
            limit: 0,
        }
    }

    async recordTokenUsage(_user: string, _tokens: number): Promise<void> {
        // No-op since quota is disabled
    }
}

// Export singleton instance for backward compatibility
export const quotaManager = new NoneQuotaManager()
