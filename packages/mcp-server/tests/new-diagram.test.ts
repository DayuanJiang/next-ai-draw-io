/**
 * Tests for prepareNewDiagram's truncation check: output that stops inside an
 * mxCell gets a clear error instead of one about the wrapper tags the model
 * never sent.
 */

import { beforeAll, describe, expect, it } from "vitest"
import { installDomPolyfill } from "../src/dom.ts"

beforeAll(() => {
    installDomPolyfill()
})

import {
    isMxCellXmlComplete,
    prepareNewDiagram,
    truncatedCellError,
} from "../src/new-diagram.ts"

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
        // A raw "<" in a value (escaped later by the auto-fix)
        expect(
            isMxCellXmlComplete(
                '<mxCell id="3" value="<b>Title</b>" style="text;html=1;" vertex="1" parent="1"/>',
            ),
        ).toBe(true)
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

describe("prepareNewDiagram with cut-off output", () => {
    const A = `<mxCell id="2" value="A" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>`

    it("rejects a cell cut off inside an attribute", () => {
        const cut = `${A}<mxCell id="3" value="B" vertex="1" par`
        const out = prepareNewDiagram(cut)
        expect(out.ok).toBe(false)
        if (out.ok) return
        expect(out.error).toContain("cut off")
        // The tail is quoted so the model knows where to resume
        expect(out.error).toContain('<mxCell id="3" value="B" vertex="1" par')
        expect(out.error).toContain("edit_diagram add")
    })

    it("rejects a cell cut off after its geometry", () => {
        const cut = `${A}<mxCell id="3" value="B" vertex="1" parent="1"><mxGeometry x="200" y="0" width="80" height="40" as="geometry"/>`
        const out = prepareNewDiagram(cut)
        expect(out.ok).toBe(false)
        if (out.ok) return
        expect(out.error).toContain("cut off")
        expect(out.error).not.toContain("</root>")
    })

    it("quotes at most the last 300 characters", () => {
        const cut = `${A}<mxCell id="3" value="${"x".repeat(400)}`
        const out = prepareNewDiagram(cut)
        expect(out.ok).toBe(false)
        if (out.ok) return
        expect(out.error).toContain(cut.slice(-300))
        expect(out.error).not.toContain(cut.slice(-301))
    })

    it("does not report complete cells followed by an XML comment as cut", () => {
        const cells = `${A}<!-- end of the diagram -->`
        expect(truncatedCellError(cells)).toBeNull()
        expect(prepareNewDiagram(cells).ok).toBe(true)
    })

    it("leaves a closing tag the auto-fix repairs to the auto-fix", () => {
        // </mxCell/> is a typo, not a cut
        const typo = A.replace("</mxCell>", "</mxCell/>")
        expect(truncatedCellError(typo)).toBeNull()
        expect(prepareNewDiagram(typo).ok).toBe(true)
    })

    it("leaves input without any cell to the validator", () => {
        for (const input of ["", "Here is the diagram"]) {
            expect(truncatedCellError(input)).toBeNull()
            const out = prepareNewDiagram(input)
            expect(out.ok).toBe(false)
            if (!out.ok) expect(out.error).not.toContain("cut off")
        }
    })

    it("never checks a full <mxfile>", () => {
        const cut = `<mxfile><diagram id="p1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="A" vertex="1" par`
        expect(truncatedCellError(cut)).toBeNull()
        const out = prepareNewDiagram(cut)
        expect(out.ok).toBe(false)
        if (out.ok) return
        expect(out.error).not.toContain("cut off")
    })
})
