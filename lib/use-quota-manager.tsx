"use client"

import { useCallback, useMemo } from "react"
import { toast } from "sonner"
import { QuotaLimitToast } from "@/components/quota-limit-toast"
import { STORAGE_KEYS } from "@/lib/storage"

export interface QuotaConfig {
    dailyRequestLimit: number
    dailyTokenLimit: number
    tpmLimit: number
}

export interface QuotaCheckResult {
    allowed: boolean
    remaining: number
    used: number
}

/**
 * Hook for managing request/token quotas and rate limiting.
 * Handles three types of limits:
 * - Daily request limit
 * - Daily token limit
 * - Tokens per minute (TPM) rate limit
 *
 * Users with their own API key bypass all limits.
 */
export function useQuotaManager(config: QuotaConfig): {
    hasOwnApiKey: () => boolean
    checkDailyLimit: () => QuotaCheckResult
    checkTokenLimit: () => QuotaCheckResult
    checkTPMLimit: () => QuotaCheckResult
    incrementRequestCount: () => void
    incrementTokenCount: (tokens: number) => void
    incrementTPMCount: (tokens: number) => void
    showQuotaLimitToast: () => void
    showTokenLimitToast: (used: number) => void
    showTPMLimitToast: () => void
} {
    const { dailyRequestLimit, dailyTokenLimit, tpmLimit } = config

    // Check if user has their own API key configured (bypass limits)
    const hasOwnApiKey = useCallback((): boolean => {
        const provider = localStorage.getItem(STORAGE_KEYS.aiProvider)
        const apiKey = localStorage.getItem(STORAGE_KEYS.aiApiKey)
        return !!(provider && apiKey)
    }, [])

    // Generic helper: Parse count from localStorage with NaN guard
    const parseStorageCount = (key: string): number => {
        const count = parseInt(localStorage.getItem(key) || "0", 10)
        return Number.isNaN(count) ? 0 : count
    }

    // Generic helper: Create quota checker factory
    const createQuotaChecker = useCallback(
        (
            getTimeKey: () => string,
            timeStorageKey: string,
            countStorageKey: string,
            limit: number,
        ) => {
            return (): QuotaCheckResult => {
                if (hasOwnApiKey())
                    return { allowed: true, remaining: -1, used: 0 }
                if (limit <= 0) return { allowed: true, remaining: -1, used: 0 }

                const currentTime = getTimeKey()
                const storedTime = localStorage.getItem(timeStorageKey)
                let count = parseStorageCount(countStorageKey)

                if (storedTime !== currentTime) {
                    count = 0
                    localStorage.setItem(timeStorageKey, currentTime)
                    localStorage.setItem(countStorageKey, "0")
                }

                return {
                    allowed: count < limit,
                    remaining: limit - count,
                    used: count,
                }
            }
        },
        [hasOwnApiKey],
    )

    // Generic helper: Create quota incrementer factory
    const createQuotaIncrementer = useCallback(
        (
            getTimeKey: () => string,
            timeStorageKey: string,
            countStorageKey: string,
            validateInput: boolean = false,
        ) => {
            return (tokens: number = 1): void => {
                if (validateInput && (!Number.isFinite(tokens) || tokens <= 0))
                    return

                const currentTime = getTimeKey()
                const storedTime = localStorage.getItem(timeStorageKey)
                let count = parseStorageCount(countStorageKey)

                if (storedTime !== currentTime) {
                    count = 0
                    localStorage.setItem(timeStorageKey, currentTime)
                }

                localStorage.setItem(countStorageKey, String(count + tokens))
            }
        },
        [],
    )

    // Check daily request limit
    const checkDailyLimit = useMemo(
        () =>
            createQuotaChecker(
                () => new Date().toDateString(),
                STORAGE_KEYS.requestDate,
                STORAGE_KEYS.requestCount,
                dailyRequestLimit,
            ),
        [createQuotaChecker, dailyRequestLimit],
    )

    // Increment request count
    const incrementRequestCount = useMemo(
        () =>
            createQuotaIncrementer(
                () => new Date().toDateString(),
                STORAGE_KEYS.requestDate,
                STORAGE_KEYS.requestCount,
                false,
            ),
        [createQuotaIncrementer],
    )

    // Show quota limit toast (request-based)
    const showQuotaLimitToast = useCallback(() => {
        toast.custom(
            (t) => (
                <QuotaLimitToast
                    used={dailyRequestLimit}
                    limit={dailyRequestLimit}
                    onDismiss={() => toast.dismiss(t)}
                />
            ),
            { duration: 15000 },
        )
    }, [dailyRequestLimit])

    // Check daily token limit
    const checkTokenLimit = useMemo(
        () =>
            createQuotaChecker(
                () => new Date().toDateString(),
                STORAGE_KEYS.tokenDate,
                STORAGE_KEYS.tokenCount,
                dailyTokenLimit,
            ),
        [createQuotaChecker, dailyTokenLimit],
    )

    // Increment token count
    const incrementTokenCount = useMemo(
        () =>
            createQuotaIncrementer(
                () => new Date().toDateString(),
                STORAGE_KEYS.tokenDate,
                STORAGE_KEYS.tokenCount,
                true, // Validate input tokens
            ),
        [createQuotaIncrementer],
    )

    // Show token limit toast
    const showTokenLimitToast = useCallback(
        (used: number) => {
            toast.custom(
                (t) => (
                    <QuotaLimitToast
                        type="token"
                        used={used}
                        limit={dailyTokenLimit}
                        onDismiss={() => toast.dismiss(t)}
                    />
                ),
                { duration: 15000 },
            )
        },
        [dailyTokenLimit],
    )

    // Check TPM (tokens per minute) limit
    const checkTPMLimit = useMemo(
        () =>
            createQuotaChecker(
                () => Math.floor(Date.now() / 60000).toString(),
                STORAGE_KEYS.tpmMinute,
                STORAGE_KEYS.tpmCount,
                tpmLimit,
            ),
        [createQuotaChecker, tpmLimit],
    )

    // Increment TPM count
    const incrementTPMCount = useMemo(
        () =>
            createQuotaIncrementer(
                () => Math.floor(Date.now() / 60000).toString(),
                STORAGE_KEYS.tpmMinute,
                STORAGE_KEYS.tpmCount,
                true, // Validate input tokens
            ),
        [createQuotaIncrementer],
    )

    // Show TPM limit toast
    const showTPMLimitToast = useCallback(() => {
        const limitDisplay =
            tpmLimit >= 1000 ? `${tpmLimit / 1000}k` : String(tpmLimit)
        toast.error(
            `Rate limit reached (${limitDisplay} tokens/min). Please wait 60 seconds before sending another request.`,
            { duration: 8000 },
        )
    }, [tpmLimit])

    return {
        // Check functions
        hasOwnApiKey,
        checkDailyLimit,
        checkTokenLimit,
        checkTPMLimit,

        // Increment functions
        incrementRequestCount,
        incrementTokenCount,
        incrementTPMCount,

        // Toast functions
        showQuotaLimitToast,
        showTokenLimitToast,
        showTPMLimitToast,
    }
}
