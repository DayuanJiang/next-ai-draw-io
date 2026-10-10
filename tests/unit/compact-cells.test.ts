import { describe, expect, it } from "vitest"
import {
    expandCompactCells,
    foldCells,
} from "@/packages/mcp-server/src/compact-cells.ts"
import { editDiagram } from "@/packages/mcp-server/src/edit-diagram.ts"
import { prepareNewDiagram } from "@/packages/mcp-server/src/new-diagram.ts"
import {
    normalizeToMxfile,
    wrapCellsInModel,
} from "@/packages/mcp-server/src/pages.ts"

const shape =
    '<mxCell id="2" value="Start" style="rounded=1;" x="40" y="40" w="120" h="60"/>'
const shapeLong =
    '<mxCell id="2" value="Start" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>'
const edge = '<mxCell id="5" style="down;" source="2" target="3"/>'
const edgeLong =
    '<mxCell id="5" style="down;" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"/></mxCell>'

/** Cells compared by what they mean, not by attribute order */
function canonical(xml: string): string {
    const doc = new DOMParser().parseFromString(
        `<root>${xml}</root>`,
        "text/xml",
    )
    const describe = (el: Element): string => {
        const attrs = Array.from(el.attributes)
            .map((a) => `${a.name}=${a.value}`)
            .sort()
            .join(" ")
        const children = Array.from(el.children).map(describe).join("")
        return `<${el.tagName} ${attrs}>${children}</${el.tagName}>`
    }
    return Array.from(doc.documentElement.children).map(describe).join("\n")
}

describe("expandCompactCells", () => {
    it("gives a compact shape its flags, parent and geometry", () => {
        expect(expandCompactCells(shape)).toBe(shapeLong)
    })

    it("gives a compact edge its flags, parent and relative geometry", () => {
        expect(expandCompactCells(edge)).toBe(edgeLong)
    })

    it("keeps an explicit parent and accepts width/height as names", () => {
        const inLane =
            '<mxCell id="3" value="Step" style="rounded=1;" parent="lane1" x="20" y="60" width="160" height="40"/>'
        expect(expandCompactCells(inLane)).toBe(
            '<mxCell id="3" value="Step" style="rounded=1;" vertex="1" parent="lane1"><mxGeometry x="20" y="60" width="160" height="40" as="geometry"/></mxCell>',
        )
    })

    it("fills in a default position and size when some are missing", () => {
        expect(expandCompactCells('<mxCell id="2" value="A" w="100"/>')).toBe(
            '<mxCell id="2" value="A" vertex="1" parent="1"><mxGeometry x="0" y="0" width="100" height="60" as="geometry"/></mxCell>',
        )
    })

    it("lets an explicit geometry win over compact attributes", () => {
        const both =
            '<mxCell id="2" x="1" y="1" w="1" h="1" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>'
        expect(expandCompactCells(both)).toBe(
            shapeLong.replace(' value="Start" style="rounded=1;"', ""),
        )
    })

    it("adds the relative geometry to a long-form edge that has none", () => {
        const noGeometry =
            '<mxCell id="5" style="down;" edge="1" parent="1" source="2" target="3"/>'
        expect(expandCompactCells(noGeometry)).toBe(edgeLong)
    })

    it("leaves root cells, long-form cells and edge labels alone", () => {
        const roots = '<mxCell id="0"/><mxCell id="1" parent="0"/>'
        const label =
            '<mxCell id="9" value="yes" style="edgeLabel;" vertex="1" connectable="0" parent="5"><mxGeometry x="-0.5" relative="1" as="geometry"/></mxCell>'
        expect(expandCompactCells(roots + shapeLong + edgeLong + label)).toBe(
            roots + shapeLong + edgeLong + label,
        )
    })

    it("works on a cell inside a UserObject wrapper", () => {
        const wrapped =
            '<UserObject id="4" label="Docs" link="https://example.com"><mxCell style="rounded=1;" x="580" y="40" w="120" h="60"/></UserObject>'
        expect(expandCompactCells(wrapped)).toBe(
            '<UserObject id="4" label="Docs" link="https://example.com"><mxCell style="rounded=1;" vertex="1" parent="1"><mxGeometry x="580" y="40" width="120" height="60" as="geometry"/></mxCell></UserObject>',
        )
    })
})

describe("foldCells", () => {
    it("writes plain shapes and edges compactly", () => {
        expect(foldCells(shapeLong)).toBe(shape)
        expect(foldCells(edgeLong)).toBe(edge)
    })

    it("keeps a parent other than 1 and leaves special cells as written", () => {
        const inLane =
            '<mxCell id="3" value="Step" style="rounded=1;" vertex="1" parent="lane1"><mxGeometry x="20" y="60" width="160" height="40" as="geometry"/></mxCell>'
        expect(foldCells(inLane)).toBe(
            '<mxCell id="3" value="Step" style="rounded=1;" parent="lane1" x="20" y="60" w="160" h="40"/>',
        )
        const waypoints =
            '<mxCell id="6" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="750" y="80"/></Array></mxGeometry></mxCell>'
        const label =
            '<mxCell id="9" value="yes" style="edgeLabel;" vertex="1" connectable="0" parent="5"><mxGeometry x="-0.5" relative="1" as="geometry"/></mxCell>'
        const sourcePoint =
            '<mxCell id="7" edge="1" parent="1" target="3"><mxGeometry relative="1" as="geometry"><mxPoint x="10" y="10" as="sourcePoint"/></mxGeometry></mxCell>'
        const roots = '<mxCell id="0"/><mxCell id="1" parent="0"/>'
        const wrongAs =
            '<mxCell id="8" vertex="1" parent="1"><mxGeometry x="1" y="1" width="2" height="2" as="33"/></mxCell>'
        for (const xml of [waypoints, label, sourcePoint, roots, wrongAs]) {
            expect(foldCells(xml)).toBe(xml)
        }
    })

    it("round-trips through expandCompactCells", () => {
        const page = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${shapeLong}${edgeLong}<mxCell id="lane1" value="Lane" style="swimlane;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="200" height="200" as="geometry"/></mxCell><mxCell id="3" value="Step" style="rounded=1;" vertex="1" parent="lane1"><mxGeometry x="20" y="60" width="160" height="40" as="geometry"/></mxCell><mxCell id="6" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="750" y="80"/></Array></mxGeometry></mxCell></root></mxGraphModel>`
        const folded = foldCells(page)
        expect(folded).not.toContain("vertex=")
        expect(canonical(expandCompactCells(folded))).toBe(canonical(page))
    })
})

describe("compact cells through the pipeline", () => {
    const geometryOf = (xml: string, id: string) =>
        xml.match(
            new RegExp(`<mxCell id="${id}"[^>]*>(<mxGeometry[^>]*/>)`),
        )?.[1]

    it("prepareNewDiagram expands them and still adds the defaults", () => {
        const prepared = prepareNewDiagram(`${shape}\n${edge}`)
        expect(prepared.ok).toBe(true)
        if (!prepared.ok) return
        expect(prepared.xml).toContain(
            'style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"',
        )
        expect(geometryOf(prepared.xml, "2")).toBe(
            '<mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>',
        )
        expect(prepared.xml).toContain(
            '<mxCell id="5" style="down;html=1;" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"/></mxCell>',
        )
    })

    it("editDiagram accepts a compact cell in new_xml", () => {
        const file =
            normalizeToMxfile(wrapCellsInModel(shapeLong), {
                pageId: "p1",
                pageName: "Page-1",
            }) ?? ""
        const outcome = editDiagram(
            file,
            [
                {
                    operation: "add",
                    cell_id: "3",
                    new_xml:
                        '<mxCell id="3" value="Next" style="rounded=1;" x="200" y="40" w="120" h="60"/>',
                },
                {
                    operation: "update",
                    cell_id: "2",
                    new_xml:
                        '<mxCell id="2" value="Begin" style="rounded=1;" x="40" y="40" w="120" h="60"/>',
                },
            ],
            {},
        )
        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return
        expect(outcome.xml).toContain('value="Next"')
        expect(outcome.xml).toContain('value="Begin"')
        expect(geometryOf(outcome.xml, "3")).toBe(
            '<mxGeometry x="200" y="40" width="120" height="60" as="geometry"/>',
        )
    })
})

describe("a compact cell with a slip", () => {
    it("repairs a missing closing quote before the slash", () => {
        const prepared = prepareNewDiagram(
            '<mxCell id="12" value="Coin Flip" style="rounded=1;" x="535" y="276" w="225" h="112/>',
        )
        expect(prepared.ok).toBe(true)
        if (!prepared.ok) return
        expect(prepared.xml).toContain(
            '<mxGeometry x="535" y="276" width="225" height="112" as="geometry"/>',
        )
    })
})
