/**
 * Shapes on a grid and the lines between them, for diagrams whose shapes
 * stand in rows and columns (the steps of a swimlane diagram).
 *
 * Between two rows and between two columns there is a gap that no shape
 * reaches into. A line leaves its shape by the middle of a side, runs in
 * the gaps and enters its target by the middle of a side, so it never runs
 * through a shape. Lines that would lie on each other in one gap get a
 * track each; a gap grows with its tracks. A label is put at the first
 * place along its own line where it covers no shape, no other line and no
 * other label.
 *
 * The flow runs downwards: a line to a later row leaves by the bottom and
 * enters by the top. For a flow to the right the caller swaps x and y.
 */

export type Side = "top" | "bottom" | "left" | "right"

export interface Point {
    x: number
    y: number
}

export interface GridNode {
    id: string
    col: number
    row: number
    w: number
    h: number
    /** A decision: each of its branches leaves by a corner of its own */
    diamond: boolean
}

export interface GridEdge {
    id: string
    source: string
    target: string
    /** The sizes of the texts on the line */
    labels: { w: number; h: number }[]
    /** Drawn straight from shape to shape by the caller: it gets no path here */
    straight?: boolean
}

export interface GridOptions {
    /** The gap between two rows, and between two columns */
    rowGap: number
    colGap: number
    /** Columns before which a lane ends: the gap is wider, and no line runs in its middle, where the lane's border is */
    boundaries: Set<number>
    boundaryGap: number
    /** The same for gaps between rows: a border of a frame lies in their middle */
    rowBoundaries?: Set<number>
    /** The least thickness of single gaps: between rows, between columns */
    minRowGap?: Map<number, number>
    minColGap?: Map<number, number>
    /** The gaps around the whole grid: above and below, and at the sides */
    outerRowGap: number
    outerColGap: number
    /** How many columns there are, when the last ones may be empty, and how wide an empty one is */
    cols?: number
    emptyColW?: number
    /** The least width of each column, where its shapes are narrower than what stands over it */
    minColW?: number[]
    /** The distance between two lines in one gap */
    track: number
}

export interface RoutedEdge {
    exit: Side
    entry: Side
    /** The corners of the line, between its two ends */
    points: Point[]
    /** Per label: where it stands along the line (-1 at the source, 1 at the target) and how far beside that point */
    labels: { along: number; dx: number; dy: number }[]
}

export interface GridLayout {
    width: number
    height: number
    /** Where each gap between columns starts and how wide it is: one more than there are columns */
    gapX: number[]
    gapW: number[]
    gapY: number[]
    gapH: number[]
    /** The top left corner of every shape */
    nodes: Map<string, Point>
    edges: Map<string, RoutedEdge>
}

/** A stretch of a line inside one gap */
interface Leg {
    edge: string
    /** "H": a gap between rows, the line runs sideways. "V": between columns */
    gap: "H" | "V"
    index: number
    /** The stretch, in columns (H) or rows (V); a gap lies half a step before its row or column */
    from: number
    to: number
    /** Lines from one side of a shape, or into one, may share a track */
    keys: string[]
    track: number
}

interface Plan {
    exit: Side
    entry: Side
    legs: Leg[]
}

const overlap = (a: Leg, b: Leg) =>
    Math.max(Math.min(a.from, a.to), Math.min(b.from, b.to)) <=
    Math.min(Math.max(a.from, a.to), Math.max(b.from, b.to))

/** The legs of one gap get the lowest track that is free along their stretch */
function assignTracks(legs: Leg[]): number {
    const tracks: Leg[][] = []
    const ordered = [...legs].sort(
        (a, b) => Math.min(a.from, a.to) - Math.min(b.from, b.to),
    )
    for (const leg of ordered) {
        let t = tracks.findIndex((others) =>
            others.every(
                (other) =>
                    !overlap(leg, other) ||
                    leg.keys.some((key) => other.keys.includes(key)),
            ),
        )
        if (t < 0) t = tracks.push([]) - 1
        tracks[t].push(leg)
        leg.track = t
    }
    return tracks.length
}

const boxesTouch = (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number },
) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Whether the straight way from p to q passes through the box */
export function stretchInBox(
    p: Point,
    q: Point,
    box: { x: number; y: number; w: number; h: number },
) {
    let t0 = 0
    let t1 = 1
    const dx = q.x - p.x
    const dy = q.y - p.y
    // (the part of the way inside one pair of the box's sides after the other)
    const clip = (step: number, room: number) => {
        if (step === 0) return room > 0
        const r = room / step
        if (step < 0) {
            if (r > t1) return false
            if (r > t0) t0 = r
        } else {
            if (r < t0) return false
            if (r < t1) t1 = r
        }
        return true
    }
    return (
        clip(-dx, p.x - box.x) &&
        clip(dx, box.x + box.w - p.x) &&
        clip(-dy, p.y - box.y) &&
        clip(dy, box.y + box.h - p.y) &&
        t0 < t1
    )
}

export function layoutGrid(
    nodes: GridNode[],
    lines: GridEdge[],
    opt: GridOptions,
): GridLayout {
    const edges = lines.filter((line) => !line.straight)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const cols = opt.cols ?? Math.max(...nodes.map((n) => n.col)) + 1
    const rows = Math.max(...nodes.map((n) => n.row)) + 1
    const taken = new Set(nodes.map((n) => `${n.col},${n.row}`))
    /** No shape in this column between the two rows (both excluded) */
    const freeColumn = (col: number, r1: number, r2: number) => {
        for (let r = Math.min(r1, r2) + 1; r < Math.max(r1, r2); r++) {
            if (taken.has(`${col},${r}`)) return false
        }
        return true
    }
    const freeRow = (row: number, c1: number, c2: number) => {
        for (let c = Math.min(c1, c2) + 1; c < Math.max(c1, c2); c++) {
            if (taken.has(`${c},${row}`)) return false
        }
        return true
    }

    // Which side each line leaves by. A decision sends its branch straight
    // on from the bottom and its other branches from the corners beside
    const forward = new Map<string, GridEdge[]>()
    for (const edge of edges) {
        const s = byId.get(edge.source)
        const t = byId.get(edge.target)
        if (s && t && t.row > s.row) {
            forward.set(s.id, [...(forward.get(s.id) ?? []), edge])
        }
    }
    const straightOn = new Map<string, string>()
    for (const [id, out] of forward) {
        const s = byId.get(id) as GridNode
        if (!s.diamond || out.length < 2) continue
        const column = (e: GridEdge) => (byId.get(e.target) as GridNode).col
        const row = (e: GridEdge) => (byId.get(e.target) as GridNode).row
        const main = [...out].sort(
            (a, b) =>
                Math.abs(column(a) - s.col) - Math.abs(column(b) - s.col) ||
                row(a) - row(b),
        )[0]
        straightOn.set(id, main.id)
    }

    // Which side each line leaves by, for all lines first: where a line
    // enters depends on the sides its target's own lines leave by
    const exits = new Map<string, Side>()
    for (const edge of edges) {
        const s = byId.get(edge.source)
        const t = byId.get(edge.target)
        if (!s || !t || s === t) continue
        const beside: Side = t.col > s.col ? "right" : "left"
        if (t.row > s.row) {
            const branch =
                straightOn.has(s.id) &&
                straightOn.get(s.id) !== edge.id &&
                t.col !== s.col
            exits.set(edge.id, branch ? beside : "bottom")
        } else if (t.row === s.row) {
            exits.set(edge.id, freeRow(s.row, s.col, t.col) ? beside : "bottom")
        } else if (
            t.col === s.col &&
            freeColumn(s.col, s.row, t.row) &&
            !edges.some(
                (e) =>
                    // (a line the straight one would lie on: one into the
                    // source from above, one out of the target downwards)
                    (e.target === s.id &&
                        (byId.get(e.source)?.row ?? s.row) < s.row) ||
                    (e.source === t.id &&
                        (byId.get(e.target)?.row ?? t.row) > t.row),
            )
        ) {
            // Back to the shape straight above, as a drawing whose flow
            // turns round has it
            exits.set(edge.id, "top")
        } else {
            // Back to an earlier row: up the gap beside the shape
            exits.set(edge.id, t.col === s.col ? "right" : beside)
        }
    }
    const leavesBy = (node: string, side: Side, but?: string) =>
        edges.some(
            (e) =>
                e.id !== but && e.source === node && exits.get(e.id) === side,
        )
    for (const edge of edges) {
        const s = byId.get(edge.source)
        const t = byId.get(edge.target)
        // A line back within its column takes the side that is still free
        if (
            s &&
            t &&
            s !== t &&
            t.row < s.row &&
            t.col === s.col &&
            exits.get(edge.id) === "right"
        ) {
            if (leavesBy(s.id, "right", edge.id)) exits.set(edge.id, "left")
        }
    }

    const plans = new Map<string, Plan>()
    const legs: Leg[] = []
    const leg = (edge: string, gap: "H" | "V", index: number): Leg => ({
        edge,
        gap,
        index,
        from: 0,
        to: 0,
        keys: [],
        track: 0,
    })
    for (const edge of edges) {
        const s = byId.get(edge.source)
        const t = byId.get(edge.target)
        const exit = exits.get(edge.id)
        if (!s || !t || !exit) continue
        const plan: Plan = { exit, entry: "top", legs: [] }
        const H = (index: number) => leg(edge.id, "H", index)
        const V = (index: number) => leg(edge.id, "V", index)
        if (t.row > s.row) {
            if (exit !== "bottom") {
                // From the corner beside: straight across and down when
                // nothing stands there, else down the gap beside
                const clear =
                    freeRow(s.row, s.col, t.col) &&
                    !taken.has(`${t.col},${s.row}`) &&
                    freeColumn(t.col, s.row, t.row)
                if (!clear) {
                    plan.legs = [
                        V(exit === "right" ? s.col + 1 : s.col),
                        H(t.row),
                    ]
                }
            } else if (t.row === s.row + 1) {
                if (t.col !== s.col) plan.legs = [H(t.row)]
            } else if (t.col === s.col && freeColumn(s.col, s.row, t.row)) {
                // Straight down past empty places
            } else if (freeColumn(s.col, s.row, t.row)) {
                plan.legs = [H(t.row)]
            } else if (freeColumn(t.col, s.row, t.row)) {
                plan.legs = [H(s.row + 1)]
            } else {
                const beside = t.col >= s.col ? s.col + 1 : s.col
                plan.legs = [H(s.row + 1), V(beside), H(t.row)]
            }
        } else if (t.row === s.row) {
            if (exit === "bottom") {
                plan.entry = "bottom"
                plan.legs = [H(s.row + 1)]
            } else {
                plan.entry = exit === "right" ? "left" : "right"
            }
        } else if (exit === "top") {
            plan.entry = "bottom"
        } else {
            // Into the side of the target that faces the gap, when the
            // target stands at that gap and sends no line of its own from
            // that side; else over the target and in by its top
            const gap = exit === "right" ? s.col + 1 : s.col
            const facing: Side | null =
                t.col === s.col
                    ? exit
                    : t.col === gap
                      ? "left"
                      : t.col === gap - 1
                        ? "right"
                        : null
            if (facing && !leavesBy(t.id, facing)) {
                plan.entry = facing
                plan.legs = [V(gap)]
            } else {
                plan.legs = [V(gap), H(t.row)]
            }
        }
        // The stretch of every leg, from the end of the one before to the
        // start of the next
        plan.legs.forEach((l, i) => {
            const before = plan.legs[i - 1]
            const after = plan.legs[i + 1]
            if (l.gap === "H") {
                l.from = before ? before.index - 0.5 : s.col
                l.to = after ? after.index - 0.5 : t.col
            } else {
                l.from = before ? before.index - 0.5 : s.row
                l.to = after ? after.index - 0.5 : t.row
            }
        })
        if (plan.legs.length > 0) {
            plan.legs[0].keys.push(`from ${s.id} ${plan.exit}`)
            plan.legs[plan.legs.length - 1].keys.push(
                `to ${t.id} ${plan.entry}`,
            )
        }
        plans.set(edge.id, plan)
        legs.push(...plan.legs)
    }

    // The gaps: as thick as their tracks need. A line with a text starts
    // with a stretch as long as the text, kept free of tracks: a band on
    // the side of the gap where the line's shape is
    const bandBefore = {
        H: new Map<number, number>(),
        V: new Map<number, number>(),
    }
    const bandAfter = {
        H: new Map<number, number>(),
        V: new Map<number, number>(),
    }
    for (const edge of edges) {
        const plan = plans.get(edge.id)
        const s = byId.get(edge.source)
        if (!plan || !s || edge.labels.length === 0) continue
        const upright = plan.exit === "top" || plan.exit === "bottom"
        const need = Math.min(
            130,
            Math.max(...edge.labels.map((l) => (upright ? l.h : l.w))) + 8,
        )
        const [bands, index] =
            plan.exit === "bottom"
                ? [bandBefore.H, s.row + 1]
                : plan.exit === "top"
                  ? [bandAfter.H, s.row]
                  : plan.exit === "right"
                    ? [bandBefore.V, s.col + 1]
                    : [bandAfter.V, s.col]
        bands.set(index, Math.max(bands.get(index) ?? 0, need))
    }
    const size = (kind: "H" | "V", count: number) => {
        const starts: number[] = []
        const thick: number[] = []
        const slots: number[] = []
        const bands: number[] = []
        const room: number[] = []
        for (let i = 0; i <= count; i++) {
            const own = legs.filter((l) => l.gap === kind && l.index === i)
            let n = assignTracks(own)
            const outer = i === 0 || i === count
            const boundary =
                kind === "V"
                    ? opt.boundaries.has(i)
                    : (opt.rowBoundaries?.has(i) ?? false)
            // (an even number of places leaves the middle free)
            if (boundary && n % 2 === 1) n += 1
            const least = Math.max(
                (kind === "H" ? opt.minRowGap : opt.minColGap)?.get(i) ?? 0,
                outer
                    ? kind === "H"
                        ? opt.outerRowGap
                        : opt.outerColGap
                    : boundary
                      ? opt.boundaryGap
                      : kind === "H"
                        ? opt.rowGap
                        : opt.colGap,
            )
            const before = bandBefore[kind].get(i) ?? 0
            const after = bandAfter[kind].get(i) ?? 0
            const total = Math.max(
                least,
                before + after + (n > 0 ? (n + 1) * opt.track : 0),
            )
            slots.push(n)
            bands.push(before)
            room.push(total - before - after)
            thick.push(total)
            starts.push(0)
        }
        return { starts, thick, slots, bands, room }
    }
    const h = size("H", rows)
    const v = size("V", cols)

    const colW = Array.from({ length: cols }, (_, c) => {
        const own = nodes.filter((n) => n.col === c)
        return Math.max(
            opt.minColW?.[c] ?? 0,
            own.length > 0
                ? Math.max(...own.map((n) => n.w))
                : (opt.emptyColW ?? 0),
        )
    })
    const rowH = Array.from({ length: rows }, (_, r) =>
        Math.max(...nodes.filter((n) => n.row === r).map((n) => n.h), 0),
    )
    const colX: number[] = []
    let x = 0
    for (let c = 0; c <= cols; c++) {
        v.starts[c] = x
        x += v.thick[c]
        if (c < cols) {
            colX.push(x)
            x += colW[c]
        }
    }
    const rowY: number[] = []
    let y = 0
    for (let r = 0; r <= rows; r++) {
        h.starts[r] = y
        y += h.thick[r]
        if (r < rows) {
            rowY.push(y)
            y += rowH[r]
        }
    }
    const trackAt = (l: Leg) => {
        const g = l.gap === "H" ? h : v
        return (
            g.starts[l.index] +
            g.bands[l.index] +
            ((l.track + 1) * g.room[l.index]) / (g.slots[l.index] + 1)
        )
    }

    const place = new Map<string, Point>()
    const boxes: { id: string; x: number; y: number; w: number; h: number }[] =
        []
    for (const n of nodes) {
        const at = {
            x: colX[n.col] + (colW[n.col] - n.w) / 2,
            y: rowY[n.row] + (rowH[n.row] - n.h) / 2,
        }
        place.set(n.id, at)
        boxes.push({ id: n.id, ...at, w: n.w, h: n.h })
    }
    const port = (n: GridNode, side: Side): Point => {
        const at = place.get(n.id) as Point
        return {
            x: at.x + (side === "left" ? 0 : side === "right" ? n.w : n.w / 2),
            y: at.y + (side === "top" ? 0 : side === "bottom" ? n.h : n.h / 2),
        }
    }

    // Every line as the points it runs through, its two ends included
    const paths = new Map<string, Point[]>()
    for (const edge of edges) {
        const plan = plans.get(edge.id)
        if (!plan) continue
        const s = byId.get(edge.source) as GridNode
        const t = byId.get(edge.target) as GridNode
        const end = port(t, plan.entry)
        const path = [port(s, plan.exit)]
        const last = () => path[path.length - 1]
        plan.legs.forEach((l, i) => {
            const after = plan.legs[i + 1]
            if (l.gap === "H") {
                const at = trackAt(l)
                path.push({ x: last().x, y: at })
                path.push({ x: after ? trackAt(after) : end.x, y: at })
            } else {
                const at = trackAt(l)
                path.push({ x: at, y: last().y })
                path.push({ x: at, y: after ? trackAt(after) : end.y })
            }
        })
        if (last().x !== end.x && last().y !== end.y) {
            const upright = plan.entry === "top" || plan.entry === "bottom"
            path.push(
                upright ? { x: end.x, y: last().y } : { x: last().x, y: end.y },
            )
        }
        path.push(end)
        // Only the corners: no point twice, none on the straight way
        // between its neighbours
        const corners: Point[] = []
        path.forEach((p, i) => {
            const a = corners[corners.length - 1]
            if (a && a.x === p.x && a.y === p.y) return
            const before = corners[corners.length - 2]
            if (
                before &&
                i < path.length &&
                ((before.x === a.x && a.x === p.x) ||
                    (before.y === a.y && a.y === p.y))
            ) {
                corners.pop()
            }
            corners.push(p)
        })
        paths.set(edge.id, corners)
    }

    // A straight line has its text in its middle. The other texts keep
    // clear of it and of the line
    const placed: { x: number; y: number; w: number; h: number }[] = []
    for (const line of lines) {
        const s = byId.get(line.source)
        const t = byId.get(line.target)
        if (!line.straight || !s || !t) continue
        const middle = (n: GridNode) => {
            const at = place.get(n.id) as Point
            return { x: at.x + n.w / 2, y: at.y + n.h / 2 }
        }
        const a = middle(s)
        const b = middle(t)
        // From where it leaves the one shape to where it reaches the other
        const leave = (n: GridNode, from: Point, to: Point) => {
            const dx = to.x - from.x
            const dy = to.y - from.y
            const f = Math.min(
                dx === 0 ? Infinity : n.w / 2 / Math.abs(dx),
                dy === 0 ? Infinity : n.h / 2 / Math.abs(dy),
                1,
            )
            return { x: from.x + dx * f, y: from.y + dy * f }
        }
        const p = leave(s, a, b)
        const q = leave(t, b, a)
        paths.set(line.id, [p, q])
        for (const label of line.labels) {
            placed.push({
                x: (p.x + q.x) / 2 - label.w / 2,
                y: (p.y + q.y) / 2 - label.h / 2,
                w: label.w,
                h: label.h,
            })
        }
    }

    // The texts: along the line from its source, at the first free place
    const routed = new Map<string, RoutedEdge>()
    for (const edge of edges) {
        const plan = plans.get(edge.id)
        const path = paths.get(edge.id)
        if (!plan || !path) continue
        const lengths = path.slice(1).map((p, i) => {
            const a = path[i]
            return Math.abs(p.x - a.x) + Math.abs(p.y - a.y)
        })
        const total = lengths.reduce((sum, l) => sum + l, 0)
        const pointAt = (d: number) => {
            let rest = d
            for (let i = 0; i < lengths.length; i++) {
                if (rest <= lengths[i] || i === lengths.length - 1) {
                    const a = path[i]
                    const b = path[i + 1]
                    const f = lengths[i] === 0 ? 0 : rest / lengths[i]
                    return {
                        x: a.x + (b.x - a.x) * f,
                        y: a.y + (b.y - a.y) * f,
                        upright: a.x === b.x,
                    }
                }
                rest -= lengths[i]
            }
            return { ...path[0], upright: true }
        }
        const shared = (at: Point) => {
            const within = (v: number, p: number, q: number) =>
                v >= Math.min(p, q) - 0.5 && v <= Math.max(p, q) + 0.5
            for (const [id, line] of paths) {
                if (id === edge.id) continue
                for (let i = 1; i < line.length; i++) {
                    const a = line[i - 1]
                    const b = line[i]
                    if (within(at.x, a.x, b.x) && within(at.y, a.y, b.y)) {
                        return true
                    }
                }
            }
            return false
        }
        const labels = edge.labels.map((label) => {
            let best = { score: Infinity, d: total / 2, dx: 0, dy: 0 }
            for (let d = 10; d <= total - 6 && best.score > 0; d += 8) {
                const at = pointAt(d)
                // On the line, then beside it on either side
                const shifts = at.upright
                    ? [0, label.w / 2 + 3, -label.w / 2 - 3].map((dx) => ({
                          dx,
                          dy: 0,
                      }))
                    : [0, -label.h / 2 - 2, label.h / 2 + 2].map((dy) => ({
                          dx: 0,
                          dy,
                      }))
                for (const shift of shifts) {
                    const box = {
                        x: at.x + shift.dx - label.w / 2,
                        y: at.y + shift.dy - label.h / 2,
                        w: label.w,
                        h: label.h,
                    }
                    let score = 0
                    for (const other of boxes) {
                        if (boxesTouch(box, other)) score += 10
                    }
                    for (const other of placed) {
                        if (boxesTouch(box, other)) score += 10
                    }
                    for (const [id, line] of paths) {
                        if (id === edge.id) continue
                        for (let i = 1; i < line.length; i++) {
                            if (stretchInBox(line[i - 1], line[i], box)) {
                                score += 3
                            }
                        }
                    }
                    // (beside the line is a little worse than on it)
                    if (shift.dx !== 0 || shift.dy !== 0) score += 0.5
                    // Where another line runs along this one, the text
                    // would not say which of the two it belongs to
                    if (shared(at)) score += 4
                    if (score < best.score) {
                        best = { score, d, dx: shift.dx, dy: shift.dy }
                    }
                }
                if (best.score <= 0.5) break
            }
            const at = pointAt(best.d)
            placed.push({
                x: at.x + best.dx - label.w / 2,
                y: at.y + best.dy - label.h / 2,
                w: label.w,
                h: label.h,
            })
            return {
                along: total === 0 ? 0 : (2 * best.d) / total - 1,
                dx: best.dx,
                dy: best.dy,
            }
        })
        routed.set(edge.id, {
            exit: plan.exit,
            entry: plan.entry,
            points: path.slice(1, -1),
            labels,
        })
    }

    return {
        width: x,
        height: y,
        gapX: v.starts,
        gapW: v.thick,
        gapY: h.starts,
        gapH: h.thick,
        nodes: place,
        edges: routed,
    }
}
