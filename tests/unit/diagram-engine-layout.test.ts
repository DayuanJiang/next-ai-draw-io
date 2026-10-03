import { describe, expect, it } from "vitest"
import {
    autoBoxSize,
    flatten,
    layoutForest,
    type Placed,
} from "@/lib/diagram-engine/layout"
import type {
    BoxNode,
    DiagramNode,
    GridNode,
    GroupNode,
    IconNode,
    Rect,
} from "@/lib/diagram-engine/types"

const icon = (id: string, label = "", size?: number): IconNode => ({
    kind: "icon",
    id,
    name: "ec2",
    label,
    size,
})
const box = (id: string, label = "", w?: number, h?: number): BoxNode => ({
    kind: "box",
    id,
    label,
    w,
    h,
})
const group = (
    id: string,
    dir: "row" | "col",
    children: DiagramNode[],
    label = "",
    gap = 20,
): GroupNode => ({ kind: "group", id, gname: null, label, dir, gap, children })
const grid = (
    id: string,
    cols: number,
    children: DiagramNode[],
    label = "",
    gap = 20,
): GridNode => ({ kind: "grid", id, gname: null, label, cols, gap, children })

/** Look a rect up by node id in a placed forest. */
function rects(roots: Placed[]): Map<string, Rect> {
    const m = new Map<string, Rect>()
    for (const f of flatten(roots)) m.set(f.node.id, f.rect)
    return m
}
const contains = (outer: Rect, inner: Rect) =>
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
const overlaps = (a: Rect, b: Rect) =>
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0

describe("autoBoxSize", () => {
    it("widens with the label but stops at a maximum", () => {
        expect(autoBoxSize("hi").w).toBe(120) // floor
        expect(autoBoxSize("x".repeat(200)).w).toBe(260) // ceiling
        expect(autoBoxSize("a medium length label").w).toBeGreaterThan(120)
    })

    it("grows taller with each line", () => {
        expect(autoBoxSize("one\ntwo\nthree").h).toBeGreaterThan(
            autoBoxSize("one").h,
        )
    })

    it("never returns a degenerate size for an empty label", () => {
        const s = autoBoxSize("")
        expect(s.w).toBeGreaterThan(0)
        expect(s.h).toBeGreaterThan(0)
    })
})

describe("containers always fit their children", () => {
    it("holds a row of icons", () => {
        const tree = group(
            "f",
            "row",
            [icon("a"), icon("b"), icon("c")],
            "Frame",
        )
        const r = rects(layoutForest([tree]).roots)
        const frame = r.get("f") as Rect
        for (const id of ["a", "b", "c"])
            expect(contains(frame, r.get(id) as Rect)).toBe(true)
    })

    it("holds a column of icons", () => {
        const tree = group("f", "col", [icon("a"), icon("b")], "Frame")
        const r = rects(layoutForest([tree]).roots)
        for (const id of ["a", "b"])
            expect(contains(r.get("f") as Rect, r.get(id) as Rect)).toBe(true)
    })

    it("holds a grid", () => {
        const tree = grid(
            "g",
            3,
            [icon("a"), icon("b"), icon("c"), icon("d")],
            "G",
        )
        const r = rects(layoutForest([tree]).roots)
        for (const id of ["a", "b", "c", "d"])
            expect(contains(r.get("g") as Rect, r.get(id) as Rect)).toBe(true)
    })

    it("holds a deeply nested structure at every level", () => {
        // Region → VPC → AZ → Subnet → icon, the shape of a real cloud diagram
        const tree = group(
            "region",
            "row",
            [
                group(
                    "vpc",
                    "col",
                    [
                        group(
                            "az",
                            "col",
                            [group("subnet", "col", [icon("ec2")], "Subnet")],
                            "AZ",
                        ),
                    ],
                    "VPC",
                ),
            ],
            "Region",
        )
        const r = rects(layoutForest([tree]).roots)
        const chain = ["region", "vpc", "az", "subnet", "ec2"]
        for (let i = 1; i < chain.length; i++)
            expect(
                contains(r.get(chain[i - 1]) as Rect, r.get(chain[i]) as Rect),
            ).toBe(true)
    })

    it("holds a child whose label is far wider than the frame's own", () => {
        const tree = group(
            "f",
            "col",
            [box("wide", "a considerably longer label than the frame title")],
            "F",
        )
        const r = rects(layoutForest([tree]).roots)
        expect(contains(r.get("f") as Rect, r.get("wide") as Rect)).toBe(true)
    })
})

describe("siblings never overlap", () => {
    it("keeps a row of icons apart", () => {
        const tree = group("f", "row", [icon("a"), icon("b"), icon("c")])
        const r = rects(layoutForest([tree]).roots)
        expect(overlaps(r.get("a") as Rect, r.get("b") as Rect)).toBe(false)
        expect(overlaps(r.get("b") as Rect, r.get("c") as Rect)).toBe(false)
    })

    it("keeps a column of frames apart", () => {
        const tree = group("f", "col", [
            group("s1", "row", [icon("a")], "Public"),
            group("s2", "row", [icon("b")], "Private"),
            group("s3", "row", [icon("c")], "Data"),
        ])
        const r = rects(layoutForest([tree]).roots)
        expect(overlaps(r.get("s1") as Rect, r.get("s2") as Rect)).toBe(false)
        expect(overlaps(r.get("s2") as Rect, r.get("s3") as Rect)).toBe(false)
    })

    it("keeps grid cells apart", () => {
        const tree = grid("g", 2, [icon("a"), icon("b"), icon("c"), icon("d")])
        const r = rects(layoutForest([tree]).roots)
        const ids = ["a", "b", "c", "d"]
        for (let i = 0; i < ids.length; i++)
            for (let j = i + 1; j < ids.length; j++)
                expect(
                    overlaps(r.get(ids[i]) as Rect, r.get(ids[j]) as Rect),
                ).toBe(false)
    })

    it("keeps separate roots apart", () => {
        const r = rects(
            layoutForest([
                box("users", "Users"),
                group("region", "row", [icon("a")]),
            ]).roots,
        )
        expect(overlaps(r.get("users") as Rect, r.get("region") as Rect)).toBe(
            false,
        )
    })

    it("keeps 30 siblings apart — no accumulation error", () => {
        const kids = Array.from({ length: 30 }, (_, i) =>
            icon(`i${i}`, `n${i}`),
        )
        const r = rects(layoutForest([group("f", "row", kids)]).roots)
        for (let i = 1; i < 30; i++) {
            const prev = r.get(`i${i - 1}`) as Rect
            const cur = r.get(`i${i}`) as Rect
            expect(cur.x).toBeGreaterThanOrEqual(prev.x + prev.w)
        }
    })
})

describe("direction", () => {
    it("advances along x in a row and keeps y aligned", () => {
        const r = rects(
            layoutForest([group("f", "row", [icon("a"), icon("b")])]).roots,
        )
        const a = r.get("a") as Rect
        const b = r.get("b") as Rect
        expect(b.x).toBeGreaterThan(a.x)
        expect(b.y).toBe(a.y)
    })

    it("advances along y in a column and keeps x aligned", () => {
        const r = rects(
            layoutForest([group("f", "col", [icon("a"), icon("b")])]).roots,
        )
        const a = r.get("a") as Rect
        const b = r.get("b") as Rect
        expect(b.y).toBeGreaterThan(a.y)
        expect(b.x).toBe(a.x)
    })

    it("wraps a grid at the column count", () => {
        const r = rects(
            layoutForest([
                grid("g", 2, [icon("a"), icon("b"), icon("c"), icon("d")]),
            ]).roots,
        )
        const a = r.get("a") as Rect
        const b = r.get("b") as Rect
        const c = r.get("c") as Rect
        expect(b.y).toBe(a.y) // same row
        expect(c.y).toBeGreaterThan(a.y) // wrapped
        expect(c.x).toBe(a.x) // back to the first column
    })
})

describe("sibling equalisation", () => {
    it("gives frames in a row a shared height", () => {
        const tree = group("f", "row", [
            group("tall", "col", [icon("a"), icon("b"), icon("c")], "Tall"),
            group("short", "col", [icon("d")], "Short"),
        ])
        const r = rects(layoutForest([tree]).roots)
        expect((r.get("short") as Rect).h).toBe((r.get("tall") as Rect).h)
    })

    it("gives frames in a column a shared width", () => {
        const tree = group("f", "col", [
            group("wide", "row", [icon("a"), icon("b"), icon("c")], "Wide"),
            group("narrow", "row", [icon("d")], "Narrow"),
        ])
        const r = rects(layoutForest([tree]).roots)
        expect((r.get("narrow") as Rect).w).toBe((r.get("wide") as Rect).w)
    })

    it("does not stretch a leaf icon — that would distort the glyph", () => {
        const tree = group("f", "row", [
            group("tall", "col", [icon("a"), icon("b"), icon("c")], "Tall"),
            icon("lone", "Lone"),
        ])
        const r = rects(layoutForest([tree]).roots)
        expect((r.get("lone") as Rect).h).toBeLessThan(
            (r.get("tall") as Rect).h,
        )
    })
})

describe("title strip", () => {
    it("reserves space above the children when a container is labelled", () => {
        const withLabel = rects(
            layoutForest([group("f", "row", [icon("a")], "Titled")]).roots,
        )
        const withoutLabel = rects(
            layoutForest([group("f", "row", [icon("a")], "")]).roots,
        )
        expect((withLabel.get("f") as Rect).h).toBeGreaterThan(
            (withoutLabel.get("f") as Rect).h,
        )
    })

    it("pushes children below the strip so the label is not covered", () => {
        const r = rects(
            layoutForest([group("f", "col", [icon("a")], "Titled")]).roots,
        )
        const f = r.get("f") as Rect
        const a = r.get("a") as Rect
        expect(a.y).toBeGreaterThanOrEqual(f.y + 36)
    })

    it("widens a frame whose title is longer than its contents", () => {
        const longTitle =
            "A Very Long Container Title That Exceeds Its Single Child"
        const r = rects(
            layoutForest([group("f", "row", [icon("a")], longTitle)]).roots,
        )
        expect((r.get("f") as Rect).w).toBeGreaterThan(longTitle.length * 5)
    })
})

describe("page size", () => {
    it("covers every node plus a margin", () => {
        const { roots, page } = layoutForest([
            group("f", "row", [icon("a"), icon("b")], "F"),
        ])
        const all = flatten(roots)
        const maxX = Math.max(...all.map((n) => n.rect.x + n.rect.w))
        const maxY = Math.max(...all.map((n) => n.rect.y + n.rect.h))
        expect(page.w).toBeGreaterThan(maxX)
        expect(page.h).toBeGreaterThan(maxY)
    })

    it("grows with the content", () => {
        const small = layoutForest([group("f", "row", [icon("a")])]).page
        const big = layoutForest([
            group(
                "f",
                "row",
                Array.from({ length: 10 }, (_, i) => icon(`i${i}`)),
            ),
        ]).page
        expect(big.w).toBeGreaterThan(small.w)
    })
})

describe("pinned nodes", () => {
    it("keeps a pinned root where the user left it", () => {
        const pinned: GroupNode = {
            ...group("f", "row", [icon("a")], "F"),
            pinned: true,
            rect: { x: 777, y: 555, w: 100, h: 100 },
        }
        const r = rects(layoutForest([pinned]).roots)
        expect((r.get("f") as Rect).x).toBe(777)
        expect((r.get("f") as Rect).y).toBe(555)
    })

    it("still lays the pinned node's children out inside it", () => {
        const pinned: GroupNode = {
            ...group("f", "row", [icon("a")], "F"),
            pinned: true,
            rect: { x: 300, y: 300, w: 100, h: 100 },
        }
        const r = rects(layoutForest([pinned]).roots)
        expect(contains(r.get("f") as Rect, r.get("a") as Rect)).toBe(true)
    })

    it("does not let a pinned root consume flow space from the others", () => {
        const pinned: BoxNode = {
            ...box("pin", "Pinned"),
            pinned: true,
            rect: { x: 900, y: 900, w: 120, h: 60 },
        }
        const r = rects(layoutForest([pinned, box("flow", "Flow")]).roots)
        // the un-pinned root starts at the normal origin, not offset past the pinned one
        expect((r.get("flow") as Rect).x).toBe(40)
    })
})

describe("icon sizing", () => {
    it("applies the diagram-wide glyph size", () => {
        const small = rects(layoutForest([icon("a")], { iconSize: 48 }).roots)
        const large = rects(layoutForest([icon("a")], { iconSize: 96 }).roots)
        expect((large.get("a") as Rect).h).toBeGreaterThan(
            (small.get("a") as Rect).h,
        )
    })

    it("lets a per-icon size override the diagram default", () => {
        const r = rects(
            layoutForest([group("f", "row", [icon("a"), icon("b", "", 96)])], {
                iconSize: 48,
            }).roots,
        )
        expect((r.get("b") as Rect).h).toBeGreaterThan((r.get("a") as Rect).h)
    })

    it("widens the cell for a long label so it does not overflow", () => {
        const r = rects(
            layoutForest([
                group("f", "row", [
                    icon("a", "x"),
                    icon("b", "a much longer label"),
                ]),
            ]).roots,
        )
        expect((r.get("b") as Rect).w).toBeGreaterThan((r.get("a") as Rect).w)
    })
})

describe("degenerate input", () => {
    it("handles an empty forest", () => {
        const { roots, page } = layoutForest([])
        expect(roots).toEqual([])
        expect(page.w).toBeGreaterThan(0)
    })

    it("handles an empty container without producing a negative size", () => {
        const r = rects(layoutForest([group("f", "row", [], "Empty")]).roots)
        const f = r.get("f") as Rect
        expect(f.w).toBeGreaterThan(0)
        expect(f.h).toBeGreaterThan(0)
    })

    it("handles a grid with fewer children than columns", () => {
        const r = rects(layoutForest([grid("g", 5, [icon("a")], "G")]).roots)
        expect(contains(r.get("g") as Rect, r.get("a") as Rect)).toBe(true)
    })

    it("rounds every coordinate to an integer — draw.io renders half-pixels blurry", () => {
        const tree = group("f", "row", [
            group("a", "col", [icon("x"), icon("y"), icon("z")], "A"),
            icon("b"),
        ])
        for (const f of flatten(layoutForest([tree]).roots)) {
            expect(Number.isInteger(f.rect.x)).toBe(true)
            expect(Number.isInteger(f.rect.y)).toBe(true)
        }
    })
})

describe("determinism", () => {
    it("produces identical geometry for the same tree twice", () => {
        const build = () =>
            group("f", "row", [
                group("a", "col", [icon("x"), icon("y")], "A"),
                grid("g", 2, [icon("p"), icon("q"), icon("r")], "G"),
            ])
        const first = flatten(layoutForest([build()]).roots).map((n) => [
            n.node.id,
            n.rect,
        ])
        const second = flatten(layoutForest([build()]).roots).map((n) => [
            n.node.id,
            n.rect,
        ])
        expect(second).toEqual(first)
    })
})

describe("flatten", () => {
    it("reports the real parent id for a nested node and the layer for a root", () => {
        const tree = group("f", "row", [group("inner", "row", [icon("leaf")])])
        const flat = flatten(layoutForest([tree]).roots)
        const by = new Map(flat.map((n) => [n.node.id, n.parent]))
        expect(by.get("f")).toBe("1")
        expect(by.get("inner")).toBe("f")
        expect(by.get("leaf")).toBe("inner")
    })

    it("emits a parent before its children, so XML order is valid", () => {
        const tree = group("f", "row", [group("inner", "row", [icon("leaf")])])
        const ids = flatten(layoutForest([tree]).roots).map((n) => n.node.id)
        expect(ids.indexOf("f")).toBeLessThan(ids.indexOf("inner"))
        expect(ids.indexOf("inner")).toBeLessThan(ids.indexOf("leaf"))
    })
})
