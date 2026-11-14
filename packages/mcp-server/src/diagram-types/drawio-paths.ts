/**
 * The path draw.io shows for a connector between two shapes, worked out
 * without draw.io. The server has no renderer, and what a connector
 * crosses depends on the path draw.io gives it.
 *
 * The rules are those of draw.io itself, ported from mxEdgeStyle.js of
 * mxGraph (Apache-2.0, github.com/jgraph/drawio, src/main/webapp/mxgraph/
 * src/view/mxEdgeStyle.js): `OrthConnector` for a connector with
 * `edgeStyle=orthogonalEdgeStyle` and no waypoints, `SegmentConnector`
 * for one with waypoints. The names of the tables and the bit masks are
 * kept as they are there, so that the two can be compared.
 */
import { type Box, styleValue } from "./cells.ts"
import type { Point, Side } from "./grid-route.ts"

/** A shape a connector ends at; `outline` when a connector meets its outline and not its box */
export interface End {
    box: Box
    outline: "rhombus" | "ellipse" | null
}

export const centreOf = (b: Box): Point => ({
    x: b.x + b.w / 2,
    y: b.y + b.h / 2,
})

/** Where the straight way from a point in a box to a point outside leaves the box */
export function leave(box: Box, from: Point, to: Point): Point {
    const dx = to.x - from.x
    const dy = to.y - from.y
    let f = 1
    if (dx > 0) f = Math.min(f, (box.x + box.w - from.x) / dx)
    if (dx < 0) f = Math.min(f, (box.x - from.x) / dx)
    if (dy > 0) f = Math.min(f, (box.y + box.h - from.y) / dy)
    if (dy < 0) f = Math.min(f, (box.y - from.y) / dy)
    f = Math.max(0, f)
    return { x: from.x + dx * f, y: from.y + dy * f }
}

/** The side of the box a point on it is nearest to; null off the box and where two sides are as near */
export function sideOf(box: Box, p: Point): Side | null {
    const far: [Side, number][] = [
        ["left", p.x - box.x],
        ["right", box.x + box.w - p.x],
        ["top", p.y - box.y],
        ["bottom", box.y + box.h - p.y],
    ]
    far.sort((a, b) => a[1] - b[1])
    if (far[0][1] < -1 || far[1][1] - far[0][1] < 1) return null
    return far[0][0]
}

/**
 * The point of a shape that a connector's style names as its end
 * (exitX and exitY, or entryX and entryY), on the shape's outline
 */
export function portOf(
    end: End,
    style: string,
    which: "exit" | "entry",
): Point | null {
    const x = styleValue(style, `${which}X`)
    const y = styleValue(style, `${which}Y`)
    if (x === undefined || y === undefined) return null
    const { box } = end
    const at = {
        x:
            box.x +
            box.w * Number(x) +
            Number(styleValue(style, `${which}Dx`) ?? 0),
        y:
            box.y +
            box.h * Number(y) +
            Number(styleValue(style, `${which}Dy`) ?? 0),
    }
    if (styleValue(style, `${which}Perimeter`) === "0") return at
    // (draw.io puts the end where the way from the middle through that
    // point meets the outline: a point on a rectangle's border stays)
    const c = centreOf(box)
    const dx = at.x - c.x
    const dy = at.y - c.y
    if (dx === 0 && dy === 0) {
        // (the middle of the shape: a rectangle's right side, a diamond's
        // lower corner, and the middle itself on an ellipse)
        return end.outline === "ellipse"
            ? at
            : end.outline === "rhombus"
              ? { x: c.x, y: box.y + box.h }
              : { x: box.x + box.w, y: c.y }
    }
    const f =
        end.outline === "rhombus"
            ? 1 / (Math.abs(dx) / (box.w / 2) + Math.abs(dy) / (box.h / 2))
            : end.outline === "ellipse"
              ? 1 / Math.hypot(dx / (box.w / 2), dy / (box.h / 2))
              : 1 /
                Math.max(Math.abs(dx) / (box.w / 2), Math.abs(dy) / (box.h / 2))
    return { x: c.x + dx * f, y: c.y + dy * f }
}

const contains = (box: Box, p: Point) =>
    p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h

/**
 * SegmentConnector: the corners between the two ends of a connector led
 * through waypoints. The stretches run sideways and up and down in turn;
 * each waypoint gives the next stretch its place. `p` and `q` are the
 * ends when the style names them, else null.
 */
function segmentPoints(
    a: Box,
    b: Box,
    p: Point | null,
    q: Point | null,
    way: Point[],
): Point[] {
    const points: Point[] = []
    const pt = { ...(p ?? centreOf(a)) }
    let horizontal = true
    let hint: Point = { ...pt }
    if (way.length > 0) {
        let hints = way.map((h) => ({ ...h }))
        const align = (h: Point, to: Point | null) => {
            if (!to) return
            if (Math.abs(h.x - to.x) < 1) h.x = to.x
            if (Math.abs(h.y - to.y) < 1) h.y = to.y
        }
        align(hints[0], p)
        align(hints[hints.length - 1], q)
        hint = hints[0]
        // Whether the first stretch runs sideways: read off the source
        // end, or else off the target end
        let term: Box | null = p ? null : a
        let fixed: Point | null = p
        let current = hint
        for (let i = 0; i < 2; i++) {
            const fixedVertAlign = fixed !== null && fixed.x === current.x
            const fixedHozAlign = fixed !== null && fixed.y === current.y
            const inHozChan =
                term !== null &&
                current.y >= term.y &&
                current.y <= term.y + term.h
            const inVertChan =
                term !== null &&
                current.x >= term.x &&
                current.x <= term.x + term.w
            const hozChan = fixedHozAlign || (fixed === null && inHozChan)
            const vertChan = fixedVertAlign || (fixed === null && inVertChan)
            if (
                !(
                    i === 0 &&
                    ((hozChan && vertChan) || (fixedVertAlign && fixedHozAlign))
                )
            ) {
                if (vertChan || hozChan) {
                    horizontal =
                        i === 1
                            ? hints.length % 2 === 0
                                ? hozChan
                                : vertChan
                            : hozChan
                    break
                }
            }
            term = q ? null : b
            fixed = q
            current = hints[hints.length - 1]
            if (fixedVertAlign && fixedHozAlign) hints = hints.slice(1)
        }
        if (
            horizontal &&
            (p ? p.y !== hint.y : hint.y < a.y || hint.y > a.y + a.h)
        ) {
            points.push({ x: pt.x, y: hint.y })
        } else if (
            !horizontal &&
            (p ? p.x !== hint.x : hint.x < a.x || hint.x > a.x + a.w)
        ) {
            points.push({ x: hint.x, y: pt.y })
        }
        if (horizontal) pt.y = hint.y
        else pt.x = hint.x
        for (const next of hints) {
            horizontal = !horizontal
            hint = next
            if (horizontal) pt.y = hint.y
            else pt.x = hint.x
            points.push({ ...pt })
        }
    }
    const end = q ?? centreOf(b)
    if (
        horizontal &&
        (q ? q.y !== hint.y : hint.y < b.y || hint.y > b.y + b.h)
    ) {
        points.push({ x: end.x, y: hint.y })
    } else if (
        !horizontal &&
        (q ? q.x !== hint.x : hint.x < b.x || hint.x > b.x + b.w)
    ) {
        points.push({ x: hint.x, y: end.y })
    }
    // (an end that is not named: the corners inside its shape fall away)
    if (!p) {
        while (points.length > 0 && contains(a, points[0])) points.shift()
    }
    if (!q) {
        while (points.length > 0 && contains(b, points[points.length - 1])) {
            points.pop()
        }
    }
    return points
}

const WEST = 1
const NORTH = 2
const SOUTH = 4
const EAST = 8
const SIDE_MASK = 480
const CENTER_MASK = 512
const SOURCE_MASK = 1024
const TARGET_MASK = 2048
const dirVectors = [
    [-1, 0],
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0],
]
const routePatterns = [
    [
        [513, 2308, 2081, 2562],
        [513, 1090, 514, 2184, 2114, 2561],
        [513, 1090, 514, 2564, 2184, 2562],
        [513, 2308, 2561, 1090, 514, 2568, 2308],
    ],
    [
        [514, 1057, 513, 2308, 2081, 2562],
        [514, 2184, 2114, 2561],
        [514, 2184, 2562, 1057, 513, 2564, 2184],
        [514, 1057, 513, 2568, 2308, 2561],
    ],
    [
        [1090, 514, 1057, 513, 2308, 2081, 2562],
        [2114, 2561],
        [1090, 2562, 1057, 513, 2564, 2184],
        [1090, 514, 1057, 513, 2308, 2561, 2568],
    ],
    [
        [2081, 2562],
        [1057, 513, 1090, 514, 2184, 2114, 2561],
        [1057, 513, 1090, 514, 2184, 2562, 2564],
        [1057, 2561, 1090, 514, 2568, 2308],
    ],
]
const reverse = (side: number) =>
    ((side & WEST) << 3) |
    ((side & NORTH) << 1) |
    ((side & SOUTH) >> 1) |
    ((side & EAST) >> 3)

/**
 * OrthConnector: the corners between the two ends of an orthogonal
 * connector without waypoints. `sourceBuffer` and `targetBuffer` are how
 * far it runs straight out of each shape (the jetty size).
 */
function orthPoints(
    a: Box,
    b: Box,
    p: Point | null,
    q: Point | null,
    sourceBuffer: number,
    targetBuffer: number,
): Point[] {
    if (a.w === 0 || a.h === 0 || b.w === 0 || b.h === 0) return []
    const totalBuffer = sourceBuffer + targetBuffer
    const geo = [
        [a.x, a.y, a.w, a.h],
        [b.x, b.y, b.w, b.h],
    ]
    const buffer = [sourceBuffer, targetBuffer]
    const limits = [
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]
    for (let i = 0; i < 2; i++) {
        limits[i][1] = geo[i][0] - buffer[i]
        limits[i][2] = geo[i][1] - buffer[i]
        limits[i][4] = geo[i][0] + geo[i][2] + buffer[i]
        limits[i][8] = geo[i][1] + geo[i][3] + buffer[i]
    }
    // Which quarter around the source the target lies in
    const dx = a.x + a.w / 2 - (b.x + b.w / 2)
    const dy = a.y + a.h / 2 - (b.y + b.h / 2)
    let quad = 0
    if (dx < 0) {
        quad = dy < 0 ? 2 : 1
    } else if (dy <= 0) {
        quad = dx === 0 ? 2 : 3
    }
    // The side each end leaves by: the side a named end lies on
    const dir = [0, 0]
    const constraint = [
        [0.5, 0.5],
        [0.5, 0.5],
    ]
    const named = [p, q]
    for (let i = 0; i < 2; i++) {
        const at = named[i]
        if (!at) continue
        constraint[i][0] = (at.x - geo[i][0]) / geo[i][2]
        if (Math.abs(at.x - geo[i][0]) <= 1) dir[i] = WEST
        else if (Math.abs(at.x - geo[i][0] - geo[i][2]) <= 1) dir[i] = EAST
        constraint[i][1] = (at.y - geo[i][1]) / geo[i][3]
        if (Math.abs(at.y - geo[i][1]) <= 1) dir[i] = NORTH
        else if (Math.abs(at.y - geo[i][1] - geo[i][3]) <= 1) dir[i] = SOUTH
    }
    const sourceTopDist = geo[0][1] - (geo[1][1] + geo[1][3])
    const sourceLeftDist = geo[0][0] - (geo[1][0] + geo[1][2])
    const sourceBottomDist = geo[1][1] - (geo[0][1] + geo[0][3])
    const sourceRightDist = geo[1][0] - (geo[0][0] + geo[0][2])
    const vertexSeperations = [0, 0, 0, 0, 0]
    vertexSeperations[1] = Math.max(sourceLeftDist - totalBuffer, 0)
    vertexSeperations[2] = Math.max(sourceTopDist - totalBuffer, 0)
    vertexSeperations[4] = Math.max(sourceBottomDist - totalBuffer, 0)
    vertexSeperations[3] = Math.max(sourceRightDist - totalBuffer, 0)
    // Else the side that faces the other shape, sideways or up and down
    const horPref = [sourceLeftDist >= sourceRightDist ? WEST : EAST, 0]
    const vertPref = [sourceTopDist >= sourceBottomDist ? NORTH : SOUTH, 0]
    horPref[1] = reverse(horPref[0])
    vertPref[1] = reverse(vertPref[0])
    const preferredHorizDist = Math.max(sourceLeftDist, sourceRightDist)
    const preferredVertDist = Math.max(sourceTopDist, sourceBottomDist)
    const prefOrdering = [
        [0, 0],
        [0, 0],
    ]
    let preferredOrderSet = false
    for (let i = 0; i < 2; i++) {
        if (dir[i] !== 0) continue
        prefOrdering[i][0] = vertPref[i]
        prefOrdering[i][1] = horPref[i]
    }
    if (preferredVertDist > 0 && preferredHorizDist > 0) {
        prefOrdering[0][0] = horPref[0]
        prefOrdering[0][1] = vertPref[0]
        prefOrdering[1][0] = vertPref[1]
        prefOrdering[1][1] = horPref[1]
        preferredOrderSet = true
    }
    if (preferredVertDist > 0 && !preferredOrderSet) {
        prefOrdering[0][0] = vertPref[0]
        prefOrdering[0][1] = horPref[0]
        prefOrdering[1][0] = vertPref[1]
        prefOrdering[1][1] = horPref[1]
        preferredOrderSet = true
    }
    if (preferredHorizDist > 0 && !preferredOrderSet) {
        prefOrdering[0][0] = horPref[0]
        prefOrdering[0][1] = vertPref[0]
        prefOrdering[1][0] = horPref[1]
        prefOrdering[1][1] = vertPref[1]
    }
    for (let i = 0; i < 2; i++) {
        if (dir[i] !== 0) continue
        let dirPref = prefOrdering[i][0]
        dirPref |= prefOrdering[i][1] << 8
        dirPref |= prefOrdering[1 - i][i] << 16
        dirPref |= prefOrdering[1 - i][1 - i] << 24
        if ((dirPref & 0xf) === 0) dirPref = dirPref << 8
        if ((dirPref & 0xf00) === 0) dirPref = (dirPref & 0xf) | (dirPref >> 8)
        if ((dirPref & 0xf0000) === 0) {
            dirPref = (dirPref & 0xffff) | ((dirPref & 0xf000000) >> 8)
        }
        dir[i] = dirPref & 0xf
    }
    let sourceIndex = dir[0] === EAST ? 3 : dir[0]
    let targetIndex = dir[1] === EAST ? 3 : dir[1]
    sourceIndex -= quad
    targetIndex -= quad
    if (sourceIndex < 1) sourceIndex += 4
    if (targetIndex < 1) targetIndex += 4
    const routePattern = routePatterns[sourceIndex - 1]?.[targetIndex - 1]
    if (!routePattern) return []
    const wayPoints1 = Array.from({ length: 12 }, () => [0, 0])
    wayPoints1[0][0] = geo[0][0]
    wayPoints1[0][1] = geo[0][1]
    switch (dir[0]) {
        case WEST:
            wayPoints1[0][0] -= sourceBuffer
            wayPoints1[0][1] += constraint[0][1] * geo[0][3]
            break
        case SOUTH:
            wayPoints1[0][0] += constraint[0][0] * geo[0][2]
            wayPoints1[0][1] += geo[0][3] + sourceBuffer
            break
        case EAST:
            wayPoints1[0][0] += geo[0][2] + sourceBuffer
            wayPoints1[0][1] += constraint[0][1] * geo[0][3]
            break
        case NORTH:
            wayPoints1[0][0] += constraint[0][0] * geo[0][2]
            wayPoints1[0][1] -= sourceBuffer
            break
    }
    let currentIndex = 0
    let lastOrientation = (dir[0] & (EAST | WEST)) > 0 ? 0 : 1
    const initialOrientation = lastOrientation
    let currentOrientation = 0
    for (const step of routePattern) {
        const nextDirection = step & 0xf
        let directionIndex = nextDirection === EAST ? 3 : nextDirection
        directionIndex += quad
        if (directionIndex > 4) directionIndex -= 4
        const direction = dirVectors[directionIndex - 1]
        currentOrientation = directionIndex % 2 > 0 ? 0 : 1
        if (currentOrientation !== lastOrientation) {
            currentIndex++
            wayPoints1[currentIndex][0] = wayPoints1[currentIndex - 1][0]
            wayPoints1[currentIndex][1] = wayPoints1[currentIndex - 1][1]
        }
        const tar = (step & TARGET_MASK) > 0
        const sou = (step & SOURCE_MASK) > 0
        let side = (step & SIDE_MASK) >> 5
        side = side << quad
        if (side > 0xf) side = side >> 4
        const center = (step & CENTER_MASK) > 0
        if ((sou || tar) && side < 9) {
            const souTar = sou ? 0 : 1
            let limit = limits[souTar][side]
            if (center && currentOrientation === 0) {
                limit = geo[souTar][0] + constraint[souTar][0] * geo[souTar][2]
            } else if (center) {
                limit = geo[souTar][1] + constraint[souTar][1] * geo[souTar][3]
            }
            if (currentOrientation === 0) {
                const deltaX =
                    (limit - wayPoints1[currentIndex][0]) * direction[0]
                if (deltaX > 0) {
                    wayPoints1[currentIndex][0] += direction[0] * deltaX
                }
            } else {
                const deltaY =
                    (limit - wayPoints1[currentIndex][1]) * direction[1]
                if (deltaY > 0) {
                    wayPoints1[currentIndex][1] += direction[1] * deltaY
                }
            }
        } else if (center) {
            const half = Math.abs(vertexSeperations[directionIndex] / 2)
            wayPoints1[currentIndex][0] += direction[0] * half
            wayPoints1[currentIndex][1] += direction[1] * half
        }
        if (
            currentIndex > 0 &&
            wayPoints1[currentIndex][currentOrientation] ===
                wayPoints1[currentIndex - 1][currentOrientation]
        ) {
            currentIndex--
        } else {
            lastOrientation = currentOrientation
        }
    }
    const result: Point[] = []
    for (let i = 0; i <= currentIndex; i++) {
        if (i === currentIndex) {
            const targetOrientation = (dir[1] & (EAST | WEST)) > 0 ? 0 : 1
            const sameOrient = targetOrientation === initialOrientation ? 0 : 1
            if (sameOrient !== (currentIndex + 1) % 2) break
        }
        const next = {
            x: Math.round(wayPoints1[i][0] * 10) / 10,
            y: Math.round(wayPoints1[i][1] * 10) / 10,
        }
        const last = result[result.length - 1]
        if (!last || last.x !== next.x || last.y !== next.y) result.push(next)
    }
    return result
}

/** Where an end that the style does not name meets its shape: straight across from the next corner when that lies beside the shape */
function floatingEnd(box: Box, next: Point): Point {
    const c = centreOf(box)
    if (next.x >= box.x && next.x <= box.x + box.w) {
        return { x: next.x, y: next.y < c.y ? box.y : box.y + box.h }
    }
    if (next.y >= box.y && next.y <= box.y + box.h) {
        return { x: next.x < c.x ? box.x : box.x + box.w, y: next.y }
    }
    return leave(box, c, next)
}

/**
 * The path of a connector from shape `a` to shape `b` as draw.io shows
 * it, from its style and its waypoints (on the page). Null for an edge
 * style whose rules are not here (elbow, entity relation, isometric).
 */
export function drawnPath(
    a: End,
    b: End,
    style: string,
    way: Point[],
): Point[] | null {
    const p = portOf(a, style, "exit")
    const q = portOf(b, style, "entry")
    const kind = styleValue(style, "edgeStyle")
    if (!kind || kind === "none") {
        // Straight from corner to corner
        const first = way[0] ?? q ?? centreOf(b.box)
        const last = way[way.length - 1] ?? p ?? centreOf(a.box)
        return [
            p ?? leave(a.box, centreOf(a.box), first),
            ...way,
            q ?? leave(b.box, centreOf(b.box), last),
        ]
    }
    if (kind !== "orthogonalEdgeStyle" && kind !== "segmentEdgeStyle") {
        return null
    }
    const jetty = (source: boolean): number => {
        const value =
            styleValue(style, source ? "sourceJettySize" : "targetJettySize") ??
            styleValue(style, "jettySize")
        if (value === undefined) return 10
        if (value !== "auto") return Number(value) || 0
        const arrow =
            styleValue(style, source ? "startArrow" : "endArrow") ??
            (source ? "none" : "classic")
        if (arrow === "none") return 20
        const size = Number(
            styleValue(style, source ? "startSize" : "endSize") ?? 6,
        )
        return Math.max(2, Math.ceil((size + 10) / 10)) * 10
    }
    const sourceBuffer = jetty(true)
    const targetBuffer = jetty(false)
    // (two named ends closer than the two straight starts together are
    // joined the simple way, as a connector through no waypoints)
    const tooShort =
        p !== null &&
        q !== null &&
        (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < (sourceBuffer + targetBuffer) ** 2
    const between =
        way.length > 0 || kind === "segmentEdgeStyle" || tooShort
            ? segmentPoints(a.box, b.box, p, q, way)
            : orthPoints(a.box, b.box, p, q, sourceBuffer, targetBuffer)
    const start = p ?? floatingEnd(a.box, between[0] ?? q ?? centreOf(b.box))
    const end = q ?? floatingEnd(b.box, between[between.length - 1] ?? start)
    return [start, ...between, end]
}
