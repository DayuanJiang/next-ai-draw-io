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

const messageSchema = z
    .object({
        messages: z.array(messageItemSchema),
        model: z.string().optional(),
        stream: z.boolean().optional(),
        tools: z.any().optional(),
        tool_choice: z.any().optional(),
        functions: z.any().optional(),
        function_call: z.any().optional(),
        temperature: z.number().optional(),
        top_p: z.number().optional(),
        max_tokens: z.number().optional(),
        presence_penalty: z.number().optional(),
        frequency_penalty: z.number().optional(),
        stop: z.union([z.string(), z.array(z.string())]).optional(),
        response_format: z.any().optional(),
        seed: z.number().optional(),
        user: z.string().optional(),
        n: z.number().int().optional(),
        logit_bias: z.record(z.string(), z.number()).optional(),
        parallel_tool_calls: z.boolean().optional(),
        stream_options: z.any().optional(),
    })
    .passthrough()

// Model configuration
const ALLOWED_MODELS = [
    "@tx/deepseek-ai/deepseek-v32",
    "@tx/deepseek-ai/deepseek-r1-0528",
    "@tx/deepseek-ai/deepseek-v3-0324",
]

const MODEL_ALIASES: Record<string, string> = {
    "deepseek-v3.2": "@tx/deepseek-ai/deepseek-v32",
    "deepseek-r1-0528": "@tx/deepseek-ai/deepseek-r1-0528",
    "deepseek-v3-0324": "@tx/deepseek-ai/deepseek-v3-0324",
}

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

/**
 * Create standardized response with CORS headers
 */
function createResponse(body: any, status = 200, extraHeaders = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
            ...extraHeaders,
        },
    })
}

/**
 * Handle OPTIONS request for CORS preflight
 */
function handleOptionsRequest(): Response {
    return new Response(null, {
        headers: {
            ...CORS_HEADERS,
            "Access-Control-Max-Age": "86400",
        },
    })
}

export async function onRequest({ request, env: _env }: any) {
    if (request.method === "OPTIONS") {
        return handleOptionsRequest()
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

        const { messages, model, stream, tools, tool_choice, ...extraParams } =
            parseResult.data

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
        const requestedModel = model || ALLOWED_MODELS[0]
        const selectedModel = MODEL_ALIASES[requestedModel] || requestedModel

        if (!ALLOWED_MODELS.includes(selectedModel)) {
            return createResponse(
                {
                    error: {
                        message: `Invalid model: ${requestedModel}.`,
                        type: "invalid_request_error",
                    },
                },
                429,
            )
        }

        console.log(
            `[EdgeOne] Model: ${selectedModel}, Tools: ${tools?.length || 0}, Stream: ${stream ?? true}`,
        )

        try {
            const isStream = !!stream

            // Non-streaming: return mock response for validation
            // AI.chatCompletions doesn't support non-streaming mode
            if (!isStream) {
                const mockResponse = {
                    id: `chatcmpl-${Date.now()}`,
                    object: "chat.completion",
                    created: Math.floor(Date.now() / 1000),
                    model: selectedModel,
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: "OK",
                            },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 1,
                        total_tokens: 11,
                    },
                }
                return createResponse(mockResponse)
            }

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
                    ...CORS_HEADERS,
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
                return createResponse(
                    { error: { message: error.message, type: "api_error" } },
                    500,
                )
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
