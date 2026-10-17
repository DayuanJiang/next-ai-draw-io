import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { DEMO_LINE, DOC_DEMOS } from "@/components/site/demo-names"
import { withOwnId } from "@/components/site/serverless-diagram"

// The demo names used in a docs file, in order
const demosIn = (folder: string, file: string) =>
    [
        ...readFileSync(
            join(process.cwd(), "docs", folder, file),
            "utf8",
        ).matchAll(DEMO_LINE),
    ].map((m) => m[1])

const files = readdirSync(join(process.cwd(), "docs/en")).filter((f) =>
    f.endsWith(".md"),
)

describe("docs demos", () => {
    it("names only demos the site can show", () => {
        for (const folder of ["en", "cn", "ja", "tw"]) {
            for (const file of files) {
                for (const name of demosIn(folder, file)) {
                    expect(DOC_DEMOS, `${folder}/${file}`).toContain(name)
                }
            }
        }
    })

    it("has the same demos in every language", () => {
        for (const file of files) {
            const en = demosIn("en", file)
            expect(demosIn("cn", file), `cn/${file}`).toEqual(en)
            expect(demosIn("tw", file), `tw/${file}`).toEqual(en)
            expect(demosIn("ja", file), `ja/${file}`).toEqual(en)
        }
    })

    it("is used on the pages that show the editor", () => {
        expect(demosIn("en", "versions.md")).toEqual(["ai-edit", "versions"])
        expect(demosIn("en", "introduction.md")).toEqual(["tour"])
    })
})

describe("withOwnId", () => {
    it("renames the export's id and the style that uses it", () => {
        const svg =
            '<svg id="ge-svg-abc"><style>#ge-svg-abc { --x: 1; }</style></svg>'
        expect(withOwnId(svg, "r1")).toBe(
            '<svg id="ge-svg-abc-r1"><style>#ge-svg-abc-r1 { --x: 1; }</style></svg>',
        )
        expect(withOwnId("<svg></svg>", "r1")).toBe("<svg></svg>")
    })
})
