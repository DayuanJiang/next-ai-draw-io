/**
 * Types and utilities for VLM-based diagram validation.
 * The actual validation is performed via useValidateDiagram hook using AI SDK's useObject.
 */

// Re-export types from the schema file (single source of truth)
export type { ValidationIssue, ValidationResult } from "./validation-schema"

import type { ValidationResult } from "./validation-schema"

/**
 * Format validation feedback for display to the AI model.
 * This creates a human-readable error message that guides the AI to fix issues.
 *
 * @param result - The validation result from VLM
 * @returns Formatted string for tool error output
 */
export function formatValidationFeedback(result: ValidationResult): string {
    // If validation passed with no issues, return empty string
    if (result.valid && result.issues.length === 0) {
        return ""
    }

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
