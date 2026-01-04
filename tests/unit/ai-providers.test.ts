import { describe, expect, it } from "vitest"
import { supportsImageInput, supportsPromptCaching } from "@/lib/ai-providers"

describe("supportsPromptCaching", () => {
    it("returns true for Claude models", () => {
        expect(supportsPromptCaching("claude-sonnet-4-5")).toBe(true)
        expect(supportsPromptCaching("anthropic.claude-3-5-sonnet")).toBe(true)
        expect(supportsPromptCaching("us.anthropic.claude-3-5-sonnet")).toBe(
            true,
        )
        expect(supportsPromptCaching("eu.anthropic.claude-3-5-sonnet")).toBe(
            true,
        )
    })

    it("returns false for non-Claude models", () => {
        expect(supportsPromptCaching("gpt-4o")).toBe(false)
        expect(supportsPromptCaching("gemini-pro")).toBe(false)
        expect(supportsPromptCaching("deepseek-chat")).toBe(false)
    })
})

describe("supportsImageInput", () => {
    it("returns true for models with vision capability", () => {
        expect(supportsImageInput("gpt-4-vision")).toBe(true)
        expect(supportsImageInput("qwen-vl")).toBe(true)
        expect(supportsImageInput("deepseek-vl")).toBe(true)
    })

    it("returns false for Kimi K2 models without vision", () => {
        expect(supportsImageInput("kimi-k2")).toBe(false)
        expect(supportsImageInput("moonshot/kimi-k2")).toBe(false)
    })

    it("returns false for DeepSeek text models", () => {
        expect(supportsImageInput("deepseek-chat")).toBe(false)
        expect(supportsImageInput("deepseek-coder")).toBe(false)
    })

    it("returns false for Qwen text models", () => {
        expect(supportsImageInput("qwen-turbo")).toBe(false)
        expect(supportsImageInput("qwen-plus")).toBe(false)
    })

    it("returns true for Claude and GPT models by default", () => {
        expect(supportsImageInput("claude-sonnet-4-5")).toBe(true)
        expect(supportsImageInput("gpt-4o")).toBe(true)
        expect(supportsImageInput("gemini-pro")).toBe(true)
    })
})
