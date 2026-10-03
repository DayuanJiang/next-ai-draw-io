import { describe, expect, it } from "vitest"
import {
    applyDiagramOperations,
    autoFixXml,
    cn,
    extractCompleteMxCells,
    isMxCellXmlComplete,
    validateAndFixXml,
    validateMxCellStructure,
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

    it("returns false when output stops after a child of an open mxCell", () => {
        const xml = `<mxCell id="2" value="A" vertex="1" parent="1">
            <mxGeometry x="0" y="0" width="80" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="3" value="B" vertex="1" parent="1">
            <mxGeometry x="100" y="0" width="80" height="40" as="geometry"/>`
        expect(isMxCellXmlComplete(xml)).toBe(false)
    })

    it("returns false when output stops after </mxGeometry> of an open mxCell", () => {
        const xml = `<mxCell id="e1" edge="1" parent="1" source="2" target="3">
            <mxGeometry relative="1" as="geometry">
                <mxPoint x="10" y="10" as="sourcePoint"/>
            </mxGeometry>`
        expect(isMxCellXmlComplete(xml)).toBe(false)
    })

    it("returns true for a self-closing last mxCell with > in its value", () => {
        const xml = `<mxCell id="2" value="A" vertex="1" parent="1">
            <mxGeometry as="geometry"/>
        </mxCell>
        <mxCell id="3" value="A -> B" vertex="1" parent="1"/></root>`
        expect(isMxCellXmlComplete(xml)).toBe(true)
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

describe("extractCompleteMxCells", () => {
    it("keeps the cell right after self-closing root cells", () => {
        const xml = `<mxfile><diagram id="p1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="A" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell><mxCell id="3" value="B" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`
        const ids = [
            ...extractCompleteMxCells(xml).matchAll(/<mxCell id="([^"]+)"/g),
        ].map((m) => m[1])
        expect(ids).toEqual(["0", "1", "2", "3"])
    })

    it("drops an incomplete trailing cell", () => {
        const xml = `<mxCell id="2" vertex="1" parent="1"/><mxCell id="3" vertex="1" parent="1"><mxGeometry as="geometry"/>`
        expect(extractCompleteMxCells(xml)).toBe(
            '<mxCell id="2" vertex="1" parent="1"/>',
        )
    })
})

const page = (id: string, cells: string) =>
    `<diagram name="${id}" id="${id}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram>`

describe("duplicate ids in multi-page documents", () => {
    const shape = (id: string, value = "Box") =>
        `<mxCell id="${id}" value="${value}" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>`

    it("accepts the same ids on different pages", () => {
        const xml = `<mxfile>${page("p1", shape("2"))}${page("p2", shape("2"))}</mxfile>`
        expect(validateMxCellStructure(xml)).toBeNull()
    })

    it("still reports duplicate ids within one page", () => {
        const xml = `<mxfile>${page("p1", shape("2") + shape("2"))}${page("p2", "")}</mxfile>`
        expect(validateMxCellStructure(xml)).toContain("duplicate ID")
    })

    it("does not rename the root cells of other pages when fixing", () => {
        const xml = `<mxfile>${page("p1", shape("2", "R&D"))}${page("p2", shape("3"))}</mxfile>`
        const result = validateAndFixXml(xml)
        expect(result.valid).toBe(true)
        expect(result.fixed).not.toContain("_dup")
        expect(result.fixed).toContain("R&amp;D")
    })

    it("renames a duplicate id within a page", () => {
        const xml = `<mxfile>${page("p1", shape("d") + shape("d"))}</mxfile>`
        const { fixed } = autoFixXml(xml)
        expect(fixed).toContain('<mxCell id="d" ')
        expect(fixed).toContain('<mxCell id="d_dup1" ')
    })
})

describe("autoFixXml", () => {
    it("does not insert a space at the start of style values", () => {
        const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="R&D" style="rounded=1;whiteSpace=wrap;" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></root></mxGraphModel>`
        const { fixed } = autoFixXml(xml)
        expect(fixed).toContain('style="rounded=1;whiteSpace=wrap;"')
    })

    it("adds a missing space between attributes", () => {
        const xml = `<mxCell id="2" vertex="1"parent="1"/>`
        expect(autoFixXml(xml).fixed).toContain('vertex="1" parent="1"')
    })

    it("keeps &quot; inside rich text labels", () => {
        const label = "&lt;font color=&quot;#ff0000&quot;&gt;Hello&lt;/font&gt;"
        const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="${label}" style="html=1;" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell><mxCell id="3" value="Q&A" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></root></mxGraphModel>`
        const result = validateAndFixXml(xml)
        expect(result.valid).toBe(true)
        expect(result.fixed).toContain(`value="${label}"`)
    })

    it("fixes an attribute delimited by &quot;", () => {
        const xml = `<mxCell id="2" dashPattern=&quot;1 1;&quot; vertex="1" parent="1"/>`
        expect(autoFixXml(xml).fixed).toContain('dashPattern="1 1;"')
    })

    it("keeps cells written on one line next to multi-line cells", () => {
        const xml = `<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="2" value="Q&A" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="80" height="40" as="geometry"/>
</mxCell>
<mxCell id="e1" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"/></mxCell>
<mxCell id="3" value="B" vertex="1" parent="1">
  <mxGeometry x="200" y="0" width="80" height="40" as="geometry"/>
</mxCell>
</root></mxGraphModel>`
        const result = validateAndFixXml(xml)
        expect(result.valid).toBe(true)
        for (const id of ["2", "e1", "3"]) {
            expect(result.fixed).toContain(`<mxCell id="${id}"`)
        }
    })

    it("keeps object and UserObject wrappers", () => {
        const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><UserObject id="2" label="Docs" link="https://example.com"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></UserObject><object id="3" label="A&B" owner="me"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></object></root></mxGraphModel>`
        const result = validateAndFixXml(xml)
        expect(result.valid).toBe(true)
        expect(result.fixed).toContain('<UserObject id="2"')
        expect(result.fixed).toContain('<object id="3"')
    })
})

describe("applyDiagramOperations with wrapped cells", () => {
    const xml = `<mxfile><diagram id="p1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><UserObject id="5" label="Docs" link="https://example.com"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></UserObject><mxCell id="6" value="B" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell><mxCell id="e1" edge="1" parent="1" source="5" target="6"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`

    it("deletes a wrapped cell and its edges", () => {
        const { result, errors } = applyDiagramOperations(xml, [
            { operation: "delete", cell_id: "5" },
            { operation: "delete", cell_id: "e1" },
        ])
        expect(errors).toEqual([])
        expect(result).not.toContain("UserObject")
        expect(result).not.toContain('id="e1"')
        expect(result).toContain('id="6"')
    })

    it("rejects adding a cell with the id of a wrapped cell", () => {
        const { errors } = applyDiagramOperations(xml, [
            {
                operation: "add",
                cell_id: "5",
                new_xml: '<mxCell id="5" vertex="1" parent="1"/>',
            },
        ])
        expect(errors[0]?.message).toContain("already exists")
    })

    it("updates a wrapped cell", () => {
        const { result, errors } = applyDiagramOperations(xml, [
            {
                operation: "update",
                cell_id: "5",
                new_xml:
                    '<UserObject id="5" label="New" link="https://example.org"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></UserObject>',
            },
        ])
        expect(errors).toEqual([])
        expect(result).toContain('label="New"')
        expect(result).not.toContain('label="Docs"')
    })

    it("reports deleting a cell that does not exist", () => {
        const { errors } = applyDiagramOperations(xml, [
            { operation: "delete", cell_id: "missing" },
        ])
        expect(errors[0]?.message).toContain("not found")
    })
})
