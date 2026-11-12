// @vitest-environment node

import { convertToModelMessages } from "ai"
import { jsonrepair } from "jsonrepair"
import { describe, expect, it } from "vitest"
import {
    diagramContextText,
    dropInvalidToolCalls,
    fixToolInputJson,
    parseStringifiedArrays,
    quotaTokens,
    validateFileParts,
    withoutOldAttachments,
    withoutOldImagesAndThinking,
} from "@/lib/chat-helpers"

describe("quotaTokens", () => {
    // What the SDK reported for the three turns of a real chat with GPT-6
    // Luna on Bedrock (2026-11-12): from the second turn on, nearly all the
    // input is read from the prompt cache
    const usage = (
        noCache: number,
        cacheRead: number,
        cacheWrite: number,
        output: number,
    ) => ({
        inputTokens: noCache + cacheRead + cacheWrite,
        inputTokenDetails: {
            noCacheTokens: noCache,
            cacheReadTokens: cacheRead,
            cacheWriteTokens: cacheWrite,
        },
        outputTokens: output,
        outputTokenDetails: { textTokens: output, reasoningTokens: undefined },
        totalTokens: noCache + cacheRead + cacheWrite + output,
    })

    it("counts input read from the cache at a tenth, the rest in full", () => {
        // Nothing cached yet: 2 + 6,094 written to the cache + 1,169 output
        expect(quotaTokens(usage(2, 0, 6094, 1169))).toBe(7265)
        // 7,290 in all, 6,094 of them cache reads: 1,196 + 609
        expect(quotaTokens(usage(2, 6094, 982, 212))).toBe(1805)
        // 7,673 in all, 7,076 of them cache reads: 597 + 708
        expect(quotaTokens(usage(2, 7076, 266, 329))).toBe(1305)
    })

    it("counts a provider that reports no cache details in full", () => {
        expect(
            quotaTokens({
                ...usage(1200, 0, 0, 30),
                inputTokenDetails: {
                    noCacheTokens: undefined,
                    cacheReadTokens: undefined,
                    cacheWriteTokens: undefined,
                },
            }),
        ).toBe(1230)
    })
})

describe("validateFileParts", () => {
    it("returns valid for no files", () => {
        const messages = [
            { role: "user", parts: [{ type: "text", text: "hello" }] },
        ]
        expect(validateFileParts(messages)).toEqual({ valid: true })
    })

    // How a file of each kind begins, a character for each byte
    const PNG = "\x89PNG\r\n\x1a\n"
    const JPEG = "\xff\xd8\xff\xe0\x00\x10JFIF"
    const HEIC = "\x00\x00\x00\x18ftypheic"
    const OFFICE = "\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
    const sentAs = (type: string, content: string) => [
        {
            role: "user",
            parts: [
                {
                    type: "file",
                    mediaType: type,
                    url: `data:${type};base64,${btoa(content + "x".repeat(100))}`,
                },
            ],
        },
    ]

    it("refuses a picture that is not in the format it was sent as", () => {
        // What gets here in a request that skipped the browser's check: a
        // HEIC photo or an Office file named .jpg (Bedrock: "image format
        // could not be determined"), a PNG named .jpg (Claude refuses it)
        for (const content of [HEIC, OFFICE, PNG]) {
            const result = validateFileParts(sentAs("image/jpeg", content))
            expect(result.valid).toBe(false)
            expect(result.error).toContain("image/jpeg")
        }
    })

    it("accepts the pictures the providers read under their own type", () => {
        for (const [type, content] of [
            ["image/png", PNG],
            ["image/jpeg", JPEG],
            ["image/gif", "GIF89a"],
            ["image/webp", "RIFF\x24\x00\x00\x00WEBPVP8 "],
            // Formats the check does not know are left to the provider
            ["image/heic", HEIC],
            ["application/pdf", "%PDF-1.7"],
        ]) {
            expect(validateFileParts(sentAs(type, content))).toEqual({
                valid: true,
            })
        }
    })

    it("returns valid for files under limit", () => {
        const smallBase64 = btoa(PNG + "x".repeat(100))
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

describe("withoutOldImagesAndThinking", () => {
    const image = (name: string) => ({
        type: "file",
        mediaType: "image/png",
        url: `data:image/png;base64,${name}`,
    })
    const user = (text: string, ...files: any[]) => ({
        role: "user",
        parts: [{ type: "text", text }, ...files],
    })
    const answer = { role: "assistant", parts: [{ type: "text", text: "ok" }] }

    it("sends the images of the newest user message only", () => {
        const pdf = { type: "file", mediaType: "application/pdf", url: "x" }
        const sent = withoutOldImagesAndThinking([
            user("first", image("OLD1"), image("OLD2"), pdf),
            answer,
            user("second", image("NEW")),
            answer,
        ])
        expect(JSON.stringify(sent)).not.toContain("OLD")
        // A note takes each image's place, so the model can say what it lacks
        const note = {
            type: "text",
            text: expect.stringMatching(
                /^\n\n\[Image\]\n\[This attachment is no longer in context/,
            ),
        }
        expect(sent[0].parts).toEqual([
            { type: "text", text: "first" },
            note,
            note,
            pdf,
        ])
        expect(sent[2].parts).toEqual(user("second", image("NEW")).parts)
        expect(sent[1]).toBe(answer)
    })

    it("leaves a chat without older images as it is", () => {
        const messages = [user("first"), answer, user("second", image("NEW"))]
        const sent = withoutOldImagesAndThinking(messages)
        sent.forEach((msg, i) => {
            expect(msg).toBe(messages[i])
        })
    })

    it("sends the thinking of the turn running now only", () => {
        // Encrypted thinking as GPT-6 Luna returns it through Bedrock
        const thinking = (data: string) => ({
            type: "reasoning",
            text: "",
            providerMetadata: { bedrock: { redactedContent: data } },
        })
        const thought = (data: string) => ({
            role: "assistant",
            parts: [{ type: "step-start" }, thinking(data), ...answer.parts],
        })
        const stopped = { role: "assistant", parts: [thinking("OLD2")] }
        const messages = [
            user("first"),
            thought("OLD1"),
            user("second"),
            stopped,
            user("third"),
            thought("NOW"),
        ]
        const sent = withoutOldImagesAndThinking(messages)
        expect(sent[1].parts).toEqual([{ type: "step-start" }, ...answer.parts])
        // The server refuses a message without parts
        expect(sent[3]).toBe(stopped)
        expect(sent[5]).toBe(messages[5])
    })
})

describe("withoutOldAttachments", () => {
    it("leaves out the thinking of earlier turns, whatever the provider", () => {
        const thinking = (providerOptions: object) => ({
            type: "reasoning",
            text: "",
            providerOptions,
        })
        const text = { type: "text", text: "Done" }
        const user = { role: "user", content: [{ type: "text", text: "Go" }] }
        const now = {
            role: "assistant",
            content: [thinking({ bedrock: { redactedContent: "NOW" } }), text],
        }
        const sent = withoutOldAttachments([
            user,
            {
                role: "assistant",
                content: [
                    thinking({ bedrock: { redactedContent: "OLD1" } }),
                    thinking({ openai: { itemId: "rs_1" } }),
                    text,
                ],
            },
            user,
            // An answer stopped while it was thinking goes as a whole
            { role: "assistant", content: [thinking({ deepseek: {} })] },
            user,
            now,
        ])
        expect(sent).toEqual([
            user,
            { role: "assistant", content: [text] },
            user,
            user,
            now,
        ])
    })

    it("keeps earlier documents within 30,000 characters, the newest first", () => {
        const withDoc = (name: string, size: number) => ({
            role: "user",
            content: [
                {
                    type: "text",
                    text: `Draw it\n\n[PDF: ${name}]\n${name[0].repeat(size)}`,
                },
            ],
        })
        const textOf = (msg: any) => msg.content[0].text
        const messages = [
            withDoc("old.pdf", 8000),
            withDoc("middle.pdf", 15000),
            withDoc("recent.pdf", 20000),
            // The newest message's own document does not count
            withDoc("now.pdf", 40000),
        ]
        const sent = withoutOldAttachments(messages)
        // 20,000 fit, 15,000 more do not, 8,000 more do
        expect(sent[2]).toEqual(messages[2])
        expect(textOf(sent[1])).toBe(
            "Draw it\n\n[PDF: middle.pdf]\n[This attachment is no longer in context. To use it, the user must attach it again.]",
        )
        expect(sent[0]).toEqual(messages[0])
        expect(sent[3]).toBe(messages[3])
    })

    it("leaves a note where an earlier image was", () => {
        const image = { type: "image", image: "data", mediaType: "image/png" }
        const typed = { type: "text", text: "Draw this" }
        const next = { role: "user", content: [typed, image] }
        const sent = withoutOldAttachments([
            { role: "user", content: [typed, image] },
            next,
        ])
        expect(sent[0].content).toEqual([
            typed,
            {
                type: "text",
                text: "\n\n[Image]\n[This attachment is no longer in context. To use it, the user must attach it again.]",
            },
        ])
        expect(sent[1]).toBe(next)
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

    it("fixes := used instead of : after a JSON key", () => {
        const input = '{"xml":= "<mxCell id=\\"2\\"/>"}'
        const parsed = JSON.parse(jsonrepair(fixToolInputJson(input)))
        expect(parsed.xml).toBe('<mxCell id="2"/>')
    })

    it("keeps := in the labels of a diagram that was cut off", () => {
        // Cut off by the output limit, so it goes through the repair
        const input =
            '{"xml": "<mxCell id=\\"2\\" value=\\"i := 0\\"/><mxCell id=\\"3\\" value=\\"sum := sum + i\\" x=\\"40\\" y='
        const parsed = JSON.parse(jsonrepair(fixToolInputJson(input)))
        expect(parsed.xml).toContain('value="i := 0"')
        expect(parsed.xml).toContain('value="sum := sum + i"')
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

    it("says that a shape missing from the canvas was removed by the user", () => {
        // After a hand deletion the connectors of the shape stay, open at
        // one end: without this sentence the models draw the shape again
        const note = diagramContextText({
            xml: '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Kept" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel>',
            pageId: null,
        })
        expect(note.split("\n")[0]).toMatch(
            /missing from it was removed by the user: do not add it back unless the user asks\.\]$/,
        )
    })
})
