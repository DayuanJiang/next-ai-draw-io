import {
    convertToModelMessages,
    createUIMessageStream,
    createUIMessageStreamResponse,
    stepCountIs,
    streamText,
} from "ai"
import { z } from "zod"
import { getAIModel } from "@/lib/ai-providers"
import { findCachedResponse } from "@/lib/cached-responses"
import {
    getTelemetryConfig,
    setTraceInput,
    setTraceOutput,
    wrapWithObserve,
} from "@/lib/langfuse"
import { getSystemPrompt } from "@/lib/system-prompts"

export const maxDuration = 300

// File upload limits (must match client-side)
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const MAX_FILES = 5

// Helper function to validate file parts in messages
function validateFileParts(messages: any[]): {
    valid: boolean
    error?: string
} {
    const lastMessage = messages[messages.length - 1]
    const fileParts =
        lastMessage?.parts?.filter((p: any) => p.type === "file") || []

    if (fileParts.length > MAX_FILES) {
        return {
            valid: false,
            error: `Too many files. Maximum ${MAX_FILES} allowed.`,
        }
    }

    for (const filePart of fileParts) {
        // Data URLs format: data:image/png;base64,<data>
        // Base64 increases size by ~33%, so we check the decoded size
        if (filePart.url?.startsWith("data:")) {
            const base64Data = filePart.url.split(",")[1]
            if (base64Data) {
                const sizeInBytes = Math.ceil((base64Data.length * 3) / 4)
                if (sizeInBytes > MAX_FILE_SIZE) {
                    return {
                        valid: false,
                        error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit.`,
                    }
                }
            }
        }
    }

    return { valid: true }
}

// Helper function to check if diagram is minimal/empty
function isMinimalDiagram(xml: string): boolean {
    const stripped = xml.replace(/\s/g, "")
    return !stripped.includes('id="2"')
}

// Helper function to fix tool call inputs for Bedrock API
// Bedrock requires toolUse.input to be a JSON object, not a string
function fixToolCallInputs(messages: any[]): any[] {
    return messages.map((msg) => {
        if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
            return msg
        }
        const fixedContent = msg.content.map((part: any) => {
            if (part.type === "tool-call") {
                if (typeof part.input === "string") {
                    try {
                        const parsed = JSON.parse(part.input)
                        return { ...part, input: parsed }
                    } catch {
                        // If parsing fails, wrap the string in an object
                        return { ...part, input: { rawInput: part.input } }
                    }
                }
                // Input is already an object, but verify it's not null/undefined
                if (part.input === null || part.input === undefined) {
                    return { ...part, input: {} }
                }
            }
            return part
        })
        return { ...msg, content: fixedContent }
    })
}

// Helper function to create cached stream response
function createCachedStreamResponse(xml: string): Response {
    const toolCallId = `cached-${Date.now()}`

    const stream = createUIMessageStream({
        execute: async ({ writer }) => {
            writer.write({ type: "start" })
            writer.write({
                type: "tool-input-start",
                toolCallId,
                toolName: "display_diagram",
            })
            writer.write({
                type: "tool-input-delta",
                toolCallId,
                inputTextDelta: xml,
            })
            writer.write({
                type: "tool-input-available",
                toolCallId,
                toolName: "display_diagram",
                input: { xml },
            })
            writer.write({ type: "finish" })
        },
    })

    return createUIMessageStreamResponse({ stream })
}

// Inner handler function
async function handleChatRequest(req: Request): Promise<Response> {
    // Check for access code
    const accessCodes =
        process.env.ACCESS_CODE_LIST?.split(",")
            .map((code) => code.trim())
            .filter(Boolean) || []
    if (accessCodes.length > 0) {
        const accessCodeHeader = req.headers.get("x-access-code")
        if (!accessCodeHeader || !accessCodes.includes(accessCodeHeader)) {
            return Response.json(
                {
                    error: "Invalid or missing access code. Please configure it in Settings.",
                },
                { status: 401 },
            )
        }
    }

    const { messages, xml, sessionId } = await req.json()

    // Get user IP for Langfuse tracking
    const forwardedFor = req.headers.get("x-forwarded-for")
    const userId = forwardedFor?.split(",")[0]?.trim() || "anonymous"

    // Validate sessionId for Langfuse (must be string, max 200 chars)
    const validSessionId =
        sessionId && typeof sessionId === "string" && sessionId.length <= 200
            ? sessionId
            : undefined

    // Extract user input text for Langfuse trace
    const currentMessage = messages[messages.length - 1]
    const userInputText =
        currentMessage?.parts?.find((p: any) => p.type === "text")?.text || ""

    // Update Langfuse trace with input, session, and user
    setTraceInput({
        input: userInputText,
        sessionId: validSessionId,
        userId: userId,
    })

    // === FILE VALIDATION START ===
    const fileValidation = validateFileParts(messages)
    if (!fileValidation.valid) {
        return Response.json({ error: fileValidation.error }, { status: 400 })
    }
    // === FILE VALIDATION END ===

    // === CACHE CHECK START ===
    const isFirstMessage = messages.length === 1
    const isEmptyDiagram = !xml || xml.trim() === "" || isMinimalDiagram(xml)

    // DEBUG: Log cache check conditions
    console.log("[Cache DEBUG] messages.length:", messages.length)
    console.log("[Cache DEBUG] isFirstMessage:", isFirstMessage)
    console.log("[Cache DEBUG] xml length:", xml?.length || 0)
    console.log("[Cache DEBUG] xml preview:", xml?.substring(0, 200))
    console.log("[Cache DEBUG] isEmptyDiagram:", isEmptyDiagram)

    if (isFirstMessage && isEmptyDiagram) {
        const lastMessage = messages[0]
        const textPart = lastMessage.parts?.find((p: any) => p.type === "text")
        const filePart = lastMessage.parts?.find((p: any) => p.type === "file")

        const cached = findCachedResponse(textPart?.text || "", !!filePart)

        if (cached) {
            return createCachedStreamResponse(cached.xml)
        }
    }
    // === CACHE CHECK END ===

    // Get AI model from environment configuration
    const { model, providerOptions, headers, modelId } = getAIModel()

    // Get the appropriate system prompt based on model (extended for Opus/Haiku 4.5)
    const systemMessage = getSystemPrompt(modelId)

    const lastMessage = messages[messages.length - 1]

    // Extract text from the last message parts
    const lastMessageText =
        lastMessage.parts?.find((part: any) => part.type === "text")?.text || ""

    // Extract file parts (images) from the last message
    const fileParts =
        lastMessage.parts?.filter((part: any) => part.type === "file") || []

    // User input only - XML is now in a separate cached system message
    const formattedUserInput = `User input:
"""md
${lastMessageText}
"""`

    // Convert UIMessages to ModelMessages and add system message
    const modelMessages = convertToModelMessages(messages)

    // Fix tool call inputs for Bedrock API (requires JSON objects, not strings)
    const fixedMessages = fixToolCallInputs(modelMessages)

    // Filter out messages with empty content arrays (Bedrock API rejects these)
    // This is a safety measure - ideally convertToModelMessages should handle all cases
    let enhancedMessages = fixedMessages.filter(
        (msg: any) =>
            msg.content && Array.isArray(msg.content) && msg.content.length > 0,
    )

    // Update the last message with user input only (XML moved to separate cached system message)
    if (enhancedMessages.length >= 1) {
        const lastModelMessage = enhancedMessages[enhancedMessages.length - 1]
        if (lastModelMessage.role === "user") {
            // Build content array with user input text and file parts
            const contentParts: any[] = [
                { type: "text", text: formattedUserInput },
            ]

            // Add image parts back
            for (const filePart of fileParts) {
                contentParts.push({
                    type: "image",
                    image: filePart.url,
                    mimeType: filePart.mediaType,
                })
            }

            enhancedMessages = [
                ...enhancedMessages.slice(0, -1),
                { ...lastModelMessage, content: contentParts },
            ]
        }
    }

    // Add cache point to the last assistant message in conversation history
    // This caches the entire conversation prefix for subsequent requests
    // Strategy: system (cached) + history with last assistant (cached) + new user message
    if (enhancedMessages.length >= 2) {
        // Find the last assistant message (should be second-to-last, before current user message)
        for (let i = enhancedMessages.length - 2; i >= 0; i--) {
            if (enhancedMessages[i].role === "assistant") {
                enhancedMessages[i] = {
                    ...enhancedMessages[i],
                    providerOptions: {
                        bedrock: { cachePoint: { type: "default" } },
                    },
                }
                break // Only cache the last assistant message
            }
        }
    }

    // System messages with multiple cache breakpoints for optimal caching:
    // - Breakpoint 1: Static instructions (~1500 tokens) - rarely changes
    // - Breakpoint 2: Current XML context - changes per diagram, but constant within a conversation turn
    // This allows: if only user message changes, both system caches are reused
    //              if XML changes, instruction cache is still reused
    const systemMessages = [
        // Cache breakpoint 1: Instructions (rarely change)
        {
            role: "system" as const,
            content: systemMessage,
            providerOptions: {
                bedrock: { cachePoint: { type: "default" } },
            },
        },
        // Cache breakpoint 2: Current diagram XML context
        {
            role: "system" as const,
            content: `Current diagram XML:\n"""xml\n${xml || ""}\n"""\nWhen using edit_diagram, COPY search patterns exactly from this XML - attribute order matters!`,
            providerOptions: {
                bedrock: { cachePoint: { type: "default" } },
            },
        },
    ]

    const allMessages = [...systemMessages, ...enhancedMessages]

    const result = streamText({
        model,
        stopWhen: stepCountIs(5),
        messages: allMessages,
        ...(providerOptions && { providerOptions }),
        ...(headers && { headers }),
        // Langfuse telemetry config (returns undefined if not configured)
        ...(getTelemetryConfig({ sessionId: validSessionId, userId }) && {
            experimental_telemetry: getTelemetryConfig({
                sessionId: validSessionId,
                userId,
            }),
        }),
        // Repair malformed tool calls (model sometimes generates invalid JSON with unescaped quotes)
        experimental_repairToolCall: async ({ toolCall }) => {
            // The toolCall.input contains the raw JSON string that failed to parse
            const rawJson =
                typeof toolCall.input === "string" ? toolCall.input : null

            if (rawJson) {
                try {
                    // Fix unescaped quotes: x="520" should be x=\"520\"
                    const fixed = rawJson.replace(
                        /([a-zA-Z])="(\d+)"/g,
                        '$1=\\"$2\\"',
                    )
                    const parsed = JSON.parse(fixed)
                    return {
                        type: "tool-call" as const,
                        toolCallId: toolCall.toolCallId,
                        toolName: toolCall.toolName,
                        input: JSON.stringify(parsed),
                    }
                } catch {
                    // Repair failed, return null
                }
            }
            return null
        },
        onFinish: ({ text, usage }) => {
            // Pass usage to Langfuse (Bedrock streaming doesn't auto-report tokens to telemetry)
            setTraceOutput(text, {
                promptTokens: usage?.inputTokens,
                completionTokens: usage?.outputTokens,
            })
        },
        tools: {
            // Client-side tool that will be executed on the client
            display_diagram: {
                description: `Display a diagram on draw.io. Pass the XML content inside <root> tags.

VALIDATION RULES (XML will be rejected if violated):
1. All mxCell elements must be DIRECT children of <root> - never nested
2. Every mxCell needs a unique id
3. Every mxCell (except id="0") needs a valid parent attribute
4. Edge source/target must reference existing cell IDs
5. Escape special chars in values: &lt; &gt; &amp; &quot;
6. Always start with: <mxCell id="0"/><mxCell id="1" parent="0"/>

Example with swimlanes and edges (note: all mxCells are siblings):
<root>
  <mxCell id="0"/>
  <mxCell id="1" parent="0"/>
  <mxCell id="lane1" value="Frontend" style="swimlane;" vertex="1" parent="1">
    <mxGeometry x="40" y="40" width="200" height="200" as="geometry"/>
  </mxCell>
  <mxCell id="step1" value="Step 1" style="rounded=1;" vertex="1" parent="lane1">
    <mxGeometry x="20" y="60" width="160" height="40" as="geometry"/>
  </mxCell>
  <mxCell id="lane2" value="Backend" style="swimlane;" vertex="1" parent="1">
    <mxGeometry x="280" y="40" width="200" height="200" as="geometry"/>
  </mxCell>
  <mxCell id="step2" value="Step 2" style="rounded=1;" vertex="1" parent="lane2">
    <mxGeometry x="20" y="60" width="160" height="40" as="geometry"/>
  </mxCell>
  <mxCell id="edge1" style="edgeStyle=orthogonalEdgeStyle;endArrow=classic;" edge="1" parent="1" source="step1" target="step2">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>
</root>

Notes:
- For AWS diagrams, use **AWS 2025 icons**.
- For animated connectors, add "flowAnimation=1" to edge style.
`,
                inputSchema: z.object({
                    xml: z
                        .string()
                        .describe("XML string to be displayed on draw.io"),
                }),
            },
            edit_diagram: {
                description: `Edit specific parts of the current diagram by replacing exact line matches. Use this tool to make targeted fixes without regenerating the entire XML.
CRITICAL: Copy-paste the EXACT search pattern from the "Current diagram XML" in system context. Do NOT reorder attributes or reformat - the attribute order in draw.io XML varies and you MUST match it exactly.
IMPORTANT: Keep edits concise:
- COPY the exact mxCell line from the current XML (attribute order matters!)
- Only include the lines that are changing, plus 1-2 surrounding lines for context if needed
- Break large changes into multiple smaller edits
- Each search must contain complete lines (never truncate mid-line)
- First match only - be specific enough to target the right element

⚠️ JSON ESCAPING: Every " inside string values MUST be escaped as \\". Example: x=\\"100\\" y=\\"200\\" - BOTH quotes need backslashes!`,
                inputSchema: z.object({
                    edits: z
                        .array(
                            z.object({
                                search: z
                                    .string()
                                    .describe(
                                        "EXACT lines copied from current XML (preserve attribute order!)",
                                    ),
                                replace: z
                                    .string()
                                    .describe("Replacement lines"),
                            }),
                        )
                        .describe(
                            "Array of search/replace pairs to apply sequentially",
                        ),
                }),
            },
        },
        ...(process.env.TEMPERATURE !== undefined && {
            temperature: parseFloat(process.env.TEMPERATURE),
        }),
    })

    return result.toUIMessageStreamResponse({
        messageMetadata: ({ part }) => {
            if (part.type === "finish") {
                const usage = (part as any).totalUsage
                if (!usage) {
                    console.warn(
                        "[messageMetadata] No usage data in finish part",
                    )
                    return undefined
                }
                // Total input = non-cached + cached (these are separate counts)
                // Note: cacheWriteInputTokens is not available on finish part
                const totalInputTokens =
                    (usage.inputTokens ?? 0) + (usage.cachedInputTokens ?? 0)
                return {
                    inputTokens: totalInputTokens,
                    outputTokens: usage.outputTokens ?? 0,
                }
            }
            return undefined
        },
    })
}

// Wrap handler with error handling
async function safeHandler(req: Request): Promise<Response> {
    try {
        return await handleChatRequest(req)
    } catch (error) {
        console.error("Error in chat route:", error)
        return Response.json(
            { error: "Internal server error" },
            { status: 500 },
        )
    }
}

// Wrap with Langfuse observe (if configured)
const observedHandler = wrapWithObserve(safeHandler)

export async function POST(req: Request) {
    return observedHandler(req)
}
