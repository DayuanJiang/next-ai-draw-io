import { describe, expect, it } from "vitest"
import {
    formatValidationFeedback,
    type ValidationResult,
} from "@/lib/diagram-validator"

describe("formatValidationFeedback", () => {
    it("formats result with critical issues", () => {
        const result: ValidationResult = {
            valid: false,
            issues: [
                {
                    type: "overlap",
                    severity: "critical",
                    description: "Box A overlaps with Box B",
                },
            ],
            suggestions: ["Move Box A to the left"],
        }

        const feedback = formatValidationFeedback(result)

        expect(feedback).toContain("DIAGRAM VISUAL VALIDATION FAILED")
        expect(feedback).toContain("Critical Issues (must fix):")
        expect(feedback).toContain("[overlap] Box A overlaps with Box B")
        expect(feedback).toContain("Suggestions to fix:")
        expect(feedback).toContain("Move Box A to the left")
        expect(feedback).toContain(
            "Please regenerate the diagram with corrected layout",
        )
    })

    it("formats result with warnings only", () => {
        const result: ValidationResult = {
            valid: true,
            issues: [
                {
                    type: "text",
                    severity: "warning",
                    description: "Label text is small",
                },
            ],
            suggestions: [],
        }

        const feedback = formatValidationFeedback(result)

        expect(feedback).toContain("Warnings:")
        expect(feedback).toContain("[text] Label text is small")
        expect(feedback).not.toContain("Critical Issues")
    })

    it("formats result with both critical issues and warnings", () => {
        const result: ValidationResult = {
            valid: false,
            issues: [
                {
                    type: "edge_routing",
                    severity: "critical",
                    description: "Edge crosses through node",
                },
                {
                    type: "layout",
                    severity: "warning",
                    description: "Uneven spacing",
                },
            ],
            suggestions: ["Reroute the edge", "Adjust spacing"],
        }

        const feedback = formatValidationFeedback(result)

        expect(feedback).toContain("Critical Issues (must fix):")
        expect(feedback).toContain("[edge_routing] Edge crosses through node")
        expect(feedback).toContain("Warnings:")
        expect(feedback).toContain("[layout] Uneven spacing")
        expect(feedback).toContain("Reroute the edge")
        expect(feedback).toContain("Adjust spacing")
    })

    it("returns empty string for valid result with no issues", () => {
        const result: ValidationResult = {
            valid: true,
            issues: [],
            suggestions: [],
        }

        const feedback = formatValidationFeedback(result)

        expect(feedback).toBe("")
    })

    it("formats result with multiple suggestions", () => {
        const result: ValidationResult = {
            valid: false,
            issues: [
                {
                    type: "rendering",
                    severity: "critical",
                    description: "Missing element",
                },
            ],
            suggestions: [
                "Check the XML syntax",
                "Ensure all elements are defined",
                "Verify parent-child relationships",
            ],
        }

        const feedback = formatValidationFeedback(result)

        expect(feedback).toContain("Check the XML syntax")
        expect(feedback).toContain("Ensure all elements are defined")
        expect(feedback).toContain("Verify parent-child relationships")
    })
})
