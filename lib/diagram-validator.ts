/**
 * Client-side validation orchestration for VLM-based diagram validation.
 */

import { getApiEndpoint } from "./base-path"

export interface ValidationIssue {
    type: "overlap" | "edge_routing" | "text" | "layout" | "rendering"
    severity: "critical" | "warning"
    description: string
}

export interface ValidationResult {
    valid: boolean
    issues: ValidationIssue[]
    suggestions: string[]
}

/**
 * Validate a rendered diagram by sending its PNG to the VLM validation API.
 *
 * @param pngDataUrl - Base64 PNG data URL from draw.io export
 * @param sessionId - Optional session ID for logging
 * @returns ValidationResult with issues and suggestions
 */
export async function validateRenderedDiagram(
    pngDataUrl: string,
    sessionId?: string,
): Promise<ValidationResult> {
    try {
        const response = await fetch(getApiEndpoint("/api/validate-diagram"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                imageData: pngDataUrl,
                sessionId,
            }),
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            console.error(
                "[validateRenderedDiagram] API error:",
                response.status,
                errorData,
            )
            // Return valid on API error to not block the user
            return {
                valid: true,
                issues: [],
                suggestions: [],
            }
        }

        const result: ValidationResult = await response.json()
        return result
    } catch (error) {
        console.error("[validateRenderedDiagram] Failed:", error)
        // Return valid on network error to not block the user
        return {
            valid: true,
            issues: [],
            suggestions: [],
        }
    }
}

/**
 * Format validation feedback for display to the AI model.
 * This creates a human-readable error message that guides the AI to fix issues.
 *
 * @param result - The validation result from VLM
 * @returns Formatted string for tool error output
 */
export function formatValidationFeedback(result: ValidationResult): string {
    const lines: string[] = []

    lines.push("DIAGRAM VISUAL VALIDATION FAILED")
    lines.push("")

    // Group issues by severity
    const criticalIssues = result.issues.filter(
        (i) => i.severity === "critical",
    )
    const warnings = result.issues.filter((i) => i.severity === "warning")

    if (criticalIssues.length > 0) {
        lines.push("Critical Issues (must fix):")
        for (const issue of criticalIssues) {
            lines.push(`  - [${issue.type}] ${issue.description}`)
        }
        lines.push("")
    }

    if (warnings.length > 0) {
        lines.push("Warnings:")
        for (const issue of warnings) {
            lines.push(`  - [${issue.type}] ${issue.description}`)
        }
        lines.push("")
    }

    if (result.suggestions.length > 0) {
        lines.push("Suggestions to fix:")
        for (const suggestion of result.suggestions) {
            lines.push(`  - ${suggestion}`)
        }
        lines.push("")
    }

    lines.push(
        "Please regenerate the diagram with corrected layout to fix these visual issues.",
    )

    return lines.join("\n")
}
