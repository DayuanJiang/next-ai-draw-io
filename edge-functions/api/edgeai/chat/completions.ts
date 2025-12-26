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
// This should be minimal since tool descriptions are already in the system prompt from streamText
function generateToolCallInstruction(tools: OpenAITool[]): string {
    const toolNames = tools.map((t) => t.function.name).join(", ")

    return `

## Tool Call Output Format

When calling a tool, wrap your JSON in <tool_call> tags:

<tool_call>
{"name": "TOOL_NAME", "arguments": {YOUR_ARGUMENTS}}
</tool_call>

Available tools: ${toolNames}

RULES:
1. "name" must be one of the available tools
2. "arguments" must match the tool's parameter schema (see tool descriptions above)
3. Escape quotes in XML strings: \\"
4. Output ONLY the <tool_call> block when calling a tool - no extra text

Example for display_diagram:
<tool_call>
{"name": "display_diagram", "arguments": {"xml": "<mxCell id=\\"2\\" value=\\"Hello\\" style=\\"rounded=1;\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"100\\" y=\\"100\\" width=\\"120\\" height=\\"60\\" as=\\"geometry\\"/></mxCell>"}}
</tool_call>

Example for edit_diagram:
<tool_call>
{"name": "edit_diagram", "arguments": {"operations": [{"operation": "update", "cell_id": "2", "new_xml": "<mxCell id=\\"2\\" style=\\"fillColor=#FF0000;\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"100\\" y=\\"100\\" width=\\"60\\" height=\\"60\\" as=\\"geometry\\"/></mxCell>"}]}}
</tool_call>
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

// Parse XML-style tool call format (used by R3 and some other models)
// Format: <name>tool_name</name>\n<arguments>\n{...}\n</arguments>
function parseXmlToolCall(
    content: string,
): { name: string; arguments: string } | null {
    // Try to extract <name>...</name>
    const nameMatch = content.match(/<name>\s*([^<]+)\s*<\/name>/)
    if (!nameMatch) return null

    const toolName = nameMatch[1].trim()

    // Try to extract <arguments>...</arguments>
    const argsMatch = content.match(/<arguments>\s*([\s\S]*?)\s*<\/arguments>/)
    if (!argsMatch) {
        // Arguments might not be closed yet, try to get partial
        const argsStart = content.indexOf("<arguments>")
        if (argsStart !== -1) {
            const argsContent = content
                .slice(argsStart + "<arguments>".length)
                .trim()
            return { name: toolName, arguments: argsContent }
        }
        return { name: toolName, arguments: "" }
    }

    return { name: toolName, arguments: argsMatch[1].trim() }
}

// Check if content is XML-style tool call format
function isXmlToolCallFormat(content: string): boolean {
    return (
        content.includes("<name>") &&
        (content.includes("<arguments>") || content.includes("</name>"))
    )
}

// Strip <think>...</think> blocks from content (DeepSeek R1 reasoning)
function stripThinkBlocks(content: string): string {
    // Remove complete <think>...</think> blocks
    let result = content.replace(/<think>[\s\S]*?<\/think>/g, "")
    // Also handle unclosed <think> at the end (still thinking)
    const thinkStart = result.lastIndexOf("<think>")
    if (thinkStart !== -1 && !result.slice(thinkStart).includes("</think>")) {
        result = result.slice(0, thinkStart)
    }
    return result
}

// Check if we're inside a <think> block (R1 reasoning in progress)
function isInsideThinkBlock(content: string): boolean {
    const lastThinkOpen = content.lastIndexOf("<think>")
    const lastThinkClose = content.lastIndexOf("</think>")
    return lastThinkOpen !== -1 && lastThinkOpen > lastThinkClose
}

// Check if content might contain a tool call (including partial tags)
function mightContainToolCall(content: string): boolean {
    // Strip think blocks first - tool calls inside <think> are not real
    const strippedContent = stripThinkBlocks(content)

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
        if (strippedContent.endsWith(pattern)) return true
    }

    // Check if we're inside a tool call (started but not ended)
    if (
        strippedContent.includes("<tool_call>") &&
        !strippedContent.includes("</tool_call>")
    ) {
        return true
    }

    return false
}

// Get content that's safe to output (excluding potential tool call patterns)
function getSafeOutput(content: string): string {
    // Strip think blocks first
    const strippedContent = stripThinkBlocks(content)

    // If we're still inside a think block, don't output anything yet
    if (isInsideThinkBlock(content)) {
        return ""
    }

    // If there's a tool call, don't output anything
    if (strippedContent.includes("<tool_call>")) {
        // Return content before the tool call tag
        const idx = strippedContent.indexOf("<tool_call>")
        return idx > 0 ? strippedContent.slice(0, idx).trim() : ""
    }

    // Check for partial tag at the end
    for (let i = 1; i <= 11; i++) {
        const suffix = strippedContent.slice(-i)
        if ("<tool_call>".startsWith(suffix)) {
            return strippedContent.slice(0, -i)
        }
    }

    return strippedContent
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

        // Log if this is a reasoning model (R1, R3, etc. - has <think> blocks)
        const isReasoningModel = /r\d/i.test(modelId) // Matches r1, R1, r3, R3, etc.
        if (isReasoningModel) {
            console.log(
                `[EdgeOne] Reasoning model detected - will handle <think> blocks`,
            )
        }

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
        let isXmlFormat = false // Whether the tool call is in XML format (disable streaming for XML)

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

                    // Debug: Log content chunks for R1 models
                    if (
                        content.includes("<think") ||
                        content.includes("</think") ||
                        content.includes("<tool")
                    ) {
                        console.log(
                            `[EdgeOne] Special tag detected in chunk: ${content.slice(0, 100)}...`,
                        )
                    }

                    if (toolCallStarted) {
                        // We're inside a tool call - accumulate and parse
                        toolCallArgsBuffer += content

                        // Check if tool call ended
                        if (toolCallArgsBuffer.includes("</tool_call>")) {
                            const rawContent = toolCallArgsBuffer
                                .replace("</tool_call>", "")
                                .trim()

                            // Determine tool name and arguments
                            let finalToolName = toolCallName
                            let finalArgs = ""

                            // First, check if it's XML-style format: <name>...</name><arguments>...</arguments>
                            if (isXmlToolCallFormat(rawContent)) {
                                console.log(
                                    "[EdgeOne] Detected XML-style tool call format",
                                )
                                const xmlParsed = parseXmlToolCall(rawContent)
                                if (xmlParsed) {
                                    finalToolName = xmlParsed.name
                                    finalArgs = xmlParsed.arguments
                                    console.log(
                                        `[EdgeOne] XML parsed - name: ${finalToolName}, args length: ${finalArgs.length}`,
                                    )
                                }
                            } else {
                                // Try JSON format
                                try {
                                    const parsed = JSON.parse(rawContent)

                                    // Check if it's standard format: {"name": "xxx", "arguments": {...}}
                                    if (parsed.name && parsed.arguments) {
                                        finalToolName = parsed.name
                                        finalArgs = JSON.stringify(
                                            parsed.arguments,
                                        )
                                    }
                                    // Check if it's edit_diagram format: {"operations": [...]}
                                    else if (parsed.operations) {
                                        finalToolName = "edit_diagram"
                                        finalArgs = rawContent // Use entire JSON as arguments
                                        console.log(
                                            "[EdgeOne] Detected edit_diagram from operations field",
                                        )
                                    }
                                    // Check if it's display_diagram format: {"xml": "..."}
                                    else if (parsed.xml) {
                                        finalToolName = "display_diagram"
                                        finalArgs = rawContent
                                    }
                                    // Fallback: use entire JSON as arguments
                                    else {
                                        finalToolName =
                                            finalToolName || "display_diagram"
                                        finalArgs = rawContent
                                    }
                                } catch {
                                    // JSON parse failed - check for raw XML content
                                    // Some models return raw XML like <xml>...</xml> or <mxCell>...</mxCell>
                                    const trimmedContent = rawContent.trim()
                                    if (
                                        trimmedContent.startsWith("<") &&
                                        (trimmedContent.includes("<mxCell") ||
                                            trimmedContent.includes("<xml"))
                                    ) {
                                        // Raw XML content - wrap it as display_diagram arguments
                                        finalToolName = "display_diagram"
                                        // Extract content from <xml>...</xml> wrapper if present
                                        let xmlContent = trimmedContent
                                        const xmlMatch = trimmedContent.match(
                                            /<xml[^>]*>([\s\S]*?)<\/xml>/,
                                        )
                                        if (xmlMatch) {
                                            xmlContent = xmlMatch[1].trim()
                                        }
                                        finalArgs = JSON.stringify({
                                            xml: xmlContent,
                                        })
                                        console.log(
                                            "[EdgeOne] Detected raw XML content, wrapped as display_diagram",
                                        )
                                    } else if (
                                        rawContent.includes('"operations"') ||
                                        rawContent.includes('"cell_id"')
                                    ) {
                                        finalToolName = "edit_diagram"
                                        finalArgs = rawContent
                                    } else {
                                        finalToolName =
                                            finalToolName || "display_diagram"
                                        finalArgs = rawContent
                                    }
                                }
                            }

                            // Send tool call start chunk (if not sent yet)
                            if (!toolCallName) {
                                controller.enqueue(
                                    new TextEncoder().encode(
                                        createToolCallChunk(
                                            toolCallId,
                                            finalToolName,
                                            "",
                                            0,
                                            true,
                                            false,
                                        ),
                                    ),
                                )
                            }

                            // Send arguments ONLY if we haven't been streaming them
                            // If argumentsStarted is true, we've already streamed the arguments incrementally
                            if (finalArgs && !argumentsStarted) {
                                controller.enqueue(
                                    new TextEncoder().encode(
                                        createToolCallChunk(
                                            toolCallId,
                                            finalToolName,
                                            finalArgs,
                                            0,
                                            false,
                                            false,
                                        ),
                                    ),
                                )
                            }

                            // Tool call complete - send finish chunk
                            controller.enqueue(
                                new TextEncoder().encode(
                                    createToolCallChunk(
                                        toolCallId,
                                        finalToolName,
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

                        // Detect format early: XML vs JSON vs Raw XML content
                        // XML format: <name>...</name><arguments>...</arguments>
                        // Raw XML: <xml>...</xml> or <mxCell>...</mxCell> (direct XML content)
                        // JSON format: {"name": "...", "arguments": {...}}
                        if (!isXmlFormat && !toolCallName) {
                            const trimmedBuffer = toolCallArgsBuffer.trim()
                            // Check for XML tool call format markers
                            if (
                                toolCallArgsBuffer.includes("<name>") ||
                                toolCallArgsBuffer.includes("<arguments>")
                            ) {
                                isXmlFormat = true
                                console.log(
                                    "[EdgeOne] Detected XML tool call format - will wait for complete content",
                                )
                            }
                            // Check for raw XML content (direct mxCell/xml tags)
                            else if (
                                trimmedBuffer.startsWith("<xml") ||
                                trimmedBuffer.startsWith("<mxCell")
                            ) {
                                isXmlFormat = true // Reuse flag to disable streaming
                                console.log(
                                    "[EdgeOne] Detected raw XML content - will wait for complete content",
                                )
                            }
                        }

                        // For XML format, wait for complete content before processing
                        // This ensures we don't stream partial/malformed data
                        if (isXmlFormat) {
                            // Just accumulate - processing happens when </tool_call> is detected
                            continue
                        }

                        // JSON format: Try to determine tool name early for streaming
                        if (!toolCallName) {
                            // Try JSON format: "name": "tool_name"
                            const jsonNameMatch = toolCallArgsBuffer.match(
                                /"name"\s*:\s*"([^"]+)"/,
                            )
                            if (jsonNameMatch) {
                                toolCallName = jsonNameMatch[1]
                            } else {
                                // Infer from content patterns
                                const lowerContent =
                                    toolCallArgsBuffer.toLowerCase()
                                if (
                                    lowerContent.includes('"operations"') ||
                                    lowerContent.includes('"cell_id"') ||
                                    lowerContent.includes('"operation"')
                                ) {
                                    toolCallName = "edit_diagram"
                                    console.log(
                                        "[EdgeOne] Inferred edit_diagram from content pattern",
                                    )
                                } else if (lowerContent.includes('"xml"')) {
                                    toolCallName = "display_diagram"
                                }
                            }

                            // If tool name determined, send start chunk
                            if (toolCallName) {
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
                            }
                        }

                        // Stream arguments incrementally if tool name is known (JSON format only)
                        if (toolCallName && !argumentsStarted) {
                            // Try JSON format: "arguments": {
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
                        } else if (toolCallName && argumentsStarted) {
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

                    // Skip if we're inside a <think> block (R1 reasoning)
                    if (isInsideThinkBlock(contentBuffer)) {
                        continue
                    }

                    // Strip think blocks before checking for tool call
                    const strippedBuffer = stripThinkBlocks(contentBuffer)

                    // Check if tool call started
                    if (strippedBuffer.includes("<tool_call>")) {
                        // Output any content before the tool call (excluding think blocks)
                        const idx = strippedBuffer.indexOf("<tool_call>")
                        const beforeToolCall = strippedBuffer
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
                        toolCallArgsBuffer = strippedBuffer.slice(
                            idx + "<tool_call>".length,
                        )
                        argumentsStarted = false
                        braceDepth = 0
                        lastStreamedArgsLength = 0
                        // Don't send start chunk yet - wait for more content to determine tool name
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
