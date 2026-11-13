// @vitest-environment node
import { simulateReadableStream, streamText } from "ai"
import { MockLanguageModelV3 } from "ai/test"
import { describe, expect, it } from "vitest"
import { chatTools } from "@/lib/chat-tools"

/** The chunks of the chat's reply when the model calls edit_diagram */
async function streamEdit(input: object) {
    const model = new MockLanguageModelV3({
        doStream: (async () => ({
            stream: simulateReadableStream({
                chunks: [
                    {
                        type: "tool-call",
                        toolCallId: "c1",
                        toolName: "edit_diagram",
                        input: JSON.stringify(input),
                    },
                    {
                        type: "finish",
                        finishReason: { unified: "tool-calls", raw: "tool" },
                        usage: {
                            inputTokens: { total: 1 },
                            outputTokens: { total: 1 },
                        },
                    },
                ],
            }),
        })) as any,
    })
    const result = streamText({
        model: model as any,
        prompt: "edit",
        tools: chatTools,
    })
    const chunks: any[] = []
    for await (const chunk of result.toUIMessageStream({
        onError: (error) => (error as Error).message,
    })) {
        chunks.push(chunk)
    }
    return chunks
}

describe("the edit_diagram tool's input check", () => {
    it("passes a call whose last add has no cell_id on to the browser", async () => {
        // As Luna sent it on the demo site: the whole call came back as
        // "Invalid input for tool edit_diagram"
        const input = {
            operations: [
                {
                    operation: "add",
                    cell_id: "27",
                    new_xml: '<mxCell id="27" source="2" target="3"/>',
                },
                {
                    operation: "add",
                    new_xml: '<mxCell id="56" source="25" target="26"/>',
                },
            ],
        }
        const chunks = await streamEdit(input)
        expect(chunks.filter((c) => "errorText" in c)).toEqual([])
        expect(
            chunks.find((c) => c.type === "tool-input-available")?.input,
        ).toEqual(input)
    })

    it("still rejects an operation that is not add, update or delete", async () => {
        const chunks = await streamEdit({
            operations: [{ operation: "move", cell_id: "2" }],
        })
        expect(chunks.find((c) => "errorText" in c)?.errorText).toMatch(
            /^Invalid input for tool edit_diagram/,
        )
    })
})
