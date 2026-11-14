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

    it("reports output cut right after the opening tag of an edge in the long form", () => {
        // Its mxGeometry and the cells after it never arrived
        const out = prepareNewDiagram(
            `${A}<mxCell id="3" value="B" x="120" y="0" w="80" h="40"/><mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="2" target="3">`,
        )
        expect(out.ok).toBe(false)
        if (!out.ok) expect(out.error).toContain("cut off")
    })

    it("closes a compact cell that also says vertex or edge, on one line with the next cell", () => {
        // A habit from the long form: vertex="1" parent="1" next to x, y,
        // w and h
        const shape = prepareNewDiagram(
            '<mxCell id="2" value="A" vertex="1" parent="1" x="40" y="40" w="120" h="60"><mxCell id="3" value="B" x="240" y="40" w="120" h="60"/>',
        )
        expect(shape).toMatchObject({
            ok: true,
            fixes: ["Closed compact cells written without the slash"],
        })
        if (shape.ok) expect(shape.xml).toContain('value="B"')
        const edge = prepareNewDiagram(
            `${A}<mxCell id="3" value="B" x="120" y="0" w="80" h="40"/><mxCell id="5" edge="1" parent="1" source="2" target="3"><mxCell id="6" value="C" x="240" y="0" w="80" h="40"/>`,
        )
        expect(edge).toMatchObject({
            ok: true,
            fixes: ["Closed compact cells written without the slash"],
        })
        if (edge.ok) {
            expect(edge.xml).toContain(
                '<mxCell id="5" edge="1" parent="1" source="2" target="3"',
            )
            expect(edge.xml).toContain('value="C"')
        }
    })

    it("takes a last cell without its slash for complete, as it is drawn", () => {
        const B = '<mxCell id="3" value="B" x="120" y="0" w="80" h="40"'
        for (const xml of [
            `${A}${B}>`,
            `${A}${B} vertex="1" parent="1">`,
            `${A}${B}/><mxCell id="5" source="2" target="3">`,
        ]) {
            expect(isMxCellXmlComplete(xml)).toBe(true)
            expect(prepareNewDiagram(xml).ok).toBe(true)
        }
        // A cell in the long form that stops after its opening tag is cut
        for (const xml of [
            `${A}${B}/><mxCell id="5" edge="1" parent="1" source="2" target="3">`,
            `${A}<mxCell id="3" value="B" style="rounded=1;" vertex="1" parent="1">`,
            `${A}<mxCell id="3" value="B" vertex="1" parent="1"><mxGeometry x="120" width="80"`,
        ]) {
            expect(isMxCellXmlComplete(xml)).toBe(false)
        }
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

    it("adds the layer to a page that has only the root cell", () => {
        const shape = '<mxCell id="2" value="A" x="40" y="40" w="120" h="60"/>'
        for (const root of ["<root>", "<root >"]) {
            const out = prepareNewDiagram(
                `<mxGraphModel>${root}<mxCell id="0"/>${shape}</root></mxGraphModel>`,
            )
            expect(out).toMatchObject({ ok: true, fixes: [], notes: [] })
            if (!out.ok) return
            expect(out.xml).toContain(
                `${ROOT_CELLS}<mxCell id="2" value="A" vertex="1" parent="1" style="whiteSpace=wrap;html=1;">`,
            )
        }
    })
})

describe("a full page whose root cells are not called 0 and 1", () => {
    // draw.io's own templates name them like this (Basic flowchart)
    const P = "WIyWlLk6GJQsqaUBKTNV"
    const cells = `<mxCell id="${P}-0"/><mxCell id="${P}-1" parent="${P}-0"/><mxCell id="${P}-3" value="Lamp doesn't work" style="rounded=1;whiteSpace=wrap;html=1;" parent="${P}-1" vertex="1"><mxGeometry x="160" y="80" width="120" height="40" as="geometry"/></mxCell>`
    const template = (more = "") =>
        `<mxfile host="app.diagrams.net"><diagram id="C5RBs43oDa-KdzZeNtuy" name="Page-1"><mxGraphModel dx="1223" dy="871" grid="1" gridSize="10"><root>${cells}${more}</root></mxGraphModel></diagram></mxfile>`

    it("keeps them, and adds no second pair", () => {
        const out = prepareNewDiagram(template())
        expect(out).toMatchObject({ ok: true, fixes: [], notes: [] })
        if (!out.ok) return
        expect(out.xml).toBe(template())
    })

    it("keeps two layers as two layers", () => {
        const layers = `<mxfile><diagram id="pg1" name="Page-1"><mxGraphModel><root><mxCell id="abc-0"/><mxCell id="abc-1" value="Network" parent="abc-0"/><mxCell id="abc-9" value="Comments" parent="abc-0" visible="0"/><mxCell id="abc-3" value="Router" style="rounded=1;whiteSpace=wrap;html=1;" parent="abc-1" vertex="1"><mxGeometry x="160" y="80" width="120" height="40" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`
        const out = prepareNewDiagram(layers)
        expect(out).toMatchObject({ ok: true, xml: layers, notes: [] })
    })

    it("puts a compact cell without a parent on the page's own layer", () => {
        const out = prepareNewDiagram(
            template(
                '<mxCell id="n1" value="New" x="340" y="80" w="120" h="40"/>',
            ),
        )
        expect(out).toMatchObject({ ok: true, fixes: [], notes: [] })
        if (!out.ok) return
        expect(out.xml).toContain(
            `<mxCell id="n1" value="New" vertex="1" parent="${P}-1"`,
        )
        expect(out.xml).not.toContain('parent="1"')
    })
})

describe("a full page whose layer has custom data", () => {
    // draw.io writes such a layer's id on the <object> around its cell
    const cells =
        '<mxCell id="0"/><object id="1" label="Layer" owner="ops"><mxCell parent="0"/></object><mxCell id="2" value="A" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>'

    it("keeps that layer as the page's layer, in an <mxfile> and in a bare <mxGraphModel>", () => {
        const file = `<mxfile><diagram id="p" name="P"><mxGraphModel><root>${cells}</root></mxGraphModel></diagram></mxfile>`
        expect(prepareNewDiagram(file)).toMatchObject({
            ok: true,
            xml: file,
            fixes: [],
            notes: [],
        })
        const bare = prepareNewDiagram(
            `<mxGraphModel><root>${cells}</root></mxGraphModel>`,
        )
        expect(bare).toMatchObject({ ok: true, fixes: [], notes: [] })
        if (bare.ok) expect(bare.xml).toContain(`<root>${cells}</root>`)
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

    it("writes a stereotype typed as <<name>> with « and », which draw.io shows", () => {
        const out = prepareNewDiagram(
            `${A}${B}<mxCell id="5" value="&lt;&lt;include&gt;&gt;" source="2" target="3"/><mxCell id="6" value="x &lt;&lt; 2" x="40" y="140" w="120" h="60"/>`,
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain('<mxCell id="5" value="«include»"')
        expect(out.xml).toContain('<mxCell id="6" value="x &lt;&lt; 2"')
        expect(out.fixes).toEqual([
            "Wrote <<name>> as «name» in: 5. A label is HTML, so draw.io takes <name> for a tag and shows only <>.",
        ])
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

describe("a wrapped cell with its parent written on the wrapper", () => {
    // draw.io reads parent, style and geometry only on the mxCell inside. A
    // model put them on the <object> of every step of a swimlane diagram:
    // the steps, placed from their lane's corner, all stood in the page's
    const LANE =
        '<mxCell id="2" value="Lane" style="swimlane;startSize=30;" x="40" y="40" w="220" h="300"/>'

    it("moves parent and style to the cell, so the step stays in its lane", () => {
        const out = prepareNewDiagram(
            `${LANE}<object label="Step" tooltip="more" id="3" parent="2" style="rounded=1;"><mxCell x="40" y="50" w="140" h="60"/></object>`,
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain(
            '<object label="Step" tooltip="more" id="3"><mxCell style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="2">',
        )
        expect(out.notes).toEqual([])
    })

    it("keeps what the cell says itself, and the wrapper's own data", () => {
        const out = prepareNewDiagram(
            `${LANE}<UserObject label="Step" link="https://example.com" id="3" parent="9"><mxCell parent="2" x="40" y="50" w="140" h="60"/></UserObject>`,
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain(
            '<UserObject label="Step" link="https://example.com" id="3" parent="9"><mxCell vertex="1" parent="2"',
        )
    })
})

describe("a line written with waypoints and no ends", () => {
    // GPT-6 Luna writes a sequence diagram's message to itself this way in
    // some drawings. As a shape it was a text of no width at the corner of
    // the page, one letter per line
    const cells = `<mxCell id="2" value="A" x="40" y="40" w="120" h="60"/>
<mxCell id="3" value="loop"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="200" y="60"/><mxPoint x="200" y="90"/></Array></mxGeometry></mxCell>`

    it("is a line, not a shape of no size", () => {
        const out = prepareNewDiagram(cells)
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toMatch(/<mxCell id="3" value="loop" edge="1"/)
        expect(out.xml).not.toMatch(/<mxCell id="3"[^>]*vertex="1"/)
    })

    it("leaves a text on an edge, which has a geometry and no waypoints, a shape", () => {
        const out = prepareNewDiagram(
            `<mxCell id="2" value="A" x="40" y="40" w="120" h="60"/><mxCell id="3" value="B" x="240" y="40" w="120" h="60"/><mxCell id="4" source="2" target="3"/><mxCell id="5" value="yes" style="edgeLabel;" parent="4" connectable="0"><mxGeometry x="-0.5" relative="1" as="geometry"/></mxCell>`,
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toMatch(/<mxCell id="5"[^>]*vertex="1"/)
    })
})
