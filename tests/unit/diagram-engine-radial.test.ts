import { describe, expect, it } from "vitest"
import { type Operation, restructureDiagram } from "@/lib/diagram-engine"
import { parseDiagram } from "@/lib/diagram-engine/parse"
import type { RadialNode } from "@/lib/diagram-engine/types"
import { findNode } from "@/lib/diagram-engine/types"
import {
    absoluteRects,
    escapesParent,
    outsidePage,
    overlaps,
    rectOf,
} from "./fixtures/geometry"

/** A mind map. Children are a FLAT list; the links carry the hierarchy. */
const MINDMAP: Operation[] = [
    { op: "add_radial", id: "m", label: "", spread: "radial" },
    { op: "add_box", id: "root", parent: "m", label: "Product Launch" },
    { op: "add_box", id: "eng", parent: "m", label: "Engineering" },
    { op: "add_box", id: "api", parent: "m", label: "API" },
    { op: "add_box", id: "ui", parent: "m", label: "UI" },
    { op: "add_box", id: "mkt", parent: "m", label: "Marketing" },
    { op: "add_box", id: "legal", parent: "m", label: "Legal" },
    { op: "add_box", id: "ops", parent: "m", label: "Ops" },
    { op: "add_box", id: "sre", parent: "m", label: "SRE" },
    { op: "link", source: "root", target: "eng" },
    { op: "link", source: "root", target: "mkt" },
    { op: "link", source: "root", target: "legal" },
    { op: "link", source: "root", target: "ops" },
    { op: "link", source: "eng", target: "api" },
    { op: "link", source: "eng", target: "ui" },
    { op: "link", source: "ops", target: "sre" },
]

const MIND_IDS = ["root", "eng", "api", "ui", "mkt", "legal", "ops", "sre"]

const ORGCHART: Operation[] = [
    { op: "add_radial", id: "o", label: "", spread: "down" },
    { op: "add_box", id: "ceo", parent: "o", label: "CEO" },
    { op: "add_box", id: "cto", parent: "o", label: "CTO" },
    { op: "add_box", id: "eng1", parent: "o", label: "Platform Lead" },
    { op: "add_box", id: "eng2", parent: "o", label: "Mobile Lead" },
    { op: "add_box", id: "cfo", parent: "o", label: "CFO" },
    { op: "add_box", id: "acct", parent: "o", label: "Accounting" },
    { op: "link", source: "ceo", target: "cto" },
    { op: "link", source: "ceo", target: "cfo" },
    { op: "link", source: "cto", target: "eng1" },
    { op: "link", source: "cto", target: "eng2" },
    { op: "link", source: "cfo", target: "acct" },
]

const ORG_IDS = ["ceo", "cto", "eng1", "eng2", "cfo", "acct"]

describe("mind map: radial spread", () => {
    const result = restructureDiagram("", MINDMAP)
    const xml = result.xml as string
    const rects = absoluteRects(xml)

    it("builds without errors", () => {
        expect(result.errors).toEqual([])
    })

    it("makes the node nothing points at the centre", () => {
        const centre = rectOf(rects, "root")
        const mid = centre.x + centre.w / 2
        const sides = ["eng", "mkt", "legal", "ops"].map((id) =>
            rectOf(rects, id).x > mid ? "right" : "left",
        )
        // Branches on both sides, which is what keeps a mind map compact.
        expect(sides).toContain("right")
        expect(sides).toContain("left")
    })

    it("puts a sub-branch further from the centre than its parent", () => {
        const centre = rectOf(rects, "root")
        const mid = centre.x + centre.w / 2
        const far = (id: string) =>
            Math.abs(rectOf(rects, id).x + rectOf(rects, id).w / 2 - mid)
        expect(far("api")).toBeGreaterThan(far("eng"))
        expect(far("ui")).toBeGreaterThan(far("eng"))
        expect(far("sre")).toBeGreaterThan(far("ops"))
    })

    it("puts siblings of the same generation at the same distance out", () => {
        expect(rectOf(rects, "api").x).toBe(rectOf(rects, "ui").x)
    })

    it("draws nothing on top of anything else", () => {
        expect(overlaps(rects, MIND_IDS)).toEqual([])
    })

    it("keeps everything inside the page and inside the frame", () => {
        expect(outsidePage(xml, ["__title"])).toEqual([])
        expect(escapesParent(xml)).toEqual([])
    })

    it("fits a map whose two sides are different depths", () => {
        // Reserving the same room on both sides would push the deeper side off the page.
        const r = restructureDiagram("", [
            { op: "add_radial", id: "m", label: "", spread: "radial" },
            { op: "add_box", id: "root", parent: "m", label: "Root" },
            { op: "add_box", id: "shallow", parent: "m", label: "A" },
            { op: "add_box", id: "b", parent: "m", label: "B" },
            { op: "add_box", id: "b1", parent: "m", label: "B1" },
            { op: "add_box", id: "b2", parent: "m", label: "B2" },
            { op: "add_box", id: "b3", parent: "m", label: "B3" },
            { op: "link", source: "root", target: "shallow" },
            { op: "link", source: "root", target: "b" },
            { op: "link", source: "b", target: "b1" },
            { op: "link", source: "b1", target: "b2" },
            { op: "link", source: "b2", target: "b3" },
        ])
        expect(r.errors).toEqual([])
        expect(outsidePage(r.xml as string, ["__title"])).toEqual([])
        expect(escapesParent(r.xml as string)).toEqual([])
    })

    it("still draws a node no arrow reaches", () => {
        const r = restructureDiagram("", [
            { op: "add_radial", id: "m", label: "", spread: "radial" },
            { op: "add_box", id: "root", parent: "m", label: "Root" },
            { op: "add_box", id: "a", parent: "m", label: "A" },
            { op: "add_box", id: "orphan", parent: "m", label: "Orphan" },
            { op: "link", source: "root", target: "a" },
        ])
        expect(r.errors).toEqual([])
        const rr = absoluteRects(r.xml as string)
        expect(rr.has("orphan")).toBe(true)
        expect(overlaps(rr, ["root", "a", "orphan"])).toEqual([])
        expect(escapesParent(r.xml as string)).toEqual([])
    })

    it("survives arrows that form a cycle", () => {
        const r = restructureDiagram("", [
            { op: "add_radial", id: "m", label: "", spread: "radial" },
            { op: "add_box", id: "x", parent: "m", label: "X" },
            { op: "add_box", id: "y", parent: "m", label: "Y" },
            { op: "add_box", id: "z", parent: "m", label: "Z" },
            { op: "link", source: "x", target: "y" },
            { op: "link", source: "y", target: "z" },
            { op: "link", source: "z", target: "x" },
        ])
        expect(r.errors).toEqual([])
        expect(
            overlaps(absoluteRects(r.xml as string), ["x", "y", "z"]),
        ).toEqual([])
        expect(escapesParent(r.xml as string)).toEqual([])
    })

    it("handles a radial container holding one node", () => {
        const r = restructureDiagram("", [
            { op: "add_radial", id: "m", label: "", spread: "radial" },
            { op: "add_box", id: "only", parent: "m", label: "Only" },
        ])
        expect(r.errors).toEqual([])
        expect(escapesParent(r.xml as string)).toEqual([])
    })

    it("handles an empty radial container", () => {
        const r = restructureDiagram("", [
            { op: "add_radial", id: "m", label: "", spread: "radial" },
        ])
        expect(r.errors).toEqual([])
        expect(r.xml).toContain('id="m"')
    })
})

describe("org chart: downward spread", () => {
    const result = restructureDiagram("", ORGCHART)
    const xml = result.xml as string
    const rects = absoluteRects(xml)

    it("builds without errors", () => {
        expect(result.errors).toEqual([])
    })

    it("hangs every level strictly below the one above", () => {
        // A reporting line only reads correctly downwards, which is the whole reason this
        // spread exists separately from the radial one.
        expect(rectOf(rects, "ceo").y).toBeLessThan(rectOf(rects, "cto").y)
        expect(rectOf(rects, "cto").y).toBeLessThan(rectOf(rects, "eng1").y)
        expect(rectOf(rects, "cfo").y).toBeLessThan(rectOf(rects, "acct").y)
    })

    it("puts peers on the same line", () => {
        expect(rectOf(rects, "cto").y).toBe(rectOf(rects, "cfo").y)
        expect(rectOf(rects, "eng1").y).toBe(rectOf(rects, "eng2").y)
        expect(rectOf(rects, "eng1").y).toBe(rectOf(rects, "acct").y)
    })

    it("keeps one manager's reports clear of another's", () => {
        // Sizing each slice by its whole subtree, not by the number of direct reports, is what
        // stops a manager with two reports from overrunning the next manager's column.
        expect(overlaps(rects, ORG_IDS)).toEqual([])
        const eng2 = rectOf(rects, "eng2")
        expect(eng2.x + eng2.w).toBeLessThanOrEqual(rectOf(rects, "acct").x)
    })

    it("keeps everything inside the page and inside the frame", () => {
        expect(outsidePage(xml, ["__title"])).toEqual([])
        expect(escapesParent(xml)).toEqual([])
    })

    it("fits a chain five levels deep", () => {
        const r = restructureDiagram("", [
            { op: "add_radial", id: "o", label: "", spread: "down" },
            ...["a", "b", "c", "d", "e"].map(
                (id) =>
                    ({
                        op: "add_box",
                        id,
                        parent: "o",
                        label: id.toUpperCase(),
                    }) as Operation,
            ),
            { op: "link", source: "a", target: "b" },
            { op: "link", source: "b", target: "c" },
            { op: "link", source: "c", target: "d" },
            { op: "link", source: "d", target: "e" },
        ])
        expect(r.errors).toEqual([])
        const rr = absoluteRects(r.xml as string)
        const ys = ["a", "b", "c", "d", "e"].map((id) => rectOf(rr, id).y)
        expect(ys).toEqual([...ys].sort((x, y) => x - y))
        expect(outsidePage(r.xml as string, ["__title"])).toEqual([])
    })
})

describe("radial: round-trip", () => {
    it("comes back as a radial container with the same spread", () => {
        const first = restructureDiagram("", MINDMAP)
        const { tree, warnings } = parseDiagram(first.xml as string)
        expect(warnings).toEqual([])
        const radial = findNode(tree, "m") as RadialNode
        expect(radial.kind).toBe("radial")
        expect(radial.spread).toBe("radial")
        expect(radial.children.map((c) => c.id).sort()).toEqual(
            [...MIND_IDS].sort(),
        )
    })

    it("keeps an org chart pointing downwards", () => {
        const first = restructureDiagram("", ORGCHART)
        const radial = findNode(
            parseDiagram(first.xml as string).tree,
            "o",
        ) as RadialNode
        expect(radial.spread).toBe("down")
    })

    it("reaches a fixed point: a mind map does not drift on re-layout", () => {
        const first = restructureDiagram("", MINDMAP)
        const second = restructureDiagram(first.xml as string, [])
        const third = restructureDiagram(second.xml as string, [])
        expect(second.errors).toEqual([])
        expect(second.warnings).toEqual([])
        const a = absoluteRects(first.xml as string)
        const b = absoluteRects(second.xml as string)
        const c = absoluteRects(third.xml as string)
        for (const id of MIND_IDS) {
            expect(b.get(id)).toEqual(a.get(id))
            expect(c.get(id)).toEqual(a.get(id))
        }
    })

    it("reaches a fixed point: an org chart does not drift on re-layout", () => {
        const first = restructureDiagram("", ORGCHART)
        const second = restructureDiagram(first.xml as string, [])
        const third = restructureDiagram(second.xml as string, [])
        const a = absoluteRects(first.xml as string)
        const c = absoluteRects(third.xml as string)
        for (const id of ORG_IDS) expect(c.get(id)).toEqual(a.get(id))
    })

    it("adds a branch to an existing map without redrawing it", () => {
        const first = restructureDiagram("", MINDMAP)
        const second = restructureDiagram(first.xml as string, [
            { op: "add_box", id: "docs", parent: "m", label: "Docs" },
            { op: "link", source: "root", target: "docs" },
        ])
        expect(second.errors).toEqual([])
        const rects = absoluteRects(second.xml as string)
        expect(rects.has("docs")).toBe(true)
        expect(overlaps(rects, [...MIND_IDS, "docs"])).toEqual([])
        expect(escapesParent(second.xml as string)).toEqual([])
    })
})
