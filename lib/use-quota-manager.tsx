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
}

/**
 * Hook for displaying quota limit toasts.
 * Server-side handles actual quota enforcement via DynamoDB.
 * This hook only provides UI feedback when limits are exceeded.
 */
export function useQuotaManager(config: QuotaConfig): {
    showQuotaLimitToast: () => void
    showTokenLimitToast: (used: number) => void
    showTPMLimitToast: () => void
} {
    const { dailyRequestLimit, dailyTokenLimit, tpmLimit } = config
    const dict = useDictionary()

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

    // Show TPM limit toast
    const showTPMLimitToast = useCallback(() => {
        const limitDisplay =
            tpmLimit >= 1000 ? `${tpmLimit / 1000}k` : String(tpmLimit)
        const message = formatMessage(dict.quota.tpmMessageDetailed, {
            limit: limitDisplay,
            seconds: 60,
        })
        toast.error(message, { duration: 8000 })
    }, [tpmLimit, dict])

    return {
        showQuotaLimitToast,
        showTokenLimitToast,
        showTPMLimitToast,
    }
}
