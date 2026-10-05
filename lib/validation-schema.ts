/**
 * Shared validation schema for VLM-based diagram validation.
 * This file can be safely imported on both client and server.
 */

import { z } from "zod"

// Schema for structured validation output
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
export type ValidationIssue = ValidationResult["issues"][number]
