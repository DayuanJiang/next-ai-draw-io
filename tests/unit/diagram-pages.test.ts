import pako from "pako"
import { describe, expect, it } from "vitest"
import {
    pageModelXml,
    pageSelectorFor,
    placeOnPage,
    replacePageModel,
} from "@/lib/diagram-pages"

const box = (id: string) =>
    `<mxCell id="${id}" value="${id}" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>`
const model = (cells: string) =>
    `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`
const page = (id: string, cells: string) =>
    `<diagram id="${id}" name="Page ${id}">${model(cells)}</diagram>`
const packedPage = (id: string, cells: string) => {
    const packed = Buffer.from(
        pako.deflateRaw(encodeURIComponent(model(cells))),
    ).toString("base64")
    return `<diagram id="${id}" name="Page ${id}">${packed}</diagram>`
}
const TWO_PAGES = `<mxfile vars="{&quot;x&quot;:&quot;1&quot;}">${page("a", box("A"))}${page("b", box("B"))}</mxfile>`

const pagesOf = (xml: string) =>
    Array.from(
        new DOMParser()
            .parseFromString(xml, "text/xml")
            .getElementsByTagName("diagram"),
    ).map((d) => ({
        id: d.getAttribute("id"),
        name: d.getAttribute("name"),
        cells: Array.from(d.getElementsByTagName("mxCell"))
            .map((c) => c.getAttribute("id"))
            .filter((id) => id !== "0" && id !== "1"),
    }))

describe("pageModelXml", () => {
    it("gives the page with the id, and the first page without one", () => {
        expect(pageModelXml(TWO_PAGES, "b")).toContain('id="B"')
        expect(pageModelXml(TWO_PAGES, "b")).not.toContain('id="A"')
        expect(pageModelXml(TWO_PAGES, null)).toContain('id="A"')
        expect(pageModelXml(TWO_PAGES, "missing")).toContain('id="A"')
    })

    it("inflates a compressed page and passes a bare model through", () => {
        const file = `<mxfile>${page("a", box("A"))}${packedPage("b", box("B"))}</mxfile>`
        expect(pageModelXml(file, "b")).toContain('id="B"')
        expect(pageModelXml(model(box("Z")), "b")).toBe(model(box("Z")))
        expect(pageModelXml("<broken", "a")).toBeNull()
    })
})

describe("pageSelectorFor", () => {
    it("selects the page only when the document has it", () => {
        expect(pageSelectorFor(TWO_PAGES, "b")).toEqual({ page_id: "b" })
        expect(pageSelectorFor(TWO_PAGES, "missing")).toEqual({})
        expect(pageSelectorFor(TWO_PAGES, null)).toEqual({})
        expect(pageSelectorFor(model(box("Z")), "b")).toEqual({})
    })
})

describe("replacePageModel", () => {
    it("replaces one page and keeps the others, the names and the variables", () => {
        const result = replacePageModel(TWO_PAGES, "b", model(box("N")))
        expect(pagesOf(result)).toEqual([
            { id: "a", name: "Page a", cells: ["A"] },
            { id: "b", name: "Page b", cells: ["N"] },
        ])
        expect(result).toContain('vars="{&quot;x&quot;:&quot;1&quot;}"')
    })

    it("falls back to the first page for an unknown or missing id", () => {
        for (const id of ["missing", null]) {
            const result = replacePageModel(TWO_PAGES, id, model(box("N")))
            expect(pagesOf(result).map((p) => p.cells)).toEqual([["N"], ["B"]])
        }
    })

    it("starts from the blank file when there is no document", () => {
        for (const base of ["", "<mxGraphModel/>", "<broken"]) {
            const result = replacePageModel(base, "any", model(box("N")))
            expect(pagesOf(result)).toEqual([
                { id: "page-1", name: "Page-1", cells: ["N"] },
            ])
        }
    })

    it("refuses anything but a model", () => {
        expect(() => replacePageModel(TWO_PAGES, "a", "<root/>")).toThrow()
    })
})

describe("placeOnPage", () => {
    it("puts one page's worth of drawing on the model's page", () => {
        const drawn = `<mxfile><diagram id="page-1" name="Page-1">${model(box("N"))}</diagram></mxfile>`
        const result = placeOnPage(drawn, TWO_PAGES, "b")
        expect(pagesOf(result)).toEqual([
            { id: "a", name: "Page a", cells: ["A"] },
            { id: "b", name: "Page b", cells: ["N"] },
        ])
    })

    it("applies the drawn file's variables, and keeps the canvas's otherwise", () => {
        const withVars = `<mxfile vars="{&quot;team&quot;:&quot;New&quot;}"><diagram id="p" name="P">${model(box("N"))}</diagram></mxfile>`
        expect(placeOnPage(withVars, TWO_PAGES, "b")).toContain(
            'vars="{&quot;team&quot;:&quot;New&quot;}"',
        )
        const without = `<mxfile><diagram id="p" name="P">${model(box("N"))}</diagram></mxfile>`
        expect(placeOnPage(without, TWO_PAGES, "b")).toContain(
            'vars="{&quot;x&quot;:&quot;1&quot;}"',
        )
    })

    it("lets a drawing with several pages replace the document", () => {
        const drawn = `<mxfile>${page("x", box("X"))}${page("y", box("Y"))}</mxfile>`
        expect(placeOnPage(drawn, TWO_PAGES, "b")).toBe(drawn)
    })

    it("draws on the blank file when the canvas is empty", () => {
        const drawn = `<mxfile><diagram id="page-1" name="Page-1">${model(box("N"))}</diagram></mxfile>`
        expect(pagesOf(placeOnPage(drawn, "", null))).toEqual([
            { id: "page-1", name: "Page-1", cells: ["N"] },
        ])
    })
})
