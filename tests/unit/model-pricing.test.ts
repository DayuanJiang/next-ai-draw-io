import { describe, expect, it } from "vitest"
import {
    buildUsageMetadata,
    PRICING_HEADERS,
    parsePricingHeaders,
} from "@/lib/model-pricing"

describe("parsePricingHeaders", () => {
    it("returns null when required prices are missing", () => {
        const pricing = parsePricingHeaders(
            new Headers({
                [PRICING_HEADERS.inputPricePerMillionUsd]: "2.5",
            }),
        )

        expect(pricing).toBeNull()
    })
})

describe("buildUsageMetadata", () => {
    it("returns usage without cost when pricing is not configured", () => {
        const usage = buildUsageMetadata(
            {
                inputTokens: 120,
                outputTokens: 80,
                totalTokens: 200,
            },
            null,
        )

        expect(usage).toMatchObject({
            inputTokens: 120,
            outputTokens: 80,
            totalTokens: 200,
            costAvailable: false,
        })
    })

    it("calculates estimated cost from request headers", () => {
        const pricing = parsePricingHeaders(
            new Headers({
                [PRICING_HEADERS.inputPricePerMillionUsd]: "2.5",
                [PRICING_HEADERS.outputPricePerMillionUsd]: "10",
                [PRICING_HEADERS.cachedInputPricePerMillionUsd]: "1.25",
                [PRICING_HEADERS.cacheWritePricePerMillionUsd]: "3.75",
            }),
        )

        const usage = buildUsageMetadata(
            {
                inputTokens: 1000,
                outputTokens: 500,
                totalTokens: 1500,
                cachedInputTokens: 200,
                inputTokenDetails: {
                    cacheWriteTokens: 50,
                },
            },
            pricing,
        )

        expect(usage.costAvailable).toBe(true)
        expect(usage.estimatedCostUsd).toBeCloseTo(0.0079375, 10)
    })
})
