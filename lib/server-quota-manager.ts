// Server-side quota management for IP-based limits
// In production, this should be replaced with a database-backed solution

interface QuotaData {
    requestCount: number
    tokenCount: number
    tpmCount: number
    requestDate: string
    tokenDate: string
    tpmMinute: string
}

interface QuotaConfig {
    dailyRequestLimit: number
    dailyTokenLimit: number
    tpmLimit: number
}

class ServerQuotaManager {
    private quotaStore = new Map<string, QuotaData>()
    private config: QuotaConfig

    constructor(config: QuotaConfig) {
        this.config = config
    }

    private getCurrentDate(): string {
        return new Date().toISOString().split("T")[0] // YYYY-MM-DD
    }

    private getCurrentMinute(): string {
        const now = new Date()
        return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`
    }

    private getQuotaData(ip: string): QuotaData {
        let data = this.quotaStore.get(ip)
        if (!data) {
            data = {
                requestCount: 0,
                tokenCount: 0,
                tpmCount: 0,
                requestDate: this.getCurrentDate(),
                tokenDate: this.getCurrentDate(),
                tpmMinute: this.getCurrentMinute(),
            }
            this.quotaStore.set(ip, data)
        }
        return data
    }

    private resetIfNeeded(data: QuotaData): void {
        const currentDate = this.getCurrentDate()
        const currentMinute = this.getCurrentMinute()

        if (data.requestDate !== currentDate) {
            data.requestCount = 0
            data.requestDate = currentDate
        }

        if (data.tokenDate !== currentDate) {
            data.tokenCount = 0
            data.tokenDate = currentDate
        }

        if (data.tpmMinute !== currentMinute) {
            data.tpmCount = 0
            data.tpmMinute = currentMinute
        }
    }

    checkDailyRequestLimit(ip: string): {
        allowed: boolean
        remaining: number
        used: number
    } {
        if (this.config.dailyRequestLimit <= 0) {
            return { allowed: true, remaining: -1, used: 0 }
        }

        const data = this.getQuotaData(ip)
        this.resetIfNeeded(data)

        const allowed = data.requestCount < this.config.dailyRequestLimit
        const remaining = this.config.dailyRequestLimit - data.requestCount
        const used = data.requestCount

        return { allowed, remaining, used }
    }

    checkDailyTokenLimit(ip: string): {
        allowed: boolean
        remaining: number
        used: number
    } {
        if (this.config.dailyTokenLimit <= 0) {
            return { allowed: true, remaining: -1, used: 0 }
        }

        const data = this.getQuotaData(ip)
        this.resetIfNeeded(data)

        const allowed = data.tokenCount < this.config.dailyTokenLimit
        const remaining = this.config.dailyTokenLimit - data.tokenCount
        const used = data.tokenCount

        return { allowed, remaining, used }
    }

    checkTPMLimit(ip: string): {
        allowed: boolean
        remaining: number
        used: number
    } {
        if (this.config.tpmLimit <= 0) {
            return { allowed: true, remaining: -1, used: 0 }
        }

        const data = this.getQuotaData(ip)
        this.resetIfNeeded(data)

        const allowed = data.tpmCount < this.config.tpmLimit
        const remaining = this.config.tpmLimit - data.tpmCount
        const used = data.tpmCount

        return { allowed, remaining, used }
    }

    incrementRequestCount(ip: string): void {
        const data = this.getQuotaData(ip)
        this.resetIfNeeded(data)
        data.requestCount++
    }

    incrementTokenCount(ip: string, tokens: number): void {
        if (!Number.isFinite(tokens) || tokens <= 0) return

        const data = this.getQuotaData(ip)
        this.resetIfNeeded(data)
        data.tokenCount += tokens
    }

    incrementTPMCount(ip: string, tokens: number): void {
        if (!Number.isFinite(tokens) || tokens <= 0) return

        const data = this.getQuotaData(ip)
        this.resetIfNeeded(data)
        data.tpmCount += tokens
    }

    checkAllLimits(ip: string): {
        allowed: boolean
        reason?: string
        remainingRequests?: number
        remainingTokens?: number
        remainingTPM?: number
    } {
        const requestCheck = this.checkDailyRequestLimit(ip)
        if (!requestCheck.allowed) {
            return {
                allowed: false,
                reason: "Daily request limit exceeded",
                remainingRequests: requestCheck.remaining,
            }
        }

        const tokenCheck = this.checkDailyTokenLimit(ip)
        if (!tokenCheck.allowed) {
            return {
                allowed: false,
                reason: "Daily token limit exceeded",
                remainingTokens: tokenCheck.remaining,
            }
        }

        const tpmCheck = this.checkTPMLimit(ip)
        if (!tpmCheck.allowed) {
            return {
                allowed: false,
                reason: "Tokens per minute limit exceeded",
                remainingTPM: tpmCheck.remaining,
            }
        }

        return {
            allowed: true,
            remainingRequests: requestCheck.remaining,
            remainingTokens: tokenCheck.remaining,
            remainingTPM: tpmCheck.remaining,
        }
    }
}

// Global instance - in production, this should be shared across server instances
let quotaManager: ServerQuotaManager | null = null

export function getServerQuotaManager(): ServerQuotaManager {
    if (!quotaManager) {
        const config: QuotaConfig = {
            dailyRequestLimit: Number(process.env.DAILY_REQUEST_LIMIT) || 0,
            dailyTokenLimit: Number(process.env.DAILY_TOKEN_LIMIT) || 0,
            tpmLimit: Number(process.env.TPM_LIMIT) || 0,
        }
        quotaManager = new ServerQuotaManager(config)
    }
    return quotaManager
}
