import { z } from "zod"
import type { ChatUsageMetadata } from "@/lib/chat-metadata"

export const PRICING_HEADERS = {
    inputPricePerMillionUsd: "x-input-price-per-million-usd",
    outputPricePerMillionUsd: "x-output-price-per-million-usd",
    cachedInputPricePerMillionUsd: "x-cached-input-price-per-million-usd",
    cacheWritePricePerMillionUsd: "x-cache-write-price-per-million-usd",
} as const

const RequestPricingSchema = z.object({
    inputPricePerMillionUsd: z.number().min(0),
    outputPricePerMillionUsd: z.number().min(0),
    cachedInputPricePerMillionUsd: z.number().min(0).optional(),
    cacheWritePricePerMillionUsd: z.number().min(0).optional(),
})

export type RequestPricing = z.infer<typeof RequestPricingSchema>

interface UsageLike {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    cachedInputTokens?: number
    inputTokenDetails?: {
        cacheWriteTokens?: number
    }
}

function parseHeaderNumber(value: string | null): number | undefined {
    if (!value) return undefined

    const normalized = value.trim()
    if (!normalized) return undefined

    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : undefined
}

export function parsePricingHeaders(
    headers: Pick<Headers, "get">,
): RequestPricing | null {
    const parsed = RequestPricingSchema.safeParse({
        inputPricePerMillionUsd: parseHeaderNumber(
            headers.get(PRICING_HEADERS.inputPricePerMillionUsd),
        ),
        outputPricePerMillionUsd: parseHeaderNumber(
            headers.get(PRICING_HEADERS.outputPricePerMillionUsd),
        ),
        cachedInputPricePerMillionUsd: parseHeaderNumber(
            headers.get(PRICING_HEADERS.cachedInputPricePerMillionUsd),
        ),
        cacheWritePricePerMillionUsd: parseHeaderNumber(
            headers.get(PRICING_HEADERS.cacheWritePricePerMillionUsd),
        ),
    })

    return parsed.success ? parsed.data : null
}

function tokensToUsd(tokens: number, perMillionUsd?: number): number {
    if (perMillionUsd === undefined || tokens <= 0) return 0
    return (tokens / 1_000_000) * perMillionUsd
}

export function buildUsageMetadata(
    usage: UsageLike | undefined,
    pricing: RequestPricing | null,
): ChatUsageMetadata {
    const inputTokens = usage?.inputTokens ?? 0
    const outputTokens = usage?.outputTokens ?? 0
    const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens
    const cachedInputTokens = usage?.cachedInputTokens ?? 0
    const cacheWriteTokens = usage?.inputTokenDetails?.cacheWriteTokens ?? 0

    if (!pricing) {
        return {
            inputTokens,
            outputTokens,
            totalTokens,
            cachedInputTokens,
            cacheWriteTokens,
            costAvailable: false,
        }
    }

    const cachedInputPrice =
        pricing.cachedInputPricePerMillionUsd ?? pricing.inputPricePerMillionUsd
    const cacheWritePrice =
        pricing.cacheWritePricePerMillionUsd ?? pricing.inputPricePerMillionUsd

    return {
        inputTokens,
        outputTokens,
        totalTokens,
        cachedInputTokens,
        cacheWriteTokens,
        estimatedCostUsd:
            tokensToUsd(inputTokens, pricing.inputPricePerMillionUsd) +
            tokensToUsd(outputTokens, pricing.outputPricePerMillionUsd) +
            tokensToUsd(cachedInputTokens, cachedInputPrice) +
            tokensToUsd(cacheWriteTokens, cacheWritePrice),
        costAvailable: true,
    }
}
