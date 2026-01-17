/**
 * API endpoint for VLM-based diagram validation.
 * Accepts a PNG image and returns validation results.
 */

import { generateText } from "ai"
import { getValidationModel } from "@/lib/ai-providers"
import type { ValidationResult } from "@/lib/diagram-validator"
import {
    parseValidationResponse,
    VALIDATION_SYSTEM_PROMPT,
} from "@/lib/validation-prompts"

export const maxDuration = 30

interface ValidateDiagramRequest {
    imageData: string // Base64 PNG data URL
    xml: string // Diagram XML for context
    sessionId?: string
}

export async function POST(req: Request): Promise<Response> {
    try {
        // Check if VLM validation is enabled (default: true)
        const enableValidation = process.env.ENABLE_VLM_VALIDATION !== "false"
        if (!enableValidation) {
            return Response.json({
                valid: true,
                issues: [],
                suggestions: [],
            } satisfies ValidationResult)
        }

        const body: ValidateDiagramRequest = await req.json()
        const { imageData, xml, sessionId } = body

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
            return Response.json({
                valid: true,
                issues: [],
                suggestions: [],
            } satisfies ValidationResult)
        }

        const timeout = parseInt(process.env.VALIDATION_TIMEOUT || "10000", 10)

        // Call the VLM with the image
        const result = await Promise.race([
            generateText({
                model,
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
                                text: "Please analyze this diagram for visual quality issues and return your assessment as JSON.",
                            },
                        ],
                    },
                ],
                maxOutputTokens: 1024,
            }),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(new Error("Validation timeout")),
                    timeout,
                ),
            ),
        ])

        // Parse the VLM response
        const validationResult = parseValidationResponse(result.text)

        if (sessionId) {
            console.log(
                `[validate-diagram] Session ${sessionId}: valid=${validationResult.valid}, issues=${validationResult.issues.length}`,
            )
        }

        return Response.json(validationResult)
    } catch (error) {
        console.error("[validate-diagram] Error:", error)

        // On error, return valid to not block the user
        return Response.json({
            valid: true,
            issues: [],
            suggestions: [],
        } satisfies ValidationResult)
    }
}
