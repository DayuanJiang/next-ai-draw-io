/**
 * API endpoint for VLM-based diagram validation.
 * Accepts a PNG image and streams validation results using useObject-compatible format.
 */

import { streamObject } from "ai"
import { getValidationModel } from "@/lib/ai-providers"
import { VALIDATION_SYSTEM_PROMPT } from "@/lib/validation-prompts"
import {
    type ValidationResult,
    ValidationResultSchema,
} from "@/lib/validation-schema"

export const maxDuration = 30

interface ValidateDiagramRequest {
    imageData: string // Base64 PNG data URL
    sessionId?: string
}

// Default valid result for disabled/error cases
const DEFAULT_VALID_RESULT: ValidationResult = {
    valid: true,
    issues: [],
    suggestions: [],
}

/**
 * Create a streaming response for useObject compatibility.
 * useObject expects text stream format, not plain JSON.
 */
function createStreamingResponse(result: ValidationResult): Response {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
        start(controller) {
            // Stream the JSON as text (useObject parses this)
            controller.enqueue(encoder.encode(JSON.stringify(result)))
            controller.close()
        },
    })
    return new Response(stream, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
}

export async function POST(req: Request): Promise<Response> {
    try {
        // Check if VLM validation is enabled (default: true)
        const enableValidation = process.env.ENABLE_VLM_VALIDATION !== "false"
        if (!enableValidation) {
            return createStreamingResponse(DEFAULT_VALID_RESULT)
        }

        const body: ValidateDiagramRequest = await req.json()
        const { imageData, sessionId } = body

        if (!imageData) {
            return Response.json(
                { error: "Missing imageData" },
                { status: 400 },
            )
        }

        // Validate image data format
        if (
            !imageData.startsWith("data:image/png;base64,") &&
            !imageData.startsWith("data:image/")
        ) {
            return Response.json(
                { error: "Invalid image data format" },
                { status: 400 },
            )
        }

        // Get the validation model
        let model
        try {
            model = getValidationModel()
        } catch (error) {
            console.warn(
                "[validate-diagram] Validation model not available:",
                error,
            )
            // Return valid if no vision model is configured
            return createStreamingResponse(DEFAULT_VALID_RESULT)
        }

        // Parse timeout with validation (minimum 1000ms, default 10000ms)
        const timeout =
            Math.max(
                1000,
                parseInt(process.env.VALIDATION_TIMEOUT || "10000", 10),
            ) || 10000

        // Stream the VLM response for useObject consumption
        const result = streamObject({
            model,
            schema: ValidationResultSchema,
            system: VALIDATION_SYSTEM_PROMPT,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "image",
                            image: imageData,
                        },
                        {
                            type: "text",
                            text: "Please analyze this diagram for visual quality issues.",
                        },
                    ],
                },
            ],
            maxOutputTokens: 1024,
            abortSignal: AbortSignal.timeout(timeout),
            onFinish: ({ object }) => {
                if (sessionId && object) {
                    console.log(
                        `[validate-diagram] Session ${sessionId}: valid=${object.valid}, issues=${object.issues?.length ?? 0}`,
                    )
                }
            },
        })

        return result.toTextStreamResponse()
    } catch (error) {
        // Log with session context if available
        const errorMessage =
            error instanceof Error ? error.message : String(error)
        console.error("[validate-diagram] Error:", errorMessage)

        // On error, return valid to not block the user
        return createStreamingResponse(DEFAULT_VALID_RESULT)
    }
}
