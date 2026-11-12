import {
    APICallError,
    convertToModelMessages,
    InvalidToolInputError,
    isTextUIPart,
    pruneMessages,
    type StreamTextTransform,
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
    serverThinkingDefaults,
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
    quotaTokens,
    validateFileParts,
    withoutOldAttachments,
} from "@/lib/chat-helpers"
import { addReplyUsage, type ChatUIMessage } from "@/lib/chat-message"
import { chatTools } from "@/lib/chat-tools"
import { withDeprecatedParamsFallback } from "@/lib/deprecated-params"
import { diagramOf } from "@/lib/diagram-context"
import {
    checkAndIncrementRequest,
    checkFollowUpRequest,
    isQuotaEnabled,
    recordTokenUsage,
} from "@/lib/dynamo-quota-manager"
import {
    endTrace,
    getActiveTraceId,
    getTelemetryConfig,
    setTraceInput,
    setTraceOutput,
    wrapWithObserve,
} from "@/lib/langfuse"
import { classifyLLMError, logText, streamErrorText } from "@/lib/llm-errors"
import { estimateCost } from "@/lib/model-catalog"
import {
    resolveMaxOutputTokens,
    withOutputTokenLimitFallback,
} from "@/lib/output-token-limit"
import { PROVIDERS, type ProviderName } from "@/lib/providers"
import {
    type FlattenedServerModel,
    findServerModelById,
    loadFlattenedServerModels,
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

// The most requests the browser sends by itself after a user message: 3
// retries of a rejected tool call and 2 continuations of a cut-off drawing
// (MAX_AUTO_RETRY_COUNT and MAX_CONTINUATION_RETRY_COUNT in chat-engine.tsx)
const FOLLOW_UPS_PER_TURN = 5

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

// A gateway that speaks Anthropic's format can stream thinking deltas without
// opening a thinking block first (seen with a GPT model behind one), and the
// SDK passes them on as they are. Left so, every answer fails: the SDK's own
// bookkeeping adds a "reasoning part 0 not found" error to the stream, and
// the browser's stream reader stops at a reasoning-delta whose part never
// started. The part is opened here, before either sees the delta, and closed
// with its step, where both forget the parts that were open.
const openMissingReasoning: StreamTextTransform<typeof chatTools> = () => {
    const open = new Set<string>()
    return new TransformStream({
        transform(part, controller) {
            if (part.type === "reasoning-start") open.add(part.id)
            if (part.type === "reasoning-end") open.delete(part.id)
            if (part.type === "reasoning-delta" && !open.has(part.id)) {
                open.add(part.id)
                controller.enqueue({ type: "reasoning-start", id: part.id })
            }
            if (part.type === "finish-step") {
                for (const id of open) {
                    controller.enqueue({ type: "reasoning-end", id })
                }
                open.clear()
            }
            controller.enqueue(part)
        },
    })
}

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
    // Sent with the answer, so a vote on it scores this request's trace
    const traceId = getActiveTraceId()

    // === FILE VALIDATION START ===
    const fileValidation = validateFileParts(messages)
    if (!fileValidation.valid) {
        return Response.json({ error: fileValidation.error }, { status: 400 })
    }
    // === FILE VALIDATION END ===

    // Read client AI provider overrides from headers
    const provider = req.headers.get("x-ai-provider")
    let baseUrl = req.headers.get("x-ai-base-url")
    let selectedModelId = req.headers.get("x-selected-model-id")
    // A request that names no model runs on AI_MODEL. A server without one
    // runs it on the default of its model list, the model a page selects
    // once it has the list: a first message can be sent before that.
    if (!selectedModelId && !provider && !process.env.AI_MODEL) {
        const models = await loadFlattenedServerModels()
        selectedModelId =
            (models.find((m) => m.isDefault) ?? models[0])?.id ?? null
    }

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
        } else {
            // Removed or renamed on the server after the page loaded. Going
            // on would take the provider from the header, which for a model
            // of the admin panel is its name's slug ("Invalid provider: ...").
            return Response.json(
                {
                    error: "This model is no longer available on this server.",
                    code: "server_model_gone",
                },
                { status: 400 },
            )
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

    // What runs on the server's keys, or on the server's own endpoints:
    // EdgeOne, its keyless Ollama, and anything at a private address (the
    // server's network, which ignores a dummy key header). Bedrock and
    // EdgeOne never use the base URL header. In the desktop app every
    // endpoint is the user's.
    const onServerCredentials = usesServerCredentials(
        resolvedProvider,
        clientOverrides,
    )
    const clientBaseUrl = normalizeBaseUrl(
        req.headers.get("x-ai-base-url") ?? "",
    )
    const onServerEndpoint = await usesServerEndpoint(
        resolvedProvider,
        clientBaseUrl,
        clientOverrides.apiKey,
    )

    // On the server's own keys, only run models the server offers: a server
    // model picked by id (its model name is fixed above) or one in AI_MODEL
    // on AI_PROVIDER. With their own key, users can run any model. The
    // server's keyless Ollama runs any installed model, which a home
    // server's users rely on, unless private URLs are blocked: it is an
    // internal address, reached without the request naming it.
    const envModels =
        process.env.AI_MODEL?.split(",").map((m) => m.trim()) || []
    const offeredInEnv =
        envModels.includes(modelId) && resolvedProvider === getServerProvider()
    const onBlockedOllama =
        onServerEndpoint &&
        !allowPrivateUrls() &&
        PROVIDERS[resolvedProvider].credential === "optionalKey"
    if (
        (onServerCredentials || onBlockedOllama) &&
        !serverModel &&
        !offeredInEnv
    ) {
        return Response.json(
            {
                error: `Model "${modelId}" is not available on this server. Add your own API key in Settings to use it.`,
            },
            { status: 400 },
        )
    }

    // === SERVER-SIDE QUOTA CHECK START ===
    // Quota is opt-in (DYNAMODB_QUOTA_TABLE) and counts what runs on the
    // server's keys or on the server's own endpoints
    const countsQuota =
        isQuotaEnabled() &&
        (onServerCredentials || onServerEndpoint) &&
        userId !== "anonymous"
    if (countsQuota) {
        const limits = {
            requests: Number(process.env.DAILY_REQUEST_LIMIT) || 10,
            tokens: Number(process.env.DAILY_TOKEN_LIMIT) || 200000,
            tpm: Number(process.env.TPM_LIMIT) || 20000,
        }
        // A turn's later requests (the retry after a tool error, the rest
        // of a diagram that was cut off) end with the assistant's message
        // and belong to the message the user already sent. The messages
        // are the browser's word, so the quota allows each user message a
        // fixed number of them.
        const quotaCheck =
            lastMessage?.role === "assistant"
                ? await checkFollowUpRequest(userId, limits)
                : await checkAndIncrementRequest(
                      userId,
                      limits,
                      1,
                      FOLLOW_UPS_PER_TURN,
                  )
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
        onServerCredentials || onServerEndpoint
            ? serverThinkingDefaults(providerOptions, resolvedProvider, modelId)
            : thinking
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

    // Images are not refused by the model's name: guessing which models are
    // text-only misfires on newer models (see issue #874). The request goes
    // through, and a model that cannot take images answers with the
    // provider's own error.

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
    // templates of open models behind OpenAI-compatible endpoints). The
    // reply language is named once, in the system prompt: a second sentence
    // about it at the end of this message makes GPT-6 Luna answer an
    // English request that quotes its labels in Spanish or Russian (11 of
    // 68 first replies, none of 42 without it).
    const systemMessages = [
        {
            role: "system" as const,
            content: finalSystemMessage,
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
        experimental_transform: openMissingReasoning,
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
                await recordTokenUsage(userId, quotaTokens(usage))
            }
        },
        onFinish: ({ text }) => {
            // AI SDK 6 telemetry auto-reports token usage on its spans
            setTraceOutput(text)
        },
        // onFinish is skipped when the stream fails or is aborted, so end the trace here
        onError: ({ error }) => {
            console.error(logText(error)) // what AI SDK does without an onError
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
            // The answer's tokens, time and cost so far, shown under it in the
            // chat; and its trace from the start (an answer cut off has no finish)
            messageMetadata: ({ part }) =>
                part.type === "finish"
                    ? {
                          traceId,
                          usage: addReplyUsage(
                              usedBefore,
                              part.totalUsage,
                              Date.now() - startedAt,
                              requestCost,
                          ),
                      }
                    : part.type === "start" && traceId
                      ? { traceId }
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
    console.error("Error in chat route:", logText(error))

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
