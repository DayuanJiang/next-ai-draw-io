import {
    APICallError,
    convertToModelMessages,
    createUIMessageStream,
    createUIMessageStreamResponse,
    InvalidToolInputError,
    stepCountIs,
    streamText,
} from "ai"
import { jsonrepair } from "jsonrepair"
import path from "path"
import { z } from "zod"
import { checkAccessCode, rejectCrossSite } from "@/lib/access-code"
import {
    CACHE_POINT,
    edgeOneEndpoint,
    getAIModel,
    getServerProvider,
    SINGLE_SYSTEM_PROVIDERS,
    supportsPromptCaching,
    usesServerCredentials,
    usesServerEndpoint,
} from "@/lib/ai-providers"
import { findCachedResponse } from "@/lib/cached-responses"
import {
    dropInvalidToolCalls,
    fixToolInputJson,
    formatSelectionContext,
    replaceHistoricalToolInputs,
    validateFileParts,
} from "@/lib/chat-helpers"
import { withDeprecatedParamsFallback } from "@/lib/deprecated-params"
import {
    checkAndIncrementRequest,
    isQuotaEnabled,
    recordTokenUsage,
} from "@/lib/dynamo-quota-manager"
import {
    endTrace,
    getTelemetryConfig,
    setTraceInput,
    setTraceOutput,
    wrapWithObserve,
} from "@/lib/langfuse"
import { classifyLLMError, streamErrorText } from "@/lib/llm-errors"
import {
    resolveMaxOutputTokens,
    withOutputTokenLimitFallback,
} from "@/lib/output-token-limit"
import {
    type FlattenedServerModel,
    findServerModelById,
} from "@/lib/server-model-config"
import { allowPrivateUrls, isPrivateUrl } from "@/lib/ssrf-protection"
import { getSystemPrompt } from "@/lib/system-prompts"
import { normalizeBaseUrl } from "@/lib/types/model-config"
import { getUserIdFromRequest } from "@/lib/user-id"
import { hasCells } from "@/packages/mcp-server/src/pages.ts"
import {
    getShapeLibrary,
    SHAPE_LIBRARY_LIST,
} from "@/packages/mcp-server/src/shape-library.ts"
import { SWIMLANE_EXAMPLE } from "@/packages/mcp-server/src/xml-examples.ts"

// No explicit cap: a reasoning model can spend minutes planning before it emits
// the tool call, so take whatever the host allows. Vercel's own default is 300s,
// which is also where Node's response-body timeout on the upstream stream lands.

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

// Responses streamed from the model, whose trace streamText's callbacks end
const modelStreamResponses = new WeakSet<Response>()

// Inner handler function
const DEBUG_LLM_PAYLOAD = process.env.DEBUG_LLM_PAYLOAD === "true"

async function handleChatRequest(req: Request): Promise<Response> {
    const crossSite = rejectCrossSite(req)
    if (crossSite) return crossSite
    // Check for access code
    const accessDenied = checkAccessCode(req)
    if (accessDenied) return accessDenied

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

    // === FILE VALIDATION START ===
    const fileValidation = validateFileParts(messages)
    if (!fileValidation.valid) {
        return Response.json({ error: fileValidation.error }, { status: 400 })
    }
    // === FILE VALIDATION END ===

    // === CACHE CHECK START ===
    const isFirstMessage = messages.length === 1
    const isEmptyDiagram = !xml || !hasCells(xml)

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

    // Check if this is a server model with custom env var names
    let serverModelConfig: {
        apiKeyEnv?: string | string[]
        baseUrlEnv?: string
        provider?: string
    } = {}
    let serverModel: FlattenedServerModel | null = null
    if (selectedModelId?.startsWith("server:")) {
        serverModel = await findServerModelById(selectedModelId)
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

    // A server model's provider comes from its config: for one set up in
    // the admin panel the header holds the provider name's slug. Without
    // either, the server's own AI_PROVIDER.
    const isEdgeOne =
        (serverModelConfig.provider || provider || getServerProvider()) ===
        "edgeone"

    // EdgeOne is this deployment's own function, whatever URL the request
    // names: another host would get the user's EdgeOne cookies, and the
    // quota counts it. Absolute, as the SDK needs.
    if (isEdgeOne) baseUrl = edgeOneEndpoint(req)

    // Same rule as validate-model: with ALLOW_PRIVATE_URLS=false a request may
    // not point the server at a private or internal address
    if (baseUrl && !allowPrivateUrls() && (await isPrivateUrl(baseUrl))) {
        return Response.json(
            { error: "Private or internal base URLs are not allowed." },
            { status: 400 },
        )
    }

    // Get cookie header for EdgeOne authentication (eo_token, eo_time)
    const cookieHeader = req.headers.get("cookie")

    const clientOverrides = {
        // Server model provider takes precedence over client header; EdgeOne
        // named only in AI_PROVIDER is named here, for its own base URL
        provider:
            serverModelConfig.provider ||
            provider ||
            (isEdgeOne ? "edgeone" : null),
        baseUrl,
        apiKey: req.headers.get("x-ai-api-key"),
        // A server model runs the model it was configured with, whatever the header says
        modelId: serverModel?.modelId || req.headers.get("x-ai-model"),
        // AWS Bedrock credentials
        awsAccessKeyId: req.headers.get("x-aws-access-key-id"),
        awsSecretAccessKey: req.headers.get("x-aws-secret-access-key"),
        awsRegion: req.headers.get("x-aws-region"),
        awsSessionToken: req.headers.get("x-aws-session-token"),
        // Server model custom env var names
        ...serverModelConfig,
        // Vertex AI credentials (Express Mode)
        vertexApiKey: req.headers.get("x-vertex-api-key"),
        // Pass cookies for EdgeOne Pages authentication, and the access code,
        // which the EdgeOne function checks too
        ...(isEdgeOne && {
            headers: {
                ...(cookieHeader && { cookie: cookieHeader }),
                "x-access-code": req.headers.get("x-access-code") || "",
            },
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
        modelId,
        provider: resolvedProvider,
    } = getAIModel(clientOverrides)

    // On the server's own keys, only run models the server offers: a server
    // model picked by id (its model name is fixed above) or one in AI_MODEL
    // on AI_PROVIDER. With their own key, users can run any model.
    const onServerCredentials = usesServerCredentials(
        resolvedProvider,
        clientOverrides,
    )
    const envModels =
        process.env.AI_MODEL?.split(",").map((m) => m.trim()) || []
    const offeredInEnv =
        envModels.includes(modelId) && resolvedProvider === getServerProvider()
    if (onServerCredentials && !serverModel && !offeredInEnv) {
        return Response.json(
            {
                error: `Model "${modelId}" is not available on this server. Add your own API key in Settings to use it.`,
            },
            { status: 400 },
        )
    }

    // === SERVER-SIDE QUOTA CHECK START ===
    // Quota is opt-in (DYNAMODB_QUOTA_TABLE) and counts what runs on the
    // server's keys, or on the server's own endpoints: EdgeOne, its keyless
    // Ollama, and anything at a private address (the server's network,
    // which ignores a dummy key header). Bedrock and EdgeOne never use the
    // base URL header. In the desktop app every endpoint is the user's.
    const clientBaseUrl = normalizeBaseUrl(
        req.headers.get("x-ai-base-url") ?? "",
    )
    const onServerEndpoint = await usesServerEndpoint(
        resolvedProvider,
        clientBaseUrl,
        clientOverrides.apiKey,
    )
    const countsQuota =
        isQuotaEnabled() &&
        (onServerCredentials || onServerEndpoint) &&
        userId !== "anonymous"
    if (countsQuota) {
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

    // Retry once if the provider rejects the requested budget, or (newer
    // Claude models) the sampling or thinking settings
    const model = withOutputTokenLimitFallback(
        withDeprecatedParamsFallback(baseModel),
    )

    // The user setting can raise the budget only on their own key (in the
    // desktop app every key is the user's); on the server's keys or own
    // endpoints it can only lower it
    const maxOutputTokens = resolveMaxOutputTokens(
        req.headers.get("x-max-output-tokens"),
        onServerCredentials || onServerEndpoint,
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

    // Convert UIMessages to ModelMessages and add system message. A tool
    // call that never got its result (the user stopped while it ran) is
    // left out: the SDK would refuse this and every later request of the
    // chat (MissingToolResultsError)
    const modelMessages = await convertToModelMessages(messages, {
        ignoreIncompleteToolCalls: true,
    })

    // DEBUG_LLM_PAYLOAD=true logs the incoming message structure
    if (DEBUG_LLM_PAYLOAD) {
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
    }

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
    // and their results. Bedrock API rejects messages where toolUse.input is not a valid
    // JSON object, and every provider rejects a tool result whose call is gone.
    enhancedMessages = dropInvalidToolCalls(enhancedMessages)

    // DEBUG_LLM_PAYLOAD=true logs what is sent to the model
    if (DEBUG_LLM_PAYLOAD) {
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
                    if (
                        part.type === "tool-call" ||
                        part.type === "tool-result"
                    ) {
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
    }

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
                    mediaType: filePart.mediaType,
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
                    providerOptions: CACHE_POINT,
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

    const selectionContext = formatSelectionContext(body.selectedCells)
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

IMPORTANT: The "Current diagram XML" is the SINGLE SOURCE OF TRUTH for what's on the canvas right now. The user can manually add, delete, or modify shapes directly in draw.io. Always count and describe elements based on the CURRENT XML, not on what you previously generated. If both previous and current XML are shown, compare them to understand what the user changed.${selectionContext ? `\n\n${selectionContext}` : ""}`

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
                  ...(shouldCache && { providerOptions: CACHE_POINT }),
              },
              // Cache breakpoint 2: Previous and Current diagram XML context
              {
                  role: "system" as const,
                  content: xmlContext,
                  ...(shouldCache && { providerOptions: CACHE_POINT }),
              },
          ]

    const allMessages = [...systemMessages, ...enhancedMessages]

    // Set by onAbort, which records the finished steps' tokens itself
    let stopped = false
    const result = streamText({
        model,
        // The system messages carry cache points, so they go in messages.
        // A client's own system messages have string content and were
        // dropped by the empty-content filter above.
        allowSystemInMessages: true,
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
                    // Pre-process to fix common LLM JSON errors that jsonrepair can't handle,
                    // then use jsonrepair to fix truncated JSON
                    const repairedInput = jsonrepair(
                        fixToolInputJson(toolCall.input),
                    )
                    console.log(
                        `[repairToolCall] Repaired truncated JSON for tool: ${toolCall.toolName}`,
                    )
                    return { ...toolCall, input: repairedInput }
                } catch (repairError) {
                    console.warn(
                        `[repairToolCall] Failed to repair JSON for tool: ${toolCall.toolName}`,
                        repairError,
                    )
                    // Keep the original error, so the model and the client see why
                    // the input was rejected and the model can retry the call
                    return null
                }
            }
            // Don't attempt to repair other errors (like NoSuchToolError)
            return null
        },
        messages: allMessages,
        ...(providerOptions && { providerOptions }), // This now includes all reasoning configs
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
            // inputTokens already includes cache reads and writes in AI SDK 6
            if (countsQuota && totalUsage && !stopped) {
                const totalTokens =
                    (totalUsage.inputTokens || 0) +
                    (totalUsage.outputTokens || 0)
                recordTokenUsage(userId, totalTokens)
            }
        },
        // onFinish is skipped when the stream fails or is aborted, so end the trace here
        onError: ({ error }) => {
            console.error(error) // what AI SDK does without an onError
            endTrace()
        },
        onAbort: ({ steps }) => {
            stopped = true
            endTrace()
            // Stopped (or disconnected) after some steps finished: their
            // tokens were used, or stopping every request after a costly
            // first step would get around the token limits
            if (countsQuota) {
                const tokens = steps.reduce(
                    (sum, step) =>
                        sum +
                        (step.usage.inputTokens || 0) +
                        (step.usage.outputTokens || 0),
                    0,
                )
                if (tokens > 0) recordTokenUsage(userId, tokens)
            }
        },
        tools: {
            // Client-side tool that will be executed on the client
            display_diagram: {
                description: `Display a diagram on draw.io. Pass ONLY the mxCell elements - wrapper tags and root cells are added automatically.

VALIDATION RULES (XML will be rejected if violated):
1. Generate ONLY mxCell elements - NO wrapper tags (<mxfile>, <mxGraphModel>, <root>)
2. Do NOT include root cells (id="0" or id="1") - they are added automatically
3. All mxCell elements must be siblings - never nested
4. Every mxCell needs a unique id (start from "2")
5. Every mxCell needs a valid parent attribute (use "1" for top-level)
6. Escape special chars in values: &lt; &gt; &amp; &quot;

Example (generate ONLY this - no wrapper tags):
${SWIMLANE_EXAMPLE}

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
            get_shape_library: {
                description: `Get draw.io shape/icon library documentation with style syntax and shape names.

Available libraries:
${SHAPE_LIBRARY_LIST}

Call this tool to get shape names and usage syntax for a specific library.`,
                inputSchema: z.object({
                    library: z
                        .string()
                        .describe(
                            "Library name (e.g., 'aws4', 'kubernetes', 'flowchart')",
                        ),
                }),
                execute: async ({ library }) => {
                    // Only known library names reach the file system
                    const result = await getShapeLibrary(
                        library,
                        path.join(process.cwd(), "docs/shape-libraries"),
                    )
                    return result.ok ? result.text : result.error
                },
            },
        },
        ...(process.env.TEMPERATURE !== undefined && {
            temperature: parseFloat(process.env.TEMPERATURE),
        }),
    })

    const response = result.toUIMessageStreamResponse({
        sendReasoning: true,
        // On the server's keys the provider's text can name its account.
        // Keyless endpoints keep theirs: the desktop app's Ollama is the
        // user's own, and EdgeOne's text is our function's explanation.
        onError: (error) => streamErrorText(error, onServerCredentials),
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
    modelStreamResponses.add(response)
    return response
}

// Errors before the stream starts, as JSON the chat panel reads
function handleError(error: unknown): Response {
    console.error("Error in chat route:", error)

    const isDev = process.env.NODE_ENV === "development"
    const classified = classifyLLMError(error)
    const status =
        (error as { statusCode?: number })?.statusCode ||
        (error as { status?: number })?.status ||
        (classified.code === "invalid_api_key" ? 401 : 500)

    return Response.json(
        {
            ...classified,
            ...(isDev && {
                details: APICallError.isInstance(error)
                    ? error.responseBody
                    : undefined,
                stack: error instanceof Error ? error.stack : undefined,
            }),
        },
        { status },
    )
}

// Wrap handler with error handling
async function safeHandler(req: Request): Promise<Response> {
    let response: Response
    try {
        response = await handleChatRequest(req)
    } catch (error) {
        response = handleError(error)
    }
    // Early returns, cache hits and errors never reach streamText's callbacks,
    // so their Langfuse trace has to be ended here
    if (!modelStreamResponses.has(response)) endTrace()
    return response
}

// Wrap with Langfuse observe (if configured)
const observedHandler = wrapWithObserve(safeHandler)

export async function POST(req: Request) {
    return observedHandler(req)
}
