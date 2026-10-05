/**
 * Tests for the all-or-nothing edit_diagram core (src/edit-diagram.ts).
 */

import { beforeAll, describe, expect, it } from "vitest"
import { installDomPolyfill } from "../src/dom.ts"

beforeAll(() => {
    installDomPolyfill()
})

import { editDiagram, targetPageXml } from "../src/edit-diagram.ts"
import { validateMxCellStructure } from "../src/xml-validation.ts"

const cell = (id: string, extra = "") =>
    `<mxCell id="${id}" value="${id}" vertex="1" parent="1"${extra}><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>`

const page = (id: string, cells: string) =>
    `<diagram id="${id}" name="${id}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram>`

const DOC = `<mxfile>${page("p1", cell("a") + cell("b"))}</mxfile>`

describe("editDiagram", () => {
    it("applies every operation and counts them", () => {
        const out = editDiagram(
            DOC,
            [
                { operation: "add", cell_id: "c", new_xml: cell("c") },
                { operation: "delete", cell_id: "b" },
            ],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.applied).toBe(2)
        expect(out.xml).toContain('id="c"')
        expect(out.xml).not.toContain('id="b"')
    })

    it("applies nothing when one operation fails", () => {
        const out = editDiagram(
            DOC,
            [
                { operation: "add", cell_id: "c", new_xml: cell("c") },
                { operation: "delete", cell_id: "missing" },
            ],
            {},
        )
        expect(out.ok).toBe(false)
        if (out.ok) return
        expect(out.pageError).toBe(false)
        expect(out.errors).toEqual([
            'delete missing: Cell with id="missing" not found',
        ])
    })

    it("rejects new_xml that is still invalid after auto-fix", () => {
        const out = editDiagram(
            DOC,
            [
                {
                    operation: "update",
                    cell_id: "a",
                    new_xml: `<mxCell id="a" style="x" style="y" vertex="1" parent="1"/>`,
                },
            ],
            {},
        )
        expect(out.ok).toBe(false)
        if (out.ok) return
        expect(out.errors[0]).toMatch(/^update a: invalid new_xml: /)
    })

    it("rejects several cells in one new_xml", () => {
        const out = editDiagram(
            DOC,
            [
                {
                    operation: "add",
                    cell_id: "c",
                    new_xml: cell("c") + cell("d"),
                },
            ],
            {},
        )
        expect(out.ok).toBe(false)
        if (out.ok) return
        expect(out.errors[0]).toContain("exactly one cell")
    })

    it("accepts a UserObject that wraps one mxCell", () => {
        const wrapped = `<UserObject id="u" label="U" link="https://example.com"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></UserObject>`
        const out = editDiagram(
            DOC,
            [{ operation: "add", cell_id: "u", new_xml: wrapped }],
            {},
        )
        expect(out.ok).toBe(true)
    })

    it("is not blocked by a problem on another page", () => {
        // Page p2 has a duplicate cell id, which fails validation
        const doc = `<mxfile>${page("p1", cell("a"))}${page("p2", cell("x") + cell("x"))}</mxfile>`
        expect(validateMxCellStructure(doc)).not.toBeNull()
        const out = editDiagram(
            doc,
            [{ operation: "add", cell_id: "c", new_xml: cell("c") }],
            { page_id: "p1" },
        )
        expect(out.ok).toBe(true)
    })

    it("fixes a literal \\n between tags, as gpt-5-mini sends it", () => {
        const newXml = `<mxCell id="c" value="Reset password" vertex="1" parent="1">\\n  <mxGeometry x="0" y="0" width="80" height="40" as="geometry"/>\\n</mxCell>`
        const out = editDiagram(
            DOC,
            [{ operation: "add", cell_id: "c", new_xml: newXml }],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain('value="Reset password"')
        expect(out.xml).not.toContain("\\n")
    })

    it("reports a missing page as a page-level error", () => {
        const out = editDiagram(DOC, [{ operation: "delete", cell_id: "a" }], {
            page_id: "nope",
        })
        expect(out.ok).toBe(false)
        if (out.ok) return
        expect(out.pageError).toBe(true)
    })
})

describe("targetPageXml", () => {
    it("returns only the selected page", () => {
        const doc = `<mxfile>${page("p1", cell("a"))}${page("p2", cell("z"))}</mxfile>`
        const xml = targetPageXml(doc, { page_id: "p2" })
        expect(xml).toContain('id="z"')
        expect(xml).not.toContain('id="a"')
    })
})

describe("labels an edit does not touch", () => {
    it("keep their line breaks and spaces as draw.io reads them", () => {
        // A literal line break in an attribute reads as a space; &#xa; is a
        // real line break
        const labels =
            `<mxCell id="s" value="Hello
world" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>` +
            `<mxCell id="m" value="Line 1&#xa;Line 2" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>`
        const out = editDiagram(
            `<mxfile>${page("p1", labels)}</mxfile>`,
            [{ operation: "add", cell_id: "c", new_xml: cell("c") }],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain(`value="Hello world"`)
        expect(out.xml).toContain(`value="Line 1&#xa;Line 2"`)
    })
})
