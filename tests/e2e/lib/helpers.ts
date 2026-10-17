/**
 * Shared test helpers for E2E tests
 */

/** Serializes events as an SSE body; with done, the [DONE] line ends it */
export function sse(events: object[], done = true) {
    return (
        events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
        (done ? "data: [DONE]\n\n" : "")
    )
}

/**
 * A streamed tool call split into its start, its input deltas (the input
 * JSON cut into chunks, like a real model sends it) and its finished input
 */
export function toolCallEvents(
    id: string,
    toolName: string,
    input: unknown,
    chunk = 40,
) {
    const pattern = new RegExp(`[\\s\\S]{1,${chunk}}`, "g")
    const deltas = (JSON.stringify(input).match(pattern) ?? []).map((d) => ({
        type: "tool-input-delta",
        toolCallId: id,
        inputTextDelta: d,
    }))
    return {
        start: { type: "tool-input-start", toolCallId: id, toolName },
        deltas,
        done: { type: "tool-input-available", toolCallId: id, toolName, input },
    }
}

// The app skips a tool call whose id it has seen: every response gets new ids
let nextId = 0

/**
 * Creates a mock SSE response for the chat API
 * Format matches AI SDK UI message stream protocol
 */
export function createMockSSEResponse(
    xml: string,
    text: string,
    toolName = "display_diagram",
) {
    const n = ++nextId
    const toolCallId = `call_${n}`
    const textId = `text_${n}`

    const events = [
        { type: "start", messageId: `msg_${n}` },
        { type: "text-start", id: textId },
        { type: "text-delta", id: textId, delta: text },
        { type: "text-end", id: textId },
        { type: "tool-input-start", toolCallId, toolName },
        { type: "tool-input-available", toolCallId, toolName, input: { xml } },
        {
            type: "tool-output-available",
            toolCallId,
            output: "Successfully displayed the diagram",
        },
        { type: "finish" },
    ]

    return sse(events)
}

/**
 * Creates a text-only SSE response (no tool call)
 */
export function createTextOnlyResponse(text: string) {
    const n = ++nextId
    const textId = `text_${n}`

    const events = [
        { type: "start", messageId: `msg_${n}` },
        { type: "text-start", id: textId },
        { type: "text-delta", id: textId, delta: text },
        { type: "text-end", id: textId },
        { type: "finish" },
    ]

    return sse(events)
}
