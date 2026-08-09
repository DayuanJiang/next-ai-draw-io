import {
    APICallError,
    convertToModelMessages,
    createUIMessageStream,
    createUIMessageStreamResponse,
    InvalidToolInputError,
    LoadAPIKeyError,
    stepCountIs,
    streamText,
} from "ai"
import fs from "fs/promises"
import { jsonrepair } from "jsonrepair"
import path from "path"
import { z } from "zod"
import {
    getAIModel,
    SINGLE_SYSTEM_PROVIDERS,
    supportsPromptCaching,
} from "@/lib/ai-providers"
import { findCachedResponse } from "@/lib/cached-responses"
import {
    isMinimalDiagram,
    replaceHistoricalToolInputs,
    validateFileParts,
} from "@/lib/chat-helpers"
import { OperationSchema, searchStencils } from "@/lib/diagram-engine"
import {
    checkAndIncrementRequest,
    isQuotaEnabled,
    recordTokenUsage,
} from "@/lib/dynamo-quota-manager"
import {
    getTelemetryConfig,
    setTraceInput,
    setTraceOutput,
    wrapWithObserve,
} from "@/lib/langfuse"
import { findServerModelById } from "@/lib/server-model-config"
import { getSystemPrompt } from "@/lib/system-prompts"
import { getUserIdFromRequest } from "@/lib/user-id"

export const maxDuration = 120

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

    const body = await req.json()
    const { messages, xml, previousXml, sessionId } = body
    const customSystemMessage =
        typeof body.customSystemMessage === "string"
            ? body.customSystemMessage.slice(0, 5000)
            : ""

    // Get user ID for Langfuse tracking and quota
    const userId = getUserIdFromRequest(req)

    // Validate sessionId for Langfuse (must be string, max 200 chars)
    const validSessionId =
        sessionId && typeof sessionId === "string" && sessionId.length <= 200
            ? sessionId
            : undefined

    // Extract user input text for Langfuse trace
    // Find the last USER message, not just the last message (which could be assistant in multi-step tool flows)
    const lastUserMessage = [...messages]
        .reverse()
        .find((m: any) => m.role === "user")
    const userInputText =
        lastUserMessage?.parts?.find((p: any) => p.type === "text")?.text || ""

    // Update Langfuse trace with input, session, and user
    setTraceInput({
        input: userInputText,
        sessionId: validSessionId,
        userId: userId,
    })

    // === SERVER-SIDE QUOTA CHECK START ===
    // Quota is opt-in: only enabled when DYNAMODB_QUOTA_TABLE env var is set
    const hasOwnApiKey = !!(
        req.headers.get("x-ai-provider") &&
        (req.headers.get("x-ai-api-key") ||
            req.headers.get("x-aws-access-key-id") ||
            req.headers.get("x-vertex-api-key"))
    )

    // Skip quota check if: quota disabled, user has own API key, or is anonymous
    if (isQuotaEnabled() && !hasOwnApiKey && userId !== "anonymous") {
        const quotaCheck = await checkAndIncrementRequest(userId, {
            requests: Number(process.env.DAILY_REQUEST_LIMIT) || 10,
            tokens: Number(process.env.DAILY_TOKEN_LIMIT) || 200000,
            tpm: Number(process.env.TPM_LIMIT) || 20000,
        })
        if (!quotaCheck.allowed) {
            return Response.json(
                {
                    error: quotaCheck.error,
                    type: quotaCheck.type,
                    used: quotaCheck.used,
                    limit: quotaCheck.limit,
                },
                { status: 429 },
            )
        }
    }
    // === SERVER-SIDE QUOTA CHECK END ===

    // === FILE VALIDATION START ===
    const fileValidation = validateFileParts(messages)
    if (!fileValidation.valid) {
        return Response.json({ error: fileValidation.error }, { status: 400 })
    }
    // === FILE VALIDATION END ===

    // === CACHE CHECK START ===
    const isFirstMessage = messages.length === 1
    const isEmptyDiagram = !xml || xml.trim() === "" || isMinimalDiagram(xml)

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

    // Read client AI provider overrides from headers
    const provider = req.headers.get("x-ai-provider")
    let baseUrl = req.headers.get("x-ai-base-url")
    const selectedModelId = req.headers.get("x-selected-model-id")

    // For EdgeOne provider, construct full URL from request origin
    // because createOpenAI needs absolute URL, not relative path
    if (provider === "edgeone" && !baseUrl) {
        const origin = req.headers.get("origin") || new URL(req.url).origin
        baseUrl = `${origin}/api/edgeai`
    }

    // Get cookie header for EdgeOne authentication (eo_token, eo_time)
    const cookieHeader = req.headers.get("cookie")

    // Check if this is a server model with custom env var names
    let serverModelConfig: {
        apiKeyEnv?: string | string[]
        baseUrlEnv?: string
        provider?: string
    } = {}
    if (selectedModelId?.startsWith("server:")) {
        const serverModel = await findServerModelById(selectedModelId)
        console.log(
            `[Server Model Lookup] ID: ${selectedModelId}, Found: ${!!serverModel}, Provider: ${serverModel?.provider}`,
        )
        if (serverModel) {
            serverModelConfig = {
                apiKeyEnv: serverModel.apiKeyEnv,
                baseUrlEnv: serverModel.baseUrlEnv,
                // Use actual provider from config (client header may have incorrect value due to ID format change)
                provider: serverModel.provider,
            }
        }
    }

    const clientOverrides = {
        // Server model provider takes precedence over client header
        provider: serverModelConfig.provider || provider,
        baseUrl,
        apiKey: req.headers.get("x-ai-api-key"),
        modelId: req.headers.get("x-ai-model"),
        // AWS Bedrock credentials
        awsAccessKeyId: req.headers.get("x-aws-access-key-id"),
        awsSecretAccessKey: req.headers.get("x-aws-secret-access-key"),
        awsRegion: req.headers.get("x-aws-region"),
        awsSessionToken: req.headers.get("x-aws-session-token"),
        // Server model custom env var names
        ...serverModelConfig,
        // Vertex AI credentials (Express Mode)
        vertexApiKey: req.headers.get("x-vertex-api-key"),
        // Pass cookies for EdgeOne Pages authentication
        ...(provider === "edgeone" &&
            cookieHeader && {
                headers: { cookie: cookieHeader },
            }),
    }

    // Read minimal style preference from header
    const minimalStyle = req.headers.get("x-minimal-style") === "true"

    console.log(
        `[Client Overrides] provider: ${clientOverrides.provider}, modelId: ${clientOverrides.modelId}`,
    )

    // Get AI model with optional client overrides
    const {
        model,
        providerOptions,
        headers,
        modelId,
        provider: resolvedProvider,
    } = getAIModel(clientOverrides)

    // Check if model supports prompt caching
    const shouldCache = supportsPromptCaching(modelId)
    console.log(
        `[Prompt Caching] ${shouldCache ? "ENABLED" : "DISABLED"} for model: ${modelId}`,
    )

    // Get the appropriate system prompt based on model (extended for Opus/Haiku 4.5)
    const systemMessage = getSystemPrompt(modelId, minimalStyle)
    const finalSystemMessage = customSystemMessage
        ? `${systemMessage}\n\n## Custom Instructions\n${customSystemMessage}`
        : systemMessage

    // Extract file parts (images) from the last user message
    const fileParts =
        lastUserMessage?.parts?.filter((part: any) => part.type === "file") ||
        []

    // Note: we used to pre-emptively reject images for models we guessed were
    // text-only (by name matching). That heuristic misfired on newer models
    // (see issue #874), so we now let the request through and surface the real
    // provider error if the model genuinely can't accept images.

    // User input only - XML is now in a separate cached system message
    const formattedUserInput = `User input:
"""md
${userInputText}
"""`

    // Convert UIMessages to ModelMessages and add system message
    const modelMessages = await convertToModelMessages(messages)

    // DEBUG: Log incoming messages structure
    console.log("[route.ts] Incoming messages count:", messages.length)
    messages.forEach((msg: any, idx: number) => {
        console.log(
            `[route.ts] Message ${idx} role:`,
            msg.role,
            "parts count:",
            msg.parts?.length,
        )
        if (msg.parts) {
            msg.parts.forEach((part: any, partIdx: number) => {
                if (
                    part.type === "tool-invocation" ||
                    part.type === "tool-result"
                ) {
                    console.log(`[route.ts]   Part ${partIdx}:`, {
                        type: part.type,
                        toolName: part.toolName,
                        hasInput: !!part.input,
                        inputType: typeof part.input,
                        inputKeys:
                            part.input && typeof part.input === "object"
                                ? Object.keys(part.input)
                                : null,
                    })
                }
            })
        }
    })

    // Replace historical tool call XML with placeholders to reduce tokens
    // Disabled by default - some models (e.g. minimax) copy placeholders instead of generating XML
    const enableHistoryReplace =
        process.env.ENABLE_HISTORY_XML_REPLACE === "true"
    const placeholderMessages = enableHistoryReplace
        ? replaceHistoricalToolInputs(modelMessages)
        : modelMessages

    // Filter out messages with empty content arrays (Bedrock API rejects these)
    // This is a safety measure - ideally convertToModelMessages should handle all cases
    let enhancedMessages = placeholderMessages.filter(
        (msg: any) =>
            msg.content && Array.isArray(msg.content) && msg.content.length > 0,
    )

    // Filter out tool-calls with invalid inputs (from failed repair or interrupted streaming)
    // Bedrock API rejects messages where toolUse.input is not a valid JSON object
    enhancedMessages = enhancedMessages
        .map((msg: any) => {
            if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
                return msg
            }
            const filteredContent = msg.content.filter((part: any) => {
                if (part.type === "tool-call") {
                    // Check if input is a valid object (not null, undefined, or empty)
                    if (
                        !part.input ||
                        typeof part.input !== "object" ||
                        Object.keys(part.input).length === 0
                    ) {
                        console.warn(
                            `[route.ts] Filtering out tool-call with invalid input:`,
                            { toolName: part.toolName, input: part.input },
                        )
                        return false
                    }
                }
                return true
            })
            return { ...msg, content: filteredContent }
        })
        .filter((msg: any) => msg.content && msg.content.length > 0)

    // DEBUG: Log modelMessages structure (what's being sent to AI)
    console.log("[route.ts] Model messages count:", enhancedMessages.length)
    enhancedMessages.forEach((msg: any, idx: number) => {
        console.log(
            `[route.ts] ModelMsg ${idx} role:`,
            msg.role,
            "content count:",
            msg.content?.length,
        )
        if (msg.content) {
            msg.content.forEach((part: any, partIdx: number) => {
                if (part.type === "tool-call" || part.type === "tool-result") {
                    console.log(`[route.ts]   Content ${partIdx}:`, {
                        type: part.type,
                        toolName: part.toolName,
                        hasInput: !!part.input,
                        inputType: typeof part.input,
                        inputValue:
                            part.input === undefined
                                ? "undefined"
                                : part.input === null
                                  ? "null"
                                  : "object",
                    })
                }
            })
        }
    })

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
    if (shouldCache && enhancedMessages.length >= 2) {
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
    // - Breakpoint 1: System instructions + custom instructions - changes when user updates custom system message
    // - Breakpoint 2: Current XML context - changes per diagram, but constant within a conversation turn
    // Some providers (e.g. MiniMax) don't support multiple system messages
    // Merge them into a single system message for compatibility
    // Also merge for OpenAI-compatible providers with custom base URLs (e.g. vLLM, LMStudio)
    // because open-source model chat templates (Qwen, Llama, etc.) typically reject multiple system messages
    const isCustomOpenAIEndpoint =
        resolvedProvider === "openai" &&
        !!(
            baseUrl ||
            process.env.OPENAI_BASE_URL ||
            (serverModelConfig.baseUrlEnv &&
                process.env[serverModelConfig.baseUrlEnv])
        )
    const isSingleSystemProvider =
        SINGLE_SYSTEM_PROVIDERS.has(resolvedProvider) || isCustomOpenAIEndpoint

    const xmlContext = `${
        previousXml
            ? `Previous diagram XML (before user's last message):
"""xml
${previousXml}
"""

`
            : ""
    }Current diagram XML (AUTHORITATIVE - the source of truth):
"""xml
${xml || ""}
"""

IMPORTANT: The "Current diagram XML" is the SINGLE SOURCE OF TRUTH for what's on the canvas right now. The user can manually add, delete, or modify shapes directly in draw.io. Always count and describe elements based on the CURRENT XML, not on what you previously generated. If both previous and current XML are shown, compare them to understand what the user changed. When using edit_diagram, COPY search patterns exactly from the CURRENT XML - attribute order matters!`

    const systemMessages = isSingleSystemProvider
        ? [
              {
                  role: "system" as const,
                  content: `${finalSystemMessage}\n\n${xmlContext}`,
              },
          ]
        : [
              // Cache breakpoint 1: Instructions (+ optional custom instructions)
              {
                  role: "system" as const,
                  content: finalSystemMessage,
                  ...(shouldCache && {
                      providerOptions: {
                          bedrock: { cachePoint: { type: "default" } },
                      },
                  }),
              },
              // Cache breakpoint 2: Previous and Current diagram XML context
              {
                  role: "system" as const,
                  content: xmlContext,
                  ...(shouldCache && {
                      providerOptions: {
                          bedrock: { cachePoint: { type: "default" } },
                      },
                  }),
              },
          ]

    const allMessages = [...systemMessages, ...enhancedMessages]

    const result = streamText({
        model,
        abortSignal: req.signal,
        ...(process.env.MAX_OUTPUT_TOKENS && {
            maxOutputTokens: parseInt(process.env.MAX_OUTPUT_TOKENS, 10),
        }),
        stopWhen: stepCountIs(5),
        // Repair truncated tool calls when maxOutputTokens is reached mid-JSON
        experimental_repairToolCall: async ({ toolCall, error }) => {
            // DEBUG: Log what we're trying to repair
            console.log(`[repairToolCall] Tool: ${toolCall.toolName}`)
            console.log(
                `[repairToolCall] Error: ${error.name} - ${error.message}`,
            )
            console.log(`[repairToolCall] Input type: ${typeof toolCall.input}`)
            console.log(`[repairToolCall] Input value:`, toolCall.input)

            // Only attempt repair for invalid tool input (broken JSON from truncation)
            if (
                error instanceof InvalidToolInputError ||
                error.name === "AI_InvalidToolInputError"
            ) {
                try {
                    // Pre-process to fix common LLM JSON errors that jsonrepair can't handle
                    let inputToRepair = toolCall.input
                    if (typeof inputToRepair === "string") {
                        // Fix `:=` instead of `: ` (LLM sometimes generates this)
                        inputToRepair = inputToRepair.replace(/:=/g, ": ")
                        // Fix `= "` instead of `: "`
                        inputToRepair = inputToRepair.replace(/=\s*"/g, ': "')
                        // Fix inconsistent quote escaping in XML attributes within JSON strings
                        // Pattern: attribute="value\" where opening quote is unescaped but closing is escaped
                        // Example: y="-20\" should be y=\"-20\"
                        inputToRepair = inputToRepair.replace(
                            /(\w+)="([^"]*?)\\"/g,
                            '$1=\\"$2\\"',
                        )
                    }
                    // Use jsonrepair to fix truncated JSON
                    const repairedInput = jsonrepair(inputToRepair)
                    console.log(
                        `[repairToolCall] Repaired truncated JSON for tool: ${toolCall.toolName}`,
                    )
                    return { ...toolCall, input: repairedInput }
                } catch (repairError) {
                    console.warn(
                        `[repairToolCall] Failed to repair JSON for tool: ${toolCall.toolName}`,
                        repairError,
                    )
                    // Return a placeholder input to avoid API errors in multi-step
                    // The tool will fail gracefully on client side
                    if (toolCall.toolName === "edit_diagram") {
                        return {
                            ...toolCall,
                            input: {
                                operations: [],
                                _error: "JSON repair failed - no operations to apply",
                            },
                        }
                    }
                    if (toolCall.toolName === "display_diagram") {
                        return {
                            ...toolCall,
                            input: {
                                xml: "",
                                _error: "JSON repair failed - empty diagram",
                            },
                        }
                    }
                    return null
                }
            }
            // Don't attempt to repair other errors (like NoSuchToolError)
            return null
        },
        messages: allMessages,
        ...(providerOptions && { providerOptions }), // This now includes all reasoning configs
        ...(headers && { headers }),
        // Langfuse telemetry config (returns undefined if not configured)
        ...(getTelemetryConfig({ sessionId: validSessionId, userId }) && {
            experimental_telemetry: getTelemetryConfig({
                sessionId: validSessionId,
                userId,
            }),
        }),
        onFinish: ({ text, totalUsage }) => {
            // AI SDK 6 telemetry auto-reports token usage on its spans
            setTraceOutput(text)

            // Record token usage for server-side quota tracking (if enabled)
            // Use totalUsage (cumulative across all steps) instead of usage (final step only)
            // Include all 4 token types: input, output, cache read, cache write
            if (
                isQuotaEnabled() &&
                !hasOwnApiKey &&
                userId !== "anonymous" &&
                totalUsage
            ) {
                const totalTokens =
                    (totalUsage.inputTokens || 0) +
                    (totalUsage.outputTokens || 0) +
                    (totalUsage.cachedInputTokens || 0) +
                    (totalUsage.inputTokenDetails?.cacheWriteTokens || 0)
                recordTokenUsage(userId, totalTokens)
            }
        },
        tools: {
            // Client-side tool that will be executed on the client
            display_diagram: {
                description: `Display a diagram by writing raw draw.io XML yourself. This is the EXCEPTION, for diagrams whose exact positions are the content (UI mockups, floor plans, circuit/P&ID, seating charts, Gantt, illustrations). For flowcharts and anything nodes-and-arrows use draw_graph; for nesting-based diagrams (cloud architecture, swimlanes, sequence, mind maps) use restructure_diagram. Pass ONLY the mxCell elements - wrapper tags and root cells are added automatically.

VALIDATION RULES (XML will be rejected if violated):
1. Generate ONLY mxCell elements - NO wrapper tags (<mxfile>, <mxGraphModel>, <root>)
2. Do NOT include root cells (id="0" or id="1") - they are added automatically
3. All mxCell elements must be siblings - never nested
4. Every mxCell needs a unique id (start from "2")
5. Every mxCell needs a valid parent attribute (use "1" for top-level)
6. Escape special chars in values: &lt; &gt; &amp; &quot;

Example (generate ONLY this - no wrapper tags):
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
                description: `Edit the current diagram by ID-based operations (update/add/delete cells).

Operations:
- update: Replace an existing cell by its id. Provide cell_id and complete new_xml.
- add: Add a new cell. Provide cell_id (new unique id) and new_xml.
- delete: Remove a cell. Cascade is automatic: children AND edges (source/target) are auto-deleted. Only specify ONE cell_id.

For update/add, new_xml must be a complete mxCell element including mxGeometry.

⚠️ JSON ESCAPING: Every " inside new_xml MUST be escaped as \\". Example: id=\\"5\\" value=\\"Label\\"

Example - Add a rectangle:
{"operations": [{"operation": "add", "cell_id": "rect-1", "new_xml": "<mxCell id=\\"rect-1\\" value=\\"Hello\\" style=\\"rounded=0;\\" vertex=\\"1\\" parent=\\"1\\"><mxGeometry x=\\"100\\" y=\\"100\\" width=\\"120\\" height=\\"60\\" as=\\"geometry\\"/></mxCell>"}]}

Example - Delete container (children & edges auto-deleted):
{"operations": [{"operation": "delete", "cell_id": "2"}]}`,
                inputSchema: z.object({
                    operations: z
                        .array(
                            z.object({
                                operation: z
                                    .enum(["update", "add", "delete"])
                                    .describe(
                                        "Operation to perform: add, update, or delete",
                                    ),
                                cell_id: z
                                    .string()
                                    .describe(
                                        "The id of the mxCell. Must match the id attribute in new_xml.",
                                    ),
                                new_xml: z
                                    .string()
                                    .optional()
                                    .describe(
                                        "Complete mxCell XML element (required for update/add)",
                                    ),
                            }),
                        )
                        .describe("Array of operations to apply"),
                }),
            },
            append_diagram: {
                description: `Continue generating diagram XML when previous display_diagram output was truncated due to length limits.

WHEN TO USE: Only call this tool after display_diagram was truncated (you'll see an error message about truncation).

CRITICAL INSTRUCTIONS:
1. Do NOT include any wrapper tags - just continue the mxCell elements
2. Continue from EXACTLY where your previous output stopped
3. Complete the remaining mxCell elements
4. If still truncated, call append_diagram again with the next fragment

Example: If previous output ended with '<mxCell id="x" style="rounded=1', continue with ';" vertex="1">...' and complete the remaining elements.`,
                inputSchema: z.object({
                    xml: z
                        .string()
                        .describe(
                            "Continuation XML fragment to append (NO wrapper tags)",
                        ),
                }),
            },
            restructure_diagram: {
                description: `Build or edit a diagram by declaring STRUCTURE. The engine computes every coordinate.

PREFER THIS over display_diagram/edit_diagram whenever the diagram's meaning is in nesting or in a fixed frame: cloud architecture, swimlane/BPMN, sequence diagrams, mind maps, org charts — AND poster-style layouts: paper summaries, cheat sheets, infographics, comparison sheets. You declare what contains what; layout, sizing, alignment and arrow routing are computed. Containers always fit their contents and siblings never overlap, so the usual layout problems cannot occur.

The layout model is FLEXBOX. row/col containers nest freely; a box with internal structure is an invisible col container (pad 10-14) holding smaller boxes. Three knobs: grow (columns split leftover width by weight — grow 3 / grow 2 gives a 3:2 page), align "stretch" (child fills the cross axis — headings, bars and body boxes should almost always stretch or the column looks ragged), pad (8-14 tight card, default 24 roomy section). Labels take inline HTML — <b>, <i>, <font color="#...">, <br> — so one box carries a bold keyword, a second paragraph, a coloured verdict line. Emoji in headings (💡 Core Idea) read instantly.

For a POSTER (paper summary, cheat sheet): one col container as the page; a banner box as the masthead with align stretch (do NOT also use set_title — the banner IS the title); a muted box for the byline; a row container holding 2-4 col containers with grow weights as columns; each section a heading-role box + content boxes, all align stretch. Give each section a distinct group name — sections sharing a group share a hue, so groups are how the poster gets its colour. Use roles on boxes: callout for the core idea, good/bad for verdict pairs, metric for the headline number, muted for fine print. A comparison card: add_container dir=col gap=8 pad=12 grow=1 role=bad, then a bold title box, the body text, a role=bad answer bar (all align stretch), and a coloured "<font color=\\"#B85450\\"><b>✗ Often Wrong</b></font>" verdict with align start.

Never write coordinates, mxCell XML, or style strings. Look AWS icon names up with search_stencils first — an invented name is rejected with suggestions.

Operations are applied in order, so you can add a container and fill it in the same call:
{"operations":[
  {"op":"add_container","id":"vpc","label":"VPC 10.0.0.0/16","dir":"col","gname":"group_vpc"},
  {"op":"add_icon","id":"alb","parent":"vpc","name":"application_load_balancer","label":"ALB"},
  {"op":"add_icon","id":"ec2","parent":"vpc","name":"ec2","label":"EC2"},
  {"op":"link","source":"alb","target":"ec2","label":"route","step":1}
]}

Editing an existing diagram: the structure is re-read from the canvas each time, INCLUDING anything the user moved or recoloured by hand. To add one service, send one operation — do not re-send the diagram.

CONTAINERS — pick by what the diagram means:

add_container: children stacked along one axis. dir "row" side by side, "col" one above the next. An empty label makes an invisible grouping wrapper (use it to group columns without drawing another frame). gname is an AWS group stencil (group_region, group_vpc, group_availability_zone, group_subnet, group_account) — omit it for a plain titled frame.

add_grid: packs children into cols columns. Use it to pack 3-8 related icons into one labelled area rather than giving each its own frame.

add_pool: a SWIMLANE diagram. lanes are the roles, top to bottom. Set orientation to "vertical" for vertical swimlanes, where the lanes become columns and the flow runs downwards. Each step is an add_box with lane (which role owns it) and col (which step of the process it is); columns advance left to right and an empty cell means that role does nothing at that point. Two steps with the same col happen at the same time. phases optionally labels groups of columns.
{"operations":[
  {"op":"add_pool","id":"p","label":"Expense claim","lanes":["Employee","Manager","Finance"],"phases":["Submit","Review","Pay"]},
  {"op":"add_box","id":"fill","parent":"p","label":"Fill form","lane":0,"col":0,"shape":"terminator"},
  {"op":"add_box","id":"rev","parent":"p","label":"Review","lane":1,"col":1},
  {"op":"add_box","id":"ok","parent":"p","label":"Approved?","lane":1,"col":2,"shape":"decision"},
  {"op":"add_box","id":"pay","parent":"p","label":"Pay out","lane":2,"col":3},
  {"op":"link","source":"fill","target":"rev"},{"op":"link","source":"rev","target":"ok"},
  {"op":"link","source":"ok","target":"pay","label":"yes"}
]}

add_sequence: a SEQUENCE diagram. One add_box per participant, left to right in the order they first act; the engine draws each one's lifeline. Every message is a link with a step number giving its order — number them 1, 2, 3… as they happen, and make a reply its own link back. A participant calling itself is a link from a node to itself.
{"operations":[
  {"op":"add_sequence","id":"s","label":"Login flow"},
  {"op":"add_box","id":"u","parent":"s","label":"User"},
  {"op":"add_box","id":"api","parent":"s","label":"API"},
  {"op":"add_box","id":"db","parent":"s","label":"Database"},
  {"op":"link","source":"u","target":"api","label":"POST /login","step":1},
  {"op":"link","source":"api","target":"db","label":"find user","step":2},
  {"op":"link","source":"db","target":"api","label":"user record","step":3},
  {"op":"link","source":"api","target":"u","label":"JWT","step":4}
]}

add_radial: a MIND MAP or ORG CHART. Add every node with the radial container as its parent — a FLAT list, never nested inside another box — and let the links carry the hierarchy: link parent to child. The node nothing points at becomes the centre. spread "radial" fans branches out both sides (a mind map); "down" hangs everything below its parent (an org chart, where a reporting line only reads correctly downwards).
{"operations":[
  {"op":"add_radial","id":"o","label":"","spread":"down"},
  {"op":"add_box","id":"ceo","parent":"o","label":"CEO"},
  {"op":"add_box","id":"cto","parent":"o","label":"CTO"},
  {"op":"add_box","id":"lead","parent":"o","label":"Platform Lead"},
  {"op":"link","source":"ceo","target":"cto"},{"op":"link","source":"cto","target":"lead"}
]}

BOX SHAPES: add_box takes shape — "decision" for a branch (diamond), "terminator" for a start/end point, "data" for input or output, "document" for a report, "round" for a soft-edged step. Use them; a reader takes a diamond to mean a choice.`,
                inputSchema: z.object({
                    operations: z
                        .array(OperationSchema)
                        .describe("Structural operations, applied in order"),
                }),
            },
            draw_graph: {
                description: `Draw a FLOWCHART or other arrow-driven diagram from nodes and arrows alone. Give NO positions and NO nesting.

USE THIS FOR: flowcharts, decision trees, process and approval flows, CI/CD pipelines, state machines, git/branching workflows, dependency graphs, ER diagrams, site maps, data-flow diagrams, and any "illustrate how X works" where X is a sequence of steps or states.

The engine reads the arrows to work out how many rows the diagram has, which nodes share a row, and who goes left of whom — chosen to keep arrows from crossing each other or running through unrelated boxes. Do NOT lay these out yourself with nested containers or XML: declaring a flowchart as nesting puts every step in one column, so each branch has to jump over the step beside it.

Loops are fine — an arrow back to an earlier step is drawn as a loop. So are arrows that skip ahead several steps.

{"nodes":[
  {"id":"start","label":"Order received","shape":"terminator"},
  {"id":"check","label":"Amount > $1000?","shape":"decision"},
  {"id":"mgr","label":"Manager approval"},
  {"id":"auto","label":"Auto-approve"},
  {"id":"ship","label":"Ship order"}
],"edges":[
  {"source":"start","target":"check"},
  {"source":"check","target":"mgr","label":"yes"},
  {"source":"check","target":"auto","label":"no"},
  {"source":"mgr","target":"ship"},
  {"source":"auto","target":"ship"}
],"title":"Order Approval"}

Replaces the whole diagram, because one new arrow can change which row several nodes belong in. To edit afterwards, use restructure_diagram with the ids from the outline this returns.

Shapes say what a node IS: "decision" for a branch (diamond), "terminator" for a start or end point, "data" for input or output, "document" for a report, "round" for a soft-edged step, "cylinder" for a database, "queue" for a message queue, "person" for an actor or user, "cloud" for an external system, "hexagon" for a service, "ellipse" for a concept, "box" (default) for a plain step. Any other draw.io shape token also works verbatim. Set icon instead of shape to draw a node as a catalog icon — look the name up with search_stencils first.

Grouping: when the nodes fall into natural zones (remote vs local, frontend vs backend, roles, phases), set the same group name on each zone's nodes. The engine colours each group consistently from its own palette. Name groups by meaning; never pick hex colours.`,
                inputSchema: z.object({
                    nodes: z
                        .array(
                            z.object({
                                id: z.string(),
                                label: z.string(),
                                shape: z
                                    .string()
                                    .optional()
                                    .describe(
                                        "What the node IS: decision, terminator, round, data, document, cylinder (database), queue, person (actor), cloud (external), hexagon (service), ellipse. Any draw.io shape token also works",
                                    ),
                                icon: z
                                    .string()
                                    .optional()
                                    .describe(
                                        "Catalog stencil name; draws this node as an icon",
                                    ),
                                group: z
                                    .string()
                                    .optional()
                                    .describe(
                                        "Semantic group name, e.g. 'remote' or 'local'. Nodes sharing a group get the same colour from the engine's palette — never pick colours yourself",
                                    ),
                                role: z
                                    .enum([
                                        "banner",
                                        "heading",
                                        "body",
                                        "callout",
                                        "good",
                                        "bad",
                                        "metric",
                                        "muted",
                                    ])
                                    .optional()
                                    .describe(
                                        "What this node IS: heading, callout (must-not-miss), good/bad (verdict), metric (key number), muted (fine print). The theme styles it",
                                    ),
                            }),
                        )
                        .describe("Every box in the diagram"),
                    edges: z
                        .array(
                            z.object({
                                source: z.string(),
                                target: z.string(),
                                label: z.string().optional(),
                                dashed: z.boolean().optional(),
                                bold: z
                                    .boolean()
                                    .optional()
                                    .describe(
                                        "Thick coloured arrow for THE key relationship; use sparingly",
                                    ),
                                head: z
                                    .string()
                                    .optional()
                                    .describe(
                                        "Arrowhead at the target: block/open/diamond/diamondThin/oval/none, ER: ERone/ERmany/ERoneToMany/ERzeroToMany. UML inheritance: head=block headFill=false",
                                    ),
                                tail: z
                                    .string()
                                    .optional()
                                    .describe(
                                        "Arrowhead at the source, same values. ER 1:N: tail=ERone head=ERoneToMany",
                                    ),
                                headFill: z.boolean().optional(),
                                tailFill: z.boolean().optional(),
                            }),
                        )
                        .describe(
                            "Arrows. Direction matters — it sets the order of the diagram",
                        ),
                    title: z.string().optional(),
                    flow: z
                        .enum(["col", "row"])
                        .optional()
                        .describe(
                            "col (default): top to bottom. row: left to right",
                        ),
                }),
            },
            search_stencils: {
                description: `Find AWS stencil names for restructure_diagram. Returns names and official colours — call this before naming an icon, and batch the whole diagram's lookups into as few calls as possible.`,
                inputSchema: z.object({
                    query: z
                        .string()
                        .describe(
                            "Service name or keyword, e.g. 's3' or 'nat gateway'",
                        ),
                    kind: z
                        .enum(["icon", "group"])
                        .optional()
                        .describe(
                            "Restrict to service icons or container frames",
                        ),
                    limit: z.number().optional(),
                }),
                execute: async ({ query, kind, limit }) => {
                    const hits = searchStencils(query, { kind, limit })
                    if (hits.length === 0)
                        return `No stencil matches "${query}". Try a shorter or more general term.`
                    return JSON.stringify(hits)
                },
            },
            get_shape_library: {
                description: `Get draw.io shape/icon library documentation with style syntax and shape names. Use this before writing raw XML with display_diagram (UI mockups, floor plans, and other absolute-position diagrams). Flowcharts go through draw_graph and AWS architecture through search_stencils + restructure_diagram - neither needs this.

Available libraries:
- Cloud: aws4, azure2, gcp2, alibaba_cloud, openstack, salesforce
- Networking: cisco19, network, kubernetes, vvd, rack
- Business: bpmn, lean_mapping
- General: flowchart, basic, arrows2, infographic, sitemap
- UI/Mockups: android, material_design
- Enterprise: citrix, sap, mscae, atlassian
- Engineering: fluidpower, electrical, pid, cabinets, floorplan
- Icons: webicons

Call this tool to get shape names and usage syntax for a specific library.`,
                inputSchema: z.object({
                    library: z
                        .string()
                        .describe(
                            "Library name (e.g., 'aws4', 'kubernetes', 'flowchart')",
                        ),
                }),
                execute: async ({ library }) => {
                    // Sanitize input - prevent path traversal attacks
                    const sanitizedLibrary = library
                        .toLowerCase()
                        .replace(/[^a-z0-9_-]/g, "")

                    if (sanitizedLibrary !== library.toLowerCase()) {
                        return `Invalid library name "${library}". Use only letters, numbers, underscores, and hyphens.`
                    }

                    const baseDir = path.join(
                        process.cwd(),
                        "docs/shape-libraries",
                    )
                    const filePath = path.join(
                        baseDir,
                        `${sanitizedLibrary}.md`,
                    )

                    // Verify path stays within expected directory
                    const resolvedPath = path.resolve(filePath)
                    if (!resolvedPath.startsWith(path.resolve(baseDir))) {
                        return `Invalid library path.`
                    }

                    try {
                        const content = await fs.readFile(filePath, "utf-8")
                        return content
                    } catch (error) {
                        if (
                            (error as NodeJS.ErrnoException).code === "ENOENT"
                        ) {
                            return `Library "${library}" not found. Available: aws4, azure2, gcp2, alibaba_cloud, cisco19, kubernetes, network, bpmn, flowchart, basic, arrows2, vvd, salesforce, citrix, sap, mscae, atlassian, fluidpower, electrical, pid, cabinets, floorplan, webicons, infographic, sitemap, android, material_design, lean_mapping, openstack, rack`
                        }
                        console.error(
                            `[get_shape_library] Error loading "${library}":`,
                            error,
                        )
                        return `Error loading library "${library}". Please try again.`
                    }
                },
            },
        },
        ...(process.env.TEMPERATURE !== undefined && {
            temperature: parseFloat(process.env.TEMPERATURE),
        }),
    })

    return result.toUIMessageStreamResponse({
        sendReasoning: true,
        messageMetadata: ({ part }) => {
            if (part.type === "finish") {
                const usage = (part as any).totalUsage
                // AI SDK 6 provides totalTokens directly
                return {
                    totalTokens: usage?.totalTokens ?? 0,
                    finishReason: (part as any).finishReason,
                }
            }
            return undefined
        },
    })
}

// Helper to categorize errors and return appropriate response
function handleError(error: unknown): Response {
    console.error("Error in chat route:", error)

    const isDev = process.env.NODE_ENV === "development"

    // Check for specific AI SDK error types
    if (APICallError.isInstance(error)) {
        return Response.json(
            {
                error: error.message,
                ...(isDev && {
                    details: error.responseBody,
                    stack: error.stack,
                }),
            },
            { status: error.statusCode || 500 },
        )
    }

    if (LoadAPIKeyError.isInstance(error)) {
        return Response.json(
            {
                error: "Authentication failed. Please check your API key.",
                ...(isDev && {
                    stack: error.stack,
                }),
            },
            { status: 401 },
        )
    }

    // Fallback for other errors with safety filter
    const message =
        error instanceof Error ? error.message : "An unexpected error occurred"
    const status = (error as any)?.statusCode || (error as any)?.status || 500

    // Prevent leaking API keys, tokens, or other sensitive data
    const lowerMessage = message.toLowerCase()
    const safeMessage =
        lowerMessage.includes("key") ||
        lowerMessage.includes("token") ||
        lowerMessage.includes("sig") ||
        lowerMessage.includes("signature") ||
        lowerMessage.includes("secret") ||
        lowerMessage.includes("password") ||
        lowerMessage.includes("credential")
            ? "Authentication failed. Please check your credentials."
            : message

    return Response.json(
        {
            error: safeMessage,
            ...(isDev && {
                details: message,
                stack: error instanceof Error ? error.stack : undefined,
            }),
        },
        { status },
    )
}

// Wrap handler with error handling
async function safeHandler(req: Request): Promise<Response> {
    try {
        return await handleChatRequest(req)
    } catch (error) {
        return handleError(error)
    }
}

// Wrap with Langfuse observe (if configured)
const observedHandler = wrapWithObserve(safeHandler)

export async function POST(req: Request) {
    return observedHandler(req)
}
