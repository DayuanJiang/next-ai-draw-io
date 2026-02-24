import "server-only"

import { quotaConfig } from "@/config/quota-config"
import type { BaseQuotaManager, QuotaLimits } from "./base-quota-manager"

let cachedQuotaManager: BaseQuotaManager | null = null

const getQuotaManager = async (): Promise<BaseQuotaManager> => {
    if (cachedQuotaManager) {
        return cachedQuotaManager
    }

    const { quotaManager } = await import(
        `./${quotaConfig.provider}-quota-manager`
    )
    cachedQuotaManager = quotaManager
    return quotaManager
}

export const checkAndIncrementRequest = async (
    userId: string,
    limits: QuotaLimits,
) => {
    const manager = await getQuotaManager()
    return manager.checkAndIncrementRequest(userId, limits)
}

export const isQuotaEnabled = async () => {
    const manager = await getQuotaManager()
    return manager.isQuotaEnabled()
}

export const recordTokenUsage = async (userId: string, tokensUsed: number) => {
    const manager = await getQuotaManager()
    return manager.recordTokenUsage(userId, tokensUsed)
}
