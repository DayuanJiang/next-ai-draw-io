/**
 * VLM system prompt and response parsing for diagram validation.
 */

import type { ValidationResult } from "./diagram-validator"

export const VALIDATION_SYSTEM_PROMPT = `You are a diagram quality validator. Analyze the rendered diagram image for visual issues.

Evaluate the diagram for the following issues:

1. **Overlapping elements** (critical): Shapes covering each other inappropriately, making content unreadable
2. **Edge routing issues** (critical): Lines/arrows crossing through shapes that are not their source or target
3. **Text readability** (warning): Labels cut off, overlapping, or too small to read
4. **Layout quality** (warning): Poor spacing, misalignment, or cramped elements
5. **Rendering errors** (critical): Incomplete, corrupted, or missing visual elements

Return your analysis as a JSON object with this structure:
{
  "valid": boolean,
  "issues": [
    {
      "type": "overlap" | "edge_routing" | "text" | "layout" | "rendering",
      "severity": "critical" | "warning",
      "description": "Clear description of the issue and where it occurs"
    }
  ],
  "suggestions": ["Specific actionable suggestions to fix the issues"]
}

Rules:
- Set "valid" to true ONLY if there are no critical issues
- Be specific about which elements have problems (e.g., "The 'Login' box overlaps with 'Register' box")
- Provide actionable suggestions (e.g., "Move the Login box 50 pixels to the left")
- Minor cosmetic issues (slight misalignment, non-uniform spacing) should be warnings, not critical
- Empty diagrams or diagrams with only 1-2 elements should pass unless they have obvious errors
- If the diagram looks generally acceptable, set valid to true even with minor warnings

Return ONLY the JSON object, no additional text.`

/**
 * Parse the VLM response text into a ValidationResult.
 * Handles various response formats and edge cases.
 */
export function parseValidationResponse(text: string): ValidationResult {
    try {
        // Try to extract JSON from the response
        // The VLM might wrap the JSON in markdown code blocks
        let jsonStr = text.trim()

        // Remove markdown code block if present
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (jsonMatch) {
            jsonStr = jsonMatch[1].trim()
        }

        // Try to find JSON object if there's extra text
        const objectMatch = jsonStr.match(/\{[\s\S]*\}/)
        if (objectMatch) {
            jsonStr = objectMatch[0]
        }

        const parsed = JSON.parse(jsonStr)

        // Validate the structure
        if (typeof parsed.valid !== "boolean") {
            console.warn(
                "[parseValidationResponse] Missing or invalid 'valid' field",
            )
            return {
                valid: true, // Default to valid if parsing fails
                issues: [],
                suggestions: [],
            }
        }

        // Normalize issues array
        const issues = Array.isArray(parsed.issues)
            ? parsed.issues
                  .filter(
                      (issue: any) =>
                          issue &&
                          typeof issue.type === "string" &&
                          typeof issue.severity === "string" &&
                          typeof issue.description === "string",
                  )
                  .map((issue: any) => ({
                      type: issue.type as
                          | "overlap"
                          | "edge_routing"
                          | "text"
                          | "layout"
                          | "rendering",
                      severity: issue.severity as "critical" | "warning",
                      description: issue.description,
                  }))
            : []

        // Normalize suggestions array
        const suggestions = Array.isArray(parsed.suggestions)
            ? parsed.suggestions.filter((s: any) => typeof s === "string")
            : []

        return {
            valid: parsed.valid,
            issues,
            suggestions,
        }
    } catch (error) {
        console.error(
            "[parseValidationResponse] Failed to parse VLM response:",
            error,
        )
        console.error("[parseValidationResponse] Raw response:", text)

        // If parsing fails, default to valid to avoid blocking the user
        return {
            valid: true,
            issues: [],
            suggestions: [],
        }
    }
}
