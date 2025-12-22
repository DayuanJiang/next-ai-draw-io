import { NextResponse } from "next/server"
import { getServerQuotaManager } from "@/lib/server-quota-manager"

export async function GET(req: Request) {
    // Get user IP
    const forwardedFor = req.headers.get("x-forwarded-for")
    const userId = forwardedFor?.split(",")[0]?.trim() || "anonymous"

    // Check if user has own API key (bypass limits)
    const hasOwnApiKey = !!(
        req.headers.get("x-ai-provider") && req.headers.get("x-ai-api-key")
    )

    if (hasOwnApiKey) {
        return NextResponse.json({
            hasOwnApiKey: true,
            dailyRequests: { used: 0, limit: -1, remaining: -1 },
            dailyTokens: { used: 0, limit: -1, remaining: -1 },
            tpm: { used: 0, limit: -1, remaining: -1 },
        })
    }

    const quotaManager = getServerQuotaManager()

    const dailyRequests = quotaManager.checkDailyRequestLimit(userId)
    const dailyTokens = quotaManager.checkDailyTokenLimit(userId)
    const tpm = quotaManager.checkTPMLimit(userId)
    const config = quotaManager.getConfig()

    return NextResponse.json({
        hasOwnApiKey: false,
        dailyRequests: {
            used: dailyRequests.used,
            limit: config.dailyRequestLimit,
            remaining: dailyRequests.remaining,
        },
        dailyTokens: {
            used: dailyTokens.used,
            limit: config.dailyTokenLimit,
            remaining: dailyTokens.remaining,
        },
        tpm: {
            used: tpm.used,
            limit: config.tpmLimit,
            remaining: tpm.remaining,
        },
    })
}
