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
            const params = func.parameters
                ? `\n    Parameters: ${JSON.stringify(func.parameters)}`
                : ""
            return `- ${func.name}: ${func.description || "No description"}${params}`
        })
        .join("\n")

    return `

## Tool Calling Instructions

You have access to the following tools:
${toolDescriptions}

### STRICT OUTPUT FORMAT

When you need to use a tool, output EXACTLY this format:

<tool_call>
{"name": "TOOL_NAME", "arguments": {"param1": "value1", "param2": "value2"}}
</tool_call>

### EXAMPLE

If you need to call display_diagram with XML content:

<tool_call>
{"name": "display_diagram", "arguments": {"xml": "<mxGraphModel><root><mxCell id=\\"0\\"/></root></mxGraphModel>"}}
</tool_call>

### CRITICAL RULES - MUST FOLLOW

1. The content between <tool_call> and </tool_call> MUST be valid JSON - nothing else
2. DO NOT use XML tags inside <tool_call> - only JSON
3. DO NOT write: <tool_call><display_diagram>...</display_diagram></tool_call> ❌
4. DO write: <tool_call>{"name": "display_diagram", "arguments": {...}}</tool_call> ✓
5. Escape double quotes inside string values with backslash: \\"
6. Escape newlines as \\n, tabs as \\t
7. Output ONLY the <tool_call> block - no text before or after
8. After the </tool_call> tag, STOP immediately
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

// Parse SSE data from EdgeOne response (OpenAI-compatible format)
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

// Stream tool call arguments in chunks for better UX (shows loading progress)
function* streamToolCallChunks(
    toolCallId: string,
    toolName: string,
    args: object,
    chunkSize: number = 100,
): Generator<string> {
    // First chunk: tool name (triggers loading state in UI)
    yield createToolCallChunk(toolCallId, toolName, "", 0, true, false)

    // Stream arguments in chunks
    const argsStr = JSON.stringify(args)
    for (let i = 0; i < argsStr.length; i += chunkSize) {
        const chunk = argsStr.slice(i, i + chunkSize)
        const isLast = i + chunkSize >= argsStr.length
        yield createToolCallChunk(toolCallId, toolName, chunk, 0, false, isLast)
    }
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

// Check if content might contain a tool call (including partial tags)
function mightContainToolCall(content: string): boolean {
    // Check for partial <tool_call> tag at the end
    const partialPatterns = [
        "<tool_call>",
        "<tool_call",
        "<tool_cal",
        "<tool_ca",
        "<tool_c",
        "<tool_",
        "<tool",
        "<too",
        "<to",
        "<t",
    ]

    for (const pattern of partialPatterns) {
        if (content.endsWith(pattern)) return true
    }

    // Check if we're inside a tool call (started but not ended)
    if (content.includes("<tool_call>") && !content.includes("</tool_call>")) {
        return true
    }

    return false
}

// Get content that's safe to output (excluding potential tool call patterns)
function getSafeOutput(content: string): string {
    // If there's a tool call, don't output anything
    if (content.includes("<tool_call>")) {
        // Return content before the tool call tag
        const idx = content.indexOf("<tool_call>")
        return idx > 0 ? content.slice(0, idx).trim() : ""
    }

    // Check for partial tag at the end
    for (let i = 1; i <= 11; i++) {
        const suffix = content.slice(-i)
        if ("<tool_call>".startsWith(suffix)) {
            return content.slice(0, -i)
        }
    }

    return content
}

// Try to parse and emit a tool call, returns parsed result or null
function tryParseToolCall(
    content: string,
): { name: string; arguments: object } | null {
    const toolCallMatch = content.match(
        /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/,
    )

    if (!toolCallMatch) return null

    try {
        return JSON.parse(toolCallMatch[1].trim())
    } catch (e) {
        console.error(
            "[EdgeOne] Failed to parse tool call:",
            e,
            toolCallMatch[1],
        )
        return null
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
        let lineBuffer = "" // Buffer for incomplete SSE lines
        let contentBuffer = "" // Buffer for accumulated content
        let toolCallSent = false

        const transformStream = new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                const text = new TextDecoder().decode(chunk)
                const buffer = lineBuffer + text
                const lines = buffer.split("\n")

                // Keep incomplete line in buffer
                lineBuffer = lines.pop() || ""

                for (const line of lines) {
                    if (!line.trim()) continue

                    const parsed = parseSSEData(line)
                    if (!parsed) continue

                    if (parsed.finish_reason === "stop") {
                        // Stream ended - check for tool call in accumulated content
                        const toolCall = tryParseToolCall(contentBuffer)

                        if (toolCall && !toolCallSent) {
                            const toolCallId = `call_${Date.now()}`
                            // Stream tool call chunks for better UX
                            for (const chunk of streamToolCallChunks(
                                toolCallId,
                                toolCall.name,
                                toolCall.arguments,
                            )) {
                                controller.enqueue(
                                    new TextEncoder().encode(chunk),
                                )
                            }
                            controller.enqueue(
                                new TextEncoder().encode("data: [DONE]\n\n"),
                            )
                            toolCallSent = true
                            return
                        }

                        // No tool call found - output any buffered content and finish
                        const safeOutput = getSafeOutput(contentBuffer)
                        if (safeOutput) {
                            controller.enqueue(
                                new TextEncoder().encode(
                                    createContentChunk(safeOutput),
                                ),
                            )
                        }
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

                    // Accumulate all content
                    contentBuffer += content

                    // Check if we have a complete tool call
                    const toolCall = tryParseToolCall(contentBuffer)
                    if (toolCall && !toolCallSent) {
                        const toolCallId = `call_${Date.now()}`
                        // Stream tool call chunks for better UX
                        for (const chunk of streamToolCallChunks(
                            toolCallId,
                            toolCall.name,
                            toolCall.arguments,
                        )) {
                            controller.enqueue(new TextEncoder().encode(chunk))
                        }
                        controller.enqueue(
                            new TextEncoder().encode("data: [DONE]\n\n"),
                        )
                        toolCallSent = true
                        return
                    }

                    // Check if content might contain a tool call (partial match)
                    // If so, don't output anything yet
                    if (mightContainToolCall(contentBuffer)) {
                        continue
                    }

                    // Safe to output - no tool call pattern detected
                    const safeOutput = getSafeOutput(contentBuffer)
                    if (safeOutput) {
                        controller.enqueue(
                            new TextEncoder().encode(
                                createContentChunk(safeOutput),
                            ),
                        )
                        // Remove the output portion from buffer, keep only what wasn't output
                        contentBuffer = contentBuffer.slice(safeOutput.length)
                    }
                }
            },

            flush() {
                // Nothing to do - handled in transform
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
