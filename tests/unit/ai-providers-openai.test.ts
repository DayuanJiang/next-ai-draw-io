// @vitest-environment node
import { describe, expect, it } from "vitest"
import { getAIModel } from "@/lib/ai-providers"

const summaryFor = (modelId: string) =>
    getAIModel({ provider: "openai", apiKey: "test-key", modelId })
        .providerOptions?.openai?.reasoningSummary

describe("OpenAI reasoning summary", () => {
    it("is on for the o-series and gpt-5 or later", () => {
        for (const id of [
            "o3",
            "o4-mini",
            "gpt-5.5",
            "gpt-6-luna",
            "gpt-6.1-sol",
        ]) {
            expect(summaryFor(id), id).toBe("auto")
        }
    })

    it("is off for older chat models", () => {
        for (const id of ["gpt-4.1", "gpt-4o", "gpt-4o-mini"]) {
            expect(summaryFor(id), id).toBeUndefined()
        }
    })
})
