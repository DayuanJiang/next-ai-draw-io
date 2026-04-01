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
    supportsImageInput,
    supportsPromptCaching,
} from "@/lib/ai-providers"
import { findCachedResponse } from "@/lib/cached-responses"
import {
    filterHistoricalDiagramToolMessages,
    isMinimalDiagram,
    replaceHistoricalToolInputs,
    validateFileParts,
} from "@/lib/chat-helpers"
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
import { isValidAccessCode, getAccessCodes } from "@/lib/access-code"

export const maxDuration = 300

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
    if (getAccessCodes().size > 0) {
        const accessCodeHeader = req.headers.get("x-access-code")
        if (!isValidAccessCode(accessCodeHeader)) {
            return Response.json(
                {
                    error: "Invalid or missing access code. Please configure it in Settings.",
                },
                { status: 401 },
            )
        }
    }

    const { messages, xml, previousXml, sessionId } = await req.json()

    // Debug: Log raw messages from client
    console.log("[Client Messages] Raw messages count:", messages.length)
    messages.forEach((msg: any, idx: number) => {
        const contentTypes = Array.isArray(msg.content)
            ? msg.content.map((c: any) => c.type).join(",")
            : typeof msg.content
        console.log(`  [${idx}] role=${msg.role}, content types: ${contentTypes}`)
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
            msg.content.forEach((c: any, cIdx: number) => {
                if (c.type === "tool-call" || c.type === "tool_use") {
                    console.log(`    [${cIdx}] tool-call: ${c.toolName || c.name}, id=${c.id}`)
                }
            })
        }
    })

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
        apiKeyEnv?: string
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
    const { model, providerOptions, headers, modelId } =
        getAIModel(clientOverrides)

    // Check if model supports prompt caching
    // Disable for custom baseURL (proxy may not support new system array format)
    const isCustomBaseUrl = clientOverrides.baseUrl && clientOverrides.baseUrl.trim() !== ""
    const shouldCache = supportsPromptCaching(modelId) && !isCustomBaseUrl
    console.log(
        `[Prompt Caching] ${shouldCache ? "ENABLED" : "DISABLED"} for model: ${modelId}${isCustomBaseUrl ? " (disabled for custom baseURL)" : ""}`,
    )

    // Get the appropriate system prompt based on model (extended for Opus/Haiku 4.5)
    const systemMessage = getSystemPrompt(modelId, minimalStyle)

    // Extract file parts (images) from the last user message
    const fileParts =
        lastUserMessage?.parts?.filter((part: any) => part.type === "file") ||
        []

    // Debug: Log file parts
    console.log("[fileParts] count:", fileParts.length)
    if (fileParts.length > 0) {
        fileParts.forEach((fp: any, idx: number) => {
            console.log(`  [${idx}] type=${fp.type}, hasUrl=${!!fp.url}, urlLength=${fp.url?.length || 0}`)
        })
    }

    // Check if user is sending images to a model that doesn't support them
    // AI SDK silently drops unsupported parts, so we need to catch this early
    if (fileParts.length > 0 && !supportsImageInput(modelId)) {
        return Response.json(
            {
                error: `The model "${modelId}" does not support image input. Please use a vision-capable model (e.g., GPT-4o, Claude, Gemini) or remove the image.`,
            },
            { status: 400 },
        )
    }

    // User input only - XML is now in a separate cached system message
    const formattedUserInput = `User input:
"""md
${userInputText}
"""`

    // Limit message history to avoid excessive token usage
    // Keep at most MAX_HISTORY_MESSAGES, always starting with a user message
    let maxHistory = Number(process.env.MAX_CHAT_HISTORY_MESSAGES || 50)
    let limitedMessages = messages
    if (messages.length > maxHistory) {
        limitedMessages = messages.slice(-maxHistory)
        // Ensure the first message is a user message (API contract)
        const firstUserIdx = limitedMessages.findIndex((m: any) => m.role === "user")
        if (firstUserIdx > 0) {
            limitedMessages = limitedMessages.slice(firstUserIdx)
        }
    }

    // Filter historical diagram tool messages before replaying history back to the model.
    // These tools mutate the local canvas and should not influence later turns.
    const filteredMessages = filterHistoricalDiagramToolMessages(limitedMessages)

    // Convert UIMessages to ModelMessages and add system message
    const modelMessages = await convertToModelMessages(filteredMessages)

    // Debug: Log modelMessages structure after conversion
    console.log("[convertToModelMessages] Result count:", modelMessages.length)
    modelMessages.forEach((msg: any, idx: number) => {
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
            msg.content.forEach((c: any, cIdx: number) => {
                if (c.type === "tool-call" || c.type === "tool_use") {
                    console.log(`  [${idx}].content[${cIdx}] tool-call:`, {
                        type: c.type,
                        toolName: c.toolName || c.name,
                        hasInput: !!c.input,
                        inputKeys: c.input ? Object.keys(c.input) : [],
                        hasToolUse: !!c.tool_use,
                        toolUseInputKeys: c.tool_use?.input ? Object.keys(c.tool_use.input) : [],
                    })
                }
            })
        }
    })

    console.log(`[route.ts] Messages: ${messages.length} total, ${limitedMessages.length} after history limit, ${filteredMessages.length} after diagram tool filtering`)

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
                if (part.type === "tool-call" || part.type === "tool_use") {
                    // Check for valid input in either UIMessage format (part.input) or ModelMessage format (part.tool_use.input)
                    // Only ONE of them needs to be valid, not both
                    const input = part.input
                    const toolUseInput = part.tool_use?.input

                    const hasValidInput = input && typeof input === "object" && Object.keys(input).length > 0
                    const hasValidToolUseInput = toolUseInput && typeof toolUseInput === "object" && Object.keys(toolUseInput).length > 0

                    if (!hasValidInput && !hasValidToolUseInput) {
                        console.warn(
                            `[route.ts] Filtering out tool-call with invalid input:`,
                            { toolName: part.toolName, input: part.input, toolUseInput: part.tool_use?.input },
                        )
                        return false
                    }
                }
                return true
            })
            return { ...msg, content: filteredContent }
        })
        .filter((msg: any) => msg.content && msg.content.length > 0)

    console.log("[route.ts] Model messages count:", enhancedMessages.length)

    console.log("[enhancedMessages] Tool-calls in history:")
    enhancedMessages.forEach((msg: any, idx) => {
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
            msg.content.forEach((part: any, partIdx: number) => {
                if (part.type === "tool-call" || part.type === "tool_use") {
                    console.log(`  msg[${idx}].content[${partIdx}]:`, {
                        type: part.type,
                        toolName: part.toolName || part.name,
                        hasInput: !!part.input,
                        inputType: typeof part.input,
                        inputKeys: part.input && typeof part.input === "object" ? Object.keys(part.input) : "N/A",
                        hasToolUse: !!part.tool_use,
                        hasToolUseInput: !!part.tool_use?.input,
                        toolUseInputType: typeof part.tool_use?.input,
                        toolUseInputIsObject: part.tool_use?.input && typeof part.tool_use.input === "object",
                        // Show first 100 chars of input if it's a string
                        inputPreview: typeof part.input === "string" ? part.input.substring(0, 100) : JSON.stringify(part.input)?.substring(0, 100),
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
                // Log image info for debugging
                console.log("[Image part] type:", filePart.type, "url length:", filePart.url?.length, "url prefix:", filePart.url?.substring(0, 50))
                contentParts.push({
                    type: "image",
                    image: filePart.url, // AI SDK supports URL string for image
                    mediaType: filePart.mediaType, // Fixed: use mediaType instead of mimeType
                })
            }

            enhancedMessages = [
                ...enhancedMessages.slice(0, -1),
                { ...lastModelMessage, content: contentParts },
            ]
        }
    }

    // Debug: Log last user message content to verify images are included
    const lastEnhancedMsg = enhancedMessages[enhancedMessages.length - 1]
    if (lastEnhancedMsg?.role === "user" && Array.isArray(lastEnhancedMsg.content)) {
        console.log("[Last user message] content parts count:", lastEnhancedMsg.content.length)
        lastEnhancedMsg.content.forEach((part: any, idx: number) => {
            console.log(`  [${idx}] type=${part.type}, hasImage=${!!part.image}, imageLength=${part.image?.length || 0}`)
        })
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

    // Transform messages for MiniMax compatibility
    // MiniMax may not support the new tool_use.input format, so we remove tool_use and use input directly
    const transformedMessages = isCustomBaseUrl
        ? enhancedMessages.map((msg: any) => {
            if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
                return msg
            }
            const transformedContent = msg.content.map((part: any) => {
                if (part.type === "tool-call") {
                    // Remove tool_use field and use input directly
                    const { tool_use, ...rest } = part
                    return {
                        ...rest,
                        input: part.input || (tool_use?.input),
                    }
                }
                return part
            })
            return { ...msg, content: transformedContent }
        })
        : enhancedMessages

    // Debug: Log transformed messages for MiniMax
    if (isCustomBaseUrl) {
        console.log("[transformedMessages] Tool-calls after transformation:")
        transformedMessages.forEach((msg: any, idx) => {
            if (msg.role === "assistant" && Array.isArray(msg.content)) {
                msg.content.forEach((part: any, partIdx: number) => {
                    if (part && typeof part === 'object' && (part.type === "tool-call" || part.type === "tool_use")) {
                        console.log(`  msg[${idx}].content[${partIdx}]:`, {
                            type: part.type,
                            toolName: part.toolName || part.name,
                            toolCallId: part.id || part.tool_call_id,
                            inputType: typeof part.input,
                            inputKeys: part.input && typeof part.input === "object" ? Object.keys(part.input) : "N/A",
                            hasToolUse: !!part.tool_use,
                            toolUseInputExists: !!part.tool_use?.input,
                        })
                    }
                })
            }
            // Log tool messages to see tool_call_id
            if (msg.role === "tool" && Array.isArray(msg.content)) {
                msg.content.forEach((part: any, partIdx: number) => {
                    if (part && typeof part === 'object' && part.type === "tool-result") {
                        console.log(`  TOOL msg[${idx}].content[${partIdx}]:`, {
                            type: part.type,
                            toolName: part.toolName,
                            toolCallId: part.tool_call_id,
                            hasContent: !!part.content,
                        })
                    }
                })
            }
        })
    }

    // System messages with multiple cache breakpoints for optimal caching:
    // - Breakpoint 1: Static instructions (~1500 tokens) - rarely changes
    // - Breakpoint 2: Current XML context - changes per diagram, but constant within a conversation turn
    // This allows: if only user message changes, both system caches are reused
    //              if XML changes, instruction cache is still reused

    // For custom baseURL (proxy), merge system messages into a single string
    // to avoid the array format that may not be supported
    const xmlContext = `${previousXml ? `Previous diagram XML (before user's last message):\n"""xml\n${previousXml}\n"""\n\n` : ""}Current diagram XML (AUTHORITATIVE - the source of truth):\n"""xml\n${xml || ""}\n"""\n\nIMPORTANT: The "Current diagram XML" is the SINGLE SOURCE OF TRUTH for what's on the canvas right now. The user can manually add, delete, or modify shapes directly in draw.io. Always count and describe elements based on the CURRENT XML, not on what you previously generated. If both previous and current XML are shown, compare them to understand what the user changed. When using edit_diagram, COPY search patterns exactly from the CURRENT XML - attribute order matters!`

    const systemMessages = shouldCache ? [
        // Cache breakpoint 1: Instructions (rarely change)
        {
            role: "system" as const,
            content: systemMessage,
            providerOptions: {
                bedrock: { cachePoint: { type: "default" } },
            },
        },
        // Cache breakpoint 2: Previous and Current diagram XML context
        {
            role: "system" as const,
            content: xmlContext,
            providerOptions: {
                bedrock: { cachePoint: { type: "default" } },
            },
        },
    ] : [
        // For custom baseURL: single system message (string format)
        {
            role: "system" as const,
            content: `${systemMessage}\n\n${xmlContext}`,
        },
    ]

    // Build messages array - include system messages when using custom baseURL (for MiniMax compatibility)
    // When isCustomBaseUrl=true, we include system as a regular message rather than using the system parameter
    const allMessages = shouldCache
        ? [...systemMessages, ...transformedMessages]
        : isCustomBaseUrl
            ? [{ role: "system" as const, content: `${systemMessage}\n\n${xmlContext}` }, ...transformedMessages]
            : transformedMessages // For standard providers, don't include system in messages

    // Debug: Log shouldCache and system format
    console.log("[shouldCache DEBUG]:", {
        shouldCache,
        modelId,
        isCustomBaseUrl,
        supportsPromptCaching_result: modelId && (
            modelId.includes("claude") ||
            modelId.includes("anthropic") ||
            modelId.startsWith("us.anthropic") ||
            modelId.startsWith("eu.anthropic")
        )
    })
    console.log("[system content type]:", Array.isArray(allMessages[0]?.content) ? "array" : typeof allMessages[0]?.content)
    console.log("[allMessages.length]:", allMessages.length)
    console.log("[allMessages[0] role]:", allMessages[0]?.role)
    console.log("[allMessages[0] content]:", typeof allMessages[0]?.content, allMessages[0]?.content ? (Array.isArray(allMessages[0]?.content) ? `array(${allMessages[0].content.length})` : `string(${allMessages[0].content.length})`) : "undefined")

    // Debug: Log ALL messages' tool calls with full input details
    console.log("[streamText] Full message structure check:")
    allMessages.forEach((msg: any, idx) => {
        console.log(`  Message ${idx}: role=${msg.role}, content type=${typeof msg.content}, isArray=${Array.isArray(msg.content)}`)
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
            msg.content.forEach((part: any, partIdx: number) => {
                if (part.type === "tool-call") {
                    console.log(`    content[${partIdx}] tool-call:`, {
                        toolName: part.toolName,
                        inputType: typeof part.input,
                        inputIsObject: part.input && typeof part.input === "object",
                        inputKeys: part.input && typeof part.input === "object" ? Object.keys(part.input) : "N/A",
                        toolUseExists: !!part.tool_use,
                        toolUseInputType: typeof part.tool_use?.input,
                        toolUseInputIsObject: part.tool_use?.input && typeof part.tool_use.input === "object",
                        toolUseInputKeys: part.tool_use?.input && typeof part.tool_use.input === "object" ? Object.keys(part.tool_use.input) : "N/A",
                        // Show actual input value (truncated if string)
                        inputPreview: typeof part.input === "string" ? part.input.substring(0, 100) + "..." : JSON.stringify(part.input)?.substring(0, 100),
                    })
                }
            })
        }
        // Log image parts in user messages
        if (msg.role === "user" && Array.isArray(msg.content)) {
            msg.content.forEach((part: any, partIdx: number) => {
                if (part.type === "image") {
                    console.log(`    content[${partIdx}] IMAGE: url length=${part.image?.length || 0}, url prefix=${part.image?.substring(0, 50)}`)
                }
            })
        }
    })
    allMessages.forEach((msg: any, idx) => {
        if (msg.role === "assistant" && Array.isArray(msg.content)) {
            msg.content.forEach((part: any, partIdx: number) => {
                if (part.type === "tool-call") {
                    console.log(`  msg[${idx}].content[${partIdx}]:`, {
                        type: part.type,
                        toolName: part.toolName,
                        hasInput: !!part.input,
                        inputType: typeof part.input,
                        inputKeys: part.input ? Object.keys(part.input) : [],
                        hasToolUse: !!part.tool_use,
                        hasToolUseInput: !!part.tool_use?.input,
                        toolUseInputType: typeof part.tool_use?.input,
                        toolUseInputKeys: part.tool_use?.input ? Object.keys(part.tool_use.input) : [],
                    })
                }
            })
        }
    })

    // Debug: Log the request details before sending
    console.log("[streamText] About to call streamText with:")
    console.log("  system type:", !shouldCache ? "string" : "array (from messages)")
    console.log("  system length:", !shouldCache ? (systemMessage.length + xmlContext.length) : "N/A")
    console.log("  messages count:", allMessages.length)
    console.log("  first message role:", allMessages[0]?.role)
    console.log("  has tool_use in messages:", allMessages.some((m: any) =>
        m.role === "assistant" && m.content?.some?.((c: any) => c.tool_use)
    ))

    // Log full message structure including all content blocks
    console.log("[streamText] Full allMessages structure:")
    allMessages.forEach((msg: any, idx) => {
        console.log(`  [${idx}] role=${msg.role}, content type=${typeof msg.content}, isArray=${Array.isArray(msg.content)}`)
        if (Array.isArray(msg.content)) {
            msg.content.forEach((part: any, pIdx: number) => {
                if (part && typeof part === 'object') {
                    const logEntry: any = {
                        type: part.type,
                        toolName: part.toolName || part.name || 'N/A'
                    }
                    if (part.type === 'tool-call' || part.type === 'tool_use') {
                        logEntry.id = part.id
                        logEntry.inputType = typeof part.input
                    }
                    if (part.type === 'tool-result') {
                        logEntry.tool_call_id = part.tool_call_id
                        logEntry.toolName = part.toolName
                    }
                    console.log(`    [${pIdx}]`, logEntry)
                }
            })
        }
    })

    console.log("[streamText] Request details:", {
        modelId,
        provider: clientOverrides.provider,
        messageCount: allMessages.length,
        hasTools: true,
        toolNames: ["display_diagram", "edit_diagram", "append_diagram", "get_shape_library"],
        firstMessageType: typeof allMessages[0]?.content,
        lastMessageType: typeof allMessages[allMessages.length - 1]?.content,
        useSystemParam: !shouldCache,
    })

    const result = streamText({
        model,
        ...(process.env.MAX_OUTPUT_TOKENS && {
            maxOutputTokens: parseInt(process.env.MAX_OUTPUT_TOKENS, 10),
        }),
        // For custom baseURL: system is now included directly in messages array (as role: "system")
        // For standard providers with caching: system is passed via systemMessages array
        // For standard providers without caching: use system parameter
        ...(shouldCache && !isCustomBaseUrl && {
            system: systemMessage,
        }),
        stopWhen: stepCountIs(5),
        // Repair truncated tool calls when maxOutputTokens is reached mid-JSON
        // DISABLED for MiniMax (custom baseUrl) because MiniMax doesn't accept tool_use.input format
        ...(isCustomBaseUrl ? {} : {
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
                    // Use jsonrepair to fix truncated JSON, then parse it back to object
                    const repairedInput = jsonrepair(inputToRepair)
                    console.log(
                        `[repairToolCall] Repaired truncated JSON for tool: ${toolCall.toolName}, repaired length: ${repairedInput.length}`,
                    )
                    // jsonrepair returns a string, so we need to parse it back to an object
                    const parsedInput = JSON.parse(repairedInput)
                    console.log(
                        `[repairToolCall] Parsed input type: ${typeof parsedInput}, isObject: ${typeof parsedInput === "object"}, keys: ${typeof parsedInput === "object" ? Object.keys(parsedInput) : "N/A"}`,
                    )
                    // Remove tool_use if present (MiniMax doesn't accept it) and only use input
                    const toolCallAny = toolCall as any
                    const { tool_use, ...rest } = toolCallAny
                    return { ...rest, input: parsedInput }
                } catch (repairError) {
                    console.warn(
                        `[repairToolCall] Failed to repair JSON for tool: ${toolCall.toolName}`,
                        repairError,
                    )
                    // Return null to skip this tool call when repair fails
                    // This is safer than sending potentially invalid data to the API
                    console.log(`[repairToolCall] Skipping tool call ${toolCall.toolName} due to repair failure`)
                    return null
                }
            }
            // Don't attempt to repair other errors (like NoSuchToolError)
            return null
        }}),
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
                recordTokenUsage(userId, totalTokens).catch((err) => {
                    console.error("[chat] Failed to record token usage:", err?.message || err)
                })
            }
        },
        tools: {
            // Client-side tool that will be executed on the client
            display_diagram: {
                description: `Display a diagram on draw.io. Creates a NEW PAGE by default to preserve existing content.

IMPORTANT: You MUST provide a descriptive page name based on the diagram content.
Examples: "AWS Architecture", "User Login Flow", "Database Schema", "System Overview"

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
- Each diagram is saved as a separate page in the same .drawio file
- **IMPORTANT: When the user asks to create a NEW diagram (not edit existing), ALWAYS call display_diagram to create a NEW PAGE. The existing diagram content will be PRESERVED as other pages.**
- Users can switch between pages using the tabs at the bottom of the editor
`,
                inputSchema: z.object({
                    xml: z
                        .string()
                        .describe("XML string to be displayed on draw.io"),
                    pageName: z
                        .string()
                        .describe("Descriptive name for this diagram page based on its content (e.g., 'AWS Architecture', 'User Flow')"),
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
- Cloud: aws4, azure2, gcp2, alibaba_cloud, openstack, salesforce
- Networking: cisco19, network, kubernetes, vvd, rack
- Business: bpmn, lean_mapping
- General: flowchart, basic, arrows2, infographic, sitemap
- UI/Mockups: android
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
                            return `Library "${library}" not found. Available: aws4, azure2, gcp2, alibaba_cloud, cisco19, kubernetes, network, bpmn, flowchart, basic, arrows2, vvd, salesforce, citrix, sap, mscae, atlassian, fluidpower, electrical, pid, cabinets, floorplan, webicons, infographic, sitemap, android, lean_mapping, openstack, rack`
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

    try {
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
    } catch (streamError) {
        // Handle stream errors (e.g., client disconnected)
        console.error("[chat] Stream error:", streamError)
        // Return a minimal error response instead of throwing
        // This prevents the 500 error from propagating
        if (streamError instanceof Error && streamError.message.includes("pipe")) {
            return new Response("Error: Client disconnected", { status: 499 })
        }
        throw streamError
    }
}

// Helper to categorize errors and return appropriate response
function handleError(error: unknown): Response {
    console.error("Error in chat route:", error)

    const isDev = process.env.NODE_ENV === "development"

    // Check for specific AI SDK error types
    if (APICallError.isInstance(error)) {
        // Special handling for context window exceeded errors
        const errorMessage = error.message.toLowerCase()
        if (errorMessage.includes("context window") || errorMessage.includes("context window exceeds")) {
            return Response.json(
                {
                    error: "对话历史太长，超过了模型的上下文窗口限制。请减少对话历史或开启新对话。",
                    type: "context_limit",
                    suggestion: "您可以在设置中减少对话历史长度，或开始新的对话。",
                },
                { status: 400 },
            )
        }
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
