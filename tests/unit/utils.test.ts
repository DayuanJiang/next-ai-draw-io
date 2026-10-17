import pako from "pako"
import { describe, expect, it } from "vitest"
import {
    cn,
    extractCompleteMxCells,
    extractDiagramXML,
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

describe("cn (class name utility)", () => {
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

const pageBox = (id: string) => `<mxCell id="${id}" vertex="1" parent="1"/>`
const pageModel = (cells: string) =>
    `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`

describe("extractDiagramXML", () => {
    const packed = (model: string) =>
        Buffer.from(pako.deflateRaw(encodeURIComponent(model))).toString(
            "base64",
        )
    const file = `<mxfile><diagram id="a" name="a">${packed(pageModel(pageBox("A")))}</diagram><diagram id="b" name="b">${packed(pageModel(pageBox("B")))}</diagram></mxfile>`
    const escapeAttr = (s: string) =>
        s
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" content="${escapeAttr(file)}"></svg>`
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`

    it("returns the first page by default and a page by its id", () => {
        expect(extractDiagramXML(dataUrl)).toContain('id="A"')
        expect(extractDiagramXML(dataUrl, "b")).toContain('id="B"')
        expect(extractDiagramXML(dataUrl, "b")).not.toContain('id="A"')
        expect(extractDiagramXML(dataUrl, "zzz")).toContain('id="A"')
    })
})
