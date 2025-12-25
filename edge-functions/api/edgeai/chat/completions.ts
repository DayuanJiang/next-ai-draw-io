/**
 * EdgeOne Pages Edge Function for OpenAI-compatible Chat Completions API
 *
 * This endpoint provides an OpenAI-compatible API that can be used with
 * AI SDK's createOpenAI({ baseURL: '/api/edgeai' })
 *
 * Since EdgeOne Edge AI doesn't support native function calling,
 * this function emulates it by:
 * 1. Injecting tool definitions into the system prompt
 * 2. Parsing the model output for tool call patterns
 * 3. Converting to OpenAI-compatible tool_calls streaming format
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

interface OpenAITool {
    type: "function"
    function: {
        name: string
        description?: string
        parameters?: object
    }
}

interface OpenAIMessage {
    role: "system" | "user" | "assistant" | "tool"
    content: string | object | null
    tool_calls?: Array<{
        id: string
        type: "function"
        function: { name: string; arguments: string }
    }>
    tool_call_id?: string
}

interface OpenAIRequest {
    model: string
    messages: OpenAIMessage[]
    stream?: boolean
    max_tokens?: number
    temperature?: number
    tools?: OpenAITool[]
    tool_choice?: string | object
}

// Generate tool call instruction for system prompt
function generateToolCallInstruction(tools: OpenAITool[]): string {
    const toolDescriptions = tools
        .map((tool) => {
            const func = tool.function
            return `- ${func.name}: ${func.description || "No description"}`
        })
        .join("\n")

    return `

## Tool Calling Instructions

You have access to the following tools:
${toolDescriptions}

When you need to use a tool, you MUST output in this EXACT format (no other text before or after):
<tool_call>
{"name": "tool_name", "arguments": {"arg1": "value1"}}
</tool_call>

CRITICAL RULES:
1. Output ONLY the <tool_call> block when using a tool - no explanations before or after
2. The JSON inside must be valid - properly escape special characters
3. For XML content in arguments, escape quotes as \\"
4. Do NOT wrap tool calls in markdown code blocks
5. After outputting a tool call, STOP - do not continue with more text
`
}

// Convert messages to simple text format for EdgeOne
// EdgeOne may not support complex message content arrays
function simplifyMessages(
    messages: OpenAIMessage[],
): Array<{ role: string; content: string }> {
    return messages.map((msg) => {
        let content: string

        if (typeof msg.content === "string") {
            content = msg.content
        } else if (Array.isArray(msg.content)) {
            // Handle content array (e.g., with text and image parts)
            content = (msg.content as any[])
                .map((part) => {
                    if (part.type === "text") return part.text
                    if (part.type === "image_url") return "[Image attached]"
                    return ""
                })
                .filter(Boolean)
                .join("\n")
        } else if (msg.content === null) {
            // Assistant message with tool_calls has null content
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                content = msg.tool_calls
                    .map(
                        (tc) =>
                            `<tool_call>\n${JSON.stringify({ name: tc.function.name, arguments: JSON.parse(tc.function.arguments) })}\n</tool_call>`,
                    )
                    .join("\n")
            } else {
                content = ""
            }
        } else {
            content = JSON.stringify(msg.content)
        }

        // Handle tool role messages (tool results)
        if (msg.role === "tool") {
            return {
                role: "user",
                content: `Tool result for ${msg.tool_call_id}:\n${content}`,
            }
        }

        return { role: msg.role, content }
    })
}

// Parse SSE data from EdgeOne response
function parseSSEData(
    line: string,
): { content?: string; finish_reason?: string } | null {
    if (!line.startsWith("data: ")) return null
    const data = line.slice(6)
    if (data === "[DONE]") return { finish_reason: "stop" }

    try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta
        const finishReason = parsed.choices?.[0]?.finish_reason
        return {
            content: delta?.content,
            finish_reason: finishReason,
        }
    } catch {
        return null
    }
}

// Generate OpenAI-compatible SSE chunk for tool calls
function createToolCallChunk(
    toolCallId: string,
    toolName: string,
    args: string,
    index: number,
    isFirst: boolean,
    isLast: boolean,
): string {
    const chunk: any = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "edgeone",
        choices: [
            {
                index: 0,
                delta: isFirst
                    ? {
                          role: "assistant",
                          content: null,
                          tool_calls: [
                              {
                                  index,
                                  id: toolCallId,
                                  type: "function",
                                  function: { name: toolName, arguments: "" },
                              },
                          ],
                      }
                    : {
                          tool_calls: [
                              {
                                  index,
                                  function: { arguments: args },
                              },
                          ],
                      },
                finish_reason: isLast ? "tool_calls" : null,
            },
        ],
    }
    return `data: ${JSON.stringify(chunk)}\n\n`
}

// Generate OpenAI-compatible SSE chunk for regular content
function createContentChunk(
    content: string,
    finishReason: string | null = null,
): string {
    const chunk = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "edgeone",
        choices: [
            {
                index: 0,
                delta: content ? { content } : {},
                finish_reason: finishReason,
            },
        ],
    }
    return `data: ${JSON.stringify(chunk)}\n\n`
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

// Main chat completions handler - OpenAI compatible with tool call emulation
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
        const body = (await request.json()) as OpenAIRequest
        const { model: requestModel, messages, stream = true, tools } = body

        // Use model from request or default
        const modelId =
            requestModel || env.AI_MODEL || "@tx/deepseek-ai/deepseek-v3-0324"

        console.log(`[EdgeOne] Model: ${modelId}, Tools: ${tools?.length || 0}`)

        // Prepare messages - inject tool instructions if tools are provided
        const processedMessages = simplifyMessages(messages)

        if (tools && tools.length > 0) {
            // Find system message and append tool instructions
            const systemIndex = processedMessages.findIndex(
                (m) => m.role === "system",
            )
            if (systemIndex >= 0) {
                processedMessages[systemIndex].content +=
                    generateToolCallInstruction(tools)
            } else {
                // Add system message with tool instructions
                processedMessages.unshift({
                    role: "system",
                    content: generateToolCallInstruction(tools),
                })
            }
        }

        // Call EdgeOne Edge AI
        const aiResponse = await AI.chatCompletions({
            model: modelId,
            messages: processedMessages,
            stream,
        })

        // If no tools, return stream directly
        if (!tools || tools.length === 0) {
            return new Response(aiResponse, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "text/event-stream; charset=utf-8",
                    "Cache-Control": "no-cache, no-transform",
                    Connection: "keep-alive",
                },
            })
        }

        // With tools, we need to parse and potentially transform the response
        const transformStream = new TransformStream<Uint8Array, Uint8Array>({
            start(controller) {
                ;(this as any).buffer = ""
                ;(this as any).toolCallBuffer = ""
                ;(this as any).inToolCall = false
                ;(this as any).toolCallSent = false
                ;(this as any).contentBuffer = ""
            },

            transform(chunk, controller) {
                const text = new TextDecoder().decode(chunk)
                const buffer = (this as any).buffer + text
                const lines = buffer.split("\n")

                // Keep incomplete line in buffer
                ;(this as any).buffer = lines.pop() || ""

                for (const line of lines) {
                    if (!line.trim()) continue

                    const parsed = parseSSEData(line)
                    if (!parsed) {
                        // Pass through non-data lines
                        controller.enqueue(
                            new TextEncoder().encode(line + "\n"),
                        )
                        continue
                    }

                    if (parsed.finish_reason === "stop") {
                        // Check if we have a complete tool call in buffer
                        const fullContent =
                            (this as any).contentBuffer +
                            (this as any).toolCallBuffer
                        const toolCallMatch = fullContent.match(
                            /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/,
                        )

                        if (toolCallMatch && !(this as any).toolCallSent) {
                            try {
                                const toolCallJson = JSON.parse(
                                    toolCallMatch[1].trim(),
                                )
                                const toolCallId = `call_${Date.now()}`

                                // Send tool call chunks
                                controller.enqueue(
                                    new TextEncoder().encode(
                                        createToolCallChunk(
                                            toolCallId,
                                            toolCallJson.name,
                                            "",
                                            0,
                                            true,
                                            false,
                                        ),
                                    ),
                                )
                                controller.enqueue(
                                    new TextEncoder().encode(
                                        createToolCallChunk(
                                            toolCallId,
                                            toolCallJson.name,
                                            JSON.stringify(
                                                toolCallJson.arguments,
                                            ),
                                            0,
                                            false,
                                            true,
                                        ),
                                    ),
                                )
                                controller.enqueue(
                                    new TextEncoder().encode(
                                        "data: [DONE]\n\n",
                                    ),
                                )
                                ;(this as any).toolCallSent = true
                                return
                            } catch (e) {
                                console.error(
                                    "[EdgeOne] Failed to parse tool call:",
                                    e,
                                )
                            }
                        }

                        // Send finish chunk
                        controller.enqueue(
                            new TextEncoder().encode(
                                createContentChunk("", "stop"),
                            ),
                        )
                        controller.enqueue(
                            new TextEncoder().encode("data: [DONE]\n\n"),
                        )
                        continue
                    }

                    const content = parsed.content || ""
                    if (!content) continue

                    // Accumulate content to detect tool calls
                    ;(this as any).contentBuffer += content

                    // Check for tool call start
                    if (
                        (this as any).contentBuffer.includes("<tool_call>") &&
                        !(this as any).inToolCall
                    ) {
                        ;(this as any).inToolCall = true
                        // Don't output anything yet - buffer until we see the end
                        continue
                    }

                    if ((this as any).inToolCall) {
                        // Check for complete tool call
                        if (
                            (this as any).contentBuffer.includes("</tool_call>")
                        ) {
                            const match = (this as any).contentBuffer.match(
                                /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/,
                            )
                            if (match) {
                                try {
                                    const toolCallJson = JSON.parse(
                                        match[1].trim(),
                                    )
                                    const toolCallId = `call_${Date.now()}`

                                    // Send tool call chunks
                                    controller.enqueue(
                                        new TextEncoder().encode(
                                            createToolCallChunk(
                                                toolCallId,
                                                toolCallJson.name,
                                                "",
                                                0,
                                                true,
                                                false,
                                            ),
                                        ),
                                    )
                                    controller.enqueue(
                                        new TextEncoder().encode(
                                            createToolCallChunk(
                                                toolCallId,
                                                toolCallJson.name,
                                                JSON.stringify(
                                                    toolCallJson.arguments,
                                                ),
                                                0,
                                                false,
                                                true,
                                            ),
                                        ),
                                    )
                                    controller.enqueue(
                                        new TextEncoder().encode(
                                            "data: [DONE]\n\n",
                                        ),
                                    )
                                    ;(this as any).toolCallSent = true
                                    return
                                } catch (e) {
                                    console.error(
                                        "[EdgeOne] Failed to parse tool call:",
                                        e,
                                    )
                                    // Fall through to output as regular content
                                }
                            }
                        }
                        // Still buffering tool call
                        continue
                    }

                    // Regular content - pass through
                    controller.enqueue(
                        new TextEncoder().encode(createContentChunk(content)),
                    )
                }
            },

            flush(controller) {
                // Handle any remaining buffer
                const remaining = (this as any).buffer
                if (remaining && remaining.trim()) {
                    const parsed = parseSSEData(remaining)
                    if (parsed?.content) {
                        controller.enqueue(
                            new TextEncoder().encode(
                                createContentChunk(parsed.content),
                            ),
                        )
                    }
                }
            },
        })

        const transformedStream = aiResponse.pipeThrough(transformStream)

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
