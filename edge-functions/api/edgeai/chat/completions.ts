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
 * Create standardized JSON response with CORS headers
 */
function jsonResponse(body: any, status = 200, extraHeaders = {}): Response {
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
 * Create standardized error response with proper HTTP status code
 * For AI SDK compatibility, we throw the error in OpenAI format
 */
function errorResponse(
    message: string,
    type:
        | "invalid_request_error"
        | "rate_limit_error"
        | "api_error"
        | "server_error" = "api_error",
    details?: string,
): Response {
    // Map error type to HTTP status code
    const statusMap: Record<string, number> = {
        invalid_request_error: 400,
        rate_limit_error: 429,
        api_error: 500,
        server_error: 500,
    }
    const status = statusMap[type] || 500

    // Return OpenAI-compatible error format
    return new Response(
        JSON.stringify({
            error: {
                message,
                type,
                param: null,
                code: type,
                ...(details && { details }),
            },
        }),
        {
            status,
            headers: {
                "Content-Type": "application/json",
                ...CORS_HEADERS,
            },
        },
    )
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

export async function onRequest({ request, env }: any) {
    if (request.method === "OPTIONS") {
        return handleOptionsRequest()
    }

    request.headers.delete("accept-encoding")

    try {
        const json = await request.clone().json()

        const parseResult = messageSchema.safeParse(json)

        if (!parseResult.success) {
            return errorResponse(
                parseResult.error.message,
                "invalid_request_error",
            )
        }

        const { messages, model, stream, tools, tool_choice, ...extraParams } =
            parseResult.data
        const isStream = stream ?? true

        // Validate messages
        const userMessages = messages.filter(
            (message) => message.role === "user",
        )
        if (!userMessages.length) {
            return errorResponse(
                "No user message found",
                "invalid_request_error",
            )
        }

        // Resolve model
        const requestedModel = model || ALLOWED_MODELS[0]
        const selectedModel = MODEL_ALIASES[requestedModel] || requestedModel

        if (!ALLOWED_MODELS.includes(selectedModel)) {
            const allowedModelList = [
                ...ALLOWED_MODELS,
                ...Object.keys(MODEL_ALIASES),
            ]
            return errorResponse(
                `Invalid model: ${requestedModel}. Allowed models: ${allowedModelList.join(", ")}`,
                "invalid_request_error",
            )
        }

        console.log(
            `[EdgeOne] Model: ${selectedModel}, Tools: ${tools?.length || 0}, Stream: ${isStream}`,
        )

        try {
            // @ts-expect-error-next-line
            const aiResponse = await AI.chatCompletions({
                ...extraParams,
                model: selectedModel,
                messages,
                stream: isStream,
                ...(tools && tools.length > 0 && { tools }),
                ...(tool_choice !== undefined && { tool_choice }),
            })

            if (!isStream) {
                return jsonResponse(aiResponse)
            }

            return new Response(aiResponse, {
                headers: {
                    "Content-Type": "text/event-stream; charset=utf-8",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                    ...CORS_HEADERS,
                },
            })
        } catch (error: any) {
            // Handle EdgeOne specific errors
            try {
                const message = JSON.parse(error.message)
                if (message.code === 14020) {
                    return errorResponse(
                        "The daily public quota has been exhausted. After deployment, you can enjoy a personal daily exclusive quota.",
                        "rate_limit_error",
                    )
                }
            } catch {
                // Not a JSON error message
            }

            console.error("[EdgeOne] AI error:", error.message)
            return errorResponse(
                error.message || "AI service error",
                "api_error",
            )
        }
    } catch (error: any) {
        console.error("[EdgeOne] Request error:", error.message)
        return errorResponse(
            "Request processing failed",
            "server_error",
            error.message,
        )
    }
}
