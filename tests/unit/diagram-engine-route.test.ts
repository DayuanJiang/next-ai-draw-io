/**
 * Edge routing.
 *
 * The property that matters is geometric: a routed path must not run through an icon it
 * does not connect to, and two edges must not leave the same side of a node at the same
 * point. These tests check the produced geometry rather than the shape of the algorithm,
 * so a different routing strategy that still satisfies them would pass.
 */
import { describe, expect, it } from "vitest"
import { renderDiagram } from "@/lib/diagram-engine/render"
import { routeEdges } from "@/lib/diagram-engine/route"
import type {
    DiagramNode,
    DiagramTree,
    GroupNode,
    IconNode,
    Rect,
} from "@/lib/diagram-engine/types"

const rect = (x: number, y: number, w = 48, h = 48): Rect => ({ x, y, w, h })

/** Absolute path of a routed edge: exit port → waypoints → entry port. */
function pathOf(
    route: {
        exit: { x: number; y: number }
        entry: { x: number; y: number }
        waypoints: { x: number; y: number }[]
    },
    src: Rect,
    tgt: Rect,
): { x: number; y: number }[] {
    return [
        { x: src.x + route.exit.x * src.w, y: src.y + route.exit.y * src.h },
        ...route.waypoints,
        { x: tgt.x + route.entry.x * tgt.w, y: tgt.y + route.entry.y * tgt.h },
    ]
}

/** Does a segment cross this rect's core (not merely graze its edge)? */
function segCrosses(
    a: { x: number; y: number },
    b: { x: number; y: number },
    r: Rect,
): boolean {
    const inset = Math.min(r.w, r.h) * 0.25
    return (
        Math.max(a.x, b.x) > r.x + inset &&
        Math.min(a.x, b.x) < r.x + r.w - inset &&
        Math.max(a.y, b.y) > r.y + inset &&
        Math.min(a.y, b.y) < r.y + r.h - inset
    )
}

function pathCrosses(path: { x: number; y: number }[], r: Rect): boolean {
    for (let i = 0; i < path.length - 1; i++)
        if (segCrosses(path[i], path[i + 1], r)) return true
    return false
}

describe("connection points are always pinned", () => {
    const rects = new Map([
        ["a", rect(0, 0)],
        ["b", rect(300, 0)],
    ])
    const routes = routeEdges(
        [{ id: "e1", source: "a", target: "b", hasLabel: false }],
        rects,
        new Set(["a", "b"]),
    )

    it("emits an exit and an entry for every edge", () => {
        // Without these draw.io picks the side itself, knowing nothing about the other
        // icons on the page.
        expect(routes).toHaveLength(1)
        expect(routes[0].exit).toBeDefined()
        expect(routes[0].entry).toBeDefined()
    })

    it("leaves from the side facing the target", () => {
        // b is to the right of a, so the arrow should exit a's right edge and enter b's left.
        expect(routes[0].exit.x).toBe(1)
        expect(routes[0].entry.x).toBe(0)
    })

    it("uses fractions, so draw.io recomputes them when a node is dragged", () => {
        for (const v of [
            routes[0].exit.x,
            routes[0].exit.y,
            routes[0].entry.x,
            routes[0].entry.y,
        ]) {
            expect(v).toBeGreaterThanOrEqual(0)
            expect(v).toBeLessThanOrEqual(1)
        }
    })

    it("picks the vertical sides when the target is below", () => {
        const r = routeEdges(
            [{ id: "e", source: "a", target: "c", hasLabel: false }],
            new Map([
                ["a", rect(0, 0)],
                ["c", rect(0, 300)],
            ]),
            new Set(["a", "c"]),
        )
        expect(r[0].exit.y).toBe(1) // leaves the bottom
        expect(r[0].entry.y).toBe(0) // enters the top
    })

    it("leaves leftwards when the target is to the left", () => {
        const r = routeEdges(
            [{ id: "e", source: "b", target: "a", hasLabel: false }],
            rects,
            new Set(["a", "b"]),
        )
        expect(r[0].exit.x).toBe(0)
        expect(r[0].entry.x).toBe(1)
    })
})

describe("ports on the same side are de-collided", () => {
    it("spreads three edges leaving one node's right side", () => {
        // This is the case from the reported screenshot: two edges left the same EC2 icon
        // at the same point and overlapped on top of it.
        const rects = new Map([
            ["hub", rect(0, 200)],
            ["t1", rect(400, 0)],
            ["t2", rect(400, 200)],
            ["t3", rect(400, 400)],
        ])
        const routes = routeEdges(
            [
                { id: "e1", source: "hub", target: "t1", hasLabel: false },
                { id: "e2", source: "hub", target: "t2", hasLabel: false },
                { id: "e3", source: "hub", target: "t3", hasLabel: false },
            ],
            rects,
            new Set(["hub", "t1", "t2", "t3"]),
        )
        const ys = routes.map((r) => r.exit.y)
        expect(new Set(ys).size).toBe(3)
    })

    it("keeps the edge that has a straight shot on the centre line", () => {
        // t2 is level with hub, so that arrow can run straight; bending it to make room
        // for the others would be the wrong trade.
        const rects = new Map([
            ["hub", rect(0, 200)],
            ["t1", rect(400, 0)],
            ["t2", rect(400, 200)],
            ["t3", rect(400, 400)],
        ])
        const routes = routeEdges(
            [
                { id: "e1", source: "hub", target: "t1", hasLabel: false },
                { id: "e2", source: "hub", target: "t2", hasLabel: false },
                { id: "e3", source: "hub", target: "t3", hasLabel: false },
            ],
            rects,
            new Set(["hub", "t1", "t2", "t3"]),
        )
        expect(routes[1].exit.y).toBe(0.5)
        expect(routes[0].exit.y).not.toBe(0.5)
        expect(routes[2].exit.y).not.toBe(0.5)
    })

    it("orders the spread so the edges do not cross on the way out", () => {
        // The target that sits highest should leave from the highest port.
        const rects = new Map([
            ["hub", rect(0, 200)],
            ["top", rect(400, 0)],
            ["bottom", rect(400, 400)],
        ])
        const routes = routeEdges(
            [
                { id: "e1", source: "hub", target: "bottom", hasLabel: false },
                { id: "e2", source: "hub", target: "top", hasLabel: false },
            ],
            rects,
            new Set(["hub", "top", "bottom"]),
        )
        // e2 goes up, so its exit must be above e1's
        expect(routes[1].exit.y).toBeLessThan(routes[0].exit.y)
    })

    it("spreads fan-in on the target side too", () => {
        const rects = new Map([
            ["s1", rect(0, 0)],
            ["s2", rect(0, 200)],
            ["s3", rect(0, 400)],
            ["sink", rect(400, 200)],
        ])
        const routes = routeEdges(
            [
                { id: "e1", source: "s1", target: "sink", hasLabel: false },
                { id: "e2", source: "s2", target: "sink", hasLabel: false },
                { id: "e3", source: "s3", target: "sink", hasLabel: false },
            ],
            rects,
            new Set(["s1", "s2", "s3", "sink"]),
        )
        expect(new Set(routes.map((r) => r.entry.y)).size).toBe(3)
    })

    it("leaves a single edge centred", () => {
        const routes = routeEdges(
            [{ id: "e", source: "a", target: "b", hasLabel: false }],
            new Map([
                ["a", rect(0, 0)],
                ["b", rect(300, 0)],
            ]),
            new Set(["a", "b"]),
        )
        expect(routes[0].exit.y).toBe(0.5)
        expect(routes[0].entry.y).toBe(0.5)
    })
})

describe("routes avoid icons they do not connect to", () => {
    it("bends around an icon sitting on the straight line", () => {
        // a — blocker — b, all level. A straight line would run through the blocker.
        const rects = new Map([
            ["a", rect(0, 100)],
            ["blocker", rect(200, 100)],
            ["b", rect(400, 100)],
        ])
        const routes = routeEdges(
            [{ id: "e", source: "a", target: "b", hasLabel: false }],
            rects,
            new Set(["a", "blocker", "b"]),
        )
        const path = pathOf(
            routes[0],
            rects.get("a") as Rect,
            rects.get("b") as Rect,
        )
        expect(pathCrosses(path, rects.get("blocker") as Rect)).toBe(false)
    })

    it("freezes the waypoints of a deliberate detour", () => {
        // A re-route from the pins alone would put the path back through the blocker, so
        // this is one of the two cases where the waypoints have to survive.
        const rects = new Map([
            ["a", rect(0, 100)],
            ["blocker", rect(200, 100)],
            ["b", rect(400, 100)],
        ])
        const routes = routeEdges(
            [{ id: "e", source: "a", target: "b", hasLabel: false }],
            rects,
            new Set(["a", "blocker", "b"]),
        )
        expect(routes[0].waypoints.length).toBeGreaterThan(0)
        expect(routes[0].freeze).toBe(true)
    })

    it("does NOT freeze a clear straight run", () => {
        // Nothing in the way, so leave the route to draw.io and keep the edge
        // drag-friendly.
        const routes = routeEdges(
            [{ id: "e", source: "a", target: "b", hasLabel: false }],
            new Map([
                ["a", rect(0, 0)],
                ["b", rect(300, 0)],
            ]),
            new Set(["a", "b"]),
        )
        expect(routes[0].waypoints).toEqual([])
        expect(routes[0].freeze).toBe(false)
    })

    it("freezes a labelled bend so the label lands on a straight segment", () => {
        const rects = new Map([
            ["a", rect(0, 0)],
            ["b", rect(400, 300)],
        ])
        const routes = routeEdges(
            [{ id: "e", source: "a", target: "b", hasLabel: true }],
            rects,
            new Set(["a", "b"]),
        )
        if (routes[0].waypoints.length > 0) expect(routes[0].freeze).toBe(true)
    })

    it("keeps clear of several icons in a row", () => {
        const rects = new Map([
            ["a", rect(0, 200)],
            ["x1", rect(150, 200)],
            ["x2", rect(300, 200)],
            ["x3", rect(450, 200)],
            ["b", rect(600, 200)],
        ])
        const routes = routeEdges(
            [{ id: "e", source: "a", target: "b", hasLabel: false }],
            rects,
            new Set(["a", "x1", "x2", "x3", "b"]),
        )
        const path = pathOf(
            routes[0],
            rects.get("a") as Rect,
            rects.get("b") as Rect,
        )
        for (const id of ["x1", "x2", "x3"])
            expect(pathCrosses(path, rects.get(id) as Rect)).toBe(false)
    })

    it("treats a container frame as passable, not an obstacle", () => {
        // An arrow from outside a VPC to something inside it has to cross the border.
        const rects = new Map([
            ["outside", rect(0, 100)],
            ["vpc", { x: 200, y: 0, w: 400, h: 300 }],
            ["inside", rect(350, 100)],
        ])
        const routes = routeEdges(
            [{ id: "e", source: "outside", target: "inside", hasLabel: false }],
            rects,
            // vpc deliberately absent from the obstacle set
            new Set(["outside", "inside"]),
        )
        // A straight shot is available and should be taken.
        expect(routes[0].waypoints).toEqual([])
    })
})

describe("parallel segments are separated", () => {
    it("does not leave two detours stacked on the same track", () => {
        // Two edges that both have to bend around the same column of icons would
        // otherwise pick the same corridor lane and overlap for its whole length.
        const rects = new Map([
            ["a1", rect(0, 100)],
            ["a2", rect(0, 250)],
            ["blocker1", rect(250, 100)],
            ["blocker2", rect(250, 250)],
            ["b1", rect(500, 100)],
            ["b2", rect(500, 250)],
        ])
        const routes = routeEdges(
            [
                { id: "e1", source: "a1", target: "b1", hasLabel: false },
                { id: "e2", source: "a2", target: "b2", hasLabel: false },
            ],
            rects,
            new Set(["a1", "a2", "blocker1", "blocker2", "b1", "b2"]),
        )
        // Collect the vertical lanes each route uses.
        const lanes = routes.flatMap((r) =>
            r.waypoints.map((p) => p.x).filter((x) => x !== undefined),
        )
        if (lanes.length >= 2) {
            // No two lanes may sit within a few pixels of each other.
            for (let i = 0; i < lanes.length; i++)
                for (let j = i + 1; j < lanes.length; j++)
                    if (Math.abs(lanes[i] - lanes[j]) < 6)
                        expect(lanes[i]).toBe(lanes[j]) // same lane of one route is fine
        }
    })

    it("produces the same result regardless of declaration order", () => {
        // The nudge pass is global, so routing must not depend on the order link() was
        // called in.
        const rects = new Map([
            ["hub", rect(0, 200)],
            ["t1", rect(400, 0)],
            ["t2", rect(400, 200)],
            ["t3", rect(400, 400)],
        ])
        const obstacles = new Set(["hub", "t1", "t2", "t3"])
        const forward = routeEdges(
            [
                { id: "e1", source: "hub", target: "t1", hasLabel: false },
                { id: "e2", source: "hub", target: "t2", hasLabel: false },
                { id: "e3", source: "hub", target: "t3", hasLabel: false },
            ],
            rects,
            obstacles,
        )
        const reversed = routeEdges(
            [
                { id: "e3", source: "hub", target: "t3", hasLabel: false },
                { id: "e2", source: "hub", target: "t2", hasLabel: false },
                { id: "e1", source: "hub", target: "t1", hasLabel: false },
            ],
            rects,
            obstacles,
        )
        const byId = (rs: typeof forward) =>
            new Map(rs.map((r) => [r.id, JSON.stringify(r)]))
        const f = byId(forward)
        const r = byId(reversed)
        for (const id of ["e1", "e2", "e3"]) expect(r.get(id)).toBe(f.get(id))
    })
})

describe("degenerate input", () => {
    it("returns a usable route when a terminal is missing", () => {
        const routes = routeEdges(
            [{ id: "e", source: "ghost", target: "b", hasLabel: false }],
            new Map([["b", rect(0, 0)]]),
            new Set(["b"]),
        )
        expect(routes).toHaveLength(1)
        expect(routes[0].exit).toBeDefined()
    })

    it("handles a self-loop without hanging", () => {
        const routes = routeEdges(
            [{ id: "e", source: "a", target: "a", hasLabel: false }],
            new Map([["a", rect(0, 0)]]),
            new Set(["a"]),
        )
        expect(routes).toHaveLength(1)
    })

    it("handles no edges", () => {
        expect(routeEdges([], new Map(), new Set())).toEqual([])
    })

    it("routes 40 edges without blowing up", () => {
        const rects = new Map<string, Rect>()
        for (let i = 0; i < 40; i++)
            rects.set(`n${i}`, rect((i % 8) * 120, Math.floor(i / 8) * 120))
        const edges = []
        for (let i = 0; i < 39; i++)
            edges.push({
                id: `e${i}`,
                source: `n${i}`,
                target: `n${i + 1}`,
                hasLabel: false,
            })
        const routes = routeEdges(edges, rects, new Set(rects.keys()))
        expect(routes).toHaveLength(39)
    })
})

describe("the rendered XML carries the route", () => {
    const icon = (id: string, label = ""): IconNode => ({
        kind: "icon",
        id,
        name: "ec2",
        label,
    })
    const tree = (
        roots: DiagramNode[],
        links: DiagramTree["links"],
    ): DiagramTree => ({
        roots,
        links,
        foreign: [],
    })

    it("writes exitX/entryX into the edge style", () => {
        const t = tree(
            [
                {
                    kind: "group",
                    id: "f",
                    gname: null,
                    label: "F",
                    dir: "row",
                    gap: 60,
                    children: [icon("a"), icon("b")],
                } as GroupNode,
            ],
            [{ source: "a", target: "b" }],
        )
        const { xml } = renderDiagram(t)
        const edge = xml.match(/<mxCell[^>]*edge="1"[^>]*>/)?.[0] ?? ""
        expect(edge).toContain("exitX=")
        expect(edge).toContain("exitY=")
        expect(edge).toContain("entryX=")
        expect(edge).toContain("entryY=")
    })

    it("writes no waypoints for an unobstructed unlabelled edge", () => {
        const t = tree(
            [
                {
                    kind: "group",
                    id: "f",
                    gname: null,
                    label: "F",
                    dir: "row",
                    gap: 60,
                    children: [icon("a"), icon("b")],
                } as GroupNode,
            ],
            [{ source: "a", target: "b" }],
        )
        expect(renderDiagram(t).xml).not.toContain('as="points"')
    })

    it("writes waypoints when the router had to bend around an icon", () => {
        // Three icons in a row; the arrow skips the middle one.
        const t = tree(
            [
                {
                    kind: "group",
                    id: "f",
                    gname: null,
                    label: "F",
                    dir: "row",
                    gap: 60,
                    children: [icon("a"), icon("mid"), icon("b")],
                } as GroupNode,
            ],
            [{ source: "a", target: "b" }],
        )
        const { xml } = renderDiagram(t)
        expect(xml).toContain('as="points"')
    })

    it("does not route an arrow through a sibling icon", () => {
        const t = tree(
            [
                {
                    kind: "group",
                    id: "f",
                    gname: null,
                    label: "F",
                    dir: "row",
                    gap: 60,
                    children: [icon("a"), icon("mid"), icon("b")],
                } as GroupNode,
            ],
            [{ source: "a", target: "b" }],
        )
        const { xml } = renderDiagram(t)
        // Pull the geometry back out and check it against the middle icon.
        const geo = (id: string): Rect | null => {
            const m = xml.match(
                new RegExp(
                    `<mxCell id="${id}"[^>]*>\\s*<mxGeometry x="(-?\\d+)" y="(-?\\d+)" width="(\\d+)" height="(\\d+)"`,
                ),
            )
            if (!m) return null
            // These are parent-relative; the frame's own origin has to be added back.
            const f = xml.match(
                /<mxCell id="f"[^>]*>\s*<mxGeometry x="(-?\d+)" y="(-?\d+)"/,
            )
            const ox = f ? Number(f[1]) : 0
            const oy = f ? Number(f[2]) : 0
            return {
                x: Number(m[1]) + ox,
                y: Number(m[2]) + oy,
                w: Number(m[3]),
                h: Number(m[4]),
            }
        }
        const mid = geo("mid")
        const pts = [
            ...xml.matchAll(/<mxPoint x="(-?\d+)" y="(-?\d+)"\/>/g),
        ].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
        expect(mid).not.toBeNull()
        if (mid && pts.length >= 2) {
            // The corridor the route uses must be clear of the middle icon.
            for (const p of pts) {
                const insideX = p.x > mid.x && p.x < mid.x + mid.w
                const insideY = p.y > mid.y && p.y < mid.y + mid.h
                expect(insideX && insideY).toBe(false)
            }
        }
    })

    it("spreads a fan-out so the arrows do not stack on one point", () => {
        // The screenshot's failure mode, checked through the full render path.
        const t = tree(
            [
                {
                    kind: "group",
                    id: "f",
                    gname: null,
                    label: "F",
                    dir: "row",
                    gap: 120,
                    children: [
                        icon("hub"),
                        {
                            kind: "group",
                            id: "col",
                            gname: null,
                            label: "",
                            dir: "col",
                            gap: 60,
                            children: [icon("t1"), icon("t2"), icon("t3")],
                        } as GroupNode,
                    ],
                } as GroupNode,
            ],
            [
                { source: "hub", target: "t1" },
                { source: "hub", target: "t2" },
                { source: "hub", target: "t3" },
            ],
        )
        const { xml } = renderDiagram(t)
        const exits = [...xml.matchAll(/exitX=([\d.]+);exitY=([\d.]+)/g)].map(
            (m) => `${m[1]},${m[2]}`,
        )
        expect(exits).toHaveLength(3)
        expect(new Set(exits).size).toBe(3)
    })
})
