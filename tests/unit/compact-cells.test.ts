import { describe, expect, it } from "vitest"
import { extractCompleteMxCells, isMxCellXmlComplete } from "@/lib/utils"
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
        // The stray attributes stay as written; the geometry is the one used
        const both =
            '<mxCell id="2" x="1" y="1" w="1" h="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>'
        expect(expandCompactCells(both)).toBe(
            '<mxCell id="2" x="1" y="1" w="1" h="1" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>',
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

describe("review round: cells the model may write", () => {
    it("escapes a double quote from a single-quoted value", () => {
        const out = expandCompactCells(
            `<mxCell id='2' value='Say "hi"' x='1' y='2' w='3' h='4'/>`,
        )
        expect(out).toContain('value="Say &quot;hi&quot;"')
        const prepared = prepareNewDiagram(
            `<mxCell id='2' value='a" visible="0' x="1" y="2" w="3" h="4"/>`,
        )
        expect(prepared.ok).toBe(true)
        if (!prepared.ok) return
        expect(prepared.xml).toContain('value="a&quot; visible=&quot;0"')
        expect(prepared.xml).not.toContain(' visible="0"')
        const folded = foldCells(
            `<mxCell id="2" value='Say "hi"' vertex="1" parent="1"><mxGeometry x="1" y="2" width="3" height="4" as="geometry"/></mxCell>`,
        )
        expect(folded).toBe(
            '<mxCell id="2" value="Say &quot;hi&quot;" x="1" y="2" w="3" h="4"/>',
        )
    })

    it("accepts labels with > in compact self-closing cells", () => {
        const prepared = prepareNewDiagram(
            `<mxCell id="2" value="x > 5" style="rounded=1;" x="40" y="40" w="120" h="60"/>
<mxCell id="3" value="A -> B" style="rounded=1;" x="40" y="200" w="120" h="60"/>
<mxCell id="5" source="2" target="3"/>`,
        )
        expect(prepared.ok).toBe(true)
        expect(
            isMxCellXmlComplete(
                '<mxCell id="2" value="A > B" x="0" y="0" w="120" h="60"/>',
            ),
        ).toBe(true)
        expect(
            extractCompleteMxCells(
                '<mxCell id="2" value="A > B" x="0" y="0" w="120" h="60"/>\n<mxCell id="3" value="C" x="0" y="0" w="1',
            ),
        ).toBe('<mxCell id="2" value="A > B" x="0" y="0" w="120" h="60"/>')
    })

    it("infers a vertex for an edge label with a geometry and an edge for a connection with a size", () => {
        const label =
            '<mxCell id="9" value="yes" style="edgeLabel;" parent="5" connectable="0"><mxGeometry x="-0.5" relative="1" as="geometry"/></mxCell>'
        expect(expandCompactCells(label)).toBe(
            '<mxCell id="9" value="yes" style="edgeLabel;" connectable="0" vertex="1" parent="5"><mxGeometry x="-0.5" relative="1" as="geometry"/></mxCell>',
        )
        expect(
            expandCompactCells(
                '<mxCell id="e" source="2" target="3" x="0" y="0"/>',
            ),
        ).toBe(
            '<mxCell id="e" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"/></mxCell>',
        )
        // A dangling edge has only one end
        expect(
            expandCompactCells('<mxCell id="e" style="a;" source="2"/>'),
        ).toBe(
            '<mxCell id="e" style="a;" edge="1" parent="1" source="2"><mxGeometry relative="1" as="geometry"/></mxCell>',
        )
    })

    it("does not take a geometry inside custom data for the cell's own", () => {
        const out = expandCompactCells(
            '<mxCell id="2" x="10" y="20" w="120" h="60"><Object as="payload"><mxGeometry as="backup"/></Object></mxCell>',
        )
        expect(out).toBe(
            '<mxCell id="2" vertex="1" parent="1"><mxGeometry x="10" y="20" width="120" height="60" as="geometry"/><Object as="payload"><mxGeometry as="backup"/></Object></mxCell>',
        )
    })

    it("keeps stray size attributes when the cell has its own geometry", () => {
        const xml =
            '<mxCell id="2" x="99" vertex="1" parent="1"><mxGeometry x="1" y="2" width="3" height="4" as="geometry"/></mxCell>'
        expect(expandCompactCells(xml)).toBe(xml)
        expect(foldCells(xml)).toBe(xml)
    })

    it("ignores prototype names and folds only cells that name their parent", () => {
        expect(expandCompactCells('<mxCell id="2" toString="x"/>')).toBe(
            '<mxCell id="2" toString="x"/>',
        )
        const noParent =
            '<mxCell id="2" vertex="1"><mxGeometry x="1" y="2" width="3" height="4" as="geometry"/></mxCell>'
        expect(foldCells(noParent)).toBe(noParent)
    })

    it("puts a compact cell on the page's first layer when editing", () => {
        const file = `<mxfile><diagram id="p1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="L1" parent="0"/>${shapeLong.replace('parent="1"', 'parent="L1"')}</root></mxGraphModel></diagram></mxfile>`
        const outcome = editDiagram(
            file,
            [
                {
                    operation: "add",
                    cell_id: "3",
                    new_xml:
                        '<mxCell id="3" value="B" x="1" y="2" w="3" h="4"/>',
                },
            ],
            {},
        )
        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return
        expect(outcome.xml).toContain(
            '<mxCell id="3" value="B" vertex="1" parent="L1"',
        )
        expect(foldCells(file, "L1")).toContain(
            '<mxCell id="2" value="Start" style="rounded=1;" x="40" y="40" w="120" h="60"/>',
        )
    })

    it("refuses a compact shape with a root cell id instead of dropping it", () => {
        const prepared = prepareNewDiagram(
            '<mxCell id="1" value="A" x="0" y="0" w="10" h="10"/>',
        )
        expect(prepared.ok).toBe(false)
        if (!prepared.ok) expect(prepared.error).toContain("root cells")
    })

    it("repairs the quote slip only on a cell's last numeric attribute", () => {
        expect(
            isMxCellXmlComplete('<mxCell id="2" x="1" y="2" w="3" h="4/>'),
        ).toBe(true)
        const prepared = prepareNewDiagram(
            '<mxCell id="2" value="5/>" x="1" y="2" w="3" h="4"/>',
        )
        expect(prepared.ok).toBe(true)
        if (!prepared.ok) return
        expect(prepared.xml).toContain('value="5/>"')
        expect(prepared.xml).toContain(
            '<mxGeometry x="1" y="2" width="3" height="4" as="geometry"/>',
        )
    })

    it("closes a compact cell written without the slash", () => {
        const prepared = prepareNewDiagram(
            '<mxCell id="2" value="A" x="1" y="2" w="3" h="4">\n<mxCell id="3" value="B" x="1" y="2" w="3" h="4"/>',
        )
        expect(prepared.ok).toBe(true)
        if (!prepared.ok) return
        expect(prepared.xml).toContain('value="A"')
        expect(prepared.xml).toContain('value="B"')
        expect(prepared.fixes.join()).toContain("without the slash")
    })
})

describe("a long-form cell missing its closing tag next to compact cells", () => {
    it("is closed before the compact cell that follows", () => {
        const prepared = prepareNewDiagram(
            `<mxCell id="2" value="A" x="0" y="0" w="80" h="40"/>
<mxCell id="4" edge="1" parent="1" source="2" target="5">
  <mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="300" y="150"/></Array></mxGeometry>
<mxCell id="5" value="C" x="400" y="0" w="80" h="40"/>`,
        )
        expect(prepared.ok).toBe(true)
        if (!prepared.ok) return
        expect(prepared.xml).toContain('<mxPoint x="300" y="150"/>')
        expect(prepared.xml).toContain('value="C"')
        expect((prepared.xml.match(/<mxCell\b/g) || []).length).toBe(5)
    })

    it("still flattens a compact cell nested inside an open cell", () => {
        const prepared = prepareNewDiagram(
            `<mxCell id="2" value="A" vertex="1" parent="1">
  <mxGeometry x="0" y="0" width="80" height="40" as="geometry"/>
  <mxCell id="3" value="B" x="100" y="0" w="80" h="40"/>
</mxCell>`,
        )
        expect(prepared.ok).toBe(true)
        if (!prepared.ok) return
        expect(prepared.xml).toContain('value="A"')
        expect(prepared.xml).toContain('value="B"')
        expect((prepared.xml.match(/<mxCell\b/g) || []).length).toBe(4)
    })
})
