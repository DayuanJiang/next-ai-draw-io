import { describe, expect, it } from "vitest"
import {
    buildDisplayDiagramXml,
    chooseMoreCompleteDiagramXml,
    cn,
    isMxCellXmlComplete,
    normalizeMxfileForDiagramLoad,
    replaceNodes,
    wrapWithMxFile,
} from "@/lib/utils"

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

    it("appends a new page when existingXml uses exported mxGraphModel structure", () => {
        const existingXml = `<mxfile><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="cat-head" value="Cat Head" parent="1" vertex="1"><mxGeometry x="200" y="100" width="100" height="80" as="geometry"/></mxCell></root></mxGraphModel></mxfile>`
        const newXml = '<mxCell id="start" value="Start" parent="1" vertex="1"><mxGeometry x="200" y="50" width="100" height="40" as="geometry"/></mxCell>'

        const result = wrapWithMxFile(newXml, {
            pageName: "Flowchart",
            existingXml,
        })

        expect((result.match(/<diagram\b/g) || []).length).toBe(2)
        expect(result).toContain('id="cat-head"')
        expect(result).toContain('id="start"')
        expect(result).toContain('name="Flowchart"')
    })

    it("handles whitespace in input", () => {
        const result = wrapWithMxFile("   ")
        expect(result).toContain("<mxfile>")
    })
})

describe("normalizeMxfileForDiagramLoad", () => {
    it("wraps mxGraphModel-only mxfile in a diagram tag", () => {
        const xml = `<mxfile><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="cat-head" value="Cat Head" parent="1" vertex="1"/></root></mxGraphModel></mxfile>`

        const result = normalizeMxfileForDiagramLoad(xml)

        expect(result).toContain("<mxfile>")
        expect(result).toContain("<diagram")
        expect(result).toContain("<mxGraphModel>")
        expect(result).toContain('id="cat-head"')
        expect((result.match(/<diagram\b/g) || []).length).toBe(1)
    })

    it("keeps multi-page mxfile unchanged", () => {
        const xml = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`

        expect(normalizeMxfileForDiagramLoad(xml)).toBe(xml)
    })
})

describe("replaceNodes", () => {
    it("preserves diagram wrapper when base xml is mxGraphModel-only mxfile", () => {
        const baseXml = `<mxfile><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></mxfile>`
        const nodes = '<mxCell id="2" value="Hello" vertex="1" parent="1"/>'

        const result = replaceNodes(baseXml, nodes)

        expect(result).toContain("<mxfile>")
        expect(result).toContain("<diagram")
        expect(result).toContain('id="2"')
    })
})

describe("chooseMoreCompleteDiagramXml", () => {
    it("prefers the xml with more diagram pages", () => {
        const inMemoryXml = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="cat-head" value="Cat" parent="1" vertex="1"/></root></mxGraphModel></diagram><diagram name="Page B" id="page-b"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="start" value="Start" parent="1" vertex="1"/></root></mxGraphModel></diagram></mxfile>`
        const exportedXml = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="cat-head" value="Cat" parent="1" vertex="1"/></root></mxGraphModel></diagram></mxfile>`

        const result = chooseMoreCompleteDiagramXml({
            preferredXml: exportedXml,
            fallbackXml: inMemoryXml,
        })

        expect((result.match(/<diagram\b/g) || []).length).toBe(2)
        expect(result).toContain('id="cat-head"')
        expect(result).toContain('id="start"')
    })

    it("keeps preferred xml when it is at least as complete", () => {
        const preferredXml = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="cat-head" value="Cat" parent="1" vertex="1"/></root></mxGraphModel></diagram><diagram name="Page B" id="page-b"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="start" value="Start" parent="1" vertex="1"/></root></mxGraphModel></diagram></mxfile>`
        const fallbackXml = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="cat-head" value="Cat" parent="1" vertex="1"/></root></mxGraphModel></diagram></mxfile>`

        expect(
            chooseMoreCompleteDiagramXml({
                preferredXml,
                fallbackXml,
            }),
        ).toBe(preferredXml)
    })
})

describe("buildDisplayDiagramXml", () => {
    it("fills current page on blank canvas", () => {
        const currentXml = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
        const newCells = '<mxCell id="cat-head" value="Cat Head" parent="1" vertex="1"/>'

        const result = buildDisplayDiagramXml({
            newCells,
            pageName: "Page A",
            currentXml,
        })

        expect((result.match(/<diagram\b/g) || []).length).toBe(1)
        expect(result).toContain('id="cat-head"')
        // pageName should not rename the existing Page-1 in blank-canvas case
        expect(result).toContain('name="Page-1"')
    })

    it("appends a new page when canvas is non-blank", () => {
        const currentXml = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="existing" value="Existing" parent="1" vertex="1"/></root></mxGraphModel></diagram></mxfile>`
        const newCells = '<mxCell id="start" value="Start" parent="1" vertex="1"/>'

        const result = buildDisplayDiagramXml({
            newCells,
            pageName: "Page B",
            currentXml,
        })

        expect((result.match(/<diagram\b/g) || []).length).toBe(2)
        expect(result).toContain('id="existing"')
        expect(result).toContain('id="start"')
        expect(result).toContain('name="Page B"')
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
