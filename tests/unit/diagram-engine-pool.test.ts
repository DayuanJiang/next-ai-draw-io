import { describe, expect, it } from "vitest"
import { type Operation, restructureDiagram } from "@/lib/diagram-engine"
import { parseDiagram } from "@/lib/diagram-engine/parse"
import type { PoolNode } from "@/lib/diagram-engine/types"
import { findNode } from "@/lib/diagram-engine/types"
import {
    absoluteRects,
    escapesParent,
    outsidePage,
    overlaps,
    parentOf,
    rectOf,
} from "./fixtures/geometry"

/** An expense-approval swimlane: three roles, five steps, three milestone labels. */
const EXPENSE: Operation[] = [
    { op: "set_title", title: "Expense Approval" },
    {
        op: "add_pool",
        id: "p",
        label: "Expense claim",
        lanes: ["Employee", "Manager", "Finance"],
        phases: ["Submit", "Review", "Pay"],
    },
    {
        op: "add_box",
        id: "fill",
        parent: "p",
        label: "Fill form",
        lane: 0,
        col: 0,
        shape: "terminator",
    },
    {
        op: "add_box",
        id: "send",
        parent: "p",
        label: "Submit claim",
        lane: 0,
        col: 1,
    },
    { op: "add_box", id: "rev", parent: "p", label: "Review", lane: 1, col: 2 },
    {
        op: "add_box",
        id: "ok",
        parent: "p",
        label: "Approved?",
        lane: 1,
        col: 3,
        shape: "decision",
    },
    {
        op: "add_box",
        id: "pay",
        parent: "p",
        label: "Pay out",
        lane: 2,
        col: 4,
    },
    { op: "link", source: "fill", target: "send" },
    { op: "link", source: "send", target: "rev" },
    { op: "link", source: "rev", target: "ok" },
    { op: "link", source: "ok", target: "pay", label: "yes" },
]

const STEPS = ["fill", "send", "rev", "ok", "pay"]

describe("swimlane pool: layout", () => {
    const result = restructureDiagram("", EXPENSE)
    const xml = result.xml as string
    const rects = absoluteRects(xml)

    it("builds without errors", () => {
        expect(result.errors).toEqual([])
    })

    it("stacks the lanes in the order they were declared", () => {
        expect(rectOf(rects, "fill").y).toBeLessThan(rectOf(rects, "rev").y)
        expect(rectOf(rects, "rev").y).toBeLessThan(rectOf(rects, "pay").y)
    })

    it("advances the columns left to right", () => {
        expect(rectOf(rects, "fill").x).toBeLessThan(rectOf(rects, "send").x)
        expect(rectOf(rects, "send").x).toBeLessThan(rectOf(rects, "rev").x)
        expect(rectOf(rects, "rev").x).toBeLessThan(rectOf(rects, "ok").x)
    })

    it("puts two steps with the same column at the same x", () => {
        const r = restructureDiagram("", [
            { op: "add_pool", id: "p", label: "", lanes: ["A", "B"] },
            {
                op: "add_box",
                id: "x",
                parent: "p",
                label: "X",
                lane: 0,
                col: 1,
            },
            {
                op: "add_box",
                id: "y",
                parent: "p",
                label: "Y",
                lane: 1,
                col: 1,
            },
        ])
        const rr = absoluteRects(r.xml as string)
        expect(rectOf(rr, "x").x).toBe(rectOf(rr, "y").x)
        expect(rectOf(rr, "x").y).not.toBe(rectOf(rr, "y").y)
    })

    it("draws one band per lane, with the role names beside them", () => {
        expect([...xml.matchAll(/id="p__band(\d)"/g)].map((m) => m[1])).toEqual(
            ["0", "1", "2"],
        )
        expect(
            [...xml.matchAll(/id="p__lane\d" value="([^"]*)"/g)].map(
                (m) => m[1],
            ),
        ).toEqual(["Employee", "Manager", "Finance"])
    })

    it("draws the milestone labels", () => {
        expect(
            [...xml.matchAll(/id="p__phase\d" value="([^"]*)"/g)].map(
                (m) => m[1],
            ),
        ).toEqual(["Submit", "Review", "Pay"])
    })

    it("omits the milestone band when no phases were given", () => {
        const r = restructureDiagram("", [
            { op: "add_pool", id: "p", label: "", lanes: ["A"] },
            {
                op: "add_box",
                id: "x",
                parent: "p",
                label: "X",
                lane: 0,
                col: 0,
            },
        ])
        expect(r.xml).not.toContain("p__phase")
    })

    it("parents each step to its lane band, not to the pool", () => {
        // This is what records a role change when the user drags a step to another lane:
        // draw.io rewrites `parent` to the band it was dropped on.
        expect(parentOf(xml, "fill")).toBe("p__band0")
        expect(parentOf(xml, "rev")).toBe("p__band1")
        expect(parentOf(xml, "pay")).toBe("p__band2")
    })

    it("keeps everything inside the page and inside its parent", () => {
        expect(outsidePage(xml, ["__title"])).toEqual([])
        expect(escapesParent(xml)).toEqual([])
        expect(overlaps(rects, STEPS)).toEqual([])
    })

    it("clamps a lane index past the last lane instead of drawing off the pool", () => {
        const r = restructureDiagram("", [
            { op: "add_pool", id: "p", label: "", lanes: ["only"] },
            {
                op: "add_box",
                id: "x",
                parent: "p",
                label: "X",
                lane: 9,
                col: 0,
            },
        ])
        expect(r.errors).toEqual([])
        expect(escapesParent(r.xml as string)).toEqual([])
    })

    it("lays a vertical pool out with the lanes as columns", () => {
        const r = restructureDiagram("", [
            {
                op: "add_pool",
                id: "p",
                label: "",
                lanes: ["A", "B"],
                orientation: "vertical",
            },
            {
                op: "add_box",
                id: "x",
                parent: "p",
                label: "X",
                lane: 0,
                col: 0,
            },
            {
                op: "add_box",
                id: "y",
                parent: "p",
                label: "Y",
                lane: 1,
                col: 0,
            },
            {
                op: "add_box",
                id: "z",
                parent: "p",
                label: "Z",
                lane: 0,
                col: 1,
            },
        ])
        expect(r.errors).toEqual([])
        const rr = absoluteRects(r.xml as string)
        // Lanes side by side, the flow running downwards.
        expect(rectOf(rr, "x").x).toBeLessThan(rectOf(rr, "y").x)
        expect(rectOf(rr, "x").y).toBeLessThan(rectOf(rr, "z").y)
        expect(escapesParent(r.xml as string)).toEqual([])
    })

    it("keeps the milestone strip inside a VERTICAL pool", () => {
        // The measure pass reserves the pool's width as padding + content + strip, with no
        // gap between content and strip. Rendering the strip one gap further out put it
        // outside the frame — and no earlier test caught it, because every vertical case
        // omitted phases and every phases case was horizontal.
        const r = restructureDiagram("", [
            {
                op: "add_pool",
                id: "p",
                label: "V",
                lanes: ["A", "B"],
                phases: ["P1", "P2"],
                orientation: "vertical",
            },
            {
                op: "add_box",
                id: "x",
                parent: "p",
                label: "X",
                lane: 0,
                col: 0,
            },
            {
                op: "add_box",
                id: "y",
                parent: "p",
                label: "Y",
                lane: 1,
                col: 0,
            },
            {
                op: "add_box",
                id: "z",
                parent: "p",
                label: "Z",
                lane: 0,
                col: 1,
            },
        ])
        expect(r.errors).toEqual([])
        expect(escapesParent(r.xml as string)).toEqual([])
        expect(outsidePage(r.xml as string, ["__title"])).toEqual([])
    })

    it("keeps the milestone strip inside a HORIZONTAL pool", () => {
        const r = restructureDiagram("", [
            {
                op: "add_pool",
                id: "p",
                label: "H",
                lanes: ["A", "B"],
                phases: ["P1", "P2", "P3"],
            },
            {
                op: "add_box",
                id: "x",
                parent: "p",
                label: "X",
                lane: 0,
                col: 0,
            },
            {
                op: "add_box",
                id: "y",
                parent: "p",
                label: "Y",
                lane: 1,
                col: 1,
            },
            {
                op: "add_box",
                id: "z",
                parent: "p",
                label: "Z",
                lane: 0,
                col: 2,
            },
        ])
        expect(r.errors).toEqual([])
        expect(escapesParent(r.xml as string)).toEqual([])
        expect(outsidePage(r.xml as string, ["__title"])).toEqual([])
    })

    it("refuses a pool with no lanes", () => {
        const r = restructureDiagram("", [
            { op: "add_pool", id: "p", label: "x", lanes: [] },
        ])
        expect(r.xml).toBeNull()
        expect(r.errors[0]).toContain("at least one lane")
    })
})

describe("swimlane pool: round-trip", () => {
    it("comes back with the same lanes, phases and cells", () => {
        const first = restructureDiagram("", EXPENSE)
        const { tree, warnings } = parseDiagram(first.xml as string)
        expect(warnings).toEqual([])
        const pool = findNode(tree, "p") as PoolNode
        expect(pool.kind).toBe("pool")
        expect(pool.lanes).toEqual(["Employee", "Manager", "Finance"])
        expect(pool.phases).toEqual(["Submit", "Review", "Pay"])
        expect(pool.orientation).toBe("horizontal")
        expect(pool.children.map((c) => c.id)).toEqual(STEPS)
    })

    it("does not move anything on a re-layout", () => {
        const first = restructureDiagram("", EXPENSE)
        const second = restructureDiagram(first.xml as string, [])
        expect(second.errors).toEqual([])
        expect(second.warnings).toEqual([])
        const a = absoluteRects(first.xml as string)
        const b = absoluteRects(second.xml as string)
        for (const id of STEPS) expect(b.get(id)).toEqual(a.get(id))
    })

    it("does not accumulate lane bands across round-trips", () => {
        // The bands are chrome the renderer rebuilds. Preserving them verbatim would leave a
        // stale set behind the new ones on every pass.
        const first = restructureDiagram("", EXPENSE)
        const second = restructureDiagram(first.xml as string, [])
        const third = restructureDiagram(second.xml as string, [])
        const count = (xml: string) => (xml.match(/__band\d/g) ?? []).length
        expect(count(third.xml as string)).toBe(count(first.xml as string))
    })

    it("reads a step's new lane from the band the user dropped it on", () => {
        const first = restructureDiagram("", EXPENSE)
        // Simulate the drag: draw.io rewrites the cell's parent to the new band.
        const moved = (first.xml as string).replace(
            /(<mxCell id="pay"[^>]*parent=")p__band2(")/,
            "$1p__band0$2",
        )
        expect(moved).not.toBe(first.xml)
        const pool = findNode(parseDiagram(moved).tree, "p") as PoolNode
        const pay = pool.children.find((c) => c.id === "pay")
        expect(pay).toBeDefined()
        // The band wins over the stale marker still on the cell.
        expect((pay as { cell?: { lane: number } }).cell?.lane).toBe(0)
    })

    it("keeps a vertical pool vertical", () => {
        const first = restructureDiagram("", [
            {
                op: "add_pool",
                id: "p",
                label: "V",
                lanes: ["A", "B"],
                orientation: "vertical",
            },
            {
                op: "add_box",
                id: "x",
                parent: "p",
                label: "X",
                lane: 1,
                col: 0,
            },
        ])
        const pool = findNode(
            parseDiagram(first.xml as string).tree,
            "p",
        ) as PoolNode
        expect(pool.orientation).toBe("vertical")
        expect(pool.lanes).toEqual(["A", "B"])
    })

    it("survives a lane name containing a semicolon or an equals sign", () => {
        // Those two characters delimit a draw.io style string, so a naive marker would break
        // the whole cell.
        const first = restructureDiagram("", [
            {
                op: "add_pool",
                id: "p",
                label: "",
                lanes: ["a;b", "c=d", "plain"],
            },
            {
                op: "add_box",
                id: "x",
                parent: "p",
                label: "X",
                lane: 0,
                col: 0,
            },
        ])
        expect(first.errors).toEqual([])
        const pool = findNode(
            parseDiagram(first.xml as string).tree,
            "p",
        ) as PoolNode
        expect(pool.lanes).toEqual(["a;b", "c=d", "plain"])
    })
})
