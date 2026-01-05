import { describe, expect, it } from "vitest"
import { cn, isMxCellXmlComplete, wrapWithMxFile } from "@/lib/utils"

describe("isMxCellXmlComplete", () => {
    it("returns false for empty/null input", () => {
        expect(isMxCellXmlComplete("")).toBe(false)
        expect(isMxCellXmlComplete(null)).toBe(false)
        expect(isMxCellXmlComplete(undefined)).toBe(false)
    })

    it("returns true for self-closing mxCell", () => {
        const xml =
            '<mxCell id="2" value="Hello" style="rounded=1;" vertex="1" parent="1"/>'
        expect(isMxCellXmlComplete(xml)).toBe(true)
    })

    it("returns true for mxCell with closing tag", () => {
        const xml = `<mxCell id="2" value="Hello" vertex="1" parent="1">
            <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
        </mxCell>`
        expect(isMxCellXmlComplete(xml)).toBe(true)
    })

    it("returns false for truncated mxCell", () => {
        const xml =
            '<mxCell id="2" value="Hello" style="rounded=1;" vertex="1" parent'
        expect(isMxCellXmlComplete(xml)).toBe(false)
    })

    it("returns false for mxCell with unclosed geometry", () => {
        const xml = `<mxCell id="2" value="Hello" vertex="1" parent="1">
            <mxGeometry x="100" y="100" width="120"`
        expect(isMxCellXmlComplete(xml)).toBe(false)
    })

    it("returns true for multiple complete mxCells", () => {
        const xml = `<mxCell id="2" value="A" vertex="1" parent="1"/>
            <mxCell id="3" value="B" vertex="1" parent="1"/>`
        expect(isMxCellXmlComplete(xml)).toBe(true)
    })
})

describe("wrapWithMxFile", () => {
    it("wraps empty string with default structure", () => {
        const result = wrapWithMxFile("")
        expect(result).toContain("<mxfile>")
        expect(result).toContain("<mxGraphModel>")
        expect(result).toContain('<mxCell id="0"/>')
        expect(result).toContain('<mxCell id="1" parent="0"/>')
    })

    it("wraps raw mxCell content", () => {
        const xml = '<mxCell id="2" value="Hello"/>'
        const result = wrapWithMxFile(xml)
        expect(result).toContain("<mxfile>")
        expect(result).toContain(xml)
        expect(result).toContain("</mxfile>")
    })

    it("returns full mxfile unchanged", () => {
        const fullXml =
            '<mxfile><diagram name="Page-1"><mxGraphModel></mxGraphModel></diagram></mxfile>'
        const result = wrapWithMxFile(fullXml)
        expect(result).toBe(fullXml)
    })

    it("handles whitespace in input", () => {
        const result = wrapWithMxFile("   ")
        expect(result).toContain("<mxfile>")
    })
})

describe("cn (class name utility)", () => {
    it("merges class names", () => {
        expect(cn("foo", "bar")).toBe("foo bar")
    })

    it("handles conditional classes", () => {
        expect(cn("foo", false && "bar", "baz")).toBe("foo baz")
    })

    it("merges tailwind classes correctly", () => {
        expect(cn("px-2", "px-4")).toBe("px-4")
        expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500")
    })
})
