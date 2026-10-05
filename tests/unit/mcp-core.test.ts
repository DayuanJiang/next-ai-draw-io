/**
 * The web app runs the MCP server's diagram modules in the browser, where
 * DOMParser and XMLSerializer are the native ones (jsdom here), not the
 * linkedom polyfill the MCP tests use.
 */
import { deflateRaw } from "pako"
import { describe, expect, it } from "vitest"
import { applyDiagramOperations } from "@/packages/mcp-server/src/diagram-operations.ts"
import { editDiagram } from "@/packages/mcp-server/src/edit-diagram.ts"
import { decompressPageContent } from "@/packages/mcp-server/src/load-diagram.ts"
import {
    hasCells,
    normalizeToMxfile,
    wrapCellsInModel,
} from "@/packages/mcp-server/src/pages.ts"
import { getXmlSyntaxError } from "@/packages/mcp-server/src/xml-syntax.ts"
import {
    autoFixXml,
    validateAndFixXml,
    validateMxCellStructure,
} from "@/packages/mcp-server/src/xml-validation.ts"

const box = (id: string, parent = "1") =>
    `<mxCell id="${id}" value="${id}" vertex="1" parent="${parent}"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>`
const edge = (id: string, source: string, target: string) =>
    `<mxCell id="${id}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`
const file = (cells: string) =>
    normalizeToMxfile(wrapCellsInModel(cells), {
        pageId: "p1",
        pageName: "Page-1",
    }) as string

describe("MCP diagram modules with a browser DOM", () => {
    it("wraps bare cells into a valid file", () => {
        const xml = file(box("a") + box("b"))
        expect(xml).toContain('<diagram id="p1" name="Page-1">')
        expect(validateAndFixXml(xml).valid).toBe(true)
        expect(hasCells(xml)).toBe(true)
        expect(hasCells(file(""))).toBe(false)
    })

    it("fixes the case of a misspelled tag in model XML", () => {
        const result = validateAndFixXml(
            file(box("a"))
                .replace('<mxCell id="a"', '<mxcell id="a"')
                .replace("</mxCell></root>", "</mxcell></root>"),
        )
        expect(result.valid).toBe(true)
        expect(result.fixes.join(" ")).toMatch(/tag case/)
    })

    it("reports syntax errors with line and column", () => {
        expect(getXmlSyntaxError("<mxfile><diagram></mxfile>")).toMatch(
            /^1:\d+/,
        )
        expect(getXmlSyntaxError(file(box("a")))).toBeNull()
    })

    it("deletes a cell with its edges", () => {
        const xml = file(box("a") + box("b") + edge("e", "a", "b"))
        const { result, errors } = applyDiagramOperations(xml, [
            { operation: "delete", cell_id: "a" },
        ])
        expect(errors).toEqual([])
        expect(result).not.toContain('id="a"')
        expect(result).not.toContain('id="e"')
        expect(result).toContain('id="b"')
    })

    it("runs a whole edit and serializes the target page", () => {
        const outcome = editDiagram(
            file(box("a")),
            [{ operation: "add", cell_id: "b", new_xml: box("b") }],
            {},
        )
        expect(outcome.ok).toBe(true)
        if (outcome.ok) expect(outcome.xml).toContain('id="b"')

        const failed = editDiagram(
            file(box("a")),
            [{ operation: "add", cell_id: "b", new_xml: box("b") + box("c") }],
            {},
        )
        expect(failed.ok).toBe(false)
    })

    it("decompresses a draw.io compressed page", () => {
        const model = wrapCellsInModel(box("a"))
        const deflated = deflateRaw(encodeURIComponent(model))
        const base64 = btoa(String.fromCharCode(...deflated))
        expect(decompressPageContent(base64)).toBe(model)
        expect(decompressPageContent("not compressed")).toBeNull()
    })
})

// Repair cases fixed in the web app's own copy before it moved here
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
        expect(validateMxCellStructure(xml)).toMatch(/duplicate cell ID/i)
    })

    it("does not rename the root cells of other pages when fixing", () => {
        const xml = `<mxfile>${page("p1", shape("2", "R&D"))}${page("p2", shape("3"))}</mxfile>`
        const result = validateAndFixXml(xml)
        expect(result.valid).toBe(true)
        expect(result.fixed).not.toContain("_dup")
        expect(result.fixed).toContain("R&amp;D")
    })

    it("renames a duplicate id in a bare model, as display_diagram has", () => {
        // In an <mxfile> the duplicate is reported instead (above)
        const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${shape("d") + shape("d")}</root></mxGraphModel>`
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

describe("hasCells (was isMinimalDiagram in the web app)", () => {
    it("returns true for empty diagram", () => {
        const xml = '<mxCell id="0"/><mxCell id="1" parent="0"/>'
        expect(hasCells(xml)).toBe(false)
    })

    it("returns false for diagram with content", () => {
        const xml =
            '<mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Hello"/>'
        expect(hasCells(xml)).toBe(true)
    })

    it("handles whitespace correctly", () => {
        const xml = '  <mxCell id="0"/>  <mxCell id="1" parent="0"/>  '
        expect(hasCells(xml)).toBe(false)
    })

    it("returns false for a shape drawn in draw.io with a random id", () => {
        const xml =
            '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="xY3kQ9-1" value="" style="rounded=0;" vertex="1" parent="1"><mxGeometry x="10" y="10" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel>'
        expect(hasCells(xml)).toBe(true)
    })

    it("does not mistake ids that start with 0 or 1 for root cells", () => {
        const xml =
            '<mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="10"/>'
        expect(hasCells(xml)).toBe(true)
    })

    it("counts a cell wrapped in a UserObject", () => {
        const xml =
            '<mxCell id="0"/><mxCell id="1" parent="0"/><UserObject id="u" link="x"><mxCell vertex="1" parent="1"/></UserObject>'
        expect(hasCells(xml)).toBe(true)
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
