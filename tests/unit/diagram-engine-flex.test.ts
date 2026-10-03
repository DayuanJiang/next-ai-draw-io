import { describe, expect, it } from "vitest"
import { restructureDiagram } from "@/lib/diagram-engine"
import { autoBoxSize } from "@/lib/diagram-engine/layout"
import { parseDiagram } from "@/lib/diagram-engine/parse"

/**
 * The flex knobs: grow, align, pad — TeX's glue and CSS's align-items, as node fields.
 *
 * These are what make nested containers expressive enough for card-like content.
 * Graphviz (HTML-like table labels), D2 (grid containers) and TeX (box+glue) all
 * converged on the same primitives: nested boxes, proportional space distribution,
 * per-cell alignment. Without grow, two columns cannot split a page 2:1; without
 * stretch, a verdict bar cannot span its card; without pad, a tight card and a roomy
 * section cannot coexist on one page.
 */

const rectOf = (xml: string, id: string): { w: number; h: number } => {
    const m = xml.match(
        new RegExp(
            `id="${id}"[^>]*>\\s*<mxGeometry[^>]*width="([\\d.]+)" height="([\\d.]+)"`,
        ),
    )
    if (!m) throw new Error(`no geometry for ${id}`)
    return { w: Number(m[1]), h: Number(m[2]) }
}
const xyOf = (xml: string, id: string): { x: number; y: number } => {
    const m = xml.match(
        new RegExp(
            `id="${id}"[^>]*>\\s*<mxGeometry x="([\\d.-]+)" y="([\\d.-]+)"`,
        ),
    )
    if (!m) throw new Error(`no position for ${id}`)
    return { x: Number(m[1]), y: Number(m[2]) }
}

describe("grow", () => {
    it("splits a row's leftover space by weight", () => {
        // A wide banner forces the page wider than the two columns need; grow 2:1
        // must hand the columns that slack in proportion.
        const make = (withGrow: boolean) =>
            restructureDiagram("", [
                {
                    op: "add_container",
                    id: "page",
                    label: "",
                    dir: "col",
                    gap: 16,
                },
                {
                    op: "add_box",
                    id: "mast",
                    parent: "page",
                    label: "A very wide masthead banner that stretches the page out",
                    role: "banner",
                },
                {
                    op: "add_container",
                    id: "cols",
                    parent: "page",
                    label: "",
                    dir: "row",
                    gap: 16,
                },
                {
                    op: "add_container",
                    id: "main",
                    parent: "cols",
                    label: "",
                    dir: "col",
                    gap: 8,
                    ...(withGrow ? { grow: 2 } : {}),
                },
                {
                    op: "add_container",
                    id: "side",
                    parent: "cols",
                    label: "",
                    dir: "col",
                    gap: 8,
                    ...(withGrow ? { grow: 1 } : {}),
                },
                {
                    op: "add_box",
                    id: "a",
                    parent: "main",
                    label: "main content",
                },
                { op: "add_box", id: "b", parent: "side", label: "aside" },
            ]).xml as string

        const flat = make(false)
        const grown = make(true)

        // The weights make main wider than it would be on its own content...
        expect(rectOf(grown, "main").w).toBeGreaterThan(rectOf(flat, "main").w)

        // ...but NOT the full 2:1, and that is correct rather than a shortfall. `side`
        // will not shrink below the width of its own text, so the ratio settles wherever
        // that floor allows. A browser does exactly the same: `min-width` defaults to
        // `auto`, so a `flex: 2` column stops shrinking at its content too.
        const ratio = rectOf(grown, "main").w / rectOf(grown, "side").w
        expect(ratio).toBeGreaterThan(1.3)
        expect(ratio).toBeLessThan(2.1)
    })

    it("min-w-0 lets the weights win over the content width", () => {
        // The CSS escape hatch, same spelling: with min-w-0 the narrow column may be
        // squeezed under its own text, so a declared 2:1 really comes out 2:1.
        const r = restructureDiagram("", [
            { op: "add_container", id: "page", label: "", dir: "col", gap: 16 },
            {
                op: "add_box",
                id: "mast",
                parent: "page",
                label: "A very wide masthead banner that stretches the page out",
                role: "banner",
            },
            {
                op: "add_container",
                id: "cols",
                parent: "page",
                label: "",
                dir: "row",
                gap: 16,
            },
            {
                op: "add_container",
                id: "main",
                parent: "cols",
                label: "",
                dir: "col",
                class: "grow-2 min-w-0",
            },
            {
                op: "add_container",
                id: "side",
                parent: "cols",
                label: "",
                dir: "col",
                class: "grow-1 min-w-0",
            },
            { op: "add_box", id: "a", parent: "main", label: "main content" },
            { op: "add_box", id: "b", parent: "side", label: "aside" },
        ])
        expect(r.errors).toEqual([])
        const xml = r.xml as string
        const ratio = rectOf(xml, "main").w / rectOf(xml, "side").w
        expect(ratio).toBeCloseTo(2, 0)
    })
})

describe("align", () => {
    it("stretch spans the cross axis; start pins to the edge", () => {
        const r = restructureDiagram("", [
            { op: "add_container", id: "card", label: "", dir: "col", gap: 8 },
            {
                op: "add_box",
                id: "wide",
                parent: "card",
                label: "This is a long question line that sets the card width",
            },
            {
                op: "add_box",
                id: "bar",
                parent: "card",
                label: "A: 11",
                align: "stretch",
            },
            {
                op: "add_box",
                id: "verdict",
                parent: "card",
                label: "✗ Wrong",
                align: "start",
            },
        ])
        expect(r.errors).toEqual([])
        const xml = r.xml as string
        // The bar fills the card's interior width, like the wide line does.
        expect(rectOf(xml, "bar").w).toBe(rectOf(xml, "wide").w)
        // start pins to the interior's left edge — same x as the widest child.
        expect(xyOf(xml, "verdict").x).toBe(xyOf(xml, "wide").x)
    })
})

describe("pad", () => {
    it("a tight card is smaller than the default for the same content", () => {
        const make = (pad?: number) =>
            restructureDiagram("", [
                {
                    op: "add_container",
                    id: "c",
                    label: "",
                    dir: "col",
                    gap: 8,
                    ...(pad != null ? { pad } : {}),
                },
                { op: "add_box", id: "x", parent: "c", label: "content" },
            ]).xml as string
        const tight = rectOf(make(8), "c")
        const roomy = rectOf(make(), "c")
        expect(roomy.w - tight.w).toBe(32) // (24-8)*2
        expect(roomy.h - tight.h).toBe(32)
    })
})

describe("round trip", () => {
    it("grow, align and pad survive parse and re-render", () => {
        const r = restructureDiagram("", [
            {
                op: "add_container",
                id: "row",
                label: "",
                dir: "row",
                gap: 10,
                pad: 10,
            },
            {
                op: "add_container",
                id: "left",
                parent: "row",
                label: "",
                dir: "col",
                gap: 6,
                grow: 3,
            },
            {
                op: "add_box",
                id: "a",
                parent: "left",
                label: "hello",
                align: "stretch",
            },
            {
                op: "add_box",
                id: "b",
                parent: "row",
                label: "side",
                grow: 1,
                align: "end",
            },
        ])
        expect(r.errors).toEqual([])
        const back = parseDiagram(r.xml as string)
        const row = back.tree.roots.find((n) => n.id === "row")
        expect(row?.kind).toBe("group")
        if (row?.kind !== "group") return
        expect(row.pad).toBe(10)
        const left = row.children.find((n) => n.id === "left")
        expect(left?.kind === "group" && left.grow).toBe(3)
        const a = left?.kind === "group" && left.children[0]
        expect(a && a.kind === "box" && a.align).toBe("stretch")
        const b = row.children.find((n) => n.id === "b")
        expect(b?.kind === "box" && b.grow).toBe(1)
        expect(b?.kind === "box" && b.align).toBe("end")
    })
})

describe("rich text measurement", () => {
    it("does not count markup as text, and counts <br> as a line", () => {
        const plain = autoBoxSize("Often Wrong")
        const rich = autoBoxSize(
            '<font color="#B85450"><b>Often Wrong</b></font>',
        )
        expect(rich.w).toBe(plain.w)
        expect(rich.h).toBe(plain.h)
        const twoLines = autoBoxSize("first line<br>second line")
        const oneLine = autoBoxSize("first line")
        expect(twoLines.h).toBeGreaterThan(oneLine.h)
    })
})
