/**
 * EdgeOne Pages Edge Function for OpenAI-compatible Chat Completions API
 *
 * This endpoint provides an OpenAI-compatible API that can be used with
 * AI SDK's createOpenAI({ baseURL: '/api/edgeai' })
 *
 * Uses EdgeOne Edge AI's AI.chatCompletions() which now supports native tool calling.
 */

import { z } from "zod"

// EdgeOne Pages global AI object
declare const AI: {
    chatCompletions(options: {
        model: string
        messages: Array<{ role: string; content: string | null }>
        stream?: boolean
        max_tokens?: number
        temperature?: number
        tools?: any
        tool_choice?: any
    }): Promise<ReadableStream<Uint8Array> | any>
}

const messageItemSchema = z
    .object({
        role: z.enum(["user", "assistant", "system", "tool", "function"]),
        content: z.string().nullable().optional(),
    })
    .passthrough()

// The fields read here; every other field is passed on to AI.chatCompletions
const messageSchema = z
    .object({
        messages: z.array(messageItemSchema),
        model: z.string().optional(),
        stream: z.boolean().optional(),
        tools: z.any().optional(),
        tool_choice: z.any().optional(),
    })
    .passthrough()

// Model configuration
const ALLOWED_MODELS = [
    "@tx/deepseek-ai/deepseek-v32",
    "@tx/deepseek-ai/deepseek-r1-0528",
    "@tx/deepseek-ai/deepseek-v3-0324",
]

/**
 * Create standardized JSON response
 */
function createResponse(body: any, status = 200, extraHeaders = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...extraHeaders,
        },
    })
}

// Only the app's own server (/api/chat, /api/validate-model) calls this
// function, so no CORS headers are sent: other sites' pages can't call it
// from a browser and spend the deployment's Edge AI quota.
// Same rule as lib/access-code.ts, but reading the edge function's env.
// No codes configured (or env unavailable) means no check.
function hasValidAccessCode(request: Request, env: any): boolean {
    const accessCodes: string[] =
        env?.ACCESS_CODE_LIST?.split(",")
            .map((code: string) => code.trim())
            .filter(Boolean) || []
    if (accessCodes.length === 0) return true
    const accessCode = request.headers.get("x-access-code")
    return !!accessCode && accessCodes.includes(accessCode)
}

export async function onRequest({ request, env }: any) {
    // Requiring JSON also makes any cross-site browser request need a CORS
    // preflight, which fails without CORS headers. Only the type before any
    // parameters counts: "text/plain; x=application/json" needs none.
    const mediaType = (request.headers.get("content-type") ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase()
    if (request.method !== "POST" || mediaType !== "application/json") {
        return createResponse(
            {
                error: {
                    message: "Expected a POST request with a JSON body",
                    type: "invalid_request_error",
                },
            },
            400,
        )
    }

    if (!hasValidAccessCode(request, env)) {
        return createResponse(
            {
                error: {
                    message: "Invalid or missing access code",
                    type: "invalid_request_error",
                },
            },
            401,
        )
    }

    request.headers.delete("accept-encoding")

    try {
        const json = await request.clone().json()
        const parseResult = messageSchema.safeParse(json)

        if (!parseResult.success) {
            return createResponse(
                {
                    error: {
                        message: parseResult.error.message,
                        type: "invalid_request_error",
                    },
                },
                400,
            )
        }

        // stream is taken out so it is not passed on: AI.chatCompletions
        // only streams, and every caller reads a stream
        const {
            messages,
            model,
            stream: _,
            tools,
            tool_choice,
            ...extraParams
        } = parseResult.data

        // Validate messages
        const userMessages = messages.filter(
            (message) => message.role === "user",
        )
        if (!userMessages.length) {
            return createResponse(
                {
                    error: {
                        message: "No user message found",
                        type: "invalid_request_error",
                    },
                },
                400,
            )
        }

        // Resolve model
        const selectedModel = model || ALLOWED_MODELS[0]

        if (!ALLOWED_MODELS.includes(selectedModel)) {
            return createResponse(
                {
                    error: {
                        message: `Invalid model: ${selectedModel}.`,
                        type: "invalid_request_error",
                    },
                },
                400,
            )
        }

        console.log(
            `[EdgeOne] Model: ${selectedModel}, Tools: ${tools?.length || 0}`,
        )

        try {
            // Build AI.chatCompletions options for streaming
            const aiOptions: any = {
                ...extraParams,
                model: selectedModel,
                messages,
                stream: true,
            }

            // Add tools if provided
            if (tools && tools.length > 0) {
                aiOptions.tools = tools
            }
            if (tool_choice !== undefined) {
                aiOptions.tool_choice = tool_choice
            }

            const aiResponse = await AI.chatCompletions(aiOptions)

            // Streaming response
            return new Response(aiResponse, {
                headers: {
                    "Content-Type": "text/event-stream; charset=utf-8",
                    "Cache-Control": "no-cache, no-store, no-transform",
                    "X-Accel-Buffering": "no",
                    Connection: "keep-alive",
                },
            })
        } catch (error: any) {
            // Handle EdgeOne specific errors
            try {
                const message = JSON.parse(error.message)
                if (message.code === 14020) {
                    return createResponse(
                        {
                            error: {
                                message:
                                    "The daily public quota has been exhausted. After deployment, you can enjoy a personal daily exclusive quota.",
                                type: "rate_limit_error",
                            },
                        },
                        429,
                    )
                }
            } catch {
                // Not a JSON error message
            }

            console.error("[EdgeOne] AI error:", error.message)
            return createResponse(
                {
                    error: {
                        message: error.message || "AI service error",
                        type: "api_error",
                    },
                },
                500,
            )
        }
    } catch (error: any) {
        console.error("[EdgeOne] Request error:", error.message)
        return createResponse(
            {
                error: {
                    message: "Request processing failed",
                    type: "server_error",
                    details: error.message,
                },
            },
            500,
        )
    }
}
