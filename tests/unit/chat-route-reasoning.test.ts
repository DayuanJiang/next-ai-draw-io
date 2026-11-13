// @vitest-environment node
import { readUIMessageStream, type UIMessageChunk } from "ai"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ChatUIMessage } from "@/lib/chat-message"

// No DNS in tests: only loopback addresses are private
vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async (url: string) =>
        /^https?:\/\/(127\.0\.0\.1|localhost)\b/.test(url),
}))

import { POST as chat } from "@/app/api/chat/route"

afterEach(() => {
    vi.unstubAllGlobals()
})

const XML = '<mxCell id="2" value="Start" x="80" y="80" w="140" h="60"/>'

// What a gateway in Anthropic's format sent a demo user: thinking deltas
// for block 0, which no content_block_start opened, then a text block and
// a tool call
const GATEWAY_EVENTS = [
    {
        type: "message_start",
        message: {
            id: "msg_1",
            type: "message",
            role: "assistant",
            model: "gpt-6.1-sol",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 900, output_tokens: 1 },
        },
    },
    {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "Three boxes. " },
    },
    {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "In a row." },
    },
    { type: "content_block_stop", index: 0 },
    {
        type: "content_block_start",
        index: 1,
        content_block: { type: "text", text: "" },
    },
    {
        type: "content_block_delta",
        index: 1,
        delta: { type: "text_delta", text: "Here is the flowchart." },
    },
    { type: "content_block_stop", index: 1 },
    {
        type: "content_block_start",
        index: 2,
        content_block: {
            type: "tool_use",
            id: "toolu_1",
            name: "display_diagram",
            input: {},
        },
    },
    {
        type: "content_block_delta",
        index: 2,
        delta: {
            type: "input_json_delta",
            partial_json: JSON.stringify({ xml: XML }),
        },
    },
    { type: "content_block_stop", index: 2 },
    {
        type: "message_delta",
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 150 },
    },
    { type: "message_stop" },
]

describe("thinking deltas without a thinking block", () => {
    it("reach the browser as a reasoning part it can read", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(
                        GATEWAY_EVENTS.map(
                            (event) =>
                                `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
                        ).join(""),
                        { headers: { "content-type": "text/event-stream" } },
                    ),
            ),
        )
        const res = await chat(
            new Request("http://localhost/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-ai-provider": "anthropic",
                    "x-ai-base-url": "http://127.0.0.1:9000/v1",
                    "x-ai-api-key": "user-key",
                    "x-ai-model": "gpt-6.1-sol",
                },
                body: JSON.stringify({
                    messages: [
                        {
                            id: "u1",
                            role: "user",
                            parts: [{ type: "text", text: "Draw three boxes" }],
                        },
                    ],
                    xml: "",
                }),
            }),
        )
        const chunks: UIMessageChunk[] = (await res.text())
            .split("\n")
            .filter((line) => line.startsWith("data: {"))
            .map((line) => JSON.parse(line.slice(6)))
        expect(chunks.map((chunk) => chunk.type)).toEqual([
            "start",
            "start-step",
            "reasoning-start",
            "reasoning-delta",
            "reasoning-delta",
            "text-start",
            "text-delta",
            "text-end",
            "tool-input-start",
            "tool-input-delta",
            "tool-input-available",
            "reasoning-end",
            "finish-step",
            "finish",
        ])

        // The reader the browser uses: it stopped at the first delta
        // ("Received reasoning-delta for missing reasoning part")
        let message: ChatUIMessage | undefined
        for await (message of readUIMessageStream<ChatUIMessage>({
            stream: new ReadableStream({
                start(controller) {
                    for (const chunk of chunks) controller.enqueue(chunk)
                    controller.close()
                },
            }),
            terminateOnError: true,
        })) {
            // The last state is the whole answer
        }
        expect(message?.parts).toMatchObject([
            { type: "step-start" },
            { type: "reasoning", text: "Three boxes. In a row." },
            { type: "text", text: "Here is the flowchart." },
            {
                type: "tool-display_diagram",
                state: "input-available",
                input: { xml: XML },
            },
        ])
    })
})
