"use client"

import { useCallback } from "react"
import { toast } from "sonner"
import { QuotaLimitToast } from "@/components/quota-limit-toast"
import { useDictionary } from "@/hooks/use-dictionary"
import { formatMessage } from "@/lib/i18n/utils"

export interface QuotaConfig {
    onConfigModel?: () => void
}

/**
 * Hook for displaying quota limit toasts.
 * Server-side handles actual quota enforcement via DynamoDB, and its 429
 * responses carry the used and limit values shown here.
 */
export function useQuotaManager(config: QuotaConfig): {
    showQuotaLimitToast: (used: number, limit: number) => void
    showTokenLimitToast: (used: number, limit: number) => void
    showTPMLimitToast: (limit: number) => void
} {
    const { onConfigModel } = config
    const dict = useDictionary()

    // Show quota limit toast (request-based)
    const showQuotaLimitToast = useCallback(
        (used: number, limit: number) => {
            toast.custom(
                (t) => (
                    <QuotaLimitToast
                        used={used}
                        limit={limit}
                        onDismiss={() => toast.dismiss(t)}
                        onConfigModel={onConfigModel}
                    />
                ),
                { duration: 15000 },
            )
        },
        [onConfigModel],
    )

    // Show token limit toast
    const showTokenLimitToast = useCallback(
        (used: number, limit: number) => {
            toast.custom(
                (t) => (
                    <QuotaLimitToast
                        type="token"
                        used={used}
                        limit={limit}
                        onDismiss={() => toast.dismiss(t)}
                        onConfigModel={onConfigModel}
                    />
                ),
                { duration: 15000 },
            )
        },
        [onConfigModel],
    )

    // Show TPM limit toast
    const showTPMLimitToast = useCallback(
        (limit: number) => {
            const limitDisplay =
                limit >= 1000 ? `${limit / 1000}k` : String(limit)
            const message = formatMessage(dict.quota.tpmMessageDetailed, {
                limit: limitDisplay,
                seconds: 60,
            })
            toast.error(message, { duration: 8000 })
        },
        [dict],
    )

    return {
        showQuotaLimitToast,
        showTokenLimitToast,
        showTPMLimitToast,
    }
}
