// @vitest-environment node
import { describe, expect, it } from "vitest"
import { getModelInfo } from "@/lib/model-catalog"
import { PROVIDERS } from "@/lib/providers"

describe("MiniMax M3.1 Flash", () => {
    it("is the first MiniMax suggestion, before the existing ones", () => {
        expect(PROVIDERS.minimax.models).toEqual([
            "MiniMax-M3.1-Flash",
            "MiniMax-M3",
            "MiniMax-M2.7",
            "MiniMax-M2.7-highspeed",
            "MiniMax-M2.5",
        ])
    })

    it("has catalog entries for the direct API and OpenRouter", () => {
        expect(getModelInfo("minimax", "MiniMax-M3.1-Flash")).toMatchObject({
            tools: true,
            images: true,
            context: 1000000,
        })
        expect(
            getModelInfo("openrouter", "minimax/minimax-m3.1-flash"),
        ).toMatchObject({
            tools: true,
            cost: { input: 0.075, output: 0.3 },
        })
    })
})
