/**
 * Geometry checks on rendered draw.io XML.
 *
 * These assert what a reader would notice: an arrow running through a box that has nothing
 * to do with it, two shapes drawn on top of each other, a node outside the frame that is
 * supposed to contain it. Asserting on exact coordinates instead would break on every
 * spacing change while still passing on a diagram that looks wrong.
 */

export interface Rect {
    x: number
    y: number
    w: number
    h: number
}

export interface Point {
    x: number
    y: number
}

/** A rendered edge, resolved to the points it actually passes through. */
export interface EdgePath {
    id: string
    source: string
    target: string
    label: string
    points: Point[]
}

/**
 * Every vertex's rectangle in PAGE coordinates.
 *
 * The XML stores a nested cell's geometry relative to its parent, so the offsets have to be
 * added up through the parent chain. Resolved lazily and memoised, since a parent may appear
 * after its child in document order.
 */
export function absoluteRects(xml: string): Map<string, Rect> {
    const raw = new Map<string, Rect & { parent: string }>()
    for (const m of xml.matchAll(
        /<mxCell id="([^"]+)"[^>]*vertex="1" parent="([^"]+)"><mxGeometry x="(-?[\d.]+)" y="(-?[\d.]+)" width="(-?[\d.]+)" height="(-?[\d.]+)"/g,
    ))
        raw.set(m[1], {
            parent: m[2],
            x: Number(m[3]),
            y: Number(m[4]),
            w: Number(m[5]),
            h: Number(m[6]),
        })

    const abs = new Map<string, Rect>()
    const resolve = (id: string, seen = new Set<string>()): Rect => {
        const hit = abs.get(id)
        if (hit) return hit
        const r = raw.get(id) as Rect & { parent: string }
        // A malformed cycle must not hang the test run.
        const base =
            r.parent === "1" || !raw.has(r.parent) || seen.has(r.parent)
                ? { x: 0, y: 0 }
                : resolve(r.parent, new Set(seen).add(id))
        const out = { x: r.x + base.x, y: r.y + base.y, w: r.w, h: r.h }
        abs.set(id, out)
        return out
    }
    for (const id of raw.keys()) resolve(id)
    return abs
}

/**
 * One node's rectangle, or a failure naming the id that was missing.
 *
 * A missing id here almost always means the renderer dropped a cell, and "cannot read
 * property y of undefined" does not say which one.
 */
export function rectOf(rects: Map<string, Rect>, id: string): Rect {
    const r = rects.get(id)
    if (!r) throw new Error(`no cell was rendered for "${id}"`)
    return r
}

/** The page size the renderer declared. */
export function pageSize(xml: string): { w: number; h: number } {
    const m = xml.match(/pageWidth="(\d+)" pageHeight="(\d+)"/)
    return { w: Number(m?.[1] ?? 0), h: Number(m?.[2] ?? 0) }
}

/**
 * The path each edge takes: its two connection points plus any waypoints between them.
 *
 * A connection point is a fraction of the terminal's bounds, so it is resolved against that
 * terminal's rectangle. Without one, draw.io picks the side itself and the centre is the best
 * available guess.
 */
export function edgePaths(xml: string, rects: Map<string, Rect>): EdgePath[] {
    const out: EdgePath[] = []
    for (const m of xml.matchAll(
        /<mxCell id="([^"]+)" value="([^"]*)" style="([^"]*)" edge="1"[^>]*source="([^"]+)" target="([^"]+)">([\s\S]*?)<\/mxCell>/g,
    )) {
        const a = rects.get(m[4])
        const b = rects.get(m[5])
        if (!a || !b) continue
        const exit = m[3].match(/exitX=([\d.]+);exitY=([\d.]+)/)
        const entry = m[3].match(/entryX=([\d.]+);entryY=([\d.]+)/)
        const start = exit
            ? { x: a.x + Number(exit[1]) * a.w, y: a.y + Number(exit[2]) * a.h }
            : { x: a.x + a.w / 2, y: a.y + a.h / 2 }
        const end = entry
            ? {
                  x: b.x + Number(entry[1]) * b.w,
                  y: b.y + Number(entry[2]) * b.h,
              }
            : { x: b.x + b.w / 2, y: b.y + b.h / 2 }
        const waypoints = [
            ...m[6].matchAll(/<mxPoint x="(-?[\d.]+)" y="(-?[\d.]+)"\/>/g),
        ].map((p) => ({ x: Number(p[1]), y: Number(p[2]) }))
        out.push({
            id: m[1],
            source: m[4],
            target: m[5],
            label: m[2],
            points: [start, ...waypoints, end],
        })
    }
    return out
}

/**
 * Edge segments that pass through a node that is neither of their endpoints.
 *
 * A 2px tolerance, so a line grazing a border on its way past does not count — that is the
 * router deliberately hugging a shape, not an arrow drawn over it.
 */
export function nodeCollisions(
    paths: EdgePath[],
    rects: Map<string, Rect>,
    nodeIds: string[],
): string[] {
    const bad = new Set<string>()
    for (const p of paths)
        for (let i = 0; i + 1 < p.points.length; i++) {
            const a = p.points[i]
            const b = p.points[i + 1]
            const lo = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }
            const hi = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }
            for (const id of nodeIds) {
                if (id === p.source || id === p.target) continue
                const r = rects.get(id)
                if (!r) continue
                if (
                    lo.x < r.x + r.w - 2 &&
                    hi.x > r.x + 2 &&
                    lo.y < r.y + r.h - 2 &&
                    hi.y > r.y + 2
                )
                    bad.add(`${p.id} (${p.source}→${p.target}) crosses ${id}`)
            }
        }
    return [...bad]
}

/** Pairs of nodes drawn on top of each other. */
export function overlaps(
    rects: Map<string, Rect>,
    nodeIds: string[],
): string[] {
    const bad: string[] = []
    for (let i = 0; i < nodeIds.length; i++)
        for (let j = i + 1; j < nodeIds.length; j++) {
            const a = rects.get(nodeIds[i])
            const b = rects.get(nodeIds[j])
            if (!a || !b) continue
            if (
                a.x < b.x + b.w &&
                b.x < a.x + a.w &&
                a.y < b.y + b.h &&
                b.y < a.y + a.h
            )
                bad.push(`${nodeIds[i]} overlaps ${nodeIds[j]}`)
        }
    return bad
}

/** Cells that fall outside the page the renderer declared. */
export function outsidePage(xml: string, skip: string[] = []): string[] {
    const page = pageSize(xml)
    const bad: string[] = []
    for (const [id, r] of absoluteRects(xml)) {
        if (skip.includes(id)) continue
        if (r.x < 0 || r.y < 0 || r.x + r.w > page.w || r.y + r.h > page.h)
            bad.push(
                `${id} at ${r.x},${r.y} ${r.w}x${r.h} is outside the ${page.w}x${page.h} page`,
            )
    }
    return bad
}

/**
 * Cells that stick out of the parent they declare.
 *
 * 1px of slack absorbs the rounding the renderer does on each coordinate independently.
 */
export function escapesParent(xml: string): string[] {
    const rects = absoluteRects(xml)
    const bad = new Set<string>()
    for (const m of xml.matchAll(
        /<mxCell id="([^"]+)"[^>]*vertex="1" parent="([^"]+)"/g,
    )) {
        const child = rects.get(m[1])
        const parent = rects.get(m[2])
        if (!child || !parent) continue
        if (
            child.x < parent.x - 1 ||
            child.y < parent.y - 1 ||
            child.x + child.w > parent.x + parent.w + 1 ||
            child.y + child.h > parent.y + parent.h + 1
        )
            bad.add(`${m[1]} sticks out of ${m[2]}`)
    }
    return [...bad]
}

/** The `parent` attribute of one cell. */
export function parentOf(xml: string, id: string): string | null {
    const m = xml.match(new RegExp(`<mxCell id="${id}"[^>]*parent="([^"]+)"`))
    return m ? m[1] : null
}
