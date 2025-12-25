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

### TOOL SELECTION - CRITICAL!

⚠️ Before calling any tool, check "Current diagram XML" in the system context:
- If it contains mxCell elements with id="2" or higher → diagram EXISTS → use edit_diagram
- If it's empty or only has root cells (id="0", id="1") → no diagram → use display_diagram

NEVER use display_diagram to modify an existing diagram! Use edit_diagram instead.

### STRICT OUTPUT FORMAT

When you need to use a tool, output EXACTLY this format:

<tool_call>
{"name": "TOOL_NAME", "arguments": {"param1": "value1"}}
</tool_call>

### EXAMPLES

Example 1 - Create NEW diagram (display_diagram):
<tool_call>
{"name": "display_diagram", "arguments": {"xml": "<mxCell id=\\"2\\" value=\\"Hello\\" style=\\"rounded=1;\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"100\\" y=\\"100\\" width=\\"120\\" height=\\"60\\" as=\\"geometry\\"/></mxCell>"}}
</tool_call>

Example 2 - MODIFY existing diagram (edit_diagram) - change color:
<tool_call>
{"name": "edit_diagram", "arguments": {"operations": [{"operation": "update", "cell_id": "2", "new_xml": "<mxCell id=\\"2\\" value=\\"\\" style=\\"ellipse;fillColor=#1E90FF;strokeColor=#000000;\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"300\\" y=\\"200\\" width=\\"60\\" height=\\"60\\" as=\\"geometry\\"/></mxCell>"}]}}
</tool_call>

Example 3 - Multiple updates (edit_diagram):
<tool_call>
{"name": "edit_diagram", "arguments": {"operations": [{"operation": "update", "cell_id": "2", "new_xml": "<mxCell id=\\"2\\" .../>"}, {"operation": "update", "cell_id": "3", "new_xml": "<mxCell id=\\"3\\" .../>"}]}}
</tool_call>

### CRITICAL RULES - MUST FOLLOW

1. The content between <tool_call> and </tool_call> MUST be valid JSON - nothing else
2. DO NOT use XML tags inside <tool_call> - only JSON with "name" and "arguments"
3. DO NOT write: <tool_call><display_diagram>...</display_diagram></tool_call> ❌
4. DO NOT write: <tool_call>update\\ncell_id: 2\\n<mxCell.../></tool_call> ❌
5. DO write: <tool_call>{"name": "edit_diagram", "arguments": {"operations": [...]}}</tool_call> ✓
6. Escape double quotes inside string values with backslash: \\"
7. Escape newlines as \\n, tabs as \\t
8. Output ONLY the <tool_call> block - no text before or after
9. After the </tool_call> tag, STOP immediately
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
        let toolCallStarted = false // Whether we've detected <tool_call> and sent the start chunk
        let toolCallId = ""
        let toolCallName = ""
        let toolCallArgsBuffer = "" // Buffer for tool call JSON content inside <tool_call>
        let argumentsStarted = false // Whether we've found "arguments": { and started streaming
        let braceDepth = 0 // Track nested braces in arguments
        let lastStreamedArgsLength = 0 // Track how much of arguments we've streamed

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
                        if (toolCallStarted) {
                            // Tool call in progress - send finish chunk
                            controller.enqueue(
                                new TextEncoder().encode(
                                    createToolCallChunk(
                                        toolCallId,
                                        toolCallName,
                                        "",
                                        0,
                                        false,
                                        true, // isLast = true
                                    ),
                                ),
                            )
                            controller.enqueue(
                                new TextEncoder().encode("data: [DONE]\n\n"),
                            )
                            return
                        }

                        // No tool call - output any buffered content and finish
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

                    if (toolCallStarted) {
                        // We're inside a tool call - accumulate and parse
                        toolCallArgsBuffer += content

                        // Check if tool call ended
                        if (toolCallArgsBuffer.includes("</tool_call>")) {
                            // Extract final arguments if not yet done
                            if (!argumentsStarted) {
                                // Try to parse the complete JSON and extract arguments
                                const jsonContent = toolCallArgsBuffer
                                    .replace("</tool_call>", "")
                                    .trim()
                                try {
                                    const parsed = JSON.parse(jsonContent)
                                    if (parsed.arguments) {
                                        const argsStr = JSON.stringify(
                                            parsed.arguments,
                                        )
                                        controller.enqueue(
                                            new TextEncoder().encode(
                                                createToolCallChunk(
                                                    toolCallId,
                                                    toolCallName,
                                                    argsStr,
                                                    0,
                                                    false,
                                                    false,
                                                ),
                                            ),
                                        )
                                    }
                                } catch {
                                    // JSON parse failed, skip
                                }
                            }

                            // Tool call complete - send finish chunk
                            controller.enqueue(
                                new TextEncoder().encode(
                                    createToolCallChunk(
                                        toolCallId,
                                        toolCallName,
                                        "",
                                        0,
                                        false,
                                        true,
                                    ),
                                ),
                            )
                            controller.enqueue(
                                new TextEncoder().encode("data: [DONE]\n\n"),
                            )
                            return
                        }

                        // Try to extract and stream arguments incrementally
                        if (!argumentsStarted) {
                            // Look for "arguments": {
                            const argsMatch =
                                toolCallArgsBuffer.match(/"arguments"\s*:\s*\{/)
                            if (argsMatch && argsMatch.index !== undefined) {
                                argumentsStarted = true
                                // Find the position of the opening brace
                                const argsStartPos =
                                    argsMatch.index + argsMatch[0].length - 1 // Position of {
                                braceDepth = 1
                                lastStreamedArgsLength = 0

                                // Stream the opening brace
                                controller.enqueue(
                                    new TextEncoder().encode(
                                        createToolCallChunk(
                                            toolCallId,
                                            toolCallName,
                                            "{",
                                            0,
                                            false,
                                            false,
                                        ),
                                    ),
                                )
                                lastStreamedArgsLength = 1

                                // Process remaining content after {
                                const argsContent = toolCallArgsBuffer.slice(
                                    argsStartPos + 1,
                                )
                                if (argsContent.length > 0) {
                                    // Stream incrementally, tracking brace depth
                                    let safeToStream = ""
                                    for (const char of argsContent) {
                                        if (char === "{") braceDepth++
                                        if (char === "}") {
                                            braceDepth--
                                            if (braceDepth === 0) {
                                                // End of arguments object
                                                safeToStream += char
                                                break
                                            }
                                        }
                                        safeToStream += char
                                    }

                                    if (safeToStream.length > 0) {
                                        // Don't stream if it might be part of </tool_call>
                                        const partialEndTags = [
                                            "</tool_call>",
                                            "</tool_call",
                                            "</tool_cal",
                                            "</tool_ca",
                                            "</tool_c",
                                            "</tool_",
                                            "</tool",
                                            "</too",
                                            "</to",
                                            "</t",
                                            "</",
                                        ]
                                        let isSafe = true
                                        for (const tag of partialEndTags) {
                                            if (
                                                toolCallArgsBuffer.endsWith(tag)
                                            ) {
                                                isSafe = false
                                                break
                                            }
                                        }

                                        if (isSafe && braceDepth > 0) {
                                            controller.enqueue(
                                                new TextEncoder().encode(
                                                    createToolCallChunk(
                                                        toolCallId,
                                                        toolCallName,
                                                        safeToStream,
                                                        0,
                                                        false,
                                                        false,
                                                    ),
                                                ),
                                            )
                                            lastStreamedArgsLength +=
                                                safeToStream.length
                                        }
                                    }
                                }
                            }
                        } else {
                            // Already streaming arguments - continue incrementally
                            // Find where we are in the arguments
                            const argsMatch =
                                toolCallArgsBuffer.match(/"arguments"\s*:\s*\{/)
                            if (argsMatch && argsMatch.index !== undefined) {
                                const argsStartPos =
                                    argsMatch.index + argsMatch[0].length - 1
                                const currentArgsContent =
                                    toolCallArgsBuffer.slice(argsStartPos + 1)

                                // Calculate what's new since last stream
                                const newContent = currentArgsContent.slice(
                                    lastStreamedArgsLength - 1,
                                ) // -1 because we already streamed {

                                if (newContent.length > 0) {
                                    // Check for partial end tags
                                    const partialEndTags = [
                                        "</tool_call>",
                                        "</tool_call",
                                        "</tool_cal",
                                        "</tool_ca",
                                        "</tool_c",
                                        "</tool_",
                                        "</tool",
                                        "</too",
                                        "</to",
                                        "</t",
                                        "</",
                                    ]
                                    let isSafe = true
                                    for (const tag of partialEndTags) {
                                        if (toolCallArgsBuffer.endsWith(tag)) {
                                            isSafe = false
                                            break
                                        }
                                    }

                                    // Also check if we're at the end of arguments (closing brace followed by })
                                    // The pattern would be: ...}}\n</tool_call> or similar
                                    const contentToStream = newContent

                                    // Track braces in new content
                                    let tempDepth = braceDepth
                                    let safeLength = 0
                                    for (
                                        let i = 0;
                                        i < contentToStream.length;
                                        i++
                                    ) {
                                        const char = contentToStream[i]
                                        if (char === "{") tempDepth++
                                        if (char === "}") {
                                            tempDepth--
                                            if (tempDepth === 0) {
                                                // Include this closing brace and stop
                                                safeLength = i + 1
                                                braceDepth = 0
                                                break
                                            }
                                        }
                                        safeLength = i + 1
                                    }

                                    if (safeLength > 0 && isSafe) {
                                        const toStream = contentToStream.slice(
                                            0,
                                            safeLength,
                                        )
                                        controller.enqueue(
                                            new TextEncoder().encode(
                                                createToolCallChunk(
                                                    toolCallId,
                                                    toolCallName,
                                                    toStream,
                                                    0,
                                                    false,
                                                    false,
                                                ),
                                            ),
                                        )
                                        lastStreamedArgsLength += safeLength
                                        braceDepth = tempDepth
                                    }
                                }
                            }
                        }
                        continue
                    }

                    // Not in tool call yet - accumulate and check for start
                    contentBuffer += content

                    // Check if tool call started
                    if (contentBuffer.includes("<tool_call>")) {
                        // Output any content before the tool call
                        const idx = contentBuffer.indexOf("<tool_call>")
                        const beforeToolCall = contentBuffer
                            .slice(0, idx)
                            .trim()
                        if (beforeToolCall) {
                            controller.enqueue(
                                new TextEncoder().encode(
                                    createContentChunk(beforeToolCall),
                                ),
                            )
                        }

                        // Start tool call streaming
                        toolCallStarted = true
                        toolCallId = `call_${Date.now()}`
                        toolCallArgsBuffer = contentBuffer.slice(
                            idx + "<tool_call>".length,
                        )
                        argumentsStarted = false
                        braceDepth = 0
                        lastStreamedArgsLength = 0

                        // Try to extract tool name for the start chunk
                        const nameMatch = toolCallArgsBuffer.match(
                            /"name"\s*:\s*"([^"]+)"/,
                        )
                        toolCallName = nameMatch
                            ? nameMatch[1]
                            : "display_diagram"

                        // Send tool call start chunk immediately
                        controller.enqueue(
                            new TextEncoder().encode(
                                createToolCallChunk(
                                    toolCallId,
                                    toolCallName,
                                    "",
                                    0,
                                    true,
                                    false,
                                ),
                            ),
                        )

                        // Check if we already have arguments to stream
                        const argsMatch =
                            toolCallArgsBuffer.match(/"arguments"\s*:\s*\{/)
                        if (argsMatch && argsMatch.index !== undefined) {
                            argumentsStarted = true
                            const argsStartPos =
                                argsMatch.index + argsMatch[0].length - 1
                            braceDepth = 1

                            // Stream opening brace
                            controller.enqueue(
                                new TextEncoder().encode(
                                    createToolCallChunk(
                                        toolCallId,
                                        toolCallName,
                                        "{",
                                        0,
                                        false,
                                        false,
                                    ),
                                ),
                            )
                            lastStreamedArgsLength = 1

                            // Stream any content after {
                            const argsContent = toolCallArgsBuffer.slice(
                                argsStartPos + 1,
                            )
                            if (argsContent.length > 0) {
                                let safeToStream = ""
                                for (const char of argsContent) {
                                    if (char === "{") braceDepth++
                                    if (char === "}") {
                                        braceDepth--
                                        if (braceDepth === 0) {
                                            safeToStream += char
                                            break
                                        }
                                    }
                                    safeToStream += char
                                }

                                if (safeToStream.length > 0 && braceDepth > 0) {
                                    controller.enqueue(
                                        new TextEncoder().encode(
                                            createToolCallChunk(
                                                toolCallId,
                                                toolCallName,
                                                safeToStream,
                                                0,
                                                false,
                                                false,
                                            ),
                                        ),
                                    )
                                    lastStreamedArgsLength +=
                                        safeToStream.length
                                }
                            }
                        }
                        continue
                    }

                    // Check if content might contain a partial tool call tag
                    if (mightContainToolCall(contentBuffer)) {
                        continue
                    }

                    // Safe to output
                    const safeOutput = getSafeOutput(contentBuffer)
                    if (safeOutput) {
                        controller.enqueue(
                            new TextEncoder().encode(
                                createContentChunk(safeOutput),
                            ),
                        )
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
