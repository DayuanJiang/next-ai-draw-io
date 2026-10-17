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
})
