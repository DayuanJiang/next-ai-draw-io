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
import { jsonrepair } from "jsonrepair"
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
import {
    resolveMaxOutputTokens,
    withOutputTokenLimitFallback,
} from "@/lib/output-token-limit"
import { findServerModelById } from "@/lib/server-model-config"
import { getSystemPrompt } from "@/lib/system-prompts"
import { getUserIdFromRequest } from "@/lib/user-id"

// No explicit cap: a reasoning model can spend minutes planning before it emits
// the tool call, so take whatever the host allows. Vercel's own default is 300s,
// which is also where Node's response-body timeout on the upstream stream lands.

// Helper function to create cached stream response.
//
// This replays a stored XML answer straight to the canvas, so it still speaks the
// `display_diagram` wire format even though the model can no longer call that tool: the client
// handler for it is what puts XML on the canvas. Nothing here goes through the model.
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
        model: baseModel,
        providerOptions,
        headers,
        modelId,
        provider: resolvedProvider,
    } = getAIModel(clientOverrides)

    // Retry with a smaller budget if the provider rejects the requested one
    const model = withOutputTokenLimitFallback(baseModel)

    // User setting wins over server env, so desktop users can raise it themselves
    const maxOutputTokens = resolveMaxOutputTokens(
        req.headers.get("x-max-output-tokens"),
    )
    console.log(`[maxOutputTokens] ${maxOutputTokens}`)

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
        // Must be sent: unset means the provider's own default, and Bedrock's is
        // 4096, enough for a small diagram, so larger ones were cut off mid-attribute.
        maxOutputTokens,
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
            restructure_diagram: {
                description: `Build or edit a diagram by declaring STRUCTURE. The engine computes every coordinate.

PREFER THIS over edit_diagram whenever the diagram's meaning is in nesting or in a fixed frame: cloud architecture, swimlane/BPMN, sequence diagrams, mind maps, org charts — AND poster-style layouts: paper summaries, cheat sheets, infographics, comparison sheets. You declare what contains what; layout, sizing, alignment and arrow routing are computed. Containers always fit their contents and siblings never overlap, so the usual layout problems cannot occur.

The layout model is FLEXBOX. row/col containers nest freely; a box with internal structure is an invisible col container (pad 10-14) holding smaller boxes. Three knobs: grow (columns split leftover WIDTH by weight — grow 3 / grow 2 gives a 3:2 page; for containers in a row, not for leaf boxes), align "stretch" (child fills its column's width; content keeps natural height and packs to the top — the engine leaves leftover vertical space at the bottom, never inflates boxes to fill it, so balance columns by moving content between them), pad (8-14 tight card, default 24 roomy section). Labels take inline HTML — <b>, <i>, <font color="#...">, <br> — so one box carries a bold keyword, a second paragraph, a coloured verdict line. Paragraphs set themselves flush-left automatically; short labels centre. Emoji in headings (💡 Core Idea) read instantly.

DECLARE THE PAGE SHAPE FIRST, with set_page. aspect is width:height — 1 square, 1.4 a landscape slide, 0.75 a portrait poster, 1.6 a wide architecture diagram. This is the one thing that has to come before everything else: it gives the top level a definite width, and until there is one there is no spare room to share out, so grow weights and column fractions have no effect at all. A row that then cannot fit wraps onto a second line rather than running off to the right.

LAYOUT, TYPE AND SURFACE — Tailwind classes. Every add_container and add_box takes class, and it is the preferred way to say these things. Colour is the one thing a class never carries: that comes from role and group.
  proportion    grow-3 / flex-3 / w-2/3 — a column's share of the row. Add min-w-0 to BOTH columns when you want the ratio exactly: without it a column will not shrink below the width of its own text, so a declared 3:1 lands wherever the text allows (this is how flexbox behaves in a browser too).
  direction     flex-row, flex-col (or the dir field, which a class cannot override)
  cross axis    items-stretch on the container (cards all span the same width — this is what makes a column line up), or self-start / self-center / self-end / self-stretch on one child
  main axis     justify-start (default: packed, spare room at the far end) / justify-center / justify-end / justify-between / justify-around / justify-evenly. Reach for justify-between when a short column would otherwise leave a hole at the bottom.
  spacing       gap-4 between children, p-6 inside. Tailwind's 4px scale, so gap-4 is 16px and p-6 is 24px. Use the scale; there is no gap-7.5.
  width cap     max-w-md (448) or max-w-96, up to max-w-4xl. A capped box rewraps its text instead of stretching, which is what stops one long sentence flattening the page. A cap beats grow.
  type          font-bold / font-normal, italic, underline, line-through, text-xs..text-4xl (12/14/16/18/20/24/30/36px), text-left|center|right, align-top|middle|bottom, whitespace-nowrap. An explicit alignment beats the engine's own "this looks like a paragraph" rule, so use text-center when you want a long label centred. line-through is for a superseded or cancelled step.
  border        border or border-N for thickness, border-dashed / border-dotted / border-solid. A dashed frame is the conventional way to draw something planned, optional or purely logical. border-none removes the outline entirely, which is how you draw a plain colour field.
  corners       rounded, rounded-sm, rounded-md, rounded-lg, rounded-xl, rounded-2xl, rounded-3xl, rounded-4xl (4/4/6/8/12/16/24/32px), rounded-full for a capsule, rounded-none for square. Real pixels, so the same class is the same corner on every box. Overrides the corner of a shape that has one, which is what you want on round and terminator.
  elevation     shadow-sm / shadow-md / shadow-lg / shadow-xl, shadow-none. Use it to lift a card off a panel; one level on one group of cards, not on everything.
NOT supported, and dropped with a note telling you which: EVERY colour class (bg-*, text-red-*, border-blue-*) and gradients — colour comes from role and group; the seven font weights between font-thin and font-black, because draw.io has one bold bit rather than a weight ladder; opacity-* (Tailwind's is any number, not a scale); truncate (draw.io cannot draw the ellipsis, so text would just be cut); PER-SIDE borders (border-l, border-t-4) — draw.io draws these with a shape called partialRectangle, which would take the place of the node's own shape, and what a node IS matters more than which of its edges show; PER-SIDE padding (pt-4, px-2) — the engine has one padding value, and draw.io's per-side keys pad the LABEL rather than making room for children; per-corner radius (rounded-tl-lg); text-shadow-*; tracking-* and uppercase/lowercase/capitalize and leading-* (draw.io has no letter-spacing, no text-transform and no per-node line height); outline-*, hover:*, responsive prefixes, and all transforms.

PLAN THE COLUMNS BEFORE THE FIRST OPERATION. The engine places exactly what you declare; a column that runs out of content early leaves a hole at the bottom of the page and nothing later can fill it. So: list each section with a rough character count (heading ~20, paragraph ~its length, comparison card ~the sum of its parts, add_graph ~400); a column twice as wide runs about half as tall, so a column's SHARE OF THE TOTAL CONTENT must match its grow weight — grow 3 beside grow 1 holds about three times the characters, never fewer; add the columns up and check the ratio before emitting anything (1200 vs 1100 chars is grow 1 / grow 1, and wanting grow 3 / grow 1 for 900 vs 1100 means the plan is wrong — move sections across or equalise the weights); a full-width element (masthead, footnote, wide diagram) is its own row above or below the row of columns, never inside one, because a 900-wide diagram in one column forces that column wide and strands the others. State the numbers in your preamble ("left ~N chars / right ~M, so grow X / Y") — writing them down is what catches the mismatch.

For a POSTER (paper summary, cheat sheet): set_page with aspect 0.75 (portrait) or 1.4 (landscape); one col container as the page with class "gap-4"; a banner box as the masthead with class "self-stretch" (do NOT also use set_title — the banner IS the title); a muted box for the byline; a row container class "gap-4" holding 2-4 col containers as columns, each class "grow-N min-w-0 items-stretch"; each section a heading-role box + content boxes. Give each section a distinct group name — sections sharing a group share a hue, so groups are how the poster gets its colour. Use roles on boxes: callout for the core idea, good/bad for verdict pairs, metric for the headline number, muted for fine print. A comparison card: add_container dir=col class="gap-2 p-3 grow-1 items-stretch" role=bad, then a bold title box, the body text, a role=bad answer bar, and a coloured "<font color=\\"#B85450\\"><b>✗ Often Wrong</b></font>" verdict with class "self-start".
{"operations":[
  {"op":"set_page","aspect":0.8},
  {"op":"add_container","id":"page","label":"","dir":"col","class":"gap-4"},
  {"op":"add_box","id":"mast","parent":"page","label":"Chain-of-Thought Prompting","role":"banner","class":"self-stretch"},
  {"op":"add_container","id":"cols","parent":"page","label":"","dir":"row","class":"gap-4"},
  {"op":"add_container","id":"left","parent":"cols","label":"","dir":"col","class":"grow-2 min-w-0 gap-3 items-stretch"},
  {"op":"add_container","id":"right","parent":"cols","label":"","dir":"col","class":"grow-1 min-w-0 gap-3 items-stretch"},
  {"op":"add_box","id":"h1","parent":"left","label":"What it is","role":"heading","group":"idea"},
  {"op":"add_box","id":"p1","parent":"left","label":"Ask the model to show its steps...","group":"idea"}
]}
(Two thirds of the characters go in the grow-2 column, one third in the grow-1 column.)

Never write coordinates, mxCell XML, or style strings. Look AWS icon names up with search_stencils first — an invented name is rejected with suggestions.

Operations are applied in order, so you can add a container and fill it in the same call:
{"operations":[
  {"op":"add_container","id":"vpc","label":"VPC 10.0.0.0/16","dir":"col","gname":"group_vpc"},
  {"op":"add_icon","id":"alb","parent":"vpc","name":"application_load_balancer","label":"ALB"},
  {"op":"add_icon","id":"ec2","parent":"vpc","name":"ec2","label":"EC2"},
  {"op":"link","source":"alb","target":"ec2","label":"route","step":1}
]}

Editing an existing diagram: the structure is re-read from the canvas each time, INCLUDING anything the user moved or recoloured by hand. To add one service, send one operation — do not re-send the diagram.

CLOUD ARCHITECTURE (AWS/Azure/GCP/Kubernetes) — every zone is a container, and each one's dir is what makes the diagram readable: dir follows the traffic. Nesting is Region -> VPC -> Availability Zone -> Subnet, and managed/global services (CloudFront, Route 53, S3, DynamoDB, SQS, SNS, WAF, CloudWatch) sit OUTSIDE the VPC — a regional service inside a subnet states something false about the network. Use dir "row" wherever things are PEERS (availability zones side by side, replicas, a set of regional services) and dir "col" wherever traffic FLOWS THROUGH (the tiers inside one zone: public -> app -> data, top to bottom). Label every zone with its scope ("Availability Zone A", "Private Subnet (App)", "VPC 10.0.0.0/16") — an unlabelled frame makes the reader guess what the boundary means. Put the actor (Users / Internet) OUTSIDE the region as a plain box with shape "person" or "cloud" and link it inwards; it is not infrastructure. Two availability zones is the right default for "a sample architecture" — one reads as a single point of failure, three repeats the same information a third time. Number the request path on the links ("1. HTTPS", "2. forward", "3. route", "4. query") so the reader has an entry point, and make cross-cutting links (replication, telemetry) dashed and unnumbered. Keep each zone to 1-4 icons: one is fine when the boundary itself is the point (a subnet holding one NAT gateway), ten is a wall of icons — split it or use add_grid.
{"operations":[
  {"op":"add_box","id":"users","label":"Users / Internet","shape":"person"},
  {"op":"add_container","id":"region","label":"Region (ap-southeast-1)","dir":"row","gname":"group_region"},
  {"op":"add_container","id":"vpc","parent":"region","label":"VPC 10.0.0.0/16","dir":"col","gname":"group_vpc"},
  {"op":"add_icon","id":"igw","parent":"vpc","name":"internet_gateway","label":"Internet Gateway"},
  {"op":"add_icon","id":"alb","parent":"vpc","name":"application_load_balancer","label":"ALB"},
  {"op":"add_container","id":"azs","parent":"vpc","dir":"row"},
  {"op":"add_container","id":"az_a","parent":"azs","label":"Availability Zone A","dir":"col","gname":"group_availability_zone"},
  {"op":"add_container","id":"pub_a","parent":"az_a","label":"Public Subnet","dir":"col","gname":"group_subnet"},
  {"op":"add_icon","id":"nat_a","parent":"pub_a","name":"nat_gateway","label":"NAT Gateway"},
  {"op":"add_container","id":"app_a","parent":"az_a","label":"Private Subnet (App)","dir":"col","gname":"group_subnet"},
  {"op":"add_icon","id":"ec2_a","parent":"app_a","name":"ec2","label":"EC2 / ECS"},
  {"op":"add_container","id":"db_a","parent":"az_a","label":"Private Subnet (Data)","dir":"col","gname":"group_subnet"},
  {"op":"add_icon","id":"rds_a","parent":"db_a","name":"rds","label":"RDS (Primary)"},
  {"op":"add_container","id":"reg_svc","parent":"region","label":"Regional / Edge services","dir":"col"},
  {"op":"add_icon","id":"waf","parent":"reg_svc","name":"waf","label":"AWS WAF"},
  {"op":"link","source":"users","target":"igw","label":"1. HTTPS"},
  {"op":"link","source":"igw","target":"alb","label":"2. forward"},
  {"op":"link","source":"alb","target":"ec2_a","label":"3. route"},
  {"op":"link","source":"ec2_a","target":"rds_a","label":"4. query"},
  {"op":"link","source":"rds_a","target":"rds_b","label":"Multi-AZ replication","dashed":true}
]}
(az_b mirrors az_a, with RDS labelled "(Standby)".)

CONTAINERS — pick by what the diagram means:

add_container: children stacked along one axis. dir "row" side by side, "col" one above the next. An empty label makes an invisible grouping wrapper (use it to group columns without drawing another frame). gname is an AWS group stencil (group_region, group_vpc, group_availability_zone, group_subnet, group_account) — omit it for a plain titled frame.

add_grid: packs children into cols columns. Use it to pack 3-8 related icons into one labelled area rather than giving each its own frame.

add_graph: an ARROW-ORDERED block. Give it nodes and edges, NO positions and NO nesting: the engine reads the arrows to work out how many rows the diagram has, which nodes share a row, and who goes left of whom — chosen to keep arrows from crossing each other or running through unrelated boxes. Loops and arrows that skip ahead are fine.
  THIS IS THE ONLY WAY TO DRAW A FLOWCHART. Use it for flowcharts, decision trees, process and approval flows, CI/CD pipelines, state machines, git/branching workflows, dependency graphs, ER diagrams, site maps, data-flow diagrams, and any "illustrate how X works" where X is a sequence of steps or states. Never build one out of add_container/add_box by hand: declaring a flowchart as nesting puts every step in one column, so each branch has to jump over the step beside it.
  Omit parent for a whole-page flowchart; set parent to put a flow inside one zone of a bigger diagram (a pipeline in an architecture diagram, a small flowchart in a poster column), where the block then joins the outer layout like any node. dir: "col" (default) flows down, "row" flows right.
  Redrawing a whole-page flowchart: send clear first. One new arrow can change which row several nodes belong in, so a flowchart is rebuilt rather than patched.
{"operations":[
  {"op":"clear"},
  {"op":"add_graph","id":"flow","nodes":[
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
  ]},
  {"op":"set_title","title":"Order Approval"}
]}
  Grouping: when the nodes fall into natural zones (remote vs local, frontend vs backend, roles, phases), set the same group name on each zone's nodes and the engine colours each zone consistently. Set icon instead of shape to draw a node as a catalog icon.

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
