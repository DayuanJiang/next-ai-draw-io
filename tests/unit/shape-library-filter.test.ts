// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
    extractUserPrompt,
    MAX_FILTERED_SHAPES,
    parseShapeDoc,
    rebuildShapeDoc,
    selectShapes,
} from "@/lib/shape-library-filter"

const FLAT_DOC = `# aws4

**Type:** mxgraph shapes
**Prefix:** \`mxgraph.aws4\`

## Usage

\`\`\`xml
<mxCell style="shape=mxgraph.aws4.{shape}" />
\`\`\`

## Shapes (5)

- \`lambda_function\`
- \`s3_bucket\`
- \`dynamodb_table\`
- \`ec2_instance\`
- \`rds_database\`
`

const CATEGORY_DOC = `# azure2

**Type:** image shapes
**Prefix:** \`img/lib/azure2/\`

## Shapes (5)

Shapes are organized by category: \`azure2/{category}/{shape}.svg\`

### ai_machine_learning (3)

- \`AI_Studio\`
- \`Anomaly_Detector\`
- \`Translator_Text\`

### analytics (2)

- \`Azure_Databricks\`
- \`Analysis_Services\`
`

describe("parseShapeDoc", () => {
    it("parses a flat shape list", () => {
        const parsed = parseShapeDoc(FLAT_DOC)
        expect(parsed).not.toBeNull()
        expect(parsed?.header).toContain("# aws4")
        expect(parsed?.header).toContain("## Usage")
        expect(parsed?.totalShapes).toBe(5)
        expect(parsed?.groups).toHaveLength(1)
        expect(parsed?.groups[0].heading).toBeNull()
        expect(parsed?.groups[0].shapes).toEqual([
            "lambda_function",
            "s3_bucket",
            "dynamodb_table",
            "ec2_instance",
            "rds_database",
        ])
    })

    it("parses a category-sectioned list with intro text", () => {
        const parsed = parseShapeDoc(CATEGORY_DOC)
        expect(parsed).not.toBeNull()
        expect(parsed?.totalShapes).toBe(5)
        expect(parsed?.groups).toHaveLength(2)
        expect(parsed?.groups[0].heading).toBe("### ai_machine_learning (3)")
        expect(parsed?.groups[0].shapes[0]).toBe("AI_Studio")
        expect(parsed?.groups[1].heading).toBe("### analytics (2)")
        expect(parsed?.intro).toHaveLength(1)
        expect(parsed?.intro[0]).toContain("organized by category")
    })

    it("returns null when there is no Shapes section", () => {
        expect(parseShapeDoc("# just a title\n\nsome text")).toBeNull()
    })

    it("returns null when no shape lines are present", () => {
        expect(parseShapeDoc("# doc\n\n## Shapes\n\nNo shapes here")).toBeNull()
    })
})

describe("selectShapes", () => {
    it("keeps valid names and drops hallucinated ones", () => {
        const parsed = parseShapeDoc(FLAT_DOC)!
        const kept = selectShapes(parsed, [
            "lambda_function",
            "quantum_computer", // hallucinated
            "s3_bucket",
        ])
        expect(kept).toEqual(["lambda_function", "s3_bucket"])
    })

    it("dedupes case-insensitively and canonicalizes spelling", () => {
        const parsed = parseShapeDoc(CATEGORY_DOC)!
        const kept = selectShapes(parsed, [
            "ai_studio", // lowercase, should map to AI_Studio
            "AI_Studio", // duplicate
        ])
        expect(kept).toEqual(["AI_Studio"])
    })

    it("caps the number of selected shapes", () => {
        const parsed = parseShapeDoc(FLAT_DOC)!
        const kept = selectShapes(
            parsed,
            [
                "lambda_function",
                "s3_bucket",
                "dynamodb_table",
                "ec2_instance",
                "rds_database",
            ],
            2,
        )
        expect(kept).toEqual(["lambda_function", "s3_bucket"])
        expect(MAX_FILTERED_SHAPES).toBe(15)
    })

    it("returns empty array when nothing matches", () => {
        const parsed = parseShapeDoc(FLAT_DOC)!
        expect(selectShapes(parsed, ["not_a_shape", "also_fake"])).toEqual([])
    })
})

describe("rebuildShapeDoc", () => {
    it("rebuilds a flat doc with the filtered heading and backticked names", () => {
        const parsed = parseShapeDoc(FLAT_DOC)!
        const doc = rebuildShapeDoc(parsed, ["lambda_function", "s3_bucket"])
        expect(doc).toContain("## Shapes (2 of 5 - filtered for relevance)")
        expect(doc).toContain("# aws4")
        expect(doc).toContain("## Usage")
        expect(doc).toContain("- `lambda_function`")
        expect(doc).toContain("- `s3_bucket`")
        expect(doc).not.toContain("dynamodb_table")
    })

    it("preserves category sections, drops empty ones, and updates counts", () => {
        const parsed = parseShapeDoc(CATEGORY_DOC)!
        const doc = rebuildShapeDoc(parsed, ["AI_Studio", "Analysis_Services"])
        expect(doc).toContain("### ai_machine_learning (1)")
        expect(doc).toContain("- `AI_Studio`")
        expect(doc).toContain("### analytics (1)")
        expect(doc).toContain("- `Analysis_Services`")
        expect(doc).not.toContain("Translator_Text")
        expect(doc).toContain("Shapes are organized by category")
        expect(doc).toContain("## Shapes (2 of 5 - filtered for relevance)")
    })

    it("round-trips when all shapes are kept", () => {
        const parsed = parseShapeDoc(CATEGORY_DOC)!
        const doc = rebuildShapeDoc(
            parsed,
            parsed.groups.flatMap((g) => g.shapes),
        )
        for (const shape of parsed.groups.flatMap((g) => g.shapes)) {
            expect(doc).toContain(`- \`${shape}\``)
        }
        expect(doc).toContain("## Shapes (5 of 5 - filtered for relevance)")
    })
})

describe("extractUserPrompt", () => {
    it("reads the last user message with string content", () => {
        const messages = [
            { role: "user", content: "first question" },
            { role: "assistant", content: "answer" },
            { role: "user", content: "draw me a cloud" },
        ] as any[]
        expect(extractUserPrompt(messages)).toBe("draw me a cloud")
    })

    it("reads text from a parts array and ignores files", () => {
        const messages = [
            {
                role: "user",
                content: [
                    { type: "file", url: "data:image/png;base64,xxx" },
                    { type: "text", text: "describe this image" },
                ],
            },
        ] as any[]
        expect(extractUserPrompt(messages)).toBe("describe this image")
    })

    it("returns empty string when there is no user message", () => {
        const messages = [{ role: "assistant", content: "hello" }] as any[]
        expect(extractUserPrompt(messages)).toBe("")
    })
})
