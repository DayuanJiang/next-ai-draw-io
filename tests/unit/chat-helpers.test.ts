// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
    filterHistoricalDiagramToolMessages,
    isMinimalDiagram,
    replaceHistoricalToolInputs,
    shouldApplyStreamingDisplayDiagramPreview,
    shouldReplayDisplayDiagramTool,
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

describe("shouldReplayDisplayDiagramTool", () => {
    it("returns true for cached example tool calls", () => {
        expect(shouldReplayDisplayDiagramTool("cached-123")).toBe(true)
    })

    it("returns false for regular model tool calls", () => {
        expect(shouldReplayDisplayDiagramTool("call_abc123")).toBe(false)
        expect(shouldReplayDisplayDiagramTool("toolu_01XYZ")).toBe(false)
    })

    it("returns false for invalid values", () => {
        expect(shouldReplayDisplayDiagramTool(undefined)).toBe(false)
        expect(shouldReplayDisplayDiagramTool(null)).toBe(false)
        expect(shouldReplayDisplayDiagramTool(123)).toBe(false)
    })
})

describe("shouldApplyStreamingDisplayDiagramPreview", () => {
    it("returns true for cached example tool calls", () => {
        expect(
            shouldApplyStreamingDisplayDiagramPreview({
                toolCallId: "cached-123",
                chartXml:
                    '<mxfile><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Existing"/></root></mxGraphModel></diagram></mxfile>',
            }),
        ).toBe(true)
    })

    it("returns false when canvas is not blank", () => {
        expect(
            shouldApplyStreamingDisplayDiagramPreview({
                toolCallId: "call_abc123",
                chartXml:
                    '<mxfile><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Existing"/></root></mxGraphModel></diagram></mxfile>',
            }),
        ).toBe(false)
    })

    it("returns true when canvas is empty", () => {
        expect(
            shouldApplyStreamingDisplayDiagramPreview({
                toolCallId: "call_abc123",
                chartXml:
                    '<mxfile><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>',
            }),
        ).toBe(true)
    })
})

describe("filterHistoricalDiagramToolMessages", () => {
    it("removes historical diagram tool-call and tool-result messages from model history", () => {
        const messages = [
            {
                role: "user",
                content: [{ type: "text", text: "first prompt" }],
            },
            {
                role: "assistant",
                content: [
                    { type: "reasoning", text: "thinking" },
                    { type: "text", text: "I will draw it" },
                    {
                        type: "tool-call",
                        toolName: "display_diagram",
                        input: { xml: '<mxCell id="2" />', pageName: "Page A" },
                    },
                ],
            },
            {
                role: "tool",
                content: [
                    {
                        type: "tool-result",
                        toolName: "display_diagram",
                        output: "ok",
                    },
                ],
            },
            {
                role: "assistant",
                content: [{ type: "text", text: "done" }],
            },
            {
                role: "user",
                content: [{ type: "text", text: "second prompt" }],
            },
        ]

        const result = filterHistoricalDiagramToolMessages(messages as any)

        expect(result).toHaveLength(4)
        expect(result[0].role).toBe("user")
        expect(result[1].role).toBe("assistant")
        expect(result[1].content).toEqual([
            { type: "reasoning", text: "thinking" },
            { type: "text", text: "I will draw it" },
        ])
        expect(result[2].role).toBe("assistant")
        expect(result[3].role).toBe("user")
    })

    it("removes assistant messages that only contain diagram tool-calls", () => {
        const messages = [
            {
                role: "assistant",
                content: [
                    {
                        type: "tool-call",
                        toolName: "display_diagram",
                        input: { xml: '<mxCell id="2" />', pageName: "Only Tool" },
                    },
                ],
            },
        ]

        const result = filterHistoricalDiagramToolMessages(messages as any)

        expect(result).toEqual([])
    })

    it("preserves non-diagram tool messages", () => {
        const messages = [
            {
                role: "assistant",
                content: [
                    {
                        type: "tool-call",
                        toolName: "get_shape_library",
                        input: { library: "aws4" },
                    },
                ],
            },
            {
                role: "tool",
                content: [
                    {
                        type: "tool-result",
                        toolName: "get_shape_library",
                        output: "shapes",
                    },
                ],
            },
        ]

        const result = filterHistoricalDiagramToolMessages(messages as any)

        expect(result).toEqual(messages)
    })

    it("filters diagram tool blocks when messages use parts instead of content", () => {
        const messages = [
            {
                role: "assistant",
                parts: [
                    { type: "text", text: "I will update the diagram" },
                    {
                        type: "tool-call",
                        toolName: "append_diagram",
                        input: {
                            xml: "<mxCell id=\"2\" />",
                            pageName: "Page B",
                        },
                    },
                    {
                        type: "tool_use",
                        name: "edit_diagram",
                        input: { operations: [{ op: "noop" }] },
                    },
                    { type: "text", text: "done" },
                ],
            },
            {
                role: "tool",
                parts: [
                    {
                        type: "tool-result",
                        toolName: "append_diagram",
                        output: "ok",
                    },
                ],
            },
            {
                role: "tool",
                parts: [
                    {
                        type: "tool-result",
                        toolName: "edit_diagram",
                        output: "ok",
                    },
                ],
            },
        ]

        const result = filterHistoricalDiagramToolMessages(messages as any)

        // tool-only messages should be removed once their tool-result parts are filtered out
        expect(result).toHaveLength(1)
        expect(result[0].role).toBe("assistant")
        expect(result[0].parts).toEqual([
            { type: "text", text: "I will update the diagram" },
            { type: "text", text: "done" },
        ])
        expect(JSON.stringify(result)).not.toContain("append_diagram")
        expect(JSON.stringify(result)).not.toContain("edit_diagram")
    })

    it("removes only diagram tool blocks in mixed parts messages", () => {
        const messages = [
            {
                role: "assistant",
                parts: [
                    { type: "reasoning", text: "thinking" },
                    {
                        type: "tool-call",
                        toolName: "display_diagram",
                        input: { xml: "<mxCell id=\"2\" />", pageName: "P" },
                    },
                    {
                        type: "tool-call",
                        toolName: "get_shape_library",
                        input: { library: "aws4" },
                    },
                    { type: "text", text: "continuing" },
                ],
            },
            {
                role: "tool",
                parts: [
                    {
                        type: "tool-result",
                        toolName: "display_diagram",
                        output: "ok",
                    },
                    {
                        type: "tool-result",
                        toolName: "get_shape_library",
                        output: "shapes",
                    },
                ],
            },
        ]

        const result = filterHistoricalDiagramToolMessages(messages as any)

        expect(result).toHaveLength(2)
        expect(result[0].role).toBe("assistant")
        expect(result[0].parts).toEqual([
            { type: "reasoning", text: "thinking" },
            {
                type: "tool-call",
                toolName: "get_shape_library",
                input: { library: "aws4" },
            },
            { type: "text", text: "continuing" },
        ])
        expect(result[1].role).toBe("tool")
        expect(result[1].parts).toEqual([
            {
                type: "tool-result",
                toolName: "get_shape_library",
                output: "shapes",
            },
        ])
    })

    it("filters dynamic tool-* parts for diagram tools", () => {
        const messages = [
            {
                role: "assistant",
                parts: [
                    { type: "text", text: "rendering" },
                    {
                        type: "tool-display_diagram",
                        toolCallId: "call_1",
                        state: "output-available",
                        input: { xml: "<mxCell id=\"2\" />" },
                        output: "ok",
                    },
                    {
                        type: "tool-get_shape_library",
                        toolCallId: "call_2",
                        state: "output-available",
                        input: { library: "aws4" },
                        output: "shapes",
                    },
                ],
            },
        ]

        const result = filterHistoricalDiagramToolMessages(messages as any)

        expect(result).toHaveLength(1)
        expect(result[0].parts).toEqual([
            { type: "text", text: "rendering" },
            {
                type: "tool-get_shape_library",
                toolCallId: "call_2",
                state: "output-available",
                input: { library: "aws4" },
                output: "shapes",
            },
        ])
    })

    it("removes tool messages that become empty after filtering dynamic tool-* parts", () => {
        const messages = [
            {
                role: "tool",
                parts: [
                    {
                        type: "tool-display_diagram",
                        toolCallId: "call_1",
                        state: "output-available",
                        input: { xml: "<mxCell id=\"2\" />" },
                        output: "ok",
                    },
                ],
            },
        ]

        const result = filterHistoricalDiagramToolMessages(messages as any)

        expect(result).toEqual([])
    })
})

