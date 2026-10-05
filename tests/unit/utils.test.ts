import { describe, expect, it } from "vitest"
import {
    cn,
    extractCompleteMxCells,
    isMxCellXmlComplete,
    isRealDiagram,
} from "@/lib/utils"
import { BLANK_MXFILE } from "@/packages/mcp-server/src/pages.ts"

describe("isRealDiagram", () => {
    it("counts a small diagram with one shape", () => {
        // 234 characters: valid, shown, and saved with its chat
        const xml =
            '<mxfile><diagram id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="A" vertex="1" parent="1"><mxGeometry width="80" height="30" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>'
        expect(xml.length).toBeLessThan(300)
        expect(isRealDiagram(xml)).toBe(true)
    })

    it("does not count a blank page or nothing", () => {
        expect(isRealDiagram(BLANK_MXFILE)).toBe(false)
        expect(isRealDiagram("")).toBe(false)
        expect(isRealDiagram(null)).toBe(false)
    })

    it("still counts a longer document of empty named pages", () => {
        // Pages and page settings are worth keeping, as before
        const pages = Array.from(
            { length: 3 },
            (_, i) =>
                `<diagram id="p${i}" name="Page ${i}"><mxGraphModel pageWidth="1600" pageHeight="900"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram>`,
        ).join("")
        expect(isRealDiagram(`<mxfile>${pages}</mxfile>`)).toBe(true)
    })
})

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
