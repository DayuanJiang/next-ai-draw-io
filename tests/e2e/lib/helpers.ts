/**
 * Shared test helpers for E2E tests
 */

/**
 * Creates a mock SSE response for the chat API
 * Format matches AI SDK UI message stream protocol
 */
export function createMockSSEResponse(
    xml: string,
    text: string,
    toolName = "display_diagram",
) {
    const messageId = `msg_${Date.now()}`
    const toolCallId = `call_${Date.now()}`
    const textId = `text_${Date.now()}`

    const events = [
        { type: "start", messageId },
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

    return (
        events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
        "data: [DONE]\n\n"
    )
}

/**
 * Creates a text-only SSE response (no tool call)
 */
export function createTextOnlyResponse(text: string) {
    const messageId = `msg_${Date.now()}`
    const textId = `text_${Date.now()}`

    const events = [
        { type: "start", messageId },
        { type: "text-start", id: textId },
        { type: "text-delta", id: textId, delta: text },
        { type: "text-end", id: textId },
        { type: "finish" },
    ]

    return (
        events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
        "data: [DONE]\n\n"
    )
}

/**
 * Creates a mock SSE response with a tool error
 */
export function createToolErrorResponse(text: string, errorMessage: string) {
    const messageId = `msg_${Date.now()}`
    const toolCallId = `call_${Date.now()}`
    const textId = `text_${Date.now()}`

    const events = [
        { type: "start", messageId },
        { type: "text-start", id: textId },
        { type: "text-delta", id: textId, delta: text },
        { type: "text-end", id: textId },
        { type: "tool-input-start", toolCallId, toolName: "display_diagram" },
        {
            type: "tool-input-available",
            toolCallId,
            toolName: "display_diagram",
            input: { xml: "<invalid>" },
        },
        { type: "tool-output-error", toolCallId, error: errorMessage },
        { type: "finish" },
    ]

    return (
        events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
        "data: [DONE]\n\n"
    )
}
