import { describe, expect, it } from "vitest"
import { foldCells } from "@/packages/mcp-server/src/compact-cells.ts"
import { editDiagram } from "@/packages/mcp-server/src/edit-diagram.ts"
import {
    hideImageData,
    imageRefNote,
    rememberImages,
    restoreImageData,
} from "@/packages/mcp-server/src/embedded-images.ts"

// Fake base64 picture data, distinct per test (the remembered pictures are
// shared by the whole module)
const picture = (seed: string) => `iVBORw0KGgo${seed.repeat(300)}AAAA==`
const imageCell = (id: string, data: string) =>
    `<mxCell id="${id}" value="" style="shape=image;imageAspect=0;image=data:image/png,${data};" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="120" as="geometry"/></mxCell>`
const page = (cells: string) =>
    `<mxfile><diagram id="p1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`

describe("hideImageData", () => {
    it("writes a picture's data as a short reference", () => {
        const data = picture("A1")
        const hidden = hideImageData(imageCell("2", data))
        expect(hidden).not.toContain(data)
        expect(hidden).toMatch(
            /image=data:image\/png,embedded-image-[0-9a-z]+;"/,
        )
    })

    it("gives the same picture the same reference", () => {
        const data = picture("B2")
        const first = hideImageData(imageCell("2", data))
        const second = hideImageData(imageCell("2", data))
        const other = hideImageData(imageCell("2", picture("C3")))
        expect(first).toBe(second)
        expect(first).not.toBe(other)
    })

    it("hides a picture in an HTML label, and leaves short data alone", () => {
        const data = picture("D4")
        const label = `<mxCell id="3" value="&lt;img src=&quot;data:image/png;base64,${data}&quot;&gt;" style="text;html=1;" vertex="1" parent="1"/>`
        expect(hideImageData(label)).toMatch(
            /data:image\/png;base64,embedded-image-[0-9a-z]+&quot;/,
        )
        const tiny = imageCell("4", "iVBORw0KGgoAAAA")
        expect(hideImageData(tiny)).toBe(tiny)
    })

    it("is part of foldCells", () => {
        const data = picture("E5")
        const shown = foldCells(imageCell("2", data))
        expect(shown).not.toContain(data)
        expect(shown).toContain('x="40" y="40" w="120" h="120"/>')
    })
})

describe("restoreImageData", () => {
    it("puts the pictures of the source diagram back", () => {
        const data = picture("F6")
        const doc = page(imageCell("2", data))
        const shown = foldCells(doc)
        expect(restoreImageData(shown, doc)).toContain(data)
    })

    it("knows the pictures of remembered diagrams", () => {
        const data = picture("G7")
        const earlier = page(imageCell("2", data))
        const ref = hideImageData(imageCell("9", data))
        // Not on the diagram the XML is drawn on, nor remembered yet
        expect(restoreImageData(ref, page(""))).toBe(ref)
        rememberImages(earlier)
        expect(restoreImageData(ref, page(""))).toBe(imageCell("9", data))
    })

    it("restores a whole diagram exactly", () => {
        const doc = page(
            imageCell("2", picture("H8")) +
                imageCell("3", picture("I9")) +
                imageCell("4", picture("H8")),
        )
        expect(restoreImageData(hideImageData(doc), doc)).toBe(doc)
    })
})

describe("editDiagram with references", () => {
    it("keeps the picture of a cell the model updates", () => {
        const data = picture("J0")
        const doc = page(imageCell("2", data))
        const update = hideImageData(imageCell("2", data)).replace(
            'width="120"',
            'width="200"',
        )
        const out = editDiagram(
            doc,
            [{ operation: "update", cell_id: "2", new_xml: update }],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain(data)
        expect(out.xml).toContain('width="200"')
        expect(out.xml).not.toContain("embedded-image-")
    })
})

describe("imageRefNote", () => {
    it("explains the references only when the diagram has some", () => {
        expect(imageRefNote(foldCells(imageCell("2", picture("K1"))))).toMatch(
            /references/,
        )
        expect(imageRefNote(foldCells(page("")))).toBe("")
    })
})
