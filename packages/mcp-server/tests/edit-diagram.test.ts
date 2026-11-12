/**
 * Tests for the all-or-nothing edit_diagram core (src/edit-diagram.ts).
 */

import { describe, expect, it } from "vitest"
import { editDiagram, targetPageXml } from "../src/edit-diagram.ts"
import { prepareNewDiagram } from "../src/new-diagram.ts"
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
        expect(out.unchanged).toEqual([])
    })

    it("names the updates that sent a cell as it already was", () => {
        // Another attribute order is still the same cell
        const doc = `<mxfile>${page("p1", '<mxCell id="a" value="A" style="rounded=1;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>')}</mxfile>`
        const out = editDiagram(
            doc,
            [
                {
                    operation: "update",
                    cell_id: "a",
                    new_xml:
                        '<mxCell id="a" value="A" style="fillColor=#dae8fc;rounded=1;html=1;whiteSpace=wrap;" x="0" y="0" w="80" h="40"/>',
                },
                { operation: "add", cell_id: "c", new_xml: cell("c") },
            ],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        // The stored cell has no html=1: the update adds it, a change
        expect(out.unchanged).toEqual([])
        const again = editDiagram(
            out.xml,
            [
                {
                    operation: "update",
                    cell_id: "a",
                    new_xml:
                        '<mxCell value="A" id="a" style="fillColor=#dae8fc;rounded=1;html=1;whiteSpace=wrap" x="0" y="0" w="80" h="40"/>',
                },
                {
                    operation: "update",
                    cell_id: "c",
                    new_xml: cell("c").replace('value="c"', 'value="C2"'),
                },
            ],
            {},
        )
        expect(again.ok).toBe(true)
        if (!again.ok) return
        expect(again.unchanged).toEqual(["a"])
    })

    it("counts reordered style keys as a change", () => {
        // draw.io uses the last value of a repeated key: red before, blue now
        const doc = `<mxfile>${page("p1", '<mxCell id="a" value="A" style="fillColor=#0000ff;fillColor=#ff0000;html=1;whiteSpace=wrap;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>')}</mxfile>`
        const out = editDiagram(
            doc,
            [
                {
                    operation: "update",
                    cell_id: "a",
                    new_xml:
                        '<mxCell id="a" value="A" style="fillColor=#ff0000;fillColor=#0000ff;html=1;whiteSpace=wrap;" x="0" y="0" w="80" h="40"/>',
                },
            ],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.unchanged).toEqual([])
    })

    it("applies nothing when one operation fails", () => {
        const out = editDiagram(
            DOC,
            [
                { operation: "add", cell_id: "c", new_xml: cell("c") },
                {
                    operation: "update",
                    cell_id: "missing",
                    new_xml: cell("missing"),
                },
            ],
            {},
        )
        expect(out.ok).toBe(false)
        if (out.ok) return
        expect(out.pageError).toBe(false)
        expect(out.errors).toEqual([
            'update missing: Cell with id="missing" not found',
        ])
    })

    it("applies the rest when a delete names a cell that is already gone", () => {
        const out = editDiagram(
            DOC,
            [
                { operation: "delete", cell_id: "gone" },
                { operation: "add", cell_id: "c", new_xml: cell("c") },
            ],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain('id="c"')
        expect(out.notes).toEqual([
            "delete gone: no cell with this id on the page (already deleted?), skipped.",
        ])
    })

    it("takes a code fence or a CDATA section off new_xml", () => {
        const out = editDiagram(
            DOC,
            [
                {
                    operation: "add",
                    cell_id: "c",
                    new_xml: `\`\`\`xml\n${cell("c")}\n\`\`\``,
                },
                {
                    operation: "add",
                    cell_id: "d",
                    new_xml: `<![CDATA[${cell("d")}]]>`,
                },
            ],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain('<mxCell id="c" value="c" vertex="1"')
        expect(out.xml).toContain('<mxCell id="d" value="d" vertex="1"')
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

describe("what an edit tells the model about the cells it wrote", () => {
    const LANE = `<mxCell id="lane1" value="Lane" style="swimlane;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="200" height="200" as="geometry"/></mxCell>`
    const doc = `<mxfile>${page("p1", cell("a") + LANE)}</mxfile>`
    const add = (id: string, attrs: string) => ({
        operation: "add" as const,
        cell_id: id,
        new_xml: `<mxCell id="${id}" ${attrs}/>`,
    })

    it("draws an edge without the end that names no cell, and a shape with a missing parent on the page", () => {
        const out = editDiagram(
            doc,
            [
                add(
                    "x",
                    'value="X" parent="lane_1" x="20" y="60" w="160" h="40"',
                ),
                add("e", 'source="a" target="ghost"'),
            ],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        // What draw.io would do on load, done here and said
        expect(out.xml).toContain(
            '<mxCell id="x" value="X" vertex="1" parent="1" style="whiteSpace=wrap;html=1;">',
        )
        expect(out.xml).toContain(
            '<mxCell id="e" edge="1" parent="1" source="a" style="html=1;">',
        )
        expect(out.notes).toEqual([
            'Drawn without the end that names no cell on this page: e (target "ghost"). Update these edges once the cells exist.',
            'Put on the page itself, as the parent is no cell on this page: x (parent "lane_1").',
        ])
        // The web app sends the canvas again after a repair
        expect(out.fixes).toEqual(out.notes)
    })

    it("says nothing when the edge comes before its end in the same call", () => {
        const out = editDiagram(
            doc,
            [
                add("e", 'source="a" target="late"'),
                add("late", 'value="Late" x="300" y="0" w="80" h="40"'),
            ],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain('source="a" target="late"')
        expect(out.notes).toEqual([])
        expect(out.fixes).toEqual([])
    })

    it("leaves references it did not write alone", () => {
        // A loaded file's edge to nowhere is not this edit's business
        const loaded = `<mxfile>${page("p1", `${cell("a")}<mxCell id="old" edge="1" parent="1" source="a" target="nowhere"><mxGeometry relative="1" as="geometry"/></mxCell>`)}</mxfile>`
        const out = editDiagram(
            loaded,
            [add("b", 'value="B" x="0" y="100" w="80" h="40"')],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain('target="nowhere"')
        expect(out.notes).toEqual([])
    })

    it("names children that reach outside their container", () => {
        const out = editDiagram(
            doc,
            [
                // Page coordinates instead of the lane's own
                add(
                    "far",
                    'value="Far" parent="lane1" x="300" y="300" w="120" h="40"',
                ),
                add(
                    "in",
                    'value="In" parent="lane1" x="20" y="60" w="160" h="40"',
                ),
            ],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.notes).toHaveLength(1)
        expect(out.notes[0]).toMatch(/^Outside their container: far\. /)
        expect(out.fixes).toEqual([])
    })

    it("names labels with a literal \\n", () => {
        const out = editDiagram(
            doc,
            [
                add(
                    "two",
                    'value="Line one\\nLine two" x="0" y="100" w="120" h="40"',
                ),
                add(
                    "br",
                    'value="Line one&lt;br&gt;Line two" x="0" y="200" w="120" h="40"',
                ),
            ],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.notes).toEqual([
            "The label holds a literal \\n, shown as those two characters: two. For a line break write &lt;br&gt;.",
        ])
    })

    it("names references to pictures the diagram does not have", () => {
        const out = editDiagram(
            doc,
            [
                add(
                    "pic",
                    'style="shape=image;image=data:image/png,embedded-image-nosuchone1;" x="0" y="200" w="40" h="40"',
                ),
            ],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.notes).toHaveLength(1)
        expect(out.notes[0]).toContain("No picture for the reference in: pic.")
    })
})

describe("named styles in the calls after the drawing", () => {
    const BOX = "rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;"
    const drawn = prepareNewDiagram(
        `<mxStyle name="svcbox" value="${BOX}"/><mxCell id="2" value="A" style="svcbox;" x="40" y="40" w="120" h="60"/>`,
    )
    const xml = drawn.ok ? drawn.xml : ""

    it("expands a name the drawing defined in an add and an update", () => {
        const out = editDiagram(
            xml,
            [
                {
                    operation: "add",
                    cell_id: "5",
                    new_xml:
                        '<mxCell id="5" value="C" style="svcbox;" x="440" y="40" w="120" h="60"/>',
                },
                {
                    operation: "update",
                    cell_id: "2",
                    new_xml:
                        '<mxCell id="2" value="A2" style="svcbox;fontStyle=1;" x="40" y="40" w="120" h="60"/>',
                },
            ],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain(
            `<mxCell id="5" value="C" style="${BOX}whiteSpace=wrap;html=1;"`,
        )
        expect(out.xml).toContain(
            `<mxCell id="2" value="A2" style="${BOX}fontStyle=1;whiteSpace=wrap;html=1;"`,
        )
        expect(out.xml).not.toContain("svcbox")
    })

    it("expands it in a later drawing too, until that defines the name anew", () => {
        const cellOf = (xml: string) =>
            prepareNewDiagram(
                `${xml}<mxCell id="2" value="B" style="svcbox;" x="40" y="40" w="120" h="60"/>`,
            )
        expect(cellOf("")).toMatchObject({ ok: true })
        const again = cellOf("")
        if (again.ok) expect(again.xml).toContain(`style="${BOX}whiteSpace`)
        const redefined = cellOf('<mxStyle name="svcbox" value="dashed=1;"/>')
        if (redefined.ok) {
            expect(redefined.xml).toContain('style="dashed=1;whiteSpace')
        }
        const after = cellOf("")
        if (after.ok) expect(after.xml).toContain('style="dashed=1;whiteSpace')
    })

    it("keeps a definition named like one of draw.io's styles to its drawing", () => {
        // "group" restyled here would also restyle the groups of a file
        // loaded later
        const own = prepareNewDiagram(
            '<mxStyle name="group" value="dashed=1;"/><mxCell id="2" value="G" style="group;" x="0" y="0" w="200" h="100"/>',
        )
        expect(own.ok).toBe(true)
        if (own.ok) expect(own.xml).toContain('style="dashed=1;whiteSpace')
        const out = editDiagram(
            xml,
            [
                {
                    operation: "add",
                    cell_id: "7",
                    new_xml:
                        '<mxCell id="7" style="group;" x="0" y="300" w="200" h="100"/>',
                },
            ],
            {},
        )
        expect(out.ok).toBe(true)
        if (out.ok) expect(out.xml).toContain('style="group;whiteSpace')
    })

    it("leaves a name nobody defined, and draw.io's own names, as written", () => {
        const out = editDiagram(
            xml,
            [
                {
                    operation: "add",
                    cell_id: "6",
                    new_xml:
                        '<mxCell id="6" value="D" style="ellipse;neverdefined;" x="0" y="200" w="80" h="80"/>',
                },
            ],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain(
            'style="ellipse;neverdefined;whiteSpace=wrap;html=1;"',
        )
    })
})

describe("a cell without html=1, from a file another tool wrote", () => {
    // Plain text: "<String>" is text, and the label is not wrapped
    const LABEL = "List&lt;String&gt; items&#xa;second line"
    const doc = `<mxfile>${page("p1", `<mxCell id="t" value="${LABEL}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>`)}</mxfile>`
    const update = (value: string) =>
        editDiagram(
            doc,
            [
                {
                    operation: "update",
                    cell_id: "t",
                    new_xml: `<mxCell id="t" value="${value}" style="rounded=1;" x="100" y="0" w="80" h="40"/>`,
                },
            ],
            {},
        )

    it("keeps its label plain when an update only moves it", () => {
        const out = update(LABEL)
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain(
            `<mxCell id="t" value="${LABEL}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="100"`,
        )
    })

    it("gets the defaults when the update writes a new label", () => {
        const out = update("New&lt;br&gt;label")
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain(
            'value="New&lt;br&gt;label" style="rounded=1;whiteSpace=wrap;html=1;"',
        )
    })
})
