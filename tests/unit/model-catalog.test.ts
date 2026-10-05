import { describe, expect, it } from "vitest"
import { getModelInfo } from "@/lib/model-catalog"
import catalog from "@/lib/model-catalog.json"

describe("getModelInfo", () => {
    it("finds a model by its exact id, ignoring case", () => {
        const id = Object.keys(catalog.openai).find((m) => m === "gpt-4.1")
        expect(id).toBe("gpt-4.1")
        expect(getModelInfo("openai", "GPT-4.1")).toEqual(
            catalog.openai["gpt-4.1"],
        )
    })

    it("finds a dated or tagged variant by the longest id it starts with", () => {
        expect(getModelInfo("openai", "gpt-4.1-2025-04-14")).toEqual(
            catalog.openai["gpt-4.1"],
        )
    })

    it("does not match a different model that shares a prefix", () => {
        // gpt-4.1-mini is its own entry, not gpt-4.1
        expect(getModelInfo("openai", "gpt-4.1-mini")).toEqual(
            catalog.openai["gpt-4.1-mini"],
        )
        expect(getModelInfo("openai", "gpt-4.1x")).toBeUndefined()
    })

    it("knows nothing about providers models.dev does not list", () => {
        expect(getModelInfo("sglang", "anything")).toBeUndefined()
        expect(getModelInfo("openai", "not-a-model")).toBeUndefined()
    })
})
