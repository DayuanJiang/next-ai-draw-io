/**
 * Obstacle-avoiding orthogonal routing: the orthogonal visibility graph, and A* over it.
 *
 * The router beside this file works by trying a list of candidate shapes — straight, an L, a
 * Z with its trunk in some lane — and keeping the first that is clear. That can only ever be
 * as good as the list, and a fixed list is not enough: measured over 250 generated
 * flowcharts, 347 arrows were drawn through a box that had nothing to do with them. Adding
 * shapes to the list moves the failures around rather than removing them.
 *
 * This is the complete alternative, from Wybrow, Marriott & Stuckey, "Orthogonal Connector
 * Routing" (Graph Drawing 2009) — the algorithm behind libavoid. Two ideas make it work:
 *
 *   1. THE GRID IS FINITE AND SUFFICIENT. Take the "interesting points": every obstacle
 *      corner and every connection point. Their x-coordinates and y-coordinates define a
 *      grid. The paper's observation, with proof: for any valid orthogonal route there is a
 *      route using only this grid that is no longer and has no more bends — shrink each
 *      segment onto the nearest grid line. So searching the grid loses nothing, and there is
 *      no resolution to tune. This is what a uniform pixel grid gets wrong in both
 *      directions at once: too coarse and it cannot fit through a narrow gap, too fine and
 *      the search explodes.
 *
 *   2. THE STATE INCLUDES THE DIRECTION OF ARRIVAL. Bends have to be paid for, and whether
 *      the next step is a bend depends on which way this one came in. So a search state is
 *      (point, incoming direction), not just (point). Without that the cost function cannot
 *      see bends at all.
 *
 * The heuristic is the one libavoid uses: Manhattan distance to the target plus the minimum
 * number of bends still needed, times the bend cost. It never overestimates — the remaining
 * path is at least the straight-line Manhattan distance, and it must contain at least that
 * many bends — so A* returns a cheapest route, not merely a route.
 *
 * Written from the paper's description rather than ported: the reference implementation is a
 * C++ library built for interactive re-routing, with incremental scanline updates and pin
 * management that a one-shot XML generator has no use for.
 */

import type { Rect } from "./types"

export interface Point {
    x: number
    y: number
}

/** Which way a path segment travels. Indices are used as array offsets. */
const DIRS = [
    { dx: 0, dy: -1 }, // 0 north
    { dx: 1, dy: 0 }, // 1 east
    { dx: 0, dy: 1 }, // 2 south
    { dx: -1, dy: 0 }, // 3 west
] as const

/**
 * Cost of one bend, in pixels of path length.
 *
 * libavoid's default is 10. It has to be positive or the search has no reason to prefer a
 * straight line to a staircase of the same length, and the two look nothing alike.
 */
const BEND_COST = 10

/** Clearance kept around an obstacle, matching the router's own margin. */
const MARGIN = 7

/**
 * Does the segment from `p` to `q` pass through any obstacle?
 *
 * Obstacles are expanded by `MARGIN` first, so a route grazing a border counts as a hit —
 * an arrow drawn hard against a box reads as touching it.
 */
function blocked(p: Point, q: Point, obstacles: Rect[]): boolean {
    const lo = { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y) }
    const hi = { x: Math.max(p.x, q.x), y: Math.max(p.y, q.y) }
    for (const r of obstacles) {
        if (
            lo.x < r.x + r.w + MARGIN &&
            hi.x > r.x - MARGIN &&
            lo.y < r.y + r.h + MARGIN &&
            hi.y > r.y - MARGIN
        )
            return true
    }
    return false
}

/**
 * The minimum number of bends to get from `p`, travelling in direction `d`, to `t`.
 *
 * This is the table in the paper's Figure 2(a), as an arithmetic rule rather than sixteen
 * cases. Two independent questions: is the target ahead along the current axis, and is it
 * off to the side? Each answer costs bends, and they compose.
 */
function bendsToTarget(p: Point, d: number, t: Point): number {
    const { dx, dy } = DIRS[d]
    // How far the target lies along the direction of travel, and across it.
    const along = dx !== 0 ? (t.x - p.x) * dx : (t.y - p.y) * dy
    const across = dx !== 0 ? t.y - p.y : t.x - p.x
    if (across === 0) {
        // Dead ahead: no bend. Directly behind: out and back, two bends.
        return along >= 0 ? 0 : 2
    }
    // Off to the side: one bend if it is also ahead, two if it is behind.
    return along > 0 ? 1 : 2
}

/**
 * A cheapest obstacle-free orthogonal path from `from` to `to`, or null if none exists.
 *
 * `startDir` and `endDir` are the directions the path must leave and arrive by — the side of
 * the shape each end attaches to. Constraining them is what stops an arrow leaving a box and
 * immediately turning back across it: a departure direction the search must honour on its
 * first step cannot double back.
 *
 * `extraLanes` lets the caller add grid lines the obstacles alone would not produce, which
 * matters when a port sits somewhere other than an obstacle corner.
 */
export function routeOrthogonal(
    from: Point,
    to: Point,
    startDir: number,
    endDir: number,
    obstacles: Rect[],
    extraLanes: { xs: number[]; ys: number[] } = { xs: [], ys: [] },
): Point[] | null {
    // --- the interesting-points grid
    const xs = new Set<number>([from.x, to.x, ...extraLanes.xs])
    const ys = new Set<number>([from.y, to.y, ...extraLanes.ys])
    for (const r of obstacles) {
        // Just outside each edge, so a lane hugging an obstacle is still usable.
        xs.add(r.x - MARGIN - 1)
        xs.add(r.x + r.w + MARGIN + 1)
        ys.add(r.y - MARGIN - 1)
        ys.add(r.y + r.h + MARGIN + 1)
    }
    const X = [...xs].sort((a, b) => a - b)
    const Y = [...ys].sort((a, b) => a - b)
    const xi = new Map(X.map((v, i) => [v, i]))
    const yi = new Map(Y.map((v, i) => [v, i]))

    const sx = xi.get(from.x)
    const sy = yi.get(from.y)
    const tx = xi.get(to.x)
    const ty = yi.get(to.y)
    if (sx == null || sy == null || tx == null || ty == null) return null

    // --- A* over (grid point, incoming direction)
    const key = (ix: number, iy: number, d: number) =>
        (iy * X.length + ix) * 4 + d
    const best = new Map<number, number>()
    const parent = new Map<number, number>()
    // A binary heap would be tidier, but the frontier stays small on diagram-sized inputs and
    // a sorted insert keeps this readable.
    const open: { ix: number; iy: number; d: number; g: number; f: number }[] =
        []
    const push = (ix: number, iy: number, d: number, g: number, f: number) => {
        let lo = 0
        let hi = open.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (open[mid].f > f) lo = mid + 1
            else hi = mid
        }
        open.splice(lo, 0, { ix, iy, d, g, f })
    }

    const h = (ix: number, iy: number, d: number) =>
        Math.abs(X[ix] - to.x) +
        Math.abs(Y[iy] - to.y) +
        bendsToTarget({ x: X[ix], y: Y[iy] }, d, to) * BEND_COST

    const startKey = key(sx, sy, startDir)
    best.set(startKey, 0)
    push(sx, sy, startDir, 0, h(sx, sy, startDir))

    // The path must ARRIVE travelling in `endDir`, so that is the only accepting state.
    const goalKey = key(tx, ty, endDir)
    let found = false

    while (open.length > 0) {
        const cur = open.pop() as {
            ix: number
            iy: number
            d: number
            g: number
            f: number
        }
        const ck = key(cur.ix, cur.iy, cur.d)
        if (cur.g > (best.get(ck) ?? Number.POSITIVE_INFINITY)) continue
        if (ck === goalKey) {
            found = true
            break
        }

        const here = { x: X[cur.ix], y: Y[cur.iy] }
        for (let nd = 0; nd < 4; nd++) {
            // No reversing: it can never help, and it lets a path retrace itself.
            if (nd === (cur.d + 2) % 4) continue
            const { dx, dy } = DIRS[nd]
            // Step to the NEXT grid line in this direction — the grid's whole point is that
            // intermediate positions cannot change whether a route is clear.
            const nix = cur.ix + dx
            const niy = cur.iy + dy
            if (nix < 0 || nix >= X.length || niy < 0 || niy >= Y.length)
                continue
            const next = { x: X[nix], y: Y[niy] }
            if (blocked(here, next, obstacles)) continue

            const step = Math.abs(next.x - here.x) + Math.abs(next.y - here.y)
            const g = cur.g + step + (nd === cur.d ? 0 : BEND_COST)
            const nk = key(nix, niy, nd)
            if (g >= (best.get(nk) ?? Number.POSITIVE_INFINITY)) continue
            best.set(nk, g)
            parent.set(nk, ck)
            push(nix, niy, nd, g, g + h(nix, niy, nd))
        }
    }

    if (!found) return null

    // --- rebuild, then drop the points that are not bends
    const path: Point[] = []
    let node: number | undefined = goalKey
    while (node !== undefined) {
        const d = node % 4
        const rest = (node - d) / 4
        path.unshift({
            x: X[rest % X.length],
            y: Y[(rest - (rest % X.length)) / X.length],
        })
        node = parent.get(node)
    }
    return simplify(path)
}

/** Drop collinear and duplicate points: draw.io renders a redundant waypoint as a kink. */
function simplify(pts: Point[]): Point[] {
    const out: Point[] = []
    for (const p of pts) {
        const last = out[out.length - 1]
        if (last && Math.abs(last.x - p.x) < 1 && Math.abs(last.y - p.y) < 1)
            continue
        out.push(p)
    }
    const kept: Point[] = []
    for (let i = 0; i < out.length; i++) {
        if (i === 0 || i === out.length - 1) {
            kept.push(out[i])
            continue
        }
        const prev = kept[kept.length - 1]
        const next = out[i + 1]
        const collinear =
            (Math.abs(prev.x - out[i].x) < 1 &&
                Math.abs(out[i].x - next.x) < 1) ||
            (Math.abs(prev.y - out[i].y) < 1 && Math.abs(out[i].y - next.y) < 1)
        if (!collinear) kept.push(out[i])
    }
    return kept
}

/** The direction leaving a given side of a shape: away from it. */
export const SIDE_DIR = { T: 0, R: 1, B: 2, L: 3 } as const
