// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
    isMinimalDiagram,
    replaceHistoricalToolInputs,
    validateFileParts,
} from "@/lib/chat-helpers"

describe("validateFileParts", () => {
    it("returns valid for no files", () => {
        const messages = [
            { role: "user", parts: [{ type: "text", text: "hello" }] },
        ]
        expect(validateFileParts(messages)).toEqual({ valid: true })
    })

    it("returns valid for files under limit", () => {
        const smallBase64 = btoa("x".repeat(100))
        const messages = [
            {
                role: "user",
                parts: [
                    {
                        type: "file",
                        url: `data:image/png;base64,${smallBase64}`,
                    },
                ],
            },
        ]
        expect(validateFileParts(messages)).toEqual({ valid: true })
    })

    it("returns error for too many files", () => {
        const messages = [
            {
                role: "user",
                parts: Array(6)
                    .fill(null)
                    .map(() => ({
                        type: "file",
                        url: "data:image/png;base64,abc",
                    })),
            },
        ]
        const result = validateFileParts(messages)
        expect(result.valid).toBe(false)
        expect(result.error).toContain("Too many files")
    })

    it("returns error for file exceeding size limit", () => {
        // Create base64 that decodes to > 2MB
        const largeBase64 = btoa("x".repeat(3 * 1024 * 1024))
        const messages = [
            {
                role: "user",
                parts: [
                    {
                        type: "file",
                        url: `data:image/png;base64,${largeBase64}`,
                    },
                ],
            },
        ]
        const result = validateFileParts(messages)
        expect(result.valid).toBe(false)
        expect(result.error).toContain("exceeds")
    })
})

describe("isMinimalDiagram", () => {
    it("returns true for empty diagram", () => {
        const xml = '<mxCell id="0"/><mxCell id="1" parent="0"/>'
        expect(isMinimalDiagram(xml)).toBe(true)
    })

    it("returns false for diagram with content", () => {
        const xml =
            '<mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Hello"/>'
        expect(isMinimalDiagram(xml)).toBe(false)
    })

    it("handles whitespace correctly", () => {
        const xml = '  <mxCell id="0"/>  <mxCell id="1" parent="0"/>  '
        expect(isMinimalDiagram(xml)).toBe(true)
    })
})

describe("replaceHistoricalToolInputs", () => {
    it("replaces display_diagram tool inputs with placeholder", () => {
        const messages = [
            {
                role: "assistant",
                content: [
                    {
                        type: "tool-call",
                        toolName: "display_diagram",
                        input: { xml: "<mxCell...>" },
                    },
                ],
            },
        ]
        const result = replaceHistoricalToolInputs(messages)
        expect(result[0].content[0].input.placeholder).toContain(
            "XML content replaced",
        )
    })

    it("replaces edit_diagram tool inputs with placeholder", () => {
        const messages = [
            {
                role: "assistant",
                content: [
                    {
                        type: "tool-call",
                        toolName: "edit_diagram",
                        input: { operations: [] },
                    },
                ],
            },
        ]
        const result = replaceHistoricalToolInputs(messages)
        expect(result[0].content[0].input.placeholder).toContain(
            "XML content replaced",
        )
    })

    it("removes tool calls with invalid inputs", () => {
        const messages = [
            {
                role: "assistant",
                content: [
                    {
                        type: "tool-call",
                        toolName: "display_diagram",
                        input: {},
                    },
                    {
                        type: "tool-call",
                        toolName: "display_diagram",
                        input: null,
                    },
                ],
            },
        ]
        const result = replaceHistoricalToolInputs(messages)
        expect(result[0].content).toHaveLength(0)
    })

    it("preserves non-assistant messages", () => {
        const messages = [{ role: "user", content: "hello" }]
        const result = replaceHistoricalToolInputs(messages)
        expect(result).toEqual(messages)
    })

    it("preserves other tool calls", () => {
        const messages = [
            {
                role: "assistant",
                content: [
                    {
                        type: "tool-call",
                        toolName: "other_tool",
                        input: { foo: "bar" },
                    },
                ],
            },
        ]
        const result = replaceHistoricalToolInputs(messages)
        expect(result[0].content[0].input).toEqual({ foo: "bar" })
    })
})
