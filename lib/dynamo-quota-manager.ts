import {
    ConditionalCheckFailedException,
    DynamoDBClient,
    GetItemCommand,
    UpdateItemCommand,
} from "@aws-sdk/client-dynamodb"

// Quota tracking is OPT-IN: only enabled if DYNAMODB_QUOTA_TABLE is explicitly set
// OSS users who don't need quota tracking can simply not set this env var
const TABLE = process.env.DYNAMODB_QUOTA_TABLE
const DYNAMODB_REGION = process.env.DYNAMODB_REGION || "ap-northeast-1"
// Timezone for daily quota reset (e.g., "Asia/Tokyo" for JST midnight reset)
// Defaults to UTC if not set
let QUOTA_TIMEZONE = process.env.QUOTA_TIMEZONE || "UTC"

// Validate timezone at module load
try {
    new Intl.DateTimeFormat("en-CA", { timeZone: QUOTA_TIMEZONE }).format(
        new Date(),
    )
} catch {
    console.warn(
        `[quota] Invalid QUOTA_TIMEZONE "${QUOTA_TIMEZONE}", using UTC`,
    )
    QUOTA_TIMEZONE = "UTC"
}

/**
 * Get today's date string in the configured timezone (YYYY-MM-DD format)
 */
function getTodayInTimezone(): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: QUOTA_TIMEZONE,
    }).format(new Date())
}

// Only create client if quota is enabled
const client = TABLE ? new DynamoDBClient({ region: DYNAMODB_REGION }) : null

/**
 * Check if server-side quota tracking is enabled.
 * Quota is opt-in: only enabled when DYNAMODB_QUOTA_TABLE env var is set.
 */
export function isQuotaEnabled(): boolean {
    return !!TABLE
}

interface QuotaLimits {
    requests: number // Daily request limit
    tokens: number // Daily token limit
    tpm: number // Tokens per minute
}

interface QuotaCheckResult {
    allowed: boolean
    error?: string
    type?: "request" | "token" | "tpm"
    used?: number
    limit?: number
}

/**
 * Check all quotas and increment request count atomically.
 * Uses ConditionExpression to prevent race conditions.
 * Returns which limit was exceeded if any.
 */
export async function checkAndIncrementRequest(
    ip: string,
    limits: QuotaLimits,
): Promise<QuotaCheckResult> {
    // Skip if quota tracking not enabled
    if (!client || !TABLE) {
        return { allowed: true }
    }

    const today = getTodayInTimezone()
    const currentMinute = Math.floor(Date.now() / 60000).toString()
    const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60

    try {
        // First, try to reset counts if it's a new day (atomic day reset)
        // This will succeed only if lastResetDate < today or doesn't exist
        try {
            await client.send(
                new UpdateItemCommand({
                    TableName: TABLE,
                    Key: { PK: { S: `IP#${ip}` } },
                    // Reset all counts to 1/0 for the new day
                    UpdateExpression: `
                        SET lastResetDate = :today,
                            dailyReqCount = :one,
                            dailyTokenCount = :zero,
                            lastMinute = :minute,
                            tpmCount = :zero,
                            #ttl = :ttl
                    `,
                    // Only succeed if it's a new day (or new item)
                    ConditionExpression: `
                        attribute_not_exists(lastResetDate) OR lastResetDate < :today
                    `,
                    ExpressionAttributeNames: { "#ttl": "ttl" },
                    ExpressionAttributeValues: {
                        ":today": { S: today },
                        ":zero": { N: "0" },
                        ":one": { N: "1" },
                        ":minute": { S: currentMinute },
                        ":ttl": { N: String(ttl) },
                    },
                }),
            )
            // New day reset successful
            return { allowed: true }
        } catch (resetError: any) {
            // If condition failed, it's the same day - continue to increment logic
            if (!(resetError instanceof ConditionalCheckFailedException)) {
                throw resetError // Re-throw unexpected errors
            }
        }

        // Same day - increment request count with limit checks
        await client.send(
            new UpdateItemCommand({
                TableName: TABLE,
                Key: { PK: { S: `IP#${ip}` } },
                // Increment request count, handle minute boundary for TPM
                UpdateExpression: `
                    SET lastMinute = :minute,
                        tpmCount = if_not_exists(tpmCount, :zero),
                        #ttl = :ttl
                    ADD dailyReqCount :one
                `,
                // Check all limits before allowing increment
                ConditionExpression: `
                    lastResetDate = :today AND
                    (attribute_not_exists(dailyReqCount) OR dailyReqCount < :reqLimit) AND
                    (attribute_not_exists(dailyTokenCount) OR dailyTokenCount < :tokenLimit) AND
                    (attribute_not_exists(lastMinute) OR lastMinute <> :minute OR
                     attribute_not_exists(tpmCount) OR tpmCount < :tpmLimit)
                `,
                ExpressionAttributeNames: { "#ttl": "ttl" },
                ExpressionAttributeValues: {
                    ":today": { S: today },
                    ":zero": { N: "0" },
                    ":one": { N: "1" },
                    ":minute": { S: currentMinute },
                    ":ttl": { N: String(ttl) },
                    ":reqLimit": { N: String(limits.requests || 999999) },
                    ":tokenLimit": { N: String(limits.tokens || 999999) },
                    ":tpmLimit": { N: String(limits.tpm || 999999) },
                },
            }),
        )

        return { allowed: true }
    } catch (e: any) {
        // Condition failed - need to determine which limit was exceeded
        if (e instanceof ConditionalCheckFailedException) {
            // Get current counts to determine which limit was hit
            try {
                const getResult = await client.send(
                    new GetItemCommand({
                        TableName: TABLE,
                        Key: { PK: { S: `IP#${ip}` } },
                    }),
                )

                const item = getResult.Item
                const storedDate = item?.lastResetDate?.S
                const storedMinute = item?.lastMinute?.S
                const isNewDay = !storedDate || storedDate < today

                const dailyReqCount = isNewDay
                    ? 0
                    : Number(item?.dailyReqCount?.N || 0)
                const dailyTokenCount = isNewDay
                    ? 0
                    : Number(item?.dailyTokenCount?.N || 0)
                const tpmCount =
                    storedMinute !== currentMinute
                        ? 0
                        : Number(item?.tpmCount?.N || 0)

                // Determine which limit was exceeded
                if (limits.requests > 0 && dailyReqCount >= limits.requests) {
                    return {
                        allowed: false,
                        type: "request",
                        error: "Daily request limit exceeded",
                        used: dailyReqCount,
                        limit: limits.requests,
                    }
                }
                if (limits.tokens > 0 && dailyTokenCount >= limits.tokens) {
                    return {
                        allowed: false,
                        type: "token",
                        error: "Daily token limit exceeded",
                        used: dailyTokenCount,
                        limit: limits.tokens,
                    }
                }
                if (limits.tpm > 0 && tpmCount >= limits.tpm) {
                    return {
                        allowed: false,
                        type: "tpm",
                        error: "Rate limit exceeded (tokens per minute)",
                        used: tpmCount,
                        limit: limits.tpm,
                    }
                }

                // Condition failed but no limit clearly exceeded - race condition edge case
                // Fail safe by allowing (could be a reset race)
                console.warn(
                    `[quota] Condition failed but no limit exceeded for IP prefix: ${ip.slice(0, 8)}...`,
                )
                return { allowed: true }
            } catch (getError: any) {
                console.error(
                    `[quota] Failed to get quota details after condition failure, IP prefix: ${ip.slice(0, 8)}..., error: ${getError.message}`,
                )
                return { allowed: true } // Fail open
            }
        }

        // Other DynamoDB errors - fail open
        console.error(
            `[quota] DynamoDB error (fail-open), IP prefix: ${ip.slice(0, 8)}..., error: ${e.message}`,
        )
        return { allowed: true }
    }
}

/**
 * Record token usage after response completes.
 * Uses atomic operations to update both daily token count and TPM count.
 * Handles minute boundaries atomically to prevent race conditions.
 */
export async function recordTokenUsage(
    ip: string,
    tokens: number,
): Promise<void> {
    // Skip if quota tracking not enabled
    if (!client || !TABLE) return
    if (!Number.isFinite(tokens) || tokens <= 0) return

    const currentMinute = Math.floor(Date.now() / 60000).toString()
    const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60

    try {
        // Try to update assuming same minute (most common case)
        // Uses condition to ensure we're in the same minute
        await client.send(
            new UpdateItemCommand({
                TableName: TABLE,
                Key: { PK: { S: `IP#${ip}` } },
                UpdateExpression:
                    "SET #ttl = :ttl ADD dailyTokenCount :tokens, tpmCount :tokens",
                ConditionExpression: "lastMinute = :minute",
                ExpressionAttributeNames: { "#ttl": "ttl" },
                ExpressionAttributeValues: {
                    ":minute": { S: currentMinute },
                    ":tokens": { N: String(tokens) },
                    ":ttl": { N: String(ttl) },
                },
            }),
        )
    } catch (e: any) {
        if (e instanceof ConditionalCheckFailedException) {
            // Different minute - reset TPM count and set new minute
            try {
                await client.send(
                    new UpdateItemCommand({
                        TableName: TABLE,
                        Key: { PK: { S: `IP#${ip}` } },
                        UpdateExpression:
                            "SET lastMinute = :minute, tpmCount = :tokens, #ttl = :ttl ADD dailyTokenCount :tokens",
                        ExpressionAttributeNames: { "#ttl": "ttl" },
                        ExpressionAttributeValues: {
                            ":minute": { S: currentMinute },
                            ":tokens": { N: String(tokens) },
                            ":ttl": { N: String(ttl) },
                        },
                    }),
                )
            } catch (retryError: any) {
                console.error(
                    `[quota] Failed to record tokens (retry), IP prefix: ${ip.slice(0, 8)}..., tokens: ${tokens}, error: ${retryError.message}`,
                )
            }
        } else {
            console.error(
                `[quota] Failed to record tokens, IP prefix: ${ip.slice(0, 8)}..., tokens: ${tokens}, error: ${e.message}`,
            )
        }
    }
}
