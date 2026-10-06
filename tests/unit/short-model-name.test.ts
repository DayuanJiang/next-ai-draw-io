import { describe, expect, it } from "vitest"
import { shortModelName } from "@/components/model-selector"

describe("shortModelName", () => {
    it("drops the provider or region prefix the logo already shows", () => {
        expect(shortModelName("nvidia/nemotron-3-ultra-550b-a55b:free")).toBe(
            "nemotron-3-ultra-550b-a55b:free",
        )
        expect(shortModelName("global.anthropic.claude-opus-5-5")).toBe(
            "claude-opus-5-5",
        )
        expect(shortModelName("us.amazon.nova-2-lite-v1:0")).toBe(
            "nova-2-lite-v1:0",
        )
        expect(shortModelName("openai.gpt-6-luna")).toBe("gpt-6-luna")
        expect(shortModelName("@tx/deepseek-ai/deepseek-v32")).toBe(
            "deepseek-v32",
        )
    })

    it("keeps the vendor when the rest does not name it", () => {
        expect(shortModelName("deepseek.r1-v1:0")).toBe("deepseek.r1-v1:0")
        expect(shortModelName("us.deepseek.r1-v1:0")).toBe("deepseek.r1-v1:0")
        expect(shortModelName("deepseek.v3-v1:0")).toBe("deepseek.v3-v1:0")
    })

    it("keeps version numbers with dots", () => {
        for (const id of [
            "gpt-5.5",
            "glm-4.7",
            "gemini-2.5-flash",
            "kimi-k2.6",
        ]) {
            expect(shortModelName(id)).toBe(id)
        }
    })
})
