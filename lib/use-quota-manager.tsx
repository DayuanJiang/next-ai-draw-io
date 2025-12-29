"use client"

import { useCallback } from "react"
import { toast } from "sonner"
import { QuotaLimitToast } from "@/components/quota-limit-toast"
import { useDictionary } from "@/hooks/use-dictionary"
import { formatMessage } from "@/lib/i18n/utils"

export interface QuotaConfig {
    dailyRequestLimit: number
    dailyTokenLimit: number
    tpmLimit: number
    onConfigModel?: () => void
}

/**
 * Hook for displaying quota limit toasts.
 * Server-side handles actual quota enforcement via DynamoDB.
 * This hook only provides UI feedback when limits are exceeded.
 */
export function useQuotaManager(config: QuotaConfig): {
    showQuotaLimitToast: (used?: number, limit?: number) => void
    showTokenLimitToast: (used?: number, limit?: number) => void
    showTPMLimitToast: (limit?: number) => void
} {
    const { dailyRequestLimit, dailyTokenLimit, tpmLimit, onConfigModel } =
        config
    const dict = useDictionary()

    // Show quota limit toast (request-based)
    const showQuotaLimitToast = useCallback(
        (used?: number, limit?: number) => {
            toast.custom(
                (t) => (
                    <QuotaLimitToast
                        used={used ?? dailyRequestLimit}
                        limit={limit ?? dailyRequestLimit}
                        onDismiss={() => toast.dismiss(t)}
                        onConfigModel={onConfigModel}
                    />
                ),
                { duration: 15000 },
            )
        },
        [dailyRequestLimit, onConfigModel],
    )

    // Show token limit toast
    const showTokenLimitToast = useCallback(
        (used?: number, limit?: number) => {
            toast.custom(
                (t) => (
                    <QuotaLimitToast
                        type="token"
                        used={used ?? dailyTokenLimit}
                        limit={limit ?? dailyTokenLimit}
                        onDismiss={() => toast.dismiss(t)}
                        onConfigModel={onConfigModel}
                    />
                ),
                { duration: 15000 },
            )
        },
        [dailyTokenLimit, onConfigModel],
    )

    // Show TPM limit toast
    const showTPMLimitToast = useCallback(
        (limit?: number) => {
            const effectiveLimit = limit ?? tpmLimit
            const limitDisplay =
                effectiveLimit >= 1000
                    ? `${effectiveLimit / 1000}k`
                    : String(effectiveLimit)
            const message = formatMessage(dict.quota.tpmMessageDetailed, {
                limit: limitDisplay,
                seconds: 60,
            })
            toast.error(message, { duration: 8000 })
        },
        [tpmLimit, dict],
    )

    return {
        showQuotaLimitToast,
        showTokenLimitToast,
        showTPMLimitToast,
    }
}
