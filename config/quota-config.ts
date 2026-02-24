import "server-only"

export type QuotaProvider = "dynamo" | "none"

export interface QuotaConfig {
    provider: QuotaProvider
}

const VALID_PROVIDERS = ["dynamo", "none"] as const
const DEFAULT_PROVIDER: QuotaProvider = "dynamo"

/**
 * Determine which quota provider to use based on the environment configuration.
 *
 * Environment variable:
 * - QUOTA_PROVIDER: controls which quota provider implementation is used.
 */
const getQuotaProvider = (): QuotaProvider => {
    const provider = process.env.QUOTA_PROVIDER || DEFAULT_PROVIDER

    if (!VALID_PROVIDERS.includes(provider as QuotaProvider)) {
        throw new Error(
            `Invalid quota provider: ${provider}. Must be one of: ${VALID_PROVIDERS.join(", ")}`,
        )
    }

    return provider as QuotaProvider
}

export const quotaConfig: QuotaConfig = {
    provider: getQuotaProvider(),
}
