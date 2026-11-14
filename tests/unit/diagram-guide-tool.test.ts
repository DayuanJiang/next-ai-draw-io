// @vitest-environment node
import { describe, expect, it } from "vitest"
import { chatTools } from "@/lib/chat-tools"
import { isLookupTool } from "@/lib/lookup-tools"
import { getSystemPrompt } from "@/lib/system-prompts"
import { DIAGRAM_TYPE_NAMES } from "@/packages/mcp-server/src/diagram-types/index.ts"

const run = (type: string) =>
    chatTools.get_diagram_guide.execute?.(
        { type },
        { toolCallId: "c1", messages: [] },
    )

describe("the get_diagram_guide tool", () => {
    it("returns the guide of a type, written for the chat's tools", async () => {
        const text = await run("sequence")
        expect(text).toContain("shape=umlLifeline")
        expect(text).toContain('Now call display_diagram with type="sequence".')
    })

    it("answers an unknown type with the types that have a guide", async () => {
        expect(await run("flowchart")).toContain("sequence")
    })

    it("lists every type in its description and in the system prompt", () => {
        const prompt = getSystemPrompt("test-model", false)
        for (const name of DIAGRAM_TYPE_NAMES) {
            expect(chatTools.get_diagram_guide.description).toContain(
                `- ${name}: `,
            )
            expect(prompt).toContain(`- ${name}: `)
        }
        expect(prompt).toContain("tool name: get_diagram_guide")
    })
})

describe("isLookupTool", () => {
    it("knows the tools the server runs, which draw nothing", () => {
        // The chat engine tells "the model looked something up" from "the
        // model drew" by this: a tool the server runs has to be in the set
        const serverTools = Object.entries(chatTools)
            .filter(([, tool]) => "execute" in tool)
            .map(([name]) => name)
        expect(serverTools.length).toBeGreaterThan(0)
        for (const name of serverTools) expect(isLookupTool(name)).toBe(true)
    })

    it("does not count the drawing tools", () => {
        for (const name of [
            "display_diagram",
            "edit_diagram",
            "append_diagram",
        ]) {
            expect(isLookupTool(name)).toBe(false)
        }
    })
})
