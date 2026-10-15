import { describe, expect, it } from "vitest"
import { getModelInfo, listCatalogModels } from "@/lib/model-catalog"
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

describe("listCatalogModels", () => {
    it("lists the provider's models that can call tools", () => {
        const ids = listCatalogModels("anthropic")
        expect(ids.length).toBeGreaterThan(0)
        for (const id of ids) {
            expect(
                catalog.anthropic[id as keyof typeof catalog.anthropic],
            ).toMatchObject({ tools: true })
        }
        const withoutTools = Object.entries(catalog.openai)
            .filter(([, info]) => !info.tools)
            .map(([id]) => id)
        for (const id of withoutTools) {
            expect(listCatalogModels("openai")).not.toContain(id)
        }
    })

    it("has nothing for providers models.dev does not list", () => {
        expect(listCatalogModels("sglang")).toEqual([])
    })
})
