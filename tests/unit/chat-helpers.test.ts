// @vitest-environment node

import { convertToModelMessages } from "ai"
import { jsonrepair } from "jsonrepair"
import { describe, expect, it } from "vitest"
import {
    diagramContextText,
    dropInvalidToolCalls,
    fixToolInputJson,
    parseStringifiedArrays,
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

    it("rejects file URLs the server would have to download", () => {
        for (const url of [
            "http://10.0.0.5/secret.png",
            "https://example.com/a.png",
        ]) {
            const messages = [{ role: "user", parts: [{ type: "file", url }] }]
            expect(validateFileParts(messages).valid).toBe(false)
        }
    })

    it("checks files in earlier messages too", () => {
        const messages = [
            {
                role: "user",
                parts: [{ type: "file", url: "http://169.254.169.254/x" }],
            },
            { role: "assistant", parts: [{ type: "text", text: "ok" }] },
            { role: "user", parts: [{ type: "text", text: "hello" }] },
        ]
        expect(validateFileParts(messages).valid).toBe(false)
    })
})

describe("dropInvalidToolCalls", () => {
    it("drops an invalid tool-call together with its tool-result", () => {
        const messages = [
            { role: "user", content: [{ type: "text", text: "draw" }] },
            {
                role: "assistant",
                content: [
                    {
                        type: "tool-call",
                        toolCallId: "call-1",
                        toolName: "display_diagram",
                        input: undefined,
                    },
                ],
            },
            {
                role: "tool",
                content: [
                    {
                        type: "tool-result",
                        toolCallId: "call-1",
                        toolName: "display_diagram",
                        output: { type: "error-text", value: "Stopped" },
                    },
                ],
            },
            { role: "user", content: [{ type: "text", text: "again" }] },
        ]
        const result = dropInvalidToolCalls(messages)
        expect(result.map((m) => m.role)).toEqual(["user", "user"])
    })

    it("keeps valid calls and results in the same messages", () => {
        const messages = [
            {
                role: "assistant",
                content: [
                    { type: "text", text: "Here you go" },
                    {
                        type: "tool-call",
                        toolCallId: "bad",
                        toolName: "edit_diagram",
                        input: "{broken",
                    },
                    {
                        type: "tool-call",
                        toolCallId: "good",
                        toolName: "display_diagram",
                        input: { xml: "<mxCell/>" },
                    },
                ],
            },
            {
                role: "tool",
                content: [
                    { type: "tool-result", toolCallId: "bad", output: {} },
                    { type: "tool-result", toolCallId: "good", output: {} },
                ],
            },
        ]
        const result = dropInvalidToolCalls(messages)
        expect(result[0].content.map((p: any) => p.toolCallId)).toEqual([
            undefined,
            "good",
        ])
        expect(result[1].content.map((p: any) => p.toolCallId)).toEqual([
            "good",
        ])
    })

    it("cleans up a tool call the user stopped before its input arrived", async () => {
        // handleStop turns a still-streaming call into output-error with no input
        const modelMessages = await convertToModelMessages([
            { role: "user", parts: [{ type: "text", text: "draw" }] },
            {
                role: "assistant",
                parts: [
                    {
                        type: "tool-display_diagram",
                        toolCallId: "call-1",
                        state: "output-error",
                        input: undefined,
                        errorText: "Stopped by user",
                    } as any,
                ],
            },
            { role: "user", parts: [{ type: "text", text: "again" }] },
        ])
        const result = dropInvalidToolCalls(modelMessages)
        expect(result.map((m) => m.role)).toEqual(["user", "user"])
    })

    it("leaves messages with string content alone", () => {
        const messages = [{ role: "system", content: "You are..." }]
        expect(dropInvalidToolCalls(messages)).toEqual(messages)
    })
})

describe("fixToolInputJson", () => {
    it("fixes an attribute whose closing quote alone is escaped", () => {
        const input =
            '{"xml": "<mxCell id=\\"2\\" vertex=\\"1\\"><mxGeometry x=\\"10\\" y="-20\\" as=\\"geometry\\"/></mxCell>"}'
        const parsed = JSON.parse(jsonrepair(fixToolInputJson(input)))
        expect(parsed.xml).toContain('y="-20"')
        expect(parsed.xml).toContain('id="2"')
    })

    it("fixes = used instead of : after a JSON key", () => {
        const input = '{"xml"= "<mxCell id=\\"2\\"/>"}'
        const parsed = JSON.parse(jsonrepair(fixToolInputJson(input)))
        expect(parsed.xml).toBe('<mxCell id="2"/>')
    })

    it("leaves well-formed input unchanged", () => {
        const input =
            '{"operations": [{"operation": "add", "cell_id": "a", "new_xml": "<mxCell id=\\"a\\" value=\\"x=1\\"/>"}]}'
        expect(fixToolInputJson(input)).toBe(input)
    })
})

describe("parseStringifiedArrays", () => {
    it("turns an array written as a JSON string into the array", () => {
        const ops = [{ operation: "delete", cell_id: "2" }]
        const input = JSON.stringify({ operations: JSON.stringify(ops) })
        expect(JSON.parse(parseStringifiedArrays(input))).toEqual({
            operations: ops,
        })
    })

    it("leaves other inputs as they are", () => {
        for (const input of [
            '{"operations":[{"operation":"delete","cell_id":"2"}]}',
            '{"xml":"<mxCell id=\\"2\\"/>"}',
            '{"label":"[draft] notes"}',
            "not json",
        ]) {
            expect(parseStringifiedArrays(input)).toBe(input)
        }
    })
})

describe("diagramContextText", () => {
    const empty = (attrs: string) =>
        `<mxGraphModel${attrs}><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>`

    it("calls a page without shapes empty, unless it has a background", () => {
        expect(diagramContextText({ xml: empty(""), pageId: null })).toBe(
            "[Canvas: empty when this message was sent.]",
        )
        expect(
            diagramContextText({
                xml: empty(' background="none"'),
                pageId: null,
            }),
        ).toBe("[Canvas: empty when this message was sent.]")
        expect(
            diagramContextText({
                xml: empty(' background="#000000"'),
                pageId: null,
            }),
        ).toContain('background="#000000"')
    })
})
