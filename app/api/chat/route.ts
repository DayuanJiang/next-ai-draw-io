import {
    APICallError,
    convertToModelMessages,
    InvalidToolInputError,
    isTextUIPart,
    pruneMessages,
    safeValidateUIMessages,
    stepCountIs,
    streamText,
} from "ai"
import { jsonrepair } from "jsonrepair"
import { checkAccessCode, rejectCrossSite } from "@/lib/access-code"
import {
    applyThinkingSwitch,
    CACHE_POINT,
    edgeOneEndpoint,
    getAIModel,
    getServerProvider,
    supportsPromptCaching,
    usesServerCredentials,
    usesServerEndpoint,
} from "@/lib/ai-providers"
import {
    diagramContextText,
    dropInvalidToolCalls,
    fixToolInputJson,
    formatSelectionContext,
    parseStringifiedArrays,
    validateFileParts,
    withoutOldAttachments,
} from "@/lib/chat-helpers"
import { addReplyUsage, type ChatUIMessage } from "@/lib/chat-message"
import { chatTools } from "@/lib/chat-tools"
import { withDeprecatedParamsFallback } from "@/lib/deprecated-params"
import { diagramOf } from "@/lib/diagram-context"
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
import { estimateCost } from "@/lib/model-catalog"
import {
    resolveMaxOutputTokens,
    withOutputTokenLimitFallback,
} from "@/lib/output-token-limit"
import { PROVIDERS, type ProviderName } from "@/lib/providers"
import {
    type FlattenedServerModel,
    findServerModelById,
} from "@/lib/server-model-config"
import { allowPrivateUrls, isPrivateUrl } from "@/lib/ssrf-protection"
import { withHeartbeat } from "@/lib/stream-heartbeat"
import { getSystemPrompt } from "@/lib/system-prompts"
import { normalizeBaseUrl } from "@/lib/types/model-config"
import { getUserIdFromRequest } from "@/lib/user-id"

// No explicit cap: a reasoning model can spend minutes planning before it emits
// the tool call, so take whatever the host allows. Vercel's own default is 300s,
// which is also where Node's response-body timeout on the upstream stream lands.

// Responses streamed from the model, whose trace streamText's callbacks end
const modelStreamResponses = new WeakSet<Response>()
// A Request's signal follows the client's disconnect only while the Request
// object itself is alive: once it is garbage collected, the abort is lost
// (nodejs/undici#3644) and a stopped chat would run on at the provider.
// Each request is kept as long as its answer streams.
const requestOfResponse = new WeakMap<Response, Request>()

// Inner handler function
const DEBUG_LLM_PAYLOAD = process.env.DEBUG_LLM_PAYLOAD === "true"

// Message structure for DEBUG_LLM_PAYLOAD logs: roles, part types, tool names
// and input keys, without the diagram XML or image data
const describeMessages = (msgs: any[]) =>
    msgs.map((m) => ({
        role: m.role,
        parts: (m.parts ?? m.content ?? []).map(
            (p: any) =>
                p.type +
                (p.toolName ? `:${p.toolName}` : "") +
                (p.input && typeof p.input === "object"
                    ? `(${Object.keys(p.input).join(",")})`
                    : ""),
        ),
    }))

async function handleChatRequest(req: Request): Promise<Response> {
    const startedAt = Date.now()
    const crossSite = rejectCrossSite(req)
    if (crossSite) return crossSite
    // Check for access code
    const accessDenied = checkAccessCode(req)
    if (accessDenied) return accessDenied

    const body = await req.json()
    // The messages in the SDK's UI shape. The route writes its own system
    // messages, so none may come from the client.
    const validated = await safeValidateUIMessages<ChatUIMessage>({
        messages: body.messages,
    })
    if (!validated.success) {
        return Response.json(
            { error: validated.error.message },
            { status: 400 },
        )
    }
    const messages = validated.data.filter((m) => m.role !== "system")
    const { xml, sessionId } = body
    // A turn's later requests (after a tool result, a retry) continue the
    // same assistant message, which carries what the earlier ones used
    const lastMessage = messages.at(-1)
    const usedBefore =
        lastMessage?.role === "assistant"
            ? lastMessage.metadata?.usage
            : undefined
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
        .find((m) => m.role === "user")
    const userInputText = lastUserMessage?.parts.find(isTextUIPart)?.text || ""

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
    const requestedProvider =
        serverModelConfig.provider || provider || getServerProvider()
    // A provider without credentials (EdgeOne) is this deployment's own
    // function, whatever URL the request names: another host would get the
    // user's EdgeOne cookies, and the quota counts it. Absolute, as the SDK
    // needs.
    const onSiteFunction =
        !!requestedProvider &&
        Object.hasOwn(PROVIDERS, requestedProvider) &&
        PROVIDERS[requestedProvider as ProviderName].credential === "none"
    if (onSiteFunction) baseUrl = edgeOneEndpoint(req)

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
        // Server model provider takes precedence over client header; the
        // site's function named only in AI_PROVIDER is named here, for its
        // own base URL
        provider:
            serverModelConfig.provider ||
            provider ||
            (onSiteFunction ? requestedProvider : null),
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
        ...(onSiteFunction && {
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

    // The model's thinking switch from the user's settings, on their own key
    // and endpoint only, like the output budget: on the server's, the
    // server's settings decide what it pays for
    const thinking = req.headers.get("x-ai-thinking-enabled")
    const options =
        thinking && !onServerCredentials && !onServerEndpoint
            ? applyThinkingSwitch(
                  providerOptions,
                  resolvedProvider,
                  modelId,
                  thinking === "true",
              )
            : providerOptions

    // Check if model supports prompt caching
    const shouldCache = supportsPromptCaching(modelId)
    console.log(
        `[Prompt Caching] ${shouldCache ? "ENABLED" : "DISABLED"} for model: ${modelId}`,
    )

    // System prompt, with the model name filled in and the style section chosen
    const systemMessage = getSystemPrompt(modelId, minimalStyle)
    const finalSystemMessage = customSystemMessage
        ? `${systemMessage}\n\n## Custom Instructions\n${customSystemMessage}`
        : systemMessage

    // Note: we used to pre-emptively reject images for models we guessed were
    // text-only (by name matching). That heuristic misfired on newer models
    // (see issue #874), so we now let the request through and surface the real
    // provider error if the model genuinely can't accept images.

    // Each user message ends with a note on the canvas when it was sent
    // (lib/diagram-context.ts): the canvas itself when the model's own calls
    // no longer describe it, else that it was unchanged. The note, and the
    // shapes the user selected, come from the message's metadata, so a
    // message gets the same text in every request and the history before
    // the newest message stays cacheable. Each starts on a new paragraph:
    // some providers join a message's text parts as they are.
    const newestUser = messages.findLastIndex((m) => m.role === "user")
    const withNotes = messages.map((message, i) => {
        if (message.role !== "user") return message
        const isNewest = i === newestUser
        const diagram = diagramOf(message)
        const notes = [
            // A message from an older client has no note: the newest one
            // then gets the canvas of the request
            diagram
                ? diagramContextText(diagram)
                : isNewest
                  ? diagramContextText({ xml: xml || "", pageId: null })
                  : "",
            formatSelectionContext(
                message.metadata?.selectedCells ??
                    (isNewest ? body.selectedCells : undefined),
            ),
        ].filter(Boolean)
        if (notes.length === 0) return message
        return {
            ...message,
            parts: [
                ...message.parts,
                ...notes.map((text) => ({
                    type: "text" as const,
                    text: `\n\n${text}`,
                })),
            ],
        }
    })

    // Convert UIMessages to ModelMessages. A tool call that never got its
    // result (the user stopped while it ran) is left out: the SDK would
    // refuse this and every later request of the chat
    // (MissingToolResultsError). Messages left without content (a notice
    // the chat shows is a data part, which the model never sees) are
    // dropped: Bedrock rejects empty content.
    const modelMessages = pruneMessages({
        messages: await convertToModelMessages(withNotes, {
            ignoreIncompleteToolCalls: true,
        }),
    })

    // DEBUG_LLM_PAYLOAD=true logs the incoming message structure
    if (DEBUG_LLM_PAYLOAD) {
        console.log(
            "[route.ts] incoming",
            JSON.stringify(describeMessages(messages)),
        )
    }

    // Filter out tool-calls with invalid inputs (from failed repair or interrupted streaming)
    // and their results. Bedrock API rejects messages where toolUse.input is not a valid
    // JSON object, and every provider rejects a tool result whose call is gone.
    // An attached document or image is sent with its own turn only.
    const enhancedMessages = withoutOldAttachments(
        dropInvalidToolCalls(modelMessages),
    )

    // DEBUG_LLM_PAYLOAD=true logs what is sent to the model
    if (DEBUG_LLM_PAYLOAD) {
        console.log(
            "[route.ts] to model",
            JSON.stringify(describeMessages(enhancedMessages)),
        )
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

    // One system message with the instructions, the same in every request
    // of the chat: the diagram goes with the user messages (above). One
    // message also suits the providers that accept only one (MiniMax, chat
    // templates of open models behind OpenAI-compatible endpoints).
    const systemMessages = [
        {
            role: "system" as const,
            content: `${finalSystemMessage}\n\nWrite your reply in the language of the user's own words in their latest message, not in the language of the diagram, attached files or the canvas notes in square brackets.`,
            ...(shouldCache && { providerOptions: CACHE_POINT }),
        },
    ]

    const allMessages = [...systemMessages, ...enhancedMessages]

    // The request's cost, priced step by step: a price tier goes by one
    // call's prompt, and a step without usage or price makes it unknown
    let requestCost: number | undefined = 0

    const result = streamText({
        model,
        // The system message carries a cache point, so it goes in messages
        // (the client's own system messages were dropped above)
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
                    const repairedInput = parseStringifiedArrays(
                        jsonrepair(fixToolInputJson(toolCall.input)),
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
        ...(options && { providerOptions: options }), // This now includes all reasoning configs
        // Langfuse telemetry (undefined when not configured)
        experimental_telemetry: getTelemetryConfig({
            sessionId: validSessionId,
            userId,
        }),
        // The quota counts each step as it ends: a later step that fails or
        // is stopped has still used these tokens (onFinish runs only for a
        // completed answer). Awaited, so the write is done before the host
        // may freeze the function after the answer ends.
        onStepFinish: async ({ usage }) => {
            const stepCost = estimateCost(resolvedProvider, modelId, usage)
            requestCost =
                requestCost !== undefined && stepCost !== undefined
                    ? requestCost + stepCost
                    : undefined
            if (countsQuota) {
                await recordTokenUsage(userId, usage.totalTokens ?? 0)
            }
        },
        onFinish: ({ text }) => {
            // AI SDK 6 telemetry auto-reports token usage on its spans
            setTraceOutput(text)
        },
        // onFinish is skipped when the stream fails or is aborted, so end the trace here
        onError: ({ error }) => {
            console.error(error) // what AI SDK does without an onError
            endTrace()
        },
        onAbort: () => endTrace(),
        tools: chatTools,
        ...(process.env.TEMPERATURE !== undefined && {
            temperature: parseFloat(process.env.TEMPERATURE),
        }),
    })

    const response = withHeartbeat(
        result.toUIMessageStreamResponse<ChatUIMessage>({
            sendReasoning: true,
            // The answer's tokens, time and cost so far, shown under it in the chat
            messageMetadata: ({ part }) =>
                part.type === "finish"
                    ? {
                          usage: addReplyUsage(
                              usedBefore,
                              part.totalUsage,
                              Date.now() - startedAt,
                              requestCost,
                          ),
                      }
                    : undefined,
            // On the server's keys the provider's text can name its account.
            // Keyless endpoints keep theirs: the desktop app's Ollama is the
            // user's own, and EdgeOne's text is our function's explanation.
            onError: (error) => streamErrorText(error, onServerCredentials),
        }),
    )
    modelStreamResponses.add(response)
    requestOfResponse.set(response, req)
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
    // Early returns and errors never reach streamText's callbacks,
    // so their Langfuse trace has to be ended here
    if (!modelStreamResponses.has(response)) endTrace()
    return response
}

// Wrap with Langfuse observe (if configured)
const observedHandler = wrapWithObserve(safeHandler)

export async function POST(req: Request) {
    return observedHandler(req)
}
