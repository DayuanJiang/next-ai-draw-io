import { describe, expect, it } from "vitest"
import { getSystemPrompt } from "@/lib/system-prompts"

describe("getSystemPrompt", () => {
    // Without a recipe each model invents its own sequence diagram: lifelines
    // that draw.io cannot show, or every message on one line
    it("tells every model how to draw a sequence diagram, in both style modes", () => {
        for (const model of [
            "global.openai.gpt-6-luna",
            "global.anthropic.claude-haiku-5-5",
        ]) {
            for (const minimalStyle of [false, true]) {
                const prompt = getSystemPrompt(model, minimalStyle)
                expect(prompt).toContain(
                    "shape=umlLifeline;perimeter=lifelinePerimeter;size=40",
                )
                expect(prompt).toContain(
                    "exitX=0.5;exitY=f;entryX=0.5;entryY=f;verticalAlign=bottom",
                )
            }
        }
    })
})
