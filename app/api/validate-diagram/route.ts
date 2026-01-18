/**
 * API endpoint for VLM-based diagram validation.
 * Accepts a PNG image and streams validation results using useObject-compatible format.
 */

import { streamObject } from "ai"
import { z } from "zod"
import { getValidationModel } from "@/lib/ai-providers"
import { VALIDATION_SYSTEM_PROMPT } from "@/lib/validation-prompts"

export const maxDuration = 30

// Schema for structured validation output - exported for client-side useObject
export const ValidationResultSchema = z.object({
    valid: z.boolean().describe("True if there are no critical issues"),
    issues: z
        .array(
            z.object({
                type: z
                    .enum([
                        "overlap",
                        "edge_routing",
                        "text",
                        "layout",
                        "rendering",
                    ])
                    .describe("Type of visual issue"),
                severity: z
                    .enum(["critical", "warning"])
                    .describe("Severity level"),
                description: z
                    .string()
                    .describe("Clear description of the issue"),
            }),
        )
        .describe("List of visual issues found"),
    suggestions: z
        .array(z.string())
        .describe("Actionable suggestions to fix issues"),
})

export type ValidationResult = z.infer<typeof ValidationResultSchema>

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

export async function POST(req: Request): Promise<Response> {
    try {
        // Check if VLM validation is enabled (default: true)
        const enableValidation = process.env.ENABLE_VLM_VALIDATION !== "false"
        if (!enableValidation) {
            return Response.json(DEFAULT_VALID_RESULT)
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
            return Response.json(DEFAULT_VALID_RESULT)
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
        return Response.json(DEFAULT_VALID_RESULT)
    }
}
