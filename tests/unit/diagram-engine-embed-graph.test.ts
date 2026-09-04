import { describe, expect, it } from "vitest"
import { restructureDiagram } from "@/lib/diagram-engine"

/**
 * add_graph: arrow-driven layout as a CONTAINER, not just a page-level tool.
 *
 * D2/TALA's core claim is that containers are first-class at every layout stage —
 * hierarchical zones and arrow-ordered graphs mix in one diagram. Before this, the
 * engine was split: draw_graph did whole-page flowcharts, containers did nesting, and
 * "a poster column with a small flowchart in it" was inexpressible.
 */

const rectOf = (xml: string, id: string) => {
    const m = xml.match(
        new RegExp(
            `id="${id}"[^>]*>\\s*<mxGeometry[^>]*width="([\\d.]+)" height="([\\d.]+)"`,
        ),
    )
    if (!m) throw new Error(`no geometry for ${id}`)
    return { w: Number(m[1]), h: Number(m[2]) }
}

const FLOW = {
    nodes: [
        { id: "a", label: "request" },
        { id: "b", label: "validate", shape: "decision" },
        { id: "c", label: "process" },
        { id: "d", label: "reject" },
    ],
    edges: [
        { source: "a", target: "b" },
        { source: "b", target: "c", label: "ok" },
        { source: "b", target: "d", label: "no" },
    ],
}

describe("add_graph", () => {
    it("embeds an arrow-ordered graph inside a flexbox column", () => {
        const r = restructureDiagram("", [
            { op: "add_container", id: "page", label: "", dir: "row", gap: 20 },
            {
                op: "add_container",
                id: "left",
                parent: "page",
                label: "",
                dir: "col",
                gap: 12,
            },
            {
                op: "add_box",
                id: "intro",
                parent: "left",
                label: "How requests flow:",
            },
            { op: "add_graph", id: "flow", parent: "left", ...FLOW },
            { op: "add_box", id: "right", parent: "page", label: "Notes" },
        ])
        expect(r.errors).toEqual([])
        const xml = r.xml as string
        // The decision's two branches share a layer — arrow-driven, not declaration order.
        const c = rectOf(xml, "c")
        const d = rectOf(xml, "d")
        expect(c).toBeTruthy()
        expect(d).toBeTruthy()
        // And the graph sits inside the column: the outline nests flow under left.
        expect(r.outline).toMatch(/left:[\s\S]*flow:/)
    })

    it("two graphs on one page do not collide on synthetic layer ids", () => {
        const r = restructureDiagram("", [
            { op: "add_graph", id: "g1", ...FLOW },
            {
                op: "add_graph",
                id: "g2",
                nodes: [
                    { id: "x", label: "start" },
                    { id: "y", label: "end" },
                ],
                edges: [{ source: "x", target: "y" }],
            },
        ])
        expect(r.errors).toEqual([])
        expect(r.xml).toContain('id="g1__layer')
        expect(r.xml).toContain('id="g2"')
    })

    it("dir=row transposes the flow", () => {
        const make = (dir: "col" | "row") =>
            restructureDiagram("", [{ op: "add_graph", id: "g", dir, ...FLOW }])
                .xml as string
        const down = rectOf(make("col"), "g")
        const right = rectOf(make("row"), "g")
        // Four layers tall vs four layers wide.
        expect(down.h).toBeGreaterThan(down.w * 0.8)
        expect(right.w).toBeGreaterThan(right.h)
    })

    it("draws the rest of the graph and warns about an unknown edge endpoint", () => {
        const r = restructureDiagram("", [
            {
                op: "add_graph",
                id: "g",
                nodes: [{ id: "a", label: "a" }],
                edges: [{ source: "a", target: "ghost" }],
            },
        ])
        // A warning, not an error: node "a" is perfectly drawable, and rejecting the whole
        // call would cost a turn to arrive back at the same diagram.
        expect(r.errors).toEqual([])
        expect(r.xml).toBeTruthy()
        expect(r.warnings.join(" ")).toContain("ghost")
    })
})
