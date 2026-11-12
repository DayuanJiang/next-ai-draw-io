/**
 * Tests for prepareNewDiagram's truncation check: output that stops inside an
 * mxCell gets a clear error instead of one about the wrapper tags the model
 * never sent.
 */

import { describe, expect, it } from "vitest"
import {
    isMxCellXmlComplete,
    prepareNewDiagram,
    truncatedCellError,
} from "../src/new-diagram.ts"
import { repairNumberQuotes } from "../src/xml-validation.ts"

describe("isMxCellXmlComplete", () => {
    it("returns false for empty input", () => {
        expect(isMxCellXmlComplete("")).toBe(false)
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

describe("truncation check with named styles and compact cells", () => {
    const BLUE =
        '<mxStyle name="blue" value="fillColor=#dae8fc;strokeColor=#6c8ebf;"/>\n'
    const A =
        '<mxCell id="2" value="A" style="blue;" x="0" y="0" w="80" h="40"/>\n'

    it("accepts complete compact cells after the definitions and expands them", () => {
        const out = prepareNewDiagram(
            `${BLUE}${A}<mxCell id="3" value="B" style="blue;" x="120" y="0" w="80" h="40"/>`,
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain("fillColor=#dae8fc")
        expect(out.xml).toContain("<mxGeometry")
        expect(out.xml).not.toContain("<mxStyle")
    })

    it("reports a cut inside a compact cell that follows the definitions", () => {
        const cut = `${BLUE}${A}<mxCell id="3" value="B" style="blue;" x="120" y="0" w="8`
        const out = prepareNewDiagram(cut)
        expect(out.ok).toBe(false)
        if (out.ok) return
        expect(out.error).toContain("cut off")
        expect(out.error).toContain(
            '<mxCell id="3" value="B" style="blue;" x="120" y="0" w="8',
        )
        expect(out.error).toContain("edit_diagram add")
    })

    it("reports output that stops right after the definitions and the first cells", () => {
        const cut = `${BLUE}${A}<mxCell id="3" value="B" style="blue;"`
        expect(isMxCellXmlComplete(cut)).toBe(false)
        expect(truncatedCellError(cut)).toContain("cut off")
    })

    it("does not treat a compact cell's quote slip as a cut", () => {
        const slip = `${A}<mxCell id="3" value="B" x="120" y="0" w="80" h="40/>`
        expect(isMxCellXmlComplete(slip)).toBe(true)
        expect(truncatedCellError(slip)).toBeNull()
        const out = prepareNewDiagram(slip)
        expect(out.ok).toBe(true)
        if (out.ok) expect(out.xml).toContain('height="40"')
    })

    it("closes a last compact cell written without its slash", () => {
        const out = prepareNewDiagram(
            `${A}<mxCell id="3" value="B" x="120" y="0" w="80" h="40">`,
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain('<mxCell id="3" value="B"')
        expect(out.xml).toContain('height="40"')
        // Also when the model wrote the page in full
        const full = prepareNewDiagram(
            `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${A}<mxCell id="3" value="B" x="120" y="0" w="80" h="40"></root></mxGraphModel>`,
        )
        expect(full.ok).toBe(true)
        if (full.ok) expect(full.xml).toContain('<mxCell id="3" value="B"')
    })

    it("leaves definitions without any cell to the style check", () => {
        expect(truncatedCellError(BLUE)).toBeNull()
        const out = prepareNewDiagram(BLUE)
        expect(out.ok).toBe(false)
        if (out.ok) return
        expect(out.error).not.toContain("cut off")
        expect(out.error).toContain("no cells")
    })

    it("leaves an unclosed definition to the style check", () => {
        const cut = `${BLUE}<mxStyle name="flow" value="edgeSt`
        const out = prepareNewDiagram(cut)
        expect(out.ok).toBe(false)
        if (out.ok) return
        expect(out.error).not.toContain("cut off")
        expect(out.error).toContain("not closed")
    })
})

describe("what a model puts around complete XML", () => {
    const CELLS =
        '<mxCell id="2" value="A" x="40" y="40" w="120" h="60"/><mxCell id="3" value="B" x="240" y="40" w="120" h="60"/><mxCell id="4" source="2" target="3"/>'

    it.each([
        ["a CDATA section", `<![CDATA[${CELLS}]]>`],
        ["a code fence", `\`\`\`xml\n${CELLS}\n\`\`\``],
        ["a fence around CDATA", `\`\`\`\n<![CDATA[\n${CELLS}\n]]>\n\`\`\``],
        ["a sentence after the cells", `${CELLS}\n\nThis shows the flow.`],
    ])("draws cells wrapped in %s", (_name, xml) => {
        expect(isMxCellXmlComplete(xml)).toBe(true)
        const out = prepareNewDiagram(xml)
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml.match(/<mxGeometry/g)).toHaveLength(3)
        expect(out.xml).not.toMatch(/CDATA|`|This shows/)
    })

    it("still reports a cut inside a fenced cell", () => {
        const cut = '```xml\n<mxCell id="2" value="A" x="40" y="4'
        expect(isMxCellXmlComplete(cut)).toBe(false)
        const out = prepareNewDiagram(cut)
        expect(out.ok).toBe(false)
        if (!out.ok) expect(out.error).toContain("cut off")
    })

    it("says that empty xml is empty", () => {
        for (const xml of ["", " \n"]) {
            const out = prepareNewDiagram(xml)
            expect(out.ok).toBe(false)
            if (!out.ok) expect(out.error).toContain("xml is empty")
        }
    })
})

describe("a full page without the root cells", () => {
    const ROOT_CELLS = '<root><mxCell id="0"/><mxCell id="1" parent="0"/>'

    it("adds them to a bare <mxGraphModel>", () => {
        const out = prepareNewDiagram(
            '<mxGraphModel><root><mxCell id="2" value="A" x="40" y="40" w="120" h="60"/></root></mxGraphModel>',
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain(
            `${ROOT_CELLS}<mxCell id="2" value="A" vertex="1" parent="1" style="whiteSpace=wrap;html=1;">`,
        )
    })

    it("adds them to each page of an <mxfile> that lacks them", () => {
        const page = (name: string, cells: string) =>
            `<diagram name="${name}"><mxGraphModel><root>${cells}</root></mxGraphModel></diagram>`
        const shape = '<mxCell id="2" value="A" x="40" y="40" w="120" h="60"/>'
        const out = prepareNewDiagram(
            `<mxfile>${page("A", shape)}${page("B", `<mxCell id="0"/><mxCell id="1" parent="0"/>${shape}`)}${page("C", `<mxCell id="L" parent="0"/>${shape.replace("x=", 'parent="L" x=')}`)}</mxfile>`,
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        // Pages A and B have both; page C keeps its own layer
        expect(out.xml.match(/<mxCell id="0"\/>/g)).toHaveLength(3)
        expect(out.xml.match(/<mxCell id="1" parent="0"\/>/g)).toHaveLength(2)
        expect(out.xml).toContain(
            '<root><mxCell id="0"/><mxCell id="L" parent="0"/>',
        )
    })
})

describe("what a drawing tells the model about its cells", () => {
    const A = '<mxCell id="2" value="A" x="40" y="40" w="120" h="60"/>'
    const B = '<mxCell id="3" value="B" x="240" y="40" w="120" h="60"/>'

    it("has no notes for a sound drawing, edges before their ends included", () => {
        const out = prepareNewDiagram(
            `<mxCell id="4" source="2" target="3"/>${A}${B}`,
        )
        expect(out).toMatchObject({ ok: true, notes: [], fixes: [] })
    })

    it("draws an edge without the end that names no cell and says so", () => {
        const out = prepareNewDiagram(
            `${A}${B}<mxCell id="5" source="2" target="33"/><mxCell id="6" value="C" parent="group9" x="0" y="0" w="80" h="40"/>`,
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain(
            '<mxCell id="5" edge="1" parent="1" source="2" style="html=1;">',
        )
        expect(out.xml).toContain(
            '<mxCell id="6" value="C" vertex="1" parent="1"',
        )
        expect(out.notes).toEqual([
            'Drawn without the end that names no cell on this page: 5 (target "33"). Update these edges once the cells exist.',
            'Put on the page itself, as the parent is no cell on this page: 6 (parent "group9").',
        ])
        expect(out.fixes).toEqual(out.notes)
    })

    it("names children drawn with page coordinates, at most ten", () => {
        const kids = Array.from(
            { length: 12 },
            (_, i) =>
                `<mxCell id="k${i}" value="K" parent="box" x="${400 + i * 10}" y="300" w="80" h="40"/>`,
        ).join("")
        const out = prepareNewDiagram(
            `<mxCell id="box" value="VPC" style="swimlane;" x="300" y="200" w="300" h="200"/><mxCell id="ok" value="In" parent="box" x="20" y="40" w="80" h="40"/>${kids}`,
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.notes).toHaveLength(1)
        expect(out.notes[0]).toContain(
            "Outside their container: k0, k1, k2, k3, k4, k5, k6, k7, k8, k9 and 2 more. The x and y of a cell with parent=",
        )
    })

    it("writes an embedded picture the way draw.io does, without ;base64", () => {
        const out = prepareNewDiagram(
            '<mxCell id="2" style="shape=image;image=data:image/png;base64,iVBORw0KGgo=;" x="0" y="0" w="40" h="40"/>',
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain(
            'style="shape=image;image=data:image/png,iVBORw0KGgo=;html=1;"',
        )
    })

    it("says which page of several a note is about", () => {
        const page = (name: string, cells: string) =>
            `<diagram name="${name}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram>`
        const out = prepareNewDiagram(
            `<mxfile>${page("One", A)}${page("Two", `${A}<mxCell id="5" source="2" target="9"/>`)}</mxfile>`,
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.notes).toHaveLength(1)
        expect(out.notes[0]).toMatch(
            /^Page 2: Drawn without the end that names no cell on this page: 5 \(target "9"\)/,
        )
    })
})

describe("a number attribute written without its closing quote", () => {
    // Cells as the models wrote them on the demo site, where the browser
    // rejected every drawing that had one
    const A = '<mxCell id="2" value="A" x="40" y="40" w="120" h="60"/>\n'
    const geometryOf = (xml: string, id: string) =>
        xml.match(
            new RegExp(`<mxCell id="${id}"[^>]*>(<mxGeometry[^>]*>)`),
        )?.[1]

    it("closes the last number of a cell, also after a label with &quot;", () => {
        const out = prepareNewDiagram(
            `<mxCell id="21" value="理论认识&lt;br&gt;&lt;font style=&quot;font-size: 11px;&quot;&gt;多源不确定性作用下&lt;/font&gt;" style="rounded=1;fontSize=13;" x="660" y="68" w="127" h="105/>
<mxCell id="22" value="模型与方法&lt;br&gt;&lt;font style=&quot;font-size: 11px;&quot;&gt;状态表征&lt;/font&gt;" style="rounded=1;fontSize=13;" x="660" y="193" w="127" h="105/>`,
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.fixes).toEqual([
            "Added the missing closing quote of number attributes",
        ])
        expect(geometryOf(out.xml, "22")).toBe(
            '<mxGeometry x="660" y="193" width="127" height="105" as="geometry"/>',
        )
        // The label's own quotes stay entities
        expect(out.xml).toContain(
            "&lt;font style=&quot;font-size: 11px;&quot;&gt;状态表征",
        )
    })

    it("closes a number followed by the next attribute", () => {
        const out = prepareNewDiagram(
            `${A}<mxCell id="39" value="PGW" style="rounded=1;" x="478" y="492" w="78 h="38"/>
<mxCell id="141" value="" style="ellipse;fillColor=#b9ded0;" x="745" y="406" w="24 h="25/>
<mxCell id="80" source="2" target="39"/>`,
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(geometryOf(out.xml, "39")).toBe(
            '<mxGeometry x="478" y="492" width="78" height="38" as="geometry"/>',
        )
        expect(geometryOf(out.xml, "141")).toBe(
            '<mxGeometry x="745" y="406" width="24" height="25" as="geometry"/>',
        )
        expect(out.xml).toContain('source="2" target="39"')
    })

    it("closes the last number of a waypoint", () => {
        const out = prepareNewDiagram(
            `${A}<mxCell id="3" value="B" x="240" y="300" w="120" h="60"/>
<mxCell id="14" value="first" style="exitX=0.85;exitY=0;" source="2" target="3"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="15" y="320"/><mxPoint x="15" y="215/><mxPoint x="220" y="215"/></Array></mxGeometry></mxCell>
<mxCell id="16" value="second" style="exitX=0;exitY=0.8;" source="3" target="2"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="300" y="165"/><mxPoint x="300" y="305/></Array></mxGeometry></mxCell>
<mxCell id="17" value="C" x="440" y="40" w="120" h="60"/>`,
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain(
            '<Array as="points"><mxPoint x="15" y="320"/><mxPoint x="15" y="215"/><mxPoint x="220" y="215"/></Array>',
        )
        expect(out.xml).toContain(
            '<Array as="points"><mxPoint x="300" y="165"/><mxPoint x="300" y="305"/></Array>',
        )
        // The cells after the open quotes stay cells of their own
        expect(out.xml).toContain('<mxCell id="16" value="second"')
        expect(out.xml).toContain('<mxCell id="17" value="C"')
    })

    it("reads such a last cell as complete output", () => {
        const slip = `${A}<mxCell id="39" value="PGW" x="478" y="492" w="78 h="38"/>`
        expect(isMxCellXmlComplete(slip)).toBe(true)
        expect(truncatedCellError(slip)).toBeNull()
    })

    it("leaves a label that holds such text as it is", () => {
        const cells = `<mxCell id="2" value='Write w="78 h="38"/> like this' x="40" y="40" w="120" h="60"/>
<mxCell id="3" value="5 &lt; 6" style="rounded=1;" x="40" y="140" w="120" h="60"/>`
        expect(repairNumberQuotes(cells)).toBe(cells)
    })
})
