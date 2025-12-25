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
 * Parse AI SDK Data Stream Protocol and convert to OpenAI SSE format
 *
 * EdgeOne returns: data: {"type":"text-delta","textDelta":"Hello"}\n\n
 * OpenAI expects: data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n
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

            // Process complete SSE messages (separated by \n\n)
            const messages = buffer.split("\n\n")
            buffer = messages.pop() || "" // Keep incomplete message in buffer

            for (const message of messages) {
                if (!message.trim()) continue

                // Parse SSE format: "data: {...}" or "0:..." (AI SDK UI format)
                let jsonStr = ""

                if (message.startsWith("data: ")) {
                    jsonStr = message.substring(6).trim()
                } else if (message.includes(":")) {
                    // AI SDK UI format: 0:"text" or e:{...}
                    const colonIndex = message.indexOf(":")
                    const typeCode = message.substring(0, colonIndex)
                    jsonStr = message.substring(colonIndex + 1)

                    // Handle AI SDK UI format
                    if (typeCode === "0") {
                        try {
                            const text = JSON.parse(jsonStr) as string
                            fullContent += text
                            handleTextDelta(
                                text,
                                controller,
                                encoder,
                                hasTools,
                                fullContent,
                                toolCallDetected,
                                toolCallBuffer,
                                (detected) => {
                                    toolCallDetected = detected
                                },
                                (buf) => {
                                    toolCallBuffer = buf
                                },
                            )
                        } catch {
                            // Ignore
                        }
                        continue
                    } else if (typeCode === "e") {
                        try {
                            const finishData = JSON.parse(jsonStr)
                            handleFinish(
                                finishData,
                                controller,
                                encoder,
                                hasTools,
                                toolCallDetected,
                                toolCallBuffer,
                                fullContent,
                                toolCallId,
                            )
                        } catch {
                            // Ignore
                        }
                        continue
                    }
                    continue
                } else {
                    continue
                }

                if (!jsonStr || jsonStr === "[DONE]") {
                    continue
                }

                try {
                    const data = JSON.parse(jsonStr)

                    // Handle AI SDK Data Stream Protocol format
                    if (data.type === "text-delta" && data.textDelta) {
                        const text = data.textDelta
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
                                )
                            } else if (toolCallDetected) {
                                toolCallBuffer += text
                            }
                            // Buffer text - don't emit until we know if there's a tool call
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
                    } else if (
                        data.type === "finish" ||
                        data.type === "finish-step"
                    ) {
                        // Handle finish
                        if (hasTools && toolCallDetected) {
                            // Extract and emit tool call
                            const endTag =
                                toolCallBuffer.indexOf("</tool_call>")
                            const toolCallJson =
                                endTag !== -1
                                    ? toolCallBuffer.substring(0, endTag)
                                    : toolCallBuffer

                            try {
                                const toolCall = JSON.parse(toolCallJson)

                                // Emit tool call
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

                                // Emit finish with tool_calls
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
                                    usage: data.usage,
                                }
                                controller.enqueue(
                                    encoder.encode(
                                        `data: ${JSON.stringify(finishChunk)}\n\n`,
                                    ),
                                )
                            } catch {
                                // Failed to parse tool call - emit as text
                                emitTextAndFinish(
                                    controller,
                                    encoder,
                                    fullContent,
                                    data.finishReason || "stop",
                                    data.usage,
                                )
                            }
                        } else if (
                            hasTools &&
                            !toolCallDetected &&
                            fullContent
                        ) {
                            // Has tools but no tool call - emit buffered content
                            emitTextAndFinish(
                                controller,
                                encoder,
                                fullContent,
                                data.finishReason || "stop",
                                data.usage,
                            )
                        } else if (!hasTools && data.type === "finish") {
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
                                            data.finishReason || "stop",
                                    },
                                ],
                                usage: data.usage,
                            }
                            controller.enqueue(
                                encoder.encode(
                                    `data: ${JSON.stringify(finishChunk)}\n\n`,
                                ),
                            )
                        }

                        if (data.type === "finish") {
                            controller.enqueue(
                                encoder.encode("data: [DONE]\n\n"),
                            )
                        }
                    }
                    // Ignore other types: start, start-step, finish-step (intermediate)
                } catch {
                    // Ignore parse errors
                }
            }
        },

        flush(controller) {
            // Handle any remaining content
            if (fullContent && !toolCallDetected) {
                const openAIChunk = {
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
                    encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`),
                )
            }
        },
    })
}

// Helper to emit text content and finish
function emitTextAndFinish(
    controller: TransformStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    content: string,
    finishReason: string,
    usage?: any,
) {
    if (content) {
        const textChunk = {
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "edgeone",
            choices: [
                {
                    index: 0,
                    delta: { content },
                    finish_reason: null,
                },
            ],
        }
        controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(textChunk)}\n\n`),
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
                finish_reason: finishReason,
            },
        ],
        usage,
    }
    controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(finishChunk)}\n\n`),
    )
}

// Helper for handling text delta (used by both formats)
function handleTextDelta(
    text: string,
    controller: TransformStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    hasTools: boolean,
    fullContent: string,
    toolCallDetected: boolean,
    toolCallBuffer: string,
    setToolCallDetected: (v: boolean) => void,
    setToolCallBuffer: (v: string) => void,
) {
    if (hasTools) {
        if (!toolCallDetected && fullContent.includes("<tool_call>")) {
            setToolCallDetected(true)
            const toolCallStart = fullContent.indexOf("<tool_call>")
            setToolCallBuffer(fullContent.substring(toolCallStart + 11))
        } else if (toolCallDetected) {
            setToolCallBuffer(toolCallBuffer + text)
        }
    } else {
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
            encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`),
        )
    }
}

// Helper for handling finish (used by AI SDK UI format)
function handleFinish(
    finishData: any,
    controller: TransformStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
    hasTools: boolean,
    toolCallDetected: boolean,
    toolCallBuffer: string,
    fullContent: string,
    toolCallId: string,
) {
    if (hasTools && toolCallDetected) {
        const endTag = toolCallBuffer.indexOf("</tool_call>")
        const toolCallJson =
            endTag !== -1 ? toolCallBuffer.substring(0, endTag) : toolCallBuffer

        try {
            const toolCall = JSON.parse(toolCallJson)

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
                                        arguments: JSON.stringify(
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
                encoder.encode(`data: ${JSON.stringify(toolCallChunk)}\n\n`),
            )

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
                encoder.encode(`data: ${JSON.stringify(finishChunk)}\n\n`),
            )
        } catch {
            emitTextAndFinish(
                controller,
                encoder,
                fullContent,
                "stop",
                finishData.usage,
            )
        }
    } else {
        emitTextAndFinish(
            controller,
            encoder,
            fullContent,
            finishData.finishReason || "stop",
            finishData.usage,
        )
    }
    controller.enqueue(encoder.encode("data: [DONE]\n\n"))
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

        // DEBUG: Log incoming messages structure
        console.log(`[EdgeOne] Messages count: ${messages.length}`)
        messages.forEach((m: any, i: number) => {
            console.log(
                `[EdgeOne] Message ${i}: role=${m.role}, content type=${typeof m.content}, content=${typeof m.content === "string" ? m.content.substring(0, 100) : JSON.stringify(m.content).substring(0, 100)}...`,
            )
        })

        // Normalize messages - EdgeOne requires string content, not array format
        // AI SDK sends: { role: "user", content: [{ type: "text", text: "..." }] }
        // EdgeOne expects: { role: "user", content: "..." }
        const normalizedMessages = messages.map((m: any) => {
            if (typeof m.content === "string") {
                return m
            }
            if (Array.isArray(m.content)) {
                // Extract text from content array
                const textParts = m.content
                    .filter((part: any) => part.type === "text")
                    .map((part: any) => part.text)
                    .join("\n")

                // Check for image parts - EdgeOne may not support multimodal
                const hasImages = m.content.some(
                    (part: any) => part.type === "image",
                )
                if (hasImages) {
                    console.warn(
                        `[EdgeOne] Warning: Message contains images which may not be supported`,
                    )
                }

                return {
                    role: m.role,
                    content: textParts || "",
                }
            }
            return m
        })

        console.log(`[EdgeOne] Normalized messages:`)
        normalizedMessages.forEach((m: any, i: number) => {
            console.log(
                `[EdgeOne] Normalized ${i}: role=${m.role}, content length=${m.content?.length || 0}`,
            )
        })

        // Prepare messages - inject tool instructions if tools are provided
        const processedMessages = [...normalizedMessages]
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
