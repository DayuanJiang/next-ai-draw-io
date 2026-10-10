import { describe, expect, it } from "vitest"
import { isMxCellXmlComplete } from "@/lib/utils"
import { editDiagram } from "@/packages/mcp-server/src/edit-diagram.ts"
import { prepareNewDiagram } from "@/packages/mcp-server/src/new-diagram.ts"
import {
    normalizeToMxfile,
    wrapCellsInModel,
} from "@/packages/mcp-server/src/pages.ts"
import {
    addDefaultStyles,
    applyStyleClasses,
    expandStyles,
    readStyleClasses,
} from "@/packages/mcp-server/src/style-classes.ts"

const geometry =
    '<mxGeometry x="0" y="0" width="80" height="40" as="geometry"/>'
const cell = (id: string, style: string, extra = "") =>
    `<mxCell id="${id}" value="${id}" style="${style}" vertex="1" parent="1"${extra}>${geometry}</mxCell>`
const edge = (id: string, style: string) =>
    `<mxCell id="${id}" style="${style}" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"/></mxCell>`

const BLUE =
    '<mxStyle name="blue" value="fillColor=#dae8fc;strokeColor=#6c8ebf;"/>'

describe("readStyleClasses", () => {
    it("reads the definitions and removes them from the XML", () => {
        const xml = `${BLUE}\n<mxStyle name="flow" value="edgeStyle=orthogonalEdgeStyle;"></mxStyle>\n${cell("2", "blue;")}`
        const { classes, xml: rest } = readStyleClasses(xml)
        expect(classes.get("blue")).toBe(
            "fillColor=#dae8fc;strokeColor=#6c8ebf",
        )
        expect(classes.get("flow")).toBe("edgeStyle=orthogonalEdgeStyle")
        expect(rest).toBe(cell("2", "blue;"))
    })

    it("resolves a definition that uses an earlier name", () => {
        const xml = `${BLUE}<mxStyle name="pill" value="rounded=1;blue;arcSize=50;"/>`
        const { classes } = readStyleClasses(xml)
        expect(classes.get("pill")).toBe(
            "rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;arcSize=50",
        )
    })

    it("leaves a definition that is still streaming in place", () => {
        const xml = `${BLUE}<mxStyle name="flow" value="edgeSt`
        const { classes, xml: rest } = readStyleClasses(xml)
        expect(classes.size).toBe(1)
        expect(rest).toBe('<mxStyle name="flow" value="edgeSt')
    })
})

describe("applyStyleClasses", () => {
    const classes = readStyleClasses(BLUE).classes

    it("expands a name in place, so the overrides after it still win", () => {
        const out = applyStyleClasses(
            cell("2", "rhombus;blue;fontSize=14;"),
            classes,
        )
        expect(out).toBe(
            cell(
                "2",
                "rhombus;fillColor=#dae8fc;strokeColor=#6c8ebf;fontSize=14;",
            ),
        )
    })

    it("leaves unknown names, key=value tokens and other attributes alone", () => {
        const xml = `${cell("2", "text;fontSize=blue;")}<mxCell id="3" vertex="1" parent="1" value="blue">${geometry}</mxCell>`
        expect(applyStyleClasses(xml, classes)).toBe(xml)
    })

    it("works inside a wrapped model and keeps the attribute order", () => {
        const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" style="blue;" value="A" vertex="1" parent="1">${geometry}</mxCell></root></mxGraphModel>`
        expect(applyStyleClasses(xml, classes)).toBe(
            xml.replace(
                'style="blue;"',
                'style="fillColor=#dae8fc;strokeColor=#6c8ebf;"',
            ),
        )
    })
})

describe("addDefaultStyles", () => {
    it("adds whiteSpace=wrap and html=1 to a shape", () => {
        expect(addDefaultStyles(cell("2", "rounded=1;"))).toBe(
            cell("2", "rounded=1;whiteSpace=wrap;html=1;"),
        )
    })

    it("gives a shape without a style attribute one", () => {
        const xml = `<mxCell id="2" value="A" vertex="1" parent="1">${geometry}</mxCell>`
        expect(addDefaultStyles(xml)).toBe(
            `<mxCell id="2" value="A" vertex="1" parent="1" style="whiteSpace=wrap;html=1;">${geometry}</mxCell>`,
        )
    })

    it("keeps html=0 and an existing whiteSpace", () => {
        const xml = cell("2", "html=0;whiteSpace=nowrap;")
        expect(addDefaultStyles(xml)).toBe(xml)
    })

    it("adds only html=1 to icon shapes, images and edge labels", () => {
        const icon = cell(
            "2",
            "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;verticalLabelPosition=bottom;",
        )
        const image = cell("3", "image=data:image/png,abc;")
        const label = cell("4", "edgeLabel;align=center;")
        const unconnectable = cell("5", "align=center;", ' connectable="0"')
        expect(addDefaultStyles(icon)).toBe(
            cell(
                "2",
                "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;verticalLabelPosition=bottom;html=1;",
            ),
        )
        expect(addDefaultStyles(image)).toBe(
            cell("3", "image=data:image/png,abc;html=1;"),
        )
        expect(addDefaultStyles(label)).toBe(
            cell("4", "edgeLabel;align=center;html=1;"),
        )
        expect(addDefaultStyles(unconnectable)).toBe(
            cell("5", "align=center;html=1;", ' connectable="0"'),
        )
    })

    it("adds html=1 to edges and leaves the root cells alone", () => {
        const roots = '<mxCell id="0"/><mxCell id="1" parent="0"/>'
        expect(addDefaultStyles(roots + edge("4", "endArrow=block;"))).toBe(
            roots + edge("4", "endArrow=block;html=1;"),
        )
    })
})

describe("expandStyles", () => {
    it("expands the names, then adds the defaults", () => {
        const xml = `${BLUE}${cell("2", "blue;")}`
        expect(expandStyles(xml)).toBe(
            cell(
                "2",
                "fillColor=#dae8fc;strokeColor=#6c8ebf;whiteSpace=wrap;html=1;",
            ),
        )
    })
})

describe("prepareNewDiagram with named styles", () => {
    it("saves plain draw.io XML without the definitions", () => {
        const xml = `${BLUE}\n<mxStyle name="flow" value="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=1;entryX=0.5;entryY=0;"/>\n${cell("2", "blue;")}\n${cell("3", "rhombus;blue;")}\n${edge("4", "flow;")}`
        const prepared = prepareNewDiagram(xml, { pageId: "p1" })
        expect(prepared.ok).toBe(true)
        if (!prepared.ok) return
        expect(prepared.xml).not.toContain("mxStyle")
        expect(prepared.xml).toContain(
            'style="fillColor=#dae8fc;strokeColor=#6c8ebf;whiteSpace=wrap;html=1;"',
        )
        expect(prepared.xml).toContain(
            'style="rhombus;fillColor=#dae8fc;strokeColor=#6c8ebf;whiteSpace=wrap;html=1;"',
        )
        expect(prepared.xml).toContain(
            'style="edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=1;entryX=0.5;entryY=0;html=1;"',
        )
    })
})

describe("editDiagram adds the default styles", () => {
    it("adds html=1 and whiteSpace=wrap to an added cell", () => {
        const file =
            normalizeToMxfile(wrapCellsInModel(cell("2", "")), {
                pageId: "p1",
                pageName: "Page-1",
            }) ?? ""
        const outcome = editDiagram(
            file,
            [
                {
                    operation: "add",
                    cell_id: "3",
                    new_xml: cell("3", "rounded=1;"),
                },
            ],
            {},
        )
        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return
        expect(outcome.xml).toContain(
            'style="rounded=1;whiteSpace=wrap;html=1;"',
        )
    })
})

describe("cells written in other shapes", () => {
    it("keeps a self-closing cell without a style self-closing", () => {
        const edge =
            '<mxCell id="4" edge="1" parent="1" source="2" target="3"/>'
        expect(addDefaultStyles(edge)).toBe(
            '<mxCell id="4" edge="1" parent="1" source="2" target="3" style="html=1;"/>',
        )
        const shape = '<mxCell id="5" value="A" vertex="1" parent="1" />'
        expect(addDefaultStyles(shape)).toBe(
            '<mxCell id="5" value="A" vertex="1" parent="1" style="whiteSpace=wrap;html=1;"/>',
        )
    })

    it("expands a name in a cell wrapped in a UserObject", () => {
        const xml = `${BLUE}<UserObject id="4" label="Docs" link="https://example.com"><mxCell style="blue;" vertex="1" parent="1">${geometry}</mxCell></UserObject>`
        expect(expandStyles(xml)).toBe(
            `<UserObject id="4" label="Docs" link="https://example.com"><mxCell style="fillColor=#dae8fc;strokeColor=#6c8ebf;whiteSpace=wrap;html=1;" vertex="1" parent="1">${geometry}</mxCell></UserObject>`,
        )
    })

    it("leaves text that sizes itself unwrapped", () => {
        const xml = cell("2", "text;autosize=1;")
        expect(addDefaultStyles(xml)).toBe(cell("2", "text;autosize=1;html=1;"))
    })

    it("reads a definition written without the closing slash", () => {
        const { classes, xml } = readStyleClasses(
            `<mxStyle name="a" value="x=1">\n${cell("2", "a;")}`,
        )
        expect(classes.get("a")).toBe("x=1")
        expect(xml).toBe(cell("2", "a;"))
    })

    it("adds the defaults inside a full mxfile", () => {
        const file = `<mxfile><diagram id="p" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cell("2", "rounded=1;")}</root></mxGraphModel></diagram></mxfile>`
        const prepared = prepareNewDiagram(file)
        expect(prepared.ok).toBe(true)
        if (!prepared.ok) return
        expect(prepared.xml).toContain(
            '<mxCell id="0"/><mxCell id="1" parent="0"/>',
        )
        expect(prepared.xml).toContain(
            'style="rounded=1;whiteSpace=wrap;html=1;"',
        )
    })
})

describe("truncation check with named styles", () => {
    it("treats output cut off right after the definitions as incomplete", () => {
        expect(isMxCellXmlComplete(BLUE)).toBe(false)
        expect(
            isMxCellXmlComplete(`${BLUE}<mxStyle name="flow" value="edgeSt`),
        ).toBe(false)
        expect(isMxCellXmlComplete(`${BLUE}${cell("2", "blue;")}`)).toBe(true)
    })
})

describe("styles are rewritten as written", () => {
    it("keeps entities, a leading semicolon and a missing trailing one", () => {
        const quoted = cell(
            "2",
            "fontFamily=&quot;Times New Roman&quot;;fillColor=red;",
        )
        expect(addDefaultStyles(quoted)).toBe(
            cell(
                "2",
                "fontFamily=&quot;Times New Roman&quot;;fillColor=red;whiteSpace=wrap;html=1;",
            ),
        )
        const noDefaults = cell("3", ";shape=rectangle;strokeColor=#000000")
        expect(addDefaultStyles(noDefaults)).toBe(
            cell(
                "3",
                ";shape=rectangle;strokeColor=#000000;whiteSpace=wrap;html=1;",
            ),
        )
        const classes = readStyleClasses(BLUE).classes
        expect(applyStyleClasses(cell("4", "blue"), classes)).toBe(
            cell("4", "fillColor=#dae8fc;strokeColor=#6c8ebf"),
        )
    })

    it("does not add wrapping next to html=0, since wrapping turns HTML on", () => {
        const xml = cell("2", "html=0;")
        expect(addDefaultStyles(xml)).toBe(xml)
    })

    it("wraps ordinary shape= shapes and leaves library icons alone", () => {
        expect(
            addDefaultStyles(
                cell(
                    "2",
                    "shape=parallelogram;perimeter=parallelogramPerimeter;",
                ),
            ),
        ).toBe(
            cell(
                "2",
                "shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;",
            ),
        )
        expect(
            addDefaultStyles(
                cell(
                    "3",
                    "shape=mxgraph.cisco19.router;verticalLabelPosition=bottom;",
                ),
            ),
        ).toBe(
            cell(
                "3",
                "shape=mxgraph.cisco19.router;verticalLabelPosition=bottom;html=1;",
            ),
        )
        // Library shapes whose label sits inside wrap like any shape
        expect(
            addDefaultStyles(cell("5", "shape=mxgraph.flowchart.process;")),
        ).toBe(
            cell(
                "5",
                "shape=mxgraph.flowchart.process;whiteSpace=wrap;html=1;",
            ),
        )
        expect(addDefaultStyles(cell("4", "shape=image;image=a.png;"))).toBe(
            cell("4", "shape=image;image=a.png;html=1;"),
        )
    })

    it("escapes a quote that a single-quoted definition brings in", () => {
        const xml = `<mxStyle name="a" value='fontFamily="Arial";'/>${cell("2", "a;")}`
        expect(expandStyles(xml)).toBe(
            cell("2", "fontFamily=&quot;Arial&quot;;whiteSpace=wrap;html=1;"),
        )
    })

    it("resolves references in either order; duplicates and built-in names", () => {
        const { classes } = readStyleClasses(
            `<mxStyle name="b" value="c;x=1;"/><mxStyle name="c" value="y=2;"/><mxStyle name="c" value="y=3;"/><mxStyle name="loop" value="loop;z=1;"/>`,
        )
        // A name defined later still resolves; the last definition wins
        expect(classes.get("b")).toBe("y=3;x=1")
        // A name using itself stays a bare token
        expect(classes.get("loop")).toBe("loop;z=1")
        // The last definition of a name wins
        expect(classes.get("c")).toBe("y=3")
        // A definition named like a built-in replaces that built-in's meaning
        const shadow = readStyleClasses(
            '<mxStyle name="ellipse" value="fillColor=red;"/>',
        ).classes
        expect(applyStyleClasses(cell("2", "ellipse;"), shadow)).toBe(
            cell("2", "fillColor=red;"),
        )
    })
})

describe("the auto-fix runs before the defaults", () => {
    it("repairs quotes written as entities in an edit and then adds the defaults", () => {
        const file = normalizeToMxfile(wrapCellsInModel(cell("2", "")), {
            pageId: "p1",
            pageName: "Page-1",
        })
        const outcome = editDiagram(
            file ?? "",
            [
                {
                    operation: "add",
                    cell_id: "3",
                    new_xml: `<mxCell id="3" value="B" style=&quot;rounded=1;&quot; vertex="1" parent="1">${geometry}</mxCell>`,
                },
            ],
            {},
        )
        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return
        expect(outcome.xml).toContain(
            'style="rounded=1;whiteSpace=wrap;html=1;"',
        )
    })

    it("repairs a new diagram the same way", () => {
        const prepared = prepareNewDiagram(
            `${BLUE}<mxCell id="2" value="A" style=&quot;blue;&quot; vertex="1" parent="1">${geometry}</mxCell>`,
        )
        expect(prepared.ok).toBe(true)
        if (!prepared.ok) return
        expect(prepared.xml).toContain(
            'style="fillColor=#dae8fc;strokeColor=#6c8ebf;whiteSpace=wrap;html=1;"',
        )
    })
})

describe("definitions and cells the model may write imperfectly", () => {
    it("escapes & and < in a definition, which the validator never sees", () => {
        const xml = `<mxStyle name="f" value="fontFamily=A&B <C;"/>${cell("2", "f;")}`
        const prepared = prepareNewDiagram(xml)
        expect(prepared.ok).toBe(true)
        if (!prepared.ok) return
        expect(prepared.xml).toContain(
            'style="fontFamily=A&amp;B &lt;C;whiteSpace=wrap;html=1;"',
        )
    })

    it("accepts a lowercase tag, a style attribute and a name ending in ;", () => {
        const { classes, xml } = readStyleClasses(
            `<mxstyle name="blue;" style="fillColor=red;"/>${cell("2", "blue;")}`,
        )
        expect(classes.get("blue")).toBe("fillColor=red")
        expect(xml).toBe(cell("2", "blue;"))
    })

    it("reads keys exactly, like draw.io, so a key after a space does not count", () => {
        const xml = cell("2", "rounded=1; html=1; whiteSpace=wrap;")
        expect(addDefaultStyles(xml)).toBe(
            cell(
                "2",
                "rounded=1; html=1; whiteSpace=wrap;whiteSpace=wrap;html=1;",
            ),
        )
        const classes = readStyleClasses(BLUE).classes
        expect(
            applyStyleClasses(
                cell("3", "rounded=1; blue; fontSize=14;"),
                classes,
            ),
        ).toBe(
            cell(
                "3",
                "rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf; fontSize=14;",
            ),
        )
    })

    it("treats a vertex whose parent is an edge as an edge label", () => {
        const xml = `${edge("e1", "")}<mxCell id="lbl" value="yes" style="align=center;" vertex="1" parent="e1"><mxGeometry relative="1" as="geometry"/></mxCell>`
        expect(addDefaultStyles(xml)).toContain('style="align=center;html=1;"')
    })

    it("reports a definition that never closed and definitions without cells", () => {
        const open = prepareNewDiagram(
            `${BLUE}<mxStyle name="flow" value="edgeSt`,
        )
        expect(open.ok).toBe(false)
        if (!open.ok) expect(open.error).toContain("not closed")
        const only = prepareNewDiagram(BLUE)
        expect(only.ok).toBe(false)
        if (!only.ok) expect(only.error).toContain("no cells")
    })
})

describe("edge labels and empty definitions", () => {
    it("does not wrap a label added to an edge the XML does not show", () => {
        const file =
            normalizeToMxfile(
                wrapCellsInModel(cell("2", "") + cell("3", "") + edge("4", "")),
                {
                    pageId: "p1",
                    pageName: "Page-1",
                },
            ) ?? ""
        const label = `<mxCell id="9" value="yes" style="text;" vertex="1" parent="4"><mxGeometry x="-0.5" relative="1" as="geometry"/></mxCell>`
        const outcome = editDiagram(
            file,
            [{ operation: "add", cell_id: "9", new_xml: label }],
            {},
        )
        expect(outcome.ok).toBe(true)
        if (!outcome.ok) return
        expect(outcome.xml).toContain('id="9" value="yes" style="text;html=1;"')
        // The same through the function the preview uses
        expect(addDefaultStyles(label, ["4"])).toContain('style="text;html=1;"')
    })

    it("treats a cell marked edge and vertex as an edge", () => {
        const both = `<mxCell id="5" style="rounded=1;" edge="1" vertex="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"/></mxCell>`
        expect(addDefaultStyles(both)).toContain('style="rounded=1;html=1;"')
    })

    it("drops a name whose definition is empty instead of leaving a leading ;", () => {
        const xml = `<mxStyle name="plain" value=""/>${cell("2", "plain;rounded=1;")}`
        expect(expandStyles(xml)).toBe(
            cell("2", "rounded=1;whiteSpace=wrap;html=1;"),
        )
    })

    it("tells the model that edit_diagram has no named styles", () => {
        const file =
            normalizeToMxfile(wrapCellsInModel(cell("2", "")), {
                pageId: "p1",
                pageName: "Page-1",
            }) ?? ""
        const outcome = editDiagram(
            file,
            [
                {
                    operation: "add",
                    cell_id: "3",
                    new_xml: `${BLUE}${cell("3", "blue;")}`,
                },
            ],
            {},
        )
        expect(outcome.ok).toBe(false)
        if (!outcome.ok)
            expect(outcome.errors[0]).toContain("not available in edit_diagram")
    })
})
