import { afterEach, describe, expect, it } from "vitest"
import {
    buildUsageMetadata,
    loadPricingConfig,
    resetPricingConfigCache,
} from "@/lib/model-pricing"

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
    process.env.AI_PRICING_CONFIG = ORIGINAL_ENV.AI_PRICING_CONFIG
    process.env.AI_PRICING_CONFIG_PATH = ORIGINAL_ENV.AI_PRICING_CONFIG_PATH
    resetPricingConfigCache()
})

describe("buildUsageMetadata", () => {
    it("returns usage without cost when pricing config is missing", () => {
        const usage = buildUsageMetadata(
            "openai",
            "gpt-4o",
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

    it("calculates estimated cost from matching pricing rule", async () => {
        process.env.AI_PRICING_CONFIG = JSON.stringify({
            rules: [
                {
                    provider: "openai",
                    modelPattern: "^gpt-4o$",
                    label: "OpenAI GPT-4o",
                    inputPerMillionUsd: 2.5,
                    outputPerMillionUsd: 10,
                    cachedInputPerMillionUsd: 1.25,
                    cacheWritePerMillionUsd: 3.75,
                },
            ],
        })

        const config = await loadPricingConfig()
        const usage = buildUsageMetadata(
            "openai",
            "gpt-4o",
            {
                inputTokens: 1000,
                outputTokens: 500,
                totalTokens: 1500,
                cachedInputTokens: 200,
                inputTokenDetails: {
                    cacheWriteTokens: 50,
                },
            },
            config,
        )

        expect(usage.costAvailable).toBe(true)
        expect(usage.pricingSource).toBe("OpenAI GPT-4o")
        expect(usage.estimatedCostUsd).toBeCloseTo(0.0079375, 10)
    })
})
