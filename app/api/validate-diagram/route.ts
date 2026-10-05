/**
 * API endpoint for VLM-based diagram validation.
 * Accepts a PNG image and streams validation results using useObject-compatible format.
 */

import { Output, streamText } from "ai"
import { checkAccessCode, rejectCrossSite } from "@/lib/access-code"
import { getValidationModel } from "@/lib/ai-providers"
import {
    checkAndIncrementRequest,
    isQuotaEnabled,
    recordTokenUsage,
} from "@/lib/dynamo-quota-manager"
import { getUserIdFromRequest } from "@/lib/user-id"
import { VALIDATION_SYSTEM_PROMPT } from "@/lib/validation-prompts"
import {
    type ValidationResult,
    ValidationResultSchema,
} from "@/lib/validation-schema"

export const maxDuration = 30

// Data URL length cap (~3.75 MB of PNG), well above a normal diagram capture
const MAX_IMAGE_DATA_LENGTH = 5 * 1024 * 1024

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

/** A fixed result in the text format useObject reads */
function createStreamingResponse(result: ValidationResult): Response {
    return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
}

export async function POST(req: Request): Promise<Response> {
    const crossSite = rejectCrossSite(req)
    if (crossSite) return crossSite
    // Uses the server's model credentials, so require the access code
    const accessError = checkAccessCode(req)
    if (accessError) return accessError

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

        if (imageData.length > MAX_IMAGE_DATA_LENGTH) {
            return Response.json(
                { error: "Image data too large" },
                { status: 413 },
            )
        }

        // It runs the server's vision model: with the quota on, the daily
        // and per-minute token limits apply, and its tokens are counted. Not
        // the request limit, which is for chats: the day's last chat still
        // gets its check, and a check does not count as a chat.
        const userId = getUserIdFromRequest(req)
        const countsQuota = isQuotaEnabled() && userId !== "anonymous"
        if (countsQuota) {
            const quotaCheck = await checkAndIncrementRequest(
                userId,
                {
                    requests: 0,
                    tokens: Number(process.env.DAILY_TOKEN_LIMIT) || 200000,
                    tpm: Number(process.env.TPM_LIMIT) || 20000,
                },
                0,
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
        const result = streamText({
            model,
            output: Output.object({ schema: ValidationResultSchema }),
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
            onFinish: ({ output, totalUsage }) => {
                if (countsQuota && totalUsage) {
                    recordTokenUsage(
                        userId,
                        (totalUsage.inputTokens || 0) +
                            (totalUsage.outputTokens || 0),
                    )
                }
                if (sessionId && output) {
                    console.log(
                        `[validate-diagram] Session ${sessionId}: valid=${output.valid}, issues=${output.issues?.length ?? 0}`,
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
