/**
 * Edge routing: where an arrow leaves a node, and how it gets to the other end.
 *
 * Without this, `source` and `target` are all draw.io has to work with. Its own router
 * knows the two terminals' bounds and nothing else — not where the other icons are — so
 * it runs arrows straight through unrelated shapes and stacks several on one point.
 *
 * Three stages, the same shape as drawio-ai-kit's router (MIT — see NOTICE):
 *
 *   1. pick a side per edge, then DE-COLLIDE: several edges leaving the same side of the
 *      same node get spread along that side. An edge that has a clean straight shot keeps
 *      the centre; the others move off it.
 *   2. try progressively less direct paths — straight, a Z through the gap between the
 *      two nodes, an L — testing each against every icon on the page, and keep the first
 *      that is clear.
 *   3. NUDGE: globally separate parallel segments that ended up on top of each other, so
 *      the result does not depend on the order edges were declared in.
 *
 * What gets written to the XML is deliberately asymmetric:
 *
 *   - Connection points ALWAYS. They are fractions of the terminal's bounds, so draw.io
 *     recomputes them from live geometry on every edit — they follow a node when the user
 *     drags it, and cost nothing in exchange.
 *   - Waypoints only when they are load-bearing: the edge carries a label (which sits at
 *     the path midpoint and needs a straight segment under it), or the router deliberately
 *     bent around something a straight line would have hit. Waypoints are absolute, so
 *     draw.io keeps them after a drag and the route deforms; spending that only where it
 *     buys something keeps the diagram editable.
 */

import type { Rect } from "./types"

/** Which side of a node an edge attaches to. */
export type Side = "L" | "R" | "T" | "B"

export interface RouteInput {
    id: string
    source: string
    target: string
    /** Edges with a label need a straight segment under the midpoint. */
    hasLabel: boolean
}

export interface RoutedEdge {
    id: string
    /** Exit point as a fraction of the source's bounds. */
    exit: { x: number; y: number }
    /** Entry point as a fraction of the target's bounds. */
    entry: { x: number; y: number }
    /** Absolute waypoints — emitted only when `freeze` is set. */
    waypoints: { x: number; y: number }[]
    /** Whether the waypoints must be written to the XML. */
    freeze: boolean
}

interface Point {
    x: number
    y: number
}

/** Clearance kept around an icon when testing whether a segment hits it. */
const MARGIN = 7
/** Track separation used by the nudge pass. */
const SEP = 16
/** How close to a frame's border counts as running alongside it. */
const BORDER_MARGIN = 24
/** Segments shorter than this are connector stubs, not runs worth judging. */
const MIN_RUN = 28

/** The point on `r`'s side `side`, at fraction `f` along it. */
function portPoint(r: Rect, side: Side, f: number): Point {
    if (side === "L") return { x: r.x, y: Math.round(r.y + f * r.h) }
    if (side === "R") return { x: r.x + r.w, y: Math.round(r.y + f * r.h) }
    if (side === "T") return { x: Math.round(r.x + f * r.w), y: r.y }
    return { x: Math.round(r.x + f * r.w), y: r.y + r.h }
}

/** Does an axis-aligned segment cross this rect (plus its margin)? */
function segHitsRect(p: Point, q: Point, r: Rect): boolean {
    const x0 = r.x - MARGIN
    const x1 = r.x + r.w + MARGIN
    const y0 = r.y - MARGIN
    const y1 = r.y + r.h + MARGIN
    if (Math.abs(p.y - q.y) < 1)
        return (
            p.y > y0 &&
            p.y < y1 &&
            Math.min(p.x, q.x) < x1 &&
            Math.max(p.x, q.x) > x0
        )
    if (Math.abs(p.x - q.x) < 1)
        return (
            p.x > x0 &&
            p.x < x1 &&
            Math.min(p.y, q.y) < y1 &&
            Math.max(p.y, q.y) > y0
        )
    // A diagonal should not occur, but treat its bounding box as a hit rather than
    // silently letting it through.
    return (
        Math.min(p.x, q.x) < x1 &&
        Math.max(p.x, q.x) > x0 &&
        Math.min(p.y, q.y) < y1 &&
        Math.max(p.y, q.y) > y0
    )
}

/** Candidate route shapes, in the order they are tried. */
type Shape =
    | { kind: "straight" }
    | { kind: "Zx"; lane: number }
    | { kind: "Zy"; lane: number }
    | { kind: "Lhv" }
    | { kind: "Lvh" }

/** Turn a shape into the concrete point list for one edge. */
function shapePoints(
    a: Rect,
    b: Rect,
    exitSide: Side,
    entrySide: Side,
    sf: number,
    tf: number,
    shape: Shape,
): { sp: Point; ep: Point; wp: Point[] } {
    const sp = portPoint(a, exitSide, sf)
    const ep = portPoint(b, entrySide, tf)
    let wp: Point[] = []
    if (shape.kind === "Zx")
        wp = [
            { x: shape.lane, y: sp.y },
            { x: shape.lane, y: ep.y },
        ]
    else if (shape.kind === "Zy")
        wp = [
            { x: sp.x, y: shape.lane },
            { x: ep.x, y: shape.lane },
        ]
    else if (shape.kind === "Lhv") wp = [{ x: ep.x, y: sp.y }]
    else if (shape.kind === "Lvh") wp = [{ x: sp.x, y: ep.y }]
    return { sp, ep, wp }
}

/**
 * Lane positions to try inside a gap, from the middle outwards.
 *
 * The middle of the corridor is where a route looks intentional; stepping outwards from
 * there finds the nearest clear lane when the middle is taken.
 */
function laneSweep(lo: number, hi: number): number[] {
    const mid = (lo + hi) / 2
    const out = [Math.round(mid)]
    for (let k = 1; k <= 24; k++) {
        const down = mid - k * 10
        const up = mid + k * 10
        if (down > lo + 2) out.push(Math.round(down))
        if (up < hi - 2) out.push(Math.round(up))
    }
    return out
}

/**
 * Route every edge.
 *
 * `rects` must hold every node on the page, `obstacles` the ids of the leaf shapes an arrow
 * must not cross, and `containers` the ids of the frames.
 *
 * Containers are not obstacles — an edge from outside a VPC to something inside it has to
 * cross the VPC's border. But they are not free to ignore either: a line that runs
 * alongside a border, or straight through a frame neither of its endpoints belongs to,
 * reads as a mistake even though it hits nothing. Those two cases are penalised instead.
 */
export function routeEdges(
    edges: RouteInput[],
    rects: Map<string, Rect>,
    obstacles: Set<string>,
    containers: Set<string> = new Set(),
): RoutedEdge[] {
    const cards: { id: string; r: Rect }[] = []
    for (const id of obstacles) {
        const r = rects.get(id)
        if (r) cards.push({ id, r })
    }
    const frames: Rect[] = []
    for (const id of containers) {
        const r = rects.get(id)
        if (r) frames.push(r)
    }

    /** Does this path cross any icon other than its own two endpoints? */
    const pathHits = (pts: Point[], exempt: Set<string>): boolean => {
        for (let i = 0; i < pts.length - 1; i++)
            for (const c of cards) {
                if (exempt.has(c.id)) continue
                if (segHitsRect(pts[i], pts[i + 1], c.r)) return true
            }
        return false
    }

    const encloses = (frame: Rect, n: Rect) =>
        frame.x <= n.x + 1 &&
        frame.y <= n.y + 1 &&
        frame.x + frame.w >= n.x + n.w - 1 &&
        frame.y + frame.h >= n.y + n.h - 1

    /** Is this point inside any frame? Routing inside a frame is normal. */
    const insideAnyFrame = (px: number, py: number) =>
        frames.some(
            (c) =>
                px > c.x + 1 &&
                px < c.x + c.w - 1 &&
                py > c.y + 1 &&
                py < c.y + c.h - 1,
        )

    /**
     * Is this segment badly placed relative to the frames, even though it hits nothing?
     *
     * Two ways it can be:
     *
     *   - It runs ALONGSIDE a border, within BORDER_MARGIN of it. That looks like a line
     *     trying and failing to be the frame's edge. Only counted when the segment is
     *     outside every frame: inside one, running near the wall is unavoidable and fine.
     *   - It passes THROUGH a frame that contains exactly one of the two endpoints. The
     *     line then appears to belong to that frame's contents when it does not — this is
     *     the case where an edge from outside a VPC cuts across the whole VPC interior on
     *     its way somewhere else.
     */
    const segAlongFrame = (
        p: Point,
        q: Point,
        a: Rect | null,
        b: Rect | null,
    ): boolean => {
        const vertical = Math.abs(p.x - q.x) < 1
        const lo = vertical ? Math.min(p.y, q.y) : Math.min(p.x, q.x)
        const hi = vertical ? Math.max(p.y, q.y) : Math.max(p.x, q.x)
        // A short segment is a connector stub, not a run along a wall.
        if (hi - lo < MIN_RUN) return false

        const mid = (lo + hi) / 2
        if (!insideAnyFrame(vertical ? p.x : mid, vertical ? mid : p.y)) {
            for (const c of frames) {
                const borders = vertical ? [c.x, c.x + c.w] : [c.y, c.y + c.h]
                const cLo = vertical ? c.y : c.x
                const cHi = vertical ? c.y + c.h : c.x + c.w
                const shared = Math.min(hi, cHi) - Math.max(lo, cLo)
                if (shared <= MIN_RUN) continue
                for (const border of borders)
                    if (
                        Math.abs((vertical ? p.x : p.y) - border) <
                        BORDER_MARGIN
                    )
                        return true
            }
        }

        if (a && b)
            for (const c of frames) {
                const across = vertical
                    ? p.x > c.x + 8 && p.x < c.x + c.w - 8
                    : p.y > c.y + 8 && p.y < c.y + c.h - 8
                if (!across) continue
                const cLo = vertical ? c.y : c.x
                const cHi = vertical ? c.y + c.h : c.x + c.w
                if (Math.min(hi, cHi) - Math.max(lo, cLo) <= MIN_RUN) continue
                // Exactly one endpoint inside → the segment is trespassing.
                if (encloses(c, a) !== encloses(c, b)) return true
            }

        return false
    }

    const pathAlongFrame = (
        pts: Point[],
        a: Rect | null,
        b: Rect | null,
    ): boolean => {
        for (let i = 0; i < pts.length - 1; i++)
            if (segAlongFrame(pts[i], pts[i + 1], a, b)) return true
        return false
    }

    /** How many segments of this path are badly placed relative to the frames. */
    const frameOffences = (
        pts: Point[],
        a: Rect | null,
        b: Rect | null,
    ): number => {
        let n = 0
        for (let i = 0; i < pts.length - 1; i++)
            if (segAlongFrame(pts[i], pts[i + 1], a, b)) n++
        return n
    }

    /** Total length of a path, for preferring the shorter of two equally tidy routes. */
    const pathLength = (pts: Point[]): number => {
        let d = 0
        for (let i = 0; i < pts.length - 1; i++)
            d +=
                Math.abs(pts[i + 1].x - pts[i].x) +
                Math.abs(pts[i + 1].y - pts[i].y)
        return d
    }

    // --- stage 1a: which side does each edge leave from?
    interface Face {
        exit: Side
        entry: Side
        horiz: boolean
    }
    const faces: (Face | null)[] = edges.map((e) => {
        const a = rects.get(e.source)
        const b = rects.get(e.target)
        if (!a || !b) return null
        const fwdX = b.x + b.w / 2 >= a.x + a.w / 2
        const fwdY = b.y + b.h / 2 >= a.y + a.h / 2
        const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
        const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
        // Prefer the axis the two nodes are separated along: if their vertical extents
        // overlap they sit side by side, so the arrow should run horizontally.
        const horiz =
            yOverlap > 8
                ? true
                : xOverlap > 8
                  ? false
                  : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
        return horiz
            ? { exit: fwdX ? "R" : "L", entry: fwdX ? "L" : "R", horiz: true }
            : { exit: fwdY ? "B" : "T", entry: fwdY ? "T" : "B", horiz: false }
    })

    // --- stage 1b: de-collide ports sharing one (node, side)
    const frac = edges.map(() => ({ s: 0.5, t: 0.5 }))
    const groups = new Map<string, { i: number; end: "s" | "t" }[]>()
    edges.forEach((e, i) => {
        const f = faces[i]
        if (!f) return
        for (const end of ["s", "t"] as const) {
            const node = end === "s" ? e.source : e.target
            const side = end === "s" ? f.exit : f.entry
            const key = `${node}|${side}`
            const list = groups.get(key)
            if (list) list.push({ i, end })
            else groups.set(key, [{ i, end }])
        }
    })

    for (const [key, members] of groups) {
        if (members.length < 2) continue
        const sepIdx = key.lastIndexOf("|")
        const nodeId = key.slice(0, sepIdx)
        const side = key.slice(sepIdx + 1) as Side
        const node = rects.get(nodeId)
        if (!node) continue
        const vertical = side === "L" || side === "R"
        const nodeCentre = vertical ? node.y + node.h / 2 : node.x + node.w / 2

        // Where the far end of each edge sits along this side's axis — the order edges
        // should be stacked in, so they do not cross each other on the way out.
        const info = members.map((m) => {
            const farId = m.end === "s" ? edges[m.i].target : edges[m.i].source
            const far = rects.get(farId)
            const farCentre = far
                ? vertical
                    ? far.y + far.h / 2
                    : far.x + far.w / 2
                : nodeCentre
            return { m, farCentre }
        })
        const setFrac = (m: { i: number; end: "s" | "t" }, f: number) => {
            if (m.end === "s") frac[m.i].s = f
            else frac[m.i].t = f
        }

        // An edge whose far end is on this side's centre line has a clean straight shot.
        // Keep it centred and push the others off, rather than bending all of them.
        const aligned = info.filter(
            (x) => Math.abs(x.farCentre - nodeCentre) < 8,
        )
        if (aligned.length === 1 && members.length <= 3) {
            setFrac(aligned[0].m, 0.5)
            const rest = info.filter((x) => x !== aligned[0])
            const below = rest
                .filter((x) => x.farCentre <= nodeCentre)
                .sort((a, b) => b.farCentre - a.farCentre)
            const above = rest
                .filter((x) => x.farCentre > nodeCentre)
                .sort((a, b) => a.farCentre - b.farCentre)
            below.forEach((x, j) => {
                setFrac(x.m, 0.3 - j * 0.14)
            })
            above.forEach((x, j) => {
                setFrac(x.m, 0.7 + j * 0.14)
            })
        } else {
            info.sort((a, b) => a.farCentre - b.farCentre)
            info.forEach((x, j) => {
                setFrac(x.m, (j + 1) / (members.length + 1))
            })
        }
    }

    // --- stage 2: try shapes in order of directness, keep the first that is clear
    //
    // Segments already claimed by a routed edge, so later edges can avoid sharing a lane
    // rather than relying on the nudge pass to separate them afterwards.
    const usedSegs: { x1: number; y1: number; x2: number; y2: number }[] = []
    const overlap1 = (a0: number, a1: number, b0: number, b1: number) =>
        Math.min(a1, b1) - Math.max(a0, b0)
    /** Does this path run along a lane an earlier edge already occupies? */
    const overlapsUsed = (pts: Point[]): boolean => {
        for (let i = 0; i < pts.length - 1; i++) {
            const p = pts[i]
            const q = pts[i + 1]
            const vertical = Math.abs(p.x - q.x) < 1
            for (const s of usedSegs) {
                const sVertical = Math.abs(s.x1 - s.x2) < 1
                if (vertical !== sVertical) continue
                if (vertical) {
                    if (Math.abs(p.x - s.x1) >= 6) continue
                    if (
                        overlap1(
                            Math.min(p.y, q.y),
                            Math.max(p.y, q.y),
                            Math.min(s.y1, s.y2),
                            Math.max(s.y1, s.y2),
                        ) > 14
                    )
                        return true
                } else {
                    if (Math.abs(p.y - s.y1) >= 6) continue
                    if (
                        overlap1(
                            Math.min(p.x, q.x),
                            Math.max(p.x, q.x),
                            Math.min(s.x1, s.x2),
                            Math.max(s.x1, s.x2),
                        ) > 14
                    )
                        return true
                }
            }
        }
        return false
    }
    const claimLanes = (pts: Point[]) => {
        for (let i = 0; i < pts.length - 1; i++)
            usedSegs.push({
                x1: pts[i].x,
                y1: pts[i].y,
                x2: pts[i + 1].x,
                y2: pts[i + 1].y,
            })
    }

    const routes: {
        exitSide: Side
        entrySide: Side
        wp: Point[]
        /** The router had to bend around something — a straight line would have hit it. */
        avoided: boolean
    }[] = []

    edges.forEach((e, i) => {
        const f = faces[i]
        const a = rects.get(e.source)
        const b = rects.get(e.target)
        if (!f || !a || !b) {
            routes.push({
                exitSide: "R",
                entrySide: "L",
                wp: [],
                avoided: false,
            })
            return
        }
        const exempt = new Set([e.source, e.target])
        const sf = frac[i].s
        const tf = frac[i].t

        /**
         * Try one candidate. `strict` also rejects a path that is merely badly placed
         * relative to the frames — running alongside a border, or cutting through a frame
         * only one endpoint belongs to.
         *
         * Every shape is tried strictly first and the whole ladder re-run relaxed, so a
         * tidier route always wins over a nearer one, and an edge that has no tidy option
         * still gets a sensible path rather than the fallback.
         */
        const attempt = (
            exitSide: Side,
            entrySide: Side,
            shape: Shape,
            strict: boolean,
        ): Point[] | null => {
            const g = shapePoints(a, b, exitSide, entrySide, sf, tf, shape)
            const pts = [g.sp, ...g.wp, g.ep]
            if (pathHits(pts, exempt)) return null
            if (strict && pathAlongFrame(pts, a, b)) return null
            // Strict mode also declines a lane an earlier edge already runs along. Waiting
            // for the nudge pass to pull them apart afterwards is worse: it can only move
            // a segment so far before it hits something, so two edges that both picked the
            // corridor's centre may stay overlapping.
            if (strict && overlapsUsed(pts)) return null
            return g.wp
        }

        /**
         * The ladder of candidate shapes, most direct first.
         *
         * Run once refusing anything that hugs or trespasses on a frame, then again with
         * that relaxed. So a tidy longer route beats an untidy shorter one, and an edge
         * with no tidy option still gets a real path instead of the fallback.
         */
        const ladder = (
            strict: boolean,
        ): {
            exitSide: Side
            entrySide: Side
            wp: Point[]
            avoided: boolean
        } | null => {
            // straight, when the two ports already line up
            const aligned = f.horiz
                ? Math.abs(a.y + sf * a.h - (b.y + tf * b.h)) < 2
                : Math.abs(a.x + sf * a.w - (b.x + tf * b.w)) < 2
            if (aligned) {
                const wp = attempt(
                    f.exit,
                    f.entry,
                    { kind: "straight" },
                    strict,
                )
                if (wp)
                    return {
                        exitSide: f.exit,
                        entrySide: f.entry,
                        wp,
                        avoided: false,
                    }
            }

            // A Z whose middle leg sits in the gap between the two nodes.
            //
            // The gap runs from the trailing edge of whichever node comes first to the
            // leading edge of the other. Taking min/max of both edges instead would span
            // the whole distance between them, including anything parked in between — so
            // the sweep would happily place the leg on top of an icon it is meant to
            // route around.
            if (f.horiz) {
                const aFirst = a.x <= b.x
                const lo = aFirst ? a.x + a.w : b.x + b.w
                const hi = aFirst ? b.x : a.x
                for (const lane of laneSweep(lo, hi)) {
                    const wp = attempt(
                        f.exit,
                        f.entry,
                        { kind: "Zx", lane },
                        strict,
                    )
                    if (wp)
                        return {
                            exitSide: f.exit,
                            entrySide: f.entry,
                            wp,
                            avoided: true,
                        }
                }
            } else {
                const aFirst = a.y <= b.y
                const lo = aFirst ? a.y + a.h : b.y + b.h
                const hi = aFirst ? b.y : a.y
                for (const lane of laneSweep(lo, hi)) {
                    const wp = attempt(
                        f.exit,
                        f.entry,
                        { kind: "Zy", lane },
                        strict,
                    )
                    if (wp)
                        return {
                            exitSide: f.exit,
                            entrySide: f.entry,
                            wp,
                            avoided: true,
                        }
                }
            }

            // an L, turning once — this needs a different side at one end
            const downward = b.y + b.h / 2 >= a.y + a.h / 2
            const rightward = b.x + b.w / 2 >= a.x + a.w / 2
            const lCandidates: [Side, Side, Shape][] = f.horiz
                ? [
                      [f.exit, downward ? "T" : "B", { kind: "Lhv" }],
                      [downward ? "B" : "T", f.entry, { kind: "Lvh" }],
                  ]
                : [
                      [f.exit, rightward ? "L" : "R", { kind: "Lvh" }],
                      [rightward ? "R" : "L", f.entry, { kind: "Lhv" }],
                  ]
            for (const [es, en, shape] of lCandidates) {
                const wp = attempt(es, en, shape, strict)
                if (wp)
                    return { exitSide: es, entrySide: en, wp, avoided: true }
            }

            // A detour: out of the way, across, and back. Two bends, which is what it
            // takes to get past something sitting directly between the two nodes — a Z's
            // middle leg runs along the blocked axis and an L only turns once, so neither
            // can clear it.
            const blockers = cards.filter((c) => !exempt.has(c.id))
            const detour = f.horiz
                ? (() => {
                      const spanLo = Math.min(a.x, b.x)
                      const spanHi = Math.max(a.x + a.w, b.x + b.w)
                      const between = blockers.filter(
                          (c) => c.r.x + c.r.w > spanLo && c.r.x < spanHi,
                      )
                      if (between.length === 0) return null
                      const top = Math.min(...between.map((c) => c.r.y))
                      const bottom = Math.max(
                          ...between.map((c) => c.r.y + c.r.h),
                      )
                      const aMid = a.y + a.h / 2
                      const goUp =
                          Math.abs(aMid - top) <= Math.abs(bottom - aMid)
                      const lane = goUp
                          ? top - MARGIN - 14
                          : bottom + MARGIN + 14
                      const side: Side = goUp ? "T" : "B"
                      return {
                          exitSide: side,
                          entrySide: side,
                          wp: [
                              { x: portPoint(a, side, sf).x, y: lane },
                              { x: portPoint(b, side, tf).x, y: lane },
                          ],
                      }
                  })()
                : (() => {
                      const spanLo = Math.min(a.y, b.y)
                      const spanHi = Math.max(a.y + a.h, b.y + b.h)
                      const between = blockers.filter(
                          (c) => c.r.y + c.r.h > spanLo && c.r.y < spanHi,
                      )
                      if (between.length === 0) return null
                      const left = Math.min(...between.map((c) => c.r.x))
                      const right = Math.max(
                          ...between.map((c) => c.r.x + c.r.w),
                      )
                      const aMid = a.x + a.w / 2
                      const goLeft =
                          Math.abs(aMid - left) <= Math.abs(right - aMid)
                      const lane = goLeft
                          ? left - MARGIN - 14
                          : right + MARGIN + 14
                      const side: Side = goLeft ? "L" : "R"
                      return {
                          exitSide: side,
                          entrySide: side,
                          wp: [
                              { x: lane, y: portPoint(a, side, sf).y },
                              { x: lane, y: portPoint(b, side, tf).y },
                          ],
                      }
                  })()
            if (detour) {
                const sp = portPoint(a, detour.exitSide, sf)
                const ep = portPoint(b, detour.entrySide, tf)
                const pts = [sp, ...detour.wp, ep]
                const ok =
                    !pathHits(pts, exempt) &&
                    (!strict || !pathAlongFrame(pts, a, b))
                if (ok)
                    return {
                        exitSide: detour.exitSide,
                        entrySide: detour.entrySide,
                        wp: detour.wp,
                        avoided: true,
                    }
            }

            return null
        }

        /**
         * Score every candidate shape and return the cheapest.
         *
         * Weights, in the reference router's proportions: an icon hit is disqualifying, a
         * frame offence costs far more than a bend, a bend costs more than distance. So a
         * route that trespasses on one frame beats one that trespasses on two, and among
         * equals the shorter and straighter wins.
         */
        const cheapest = (): {
            exitSide: Side
            entrySide: Side
            wp: Point[]
            avoided: boolean
        } | null => {
            const candidates: [Side, Side, Shape][] = []
            candidates.push([f.exit, f.entry, { kind: "straight" }])
            if (f.horiz) {
                const aFirst = a.x <= b.x
                const gapLo = aFirst ? a.x + a.w : b.x + b.w
                const gapHi = aFirst ? b.x : a.x
                for (const lane of laneSweep(gapLo, gapHi))
                    candidates.push([f.exit, f.entry, { kind: "Zx", lane }])
                // Also consider lanes outside the gap: when the gap is narrow or blocked,
                // going around the outside can be much tidier.
                for (const lane of laneSweep(
                    Math.min(a.x, b.x) - 140,
                    Math.max(a.x + a.w, b.x + b.w) + 140,
                ))
                    candidates.push([f.exit, f.entry, { kind: "Zx", lane }])
            } else {
                const aFirst = a.y <= b.y
                const gapLo = aFirst ? a.y + a.h : b.y + b.h
                const gapHi = aFirst ? b.y : a.y
                for (const lane of laneSweep(gapLo, gapHi))
                    candidates.push([f.exit, f.entry, { kind: "Zy", lane }])
                for (const lane of laneSweep(
                    Math.min(a.y, b.y) - 140,
                    Math.max(a.y + a.h, b.y + b.h) + 140,
                ))
                    candidates.push([f.exit, f.entry, { kind: "Zy", lane }])
            }
            const downward = b.y + b.h / 2 >= a.y + a.h / 2
            const rightward = b.x + b.w / 2 >= a.x + a.w / 2
            candidates.push([f.exit, downward ? "T" : "B", { kind: "Lhv" }])
            candidates.push([downward ? "B" : "T", f.entry, { kind: "Lvh" }])
            candidates.push([f.exit, rightward ? "L" : "R", { kind: "Lvh" }])
            candidates.push([rightward ? "R" : "L", f.entry, { kind: "Lhv" }])

            let best: {
                exitSide: Side
                entrySide: Side
                wp: Point[]
                avoided: boolean
            } | null = null
            let bestCost = Number.POSITIVE_INFINITY

            for (const [es, en, shape] of candidates) {
                const g = shapePoints(a, b, es, en, sf, tf, shape)
                const pts = [g.sp, ...g.wp, g.ep]
                if (pathHits(pts, exempt)) continue
                // Sharing a lane with an existing edge is weighed as heavily as trespassing
                // on a frame. Two lines drawn on top of each other are indistinguishable —
                // strictly worse to read than one line crossing a border it has to cross
                // anyway. Cheaper weights here made the search accept an overlap in order
                // to save one frame crossing.
                const cost =
                    frameOffences(pts, a, b) * 500 +
                    (overlapsUsed(pts) ? 700 : 0) +
                    g.wp.length * 80 +
                    pathLength(pts)
                if (cost < bestCost) {
                    bestCost = cost
                    best = {
                        exitSide: es,
                        entrySide: en,
                        wp: g.wp,
                        avoided: g.wp.length > 0,
                    }
                }
            }
            return best
        }

        // Strict first: a route that offends no frame wins outright. Failing that, score
        // every candidate and take the least-bad one.
        //
        // Scoring is not optional here. Some edges CANNOT satisfy the strict rule: when one
        // endpoint sits inside a VPC and the other outside it, every possible path
        // trespasses on that frame. Accept-or-reject leaves those edges unoptimised — the
        // relaxed pass takes whatever it happens to try first, which is how a line ends up
        // cutting diagonally across a whole VPC. Weighing the offences instead picks the
        // path that trespasses least and is shortest.
        const chosen = ladder(true) ?? cheapest()
        if (chosen) {
            routes.push(chosen)
            // Claim this route's lanes so the edges after it look elsewhere.
            claimLanes([
                portPoint(a, chosen.exitSide, sf),
                ...chosen.wp,
                portPoint(b, chosen.entrySide, tf),
            ])
            return
        }

        // Nothing was clear even relaxed. Sweep a wider band for a lane that at least
        // clears every icon before settling for one that does not — an unconditional
        // mid-point corridor was the reference project's own reported failure: it could cut
        // straight through nodes.
        const wide = f.horiz
            ? {
                  lo: Math.min(a.x, b.x) - 160,
                  hi: Math.max(a.x + a.w, b.x + b.w) + 160,
              }
            : {
                  lo: Math.min(a.y, b.y) - 160,
                  hi: Math.max(a.y + a.h, b.y + b.h) + 160,
              }
        let fallbackWp: Point[] | null = null
        for (const lane of laneSweep(wide.lo, wide.hi)) {
            const wp = attempt(
                f.exit,
                f.entry,
                { kind: f.horiz ? "Zx" : "Zy", lane },
                false,
            )
            if (wp) {
                fallbackWp = wp
                break
            }
        }
        if (!fallbackWp) {
            const lane = f.horiz
                ? Math.round((a.x + a.w + b.x) / 2)
                : Math.round((a.y + a.h + b.y) / 2)
            fallbackWp = shapePoints(a, b, f.exit, f.entry, sf, tf, {
                kind: f.horiz ? "Zx" : "Zy",
                lane,
            }).wp
        }
        routes.push({
            exitSide: f.exit,
            entrySide: f.entry,
            wp: fallbackWp,
            avoided: true,
        })
        claimLanes([
            portPoint(a, f.exit, sf),
            ...fallbackWp,
            portPoint(b, f.entry, tf),
        ])
    })

    // --- stage 3: nudge parallel segments apart
    // Absolute point paths, which the nudge pass mutates in place.
    const paths: (Point[] | null)[] = edges.map((e, i) => {
        const a = rects.get(e.source)
        const b = rects.get(e.target)
        if (!a || !b) return null
        const r = routes[i]
        const sp = portPoint(a, r.exitSide, frac[i].s)
        const ep = portPoint(b, r.entrySide, frac[i].t)
        return [sp, ...r.wp.map((p) => ({ x: p.x, y: p.y })), ep]
    })

    interface Seg {
        i: number
        axis: "v" | "h"
        a: Point
        b: Point
        pos: number
        lo: number
        hi: number
        tie: number
    }
    const conflict = (s: Seg, t: Seg) =>
        s.axis === t.axis &&
        Math.abs(s.pos - t.pos) < SEP &&
        Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) > 8

    // Repeat: moving one segment can bring it within SEP of a bundle it was not grouped
    // with, and a single pass would leave that new conflict unresolved.
    for (let pass = 0; pass < 3; pass++) {
        const segs: Seg[] = []
        paths.forEach((P, i) => {
            if (!P) return
            // Skip the terminal segments: they touch a port, which is fixed.
            for (let k = 1; k < P.length - 2; k++) {
                const p = P[k]
                const q = P[k + 1]
                if (Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) >= 1)
                    segs.push({
                        i,
                        axis: "v",
                        a: P[k],
                        b: P[k + 1],
                        pos: p.x,
                        lo: Math.min(p.y, q.y),
                        hi: Math.max(p.y, q.y),
                        tie: P[k - 1].x + P[k + 2].x,
                    })
                else if (Math.abs(p.y - q.y) < 1 && Math.abs(p.x - q.x) >= 1)
                    segs.push({
                        i,
                        axis: "h",
                        a: P[k],
                        b: P[k + 1],
                        pos: p.y,
                        lo: Math.min(p.x, q.x),
                        hi: Math.max(p.x, q.x),
                        tie: P[k - 1].y + P[k + 2].y,
                    })
            }
        })

        // Group overlapping parallel segments into bundles (connected components).
        const comp = segs.map(() => -1)
        let next = 0
        for (let x = 0; x < segs.length; x++) {
            if (comp[x] === -1) comp[x] = next++
            for (let y = x + 1; y < segs.length; y++) {
                if (!conflict(segs[x], segs[y])) continue
                if (comp[y] === -1) comp[y] = comp[x]
                else if (comp[y] !== comp[x]) {
                    const from = comp[y]
                    const to = comp[x]
                    for (let z = 0; z < segs.length; z++)
                        if (comp[z] === from) comp[z] = to
                }
            }
        }
        const bundles = new Map<number, Seg[]>()
        segs.forEach((s, idx) => {
            const list = bundles.get(comp[idx])
            if (list) list.push(s)
            else bundles.set(comp[idx], [s])
        })

        let moved = 0
        for (const bundle of bundles.values()) {
            if (bundle.length < 2) continue
            // Order by current track, then by where the segment's neighbours are, so the
            // spread does not introduce new crossings.
            bundle.sort((a, b) => a.pos - b.pos || a.tie - b.tie)
            const centre = bundle.reduce((s, x) => s + x.pos, 0) / bundle.length
            bundle.forEach((s, j) => {
                const target = Math.round(
                    centre + (j - (bundle.length - 1) / 2) * SEP,
                )
                if (target === s.pos) return
                const P = paths[s.i]
                if (!P) return
                const e = edges[s.i]
                const exempt = new Set([e.source, e.target])
                const sa = rects.get(e.source) ?? null
                const sb = rects.get(e.target) ?? null
                // Whether this path already had a frame problem: if so, one more is not
                // the nudge's fault and should not block a tidier spread.
                const alongBefore = pathAlongFrame(P, sa, sb)
                const before = s.pos
                if (s.axis === "v") {
                    s.a.x = target
                    s.b.x = target
                } else {
                    s.a.y = target
                    s.b.y = target
                }
                // Revert a move that makes the path WORSE — through an icon, or newly
                // hugging a frame border. Tidier is not worth less correct.
                const worse =
                    pathHits(P, exempt) ||
                    (!alongBefore && pathAlongFrame(P, sa, sb))
                if (worse) {
                    if (s.axis === "v") {
                        s.a.x = before
                        s.b.x = before
                    } else {
                        s.a.y = before
                        s.b.y = before
                    }
                } else {
                    s.pos = target
                    moved++
                }
            })
        }
        if (!moved) break
    }

    // --- emit
    const sideFraction = (side: Side, f: number) =>
        side === "L"
            ? { x: 0, y: f }
            : side === "R"
              ? { x: 1, y: f }
              : side === "T"
                ? { x: f, y: 0 }
                : { x: f, y: 1 }

    const round3 = (v: number) => Math.round(v * 1000) / 1000
    const clamp01 = (v: number) => Math.max(0.04, Math.min(0.96, v))

    /**
     * Move a port to the side the adjacent waypoint actually arrives from.
     *
     * The side is chosen before the path is known, so on a bent route the two can end up
     * disagreeing: the search settles on, say, a bottom entry while the last leg comes in
     * from above. draw.io then draws the terminal segment straight THROUGH the icon to
     * reach the far-side port — an arrow that appears to pierce the shape it points at.
     *
     * Snapping is only meaningful for a bent route: a straight one connects two aligned
     * ports and cannot pierce anything. When the waypoint sits diagonally off a corner
     * there is no single side it arrives from, so the router's original choice stands.
     */
    const snapPort = (
        n: Rect,
        adjacent: Point,
        fallback: { x: number; y: number },
    ): { x: number; y: number } => {
        const withinX = adjacent.x > n.x + 1 && adjacent.x < n.x + n.w - 1
        const withinY = adjacent.y > n.y + 1 && adjacent.y < n.y + n.h - 1
        if (withinX === withinY) return fallback
        const cx = n.x + n.w / 2
        const cy = n.y + n.h / 2
        return withinX
            ? {
                  x: clamp01((adjacent.x - n.x) / n.w),
                  y: adjacent.y <= cy ? 0 : 1,
              }
            : {
                  x: adjacent.x <= cx ? 0 : 1,
                  y: clamp01((adjacent.y - n.y) / n.h),
              }
    }

    return edges.map((e, i) => {
        const r = routes[i]
        const P = paths[i]
        // Drop points the nudge made collinear or duplicate — draw.io renders a redundant
        // waypoint as a visible kink.
        let wp: Point[] = []
        if (P && P.length > 2) {
            const kept: Point[] = [P[0]]
            for (let k = 1; k < P.length - 1; k++) {
                const prev = kept[kept.length - 1]
                const cur = P[k]
                const nxt = P[k + 1]
                const collinear =
                    (Math.abs(prev.x - cur.x) < 1 &&
                        Math.abs(cur.x - nxt.x) < 1) ||
                    (Math.abs(prev.y - cur.y) < 1 &&
                        Math.abs(cur.y - nxt.y) < 1)
                if (collinear) continue
                if (
                    Math.abs(prev.x - cur.x) < 1 &&
                    Math.abs(prev.y - cur.y) < 1
                )
                    continue
                kept.push(cur)
            }
            wp = kept.slice(1)
        }

        let exit = sideFraction(r.exitSide, frac[i].s)
        let entry = sideFraction(r.entrySide, frac[i].t)
        // On a bent route, make each port face where its leg actually comes from.
        const src = rects.get(e.source)
        const tgt = rects.get(e.target)
        if (wp.length > 0) {
            if (src) exit = snapPort(src, wp[0], exit)
            if (tgt) entry = snapPort(tgt, wp[wp.length - 1], entry)
        }

        return {
            id: e.id,
            // Round both axes: the fraction lands in y for a left/right side and in x for
            // a top/bottom one.
            exit: { x: round3(exit.x), y: round3(exit.y) },
            entry: { x: round3(entry.x), y: round3(entry.y) },
            waypoints: wp,
            // Freeze only what a re-route would get wrong: a labelled bend (the label
            // needs a straight segment under it) or a deliberate detour.
            freeze: wp.length > 0 && (e.hasLabel || r.avoided),
        }
    })
}
