/**
 * EdgeOne Pages Edge Function for OpenAI-compatible Chat Completions API
 *
 * This endpoint provides an OpenAI-compatible API that can be used with
 * AI SDK's createOpenAI({ baseURL: '/api/edgeai' })
 *
 * EdgeOne Edge AI returns AI SDK UI Message Stream format (0:"text", e:{...})
 * but AI SDK's createOpenAI expects OpenAI SSE format (data: {"choices":[...]})
 *
 * This function converts AI SDK format to OpenAI format.
 *
 * EdgeOne does NOT support native tool calling, so we use prompt engineering:
 * - Inject tool instructions into system prompt
 * - Parse <tool_call>JSON</tool_call> from model output
 * - Convert to OpenAI tool_calls format
 *
 * Documentation: https://pages.edgeone.ai/document/edge-ai
 */

// EdgeOne Pages global AI object
declare const AI: {
    chatCompletions(options: {
        model: string
        messages: Array<{ role: string; content: string | object }>
        stream?: boolean
        max_tokens?: number
        temperature?: number
    }): Promise<ReadableStream<Uint8Array>>
}

interface EdgeFunctionContext {
    request: Request
    env: Record<string, string>
    next: () => Promise<Response>
}

interface Tool {
    type: "function"
    function: {
        name: string
        description?: string
        parameters?: object
    }
}

// Handle CORS preflight requests
export async function onRequestOptions(): Promise<Response> {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Max-Age": "86400",
        },
    })
}

/**
 * Generate tool calling instruction to inject into system prompt
 */
function generateToolCallInstruction(tools: Tool[]): string {
    const toolDescriptions = tools
        .map((tool) => {
            const fn = tool.function
            const paramsStr = fn.parameters
                ? `\nParameters (JSON Schema): ${JSON.stringify(fn.parameters, null, 2)}`
                : ""
            return `- ${fn.name}: ${fn.description || "No description"}${paramsStr}`
        })
        .join("\n\n")

    return `
<tool_calling_instructions>
You have access to the following tools. When you need to use a tool, output ONLY the tool call in this exact format - no other text before or after:

<tool_call>{"name": "tool_name", "arguments": {...}}</tool_call>

Available tools:
${toolDescriptions}

CRITICAL RULES:
1. Output ONLY the <tool_call> tag when calling a tool - NO explanation, NO text before/after
2. The JSON inside must be valid - use double quotes for strings, escape special characters
3. Do NOT wrap in markdown code blocks
4. Do NOT add any text like "I'll help you" or "Let me" before the tool call
5. If you need to call a tool, IMMEDIATELY output the <tool_call> tag

Example correct output:
<tool_call>{"name": "display_diagram", "arguments": {"xml": "<mxCell id=\\"2\\" value=\\"Hello\\" .../>"}}</tool_call>
</tool_calling_instructions>
`
}

/**
 * Parse AI SDK UI Message Stream format and convert to OpenAI SSE format
 *
 * AI SDK format: 0:"text"\n, 9:{...}\n, a:{...}\n, c:{...}\n, e:{...}\n
 * OpenAI format: data: {"choices":[{"delta":{"content":"text"}}]}\n\n
 */
function createAISDKToOpenAITransformer(
    hasTools: boolean,
): TransformStream<Uint8Array, Uint8Array> {
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let buffer = ""
    let fullContent = ""
    let toolCallDetected = false
    let toolCallBuffer = ""
    const toolCallId = `call_${Date.now()}`

    return new TransformStream({
        transform(chunk, controller) {
            buffer += decoder.decode(chunk, { stream: true })

            // Process complete lines
            const lines = buffer.split("\n")
            buffer = lines.pop() || "" // Keep incomplete line in buffer

            for (const line of lines) {
                if (!line.trim()) continue

                // Parse AI SDK format: TYPE_CODE:JSON_OR_STRING
                const colonIndex = line.indexOf(":")
                if (colonIndex === -1) continue

                const typeCode = line.substring(0, colonIndex)
                const data = line.substring(colonIndex + 1)

                switch (typeCode) {
                    case "0": {
                        // Text delta - data is a JSON string like "text"
                        try {
                            const text = JSON.parse(data) as string
                            fullContent += text

                            if (hasTools) {
                                // Check for tool call pattern
                                if (
                                    !toolCallDetected &&
                                    fullContent.includes("<tool_call>")
                                ) {
                                    toolCallDetected = true
                                    const toolCallStart =
                                        fullContent.indexOf("<tool_call>")
                                    toolCallBuffer = fullContent.substring(
                                        toolCallStart + 11,
                                    ) // After <tool_call>
                                } else if (toolCallDetected) {
                                    toolCallBuffer += text
                                } else {
                                    // Buffer text until we know if there's a tool call
                                    // Don't emit yet - wait to see if tool_call comes
                                }
                            } else {
                                // No tools - emit text directly
                                const openAIChunk = {
                                    id: `chatcmpl-${Date.now()}`,
                                    object: "chat.completion.chunk",
                                    created: Math.floor(Date.now() / 1000),
                                    model: "edgeone",
                                    choices: [
                                        {
                                            index: 0,
                                            delta: { content: text },
                                            finish_reason: null,
                                        },
                                    ],
                                }
                                controller.enqueue(
                                    encoder.encode(
                                        `data: ${JSON.stringify(openAIChunk)}\n\n`,
                                    ),
                                )
                            }
                        } catch {
                            // Ignore parse errors
                        }
                        break
                    }

                    case "e": {
                        // Finish event
                        try {
                            const finishData = JSON.parse(data)

                            if (hasTools && toolCallDetected) {
                                // Extract tool call JSON
                                const endTag =
                                    toolCallBuffer.indexOf("</tool_call>")
                                const toolCallJson =
                                    endTag !== -1
                                        ? toolCallBuffer.substring(0, endTag)
                                        : toolCallBuffer

                                try {
                                    const toolCall = JSON.parse(toolCallJson)

                                    // Emit tool call in OpenAI format
                                    const toolCallChunk = {
                                        id: `chatcmpl-${Date.now()}`,
                                        object: "chat.completion.chunk",
                                        created: Math.floor(Date.now() / 1000),
                                        model: "edgeone",
                                        choices: [
                                            {
                                                index: 0,
                                                delta: {
                                                    tool_calls: [
                                                        {
                                                            index: 0,
                                                            id: toolCallId,
                                                            type: "function",
                                                            function: {
                                                                name: toolCall.name,
                                                                arguments:
                                                                    JSON.stringify(
                                                                        toolCall.arguments,
                                                                    ),
                                                            },
                                                        },
                                                    ],
                                                },
                                                finish_reason: null,
                                            },
                                        ],
                                    }
                                    controller.enqueue(
                                        encoder.encode(
                                            `data: ${JSON.stringify(toolCallChunk)}\n\n`,
                                        ),
                                    )

                                    // Emit finish with tool_calls reason
                                    const finishChunk = {
                                        id: `chatcmpl-${Date.now()}`,
                                        object: "chat.completion.chunk",
                                        created: Math.floor(Date.now() / 1000),
                                        model: "edgeone",
                                        choices: [
                                            {
                                                index: 0,
                                                delta: {},
                                                finish_reason: "tool_calls",
                                            },
                                        ],
                                        usage: finishData.usage,
                                    }
                                    controller.enqueue(
                                        encoder.encode(
                                            `data: ${JSON.stringify(finishChunk)}\n\n`,
                                        ),
                                    )
                                } catch {
                                    // Failed to parse tool call - emit as text
                                    if (fullContent) {
                                        const textChunk = {
                                            id: `chatcmpl-${Date.now()}`,
                                            object: "chat.completion.chunk",
                                            created: Math.floor(
                                                Date.now() / 1000,
                                            ),
                                            model: "edgeone",
                                            choices: [
                                                {
                                                    index: 0,
                                                    delta: {
                                                        content: fullContent,
                                                    },
                                                    finish_reason: null,
                                                },
                                            ],
                                        }
                                        controller.enqueue(
                                            encoder.encode(
                                                `data: ${JSON.stringify(textChunk)}\n\n`,
                                            ),
                                        )
                                    }

                                    const finishChunk = {
                                        id: `chatcmpl-${Date.now()}`,
                                        object: "chat.completion.chunk",
                                        created: Math.floor(Date.now() / 1000),
                                        model: "edgeone",
                                        choices: [
                                            {
                                                index: 0,
                                                delta: {},
                                                finish_reason: "stop",
                                            },
                                        ],
                                        usage: finishData.usage,
                                    }
                                    controller.enqueue(
                                        encoder.encode(
                                            `data: ${JSON.stringify(finishChunk)}\n\n`,
                                        ),
                                    )
                                }
                            } else if (hasTools && !toolCallDetected) {
                                // Has tools but no tool call detected - emit buffered content
                                if (fullContent) {
                                    const textChunk = {
                                        id: `chatcmpl-${Date.now()}`,
                                        object: "chat.completion.chunk",
                                        created: Math.floor(Date.now() / 1000),
                                        model: "edgeone",
                                        choices: [
                                            {
                                                index: 0,
                                                delta: { content: fullContent },
                                                finish_reason: null,
                                            },
                                        ],
                                    }
                                    controller.enqueue(
                                        encoder.encode(
                                            `data: ${JSON.stringify(textChunk)}\n\n`,
                                        ),
                                    )
                                }

                                const finishChunk = {
                                    id: `chatcmpl-${Date.now()}`,
                                    object: "chat.completion.chunk",
                                    created: Math.floor(Date.now() / 1000),
                                    model: "edgeone",
                                    choices: [
                                        {
                                            index: 0,
                                            delta: {},
                                            finish_reason:
                                                finishData.finishReason ||
                                                "stop",
                                        },
                                    ],
                                    usage: finishData.usage,
                                }
                                controller.enqueue(
                                    encoder.encode(
                                        `data: ${JSON.stringify(finishChunk)}\n\n`,
                                    ),
                                )
                            } else {
                                // No tools - just emit finish
                                const finishChunk = {
                                    id: `chatcmpl-${Date.now()}`,
                                    object: "chat.completion.chunk",
                                    created: Math.floor(Date.now() / 1000),
                                    model: "edgeone",
                                    choices: [
                                        {
                                            index: 0,
                                            delta: {},
                                            finish_reason:
                                                finishData.finishReason ||
                                                "stop",
                                        },
                                    ],
                                    usage: finishData.usage,
                                }
                                controller.enqueue(
                                    encoder.encode(
                                        `data: ${JSON.stringify(finishChunk)}\n\n`,
                                    ),
                                )
                            }

                            // Send [DONE]
                            controller.enqueue(
                                encoder.encode("data: [DONE]\n\n"),
                            )
                        } catch {
                            // Ignore parse errors
                        }
                        break
                    }

                    // Ignore other type codes (9, a, c, etc.) as EdgeOne doesn't support native tools
                    default:
                        break
                }
            }
        },

        flush(controller) {
            // Handle any remaining buffer
            if (buffer.trim()) {
                // Try to process remaining data
                const colonIndex = buffer.indexOf(":")
                if (colonIndex !== -1) {
                    const typeCode = buffer.substring(0, colonIndex)
                    if (typeCode === "0") {
                        try {
                            const text = JSON.parse(
                                buffer.substring(colonIndex + 1),
                            ) as string
                            const openAIChunk = {
                                id: `chatcmpl-${Date.now()}`,
                                object: "chat.completion.chunk",
                                created: Math.floor(Date.now() / 1000),
                                model: "edgeone",
                                choices: [
                                    {
                                        index: 0,
                                        delta: { content: text },
                                        finish_reason: null,
                                    },
                                ],
                            }
                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify(openAIChunk)}\n\n`,
                                ),
                            )
                        } catch {
                            // Ignore
                        }
                    }
                }
            }
        },
    })
}

// Main chat completions handler
export async function onRequestPost({
    request,
    env,
}: EdgeFunctionContext): Promise<Response> {
    request.headers.delete("accept-encoding")

    const corsHeaders: Record<string, string> = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }

    try {
        const body = await request.json()
        const { model: requestModel, messages, stream = true, tools } = body

        // Use model from request or default
        const modelId =
            requestModel || env.AI_MODEL || "@tx/deepseek-ai/deepseek-v3-0324"

        const hasTools = tools && tools.length > 0

        console.log(
            `[EdgeOne] Model: ${modelId}, Tools: ${hasTools ? tools.length : 0}`,
        )

        // Prepare messages - inject tool instructions if tools are provided
        const processedMessages = [...messages]
        if (hasTools) {
            const toolInstruction = generateToolCallInstruction(tools)

            // Find system message and append tool instructions
            const systemIndex = processedMessages.findIndex(
                (m: { role: string }) => m.role === "system",
            )
            if (systemIndex !== -1) {
                processedMessages[systemIndex] = {
                    ...processedMessages[systemIndex],
                    content:
                        processedMessages[systemIndex].content +
                        toolInstruction,
                }
            } else {
                // Add system message with tool instructions
                processedMessages.unshift({
                    role: "system",
                    content: toolInstruction,
                })
            }
        }

        // Call EdgeOne Edge AI (without tools - not supported)
        const aiResponse = await AI.chatCompletions({
            model: modelId,
            messages: processedMessages,
            stream,
        })

        // Transform AI SDK format to OpenAI format
        const transformedStream = aiResponse.pipeThrough(
            createAISDKToOpenAITransformer(hasTools),
        )

        return new Response(transformedStream, {
            headers: {
                ...corsHeaders,
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
            },
        })
    } catch (error) {
        console.error("[EdgeOne Chat Completions] Error:", error)

        const errorMessage =
            error instanceof Error ? error.message : "Edge AI service error"

        return new Response(
            JSON.stringify({
                error: {
                    message: errorMessage,
                    type: "server_error",
                    code: "edge_ai_error",
                },
            }),
            {
                status: 500,
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                },
            },
        )
    }
}
