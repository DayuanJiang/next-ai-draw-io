/**
 * Layout: tree → coordinates.
 *
 * Two passes, the same shape as a flexbox implementation:
 *
 *   measure — bottom-up. A leaf reports its intrinsic size; a container sums its
 *             children along the flow axis, takes the maximum across it, and adds
 *             padding and its title strip. A container therefore always ends up big
 *             enough to hold what is inside it, which is why "child spills out of its
 *             frame" cannot happen by construction.
 *
 *   place   — top-down. Each container distributes its now-known interior among its
 *             children.
 *
 * The model never supplies a coordinate. It declares nesting, direction and gap; every
 * x/y/width/height comes from here.
 *
 * Ported from drawio-ai-kit (MIT) — see NOTICE.
 */

import type { ContainerNode, DiagramNode, Rect } from "./types"
import { isContainer } from "./types"

/** Default glyph size for a catalog icon. */
export const ICON_SIZE = 48
/** Interior padding of a container. */
const PAD = 24
/** Height of a container's title strip. Zero when it has no label — an empty strip
 *  reads as a dead band at the top of the frame. */
const HEADER = 36
/** Approximate width of one label character at the engine's font size. */
const CHAR_W = 6.6

/** A node with its computed box. Layout works on this, leaving the tree untouched. */
export interface Placed {
    node: DiagramNode
    rect: Rect
    children: Placed[]
}

/** Intrinsic size of a text box: widest wrapped line by line count. */
export function autoBoxSize(label: string): { w: number; h: number } {
    const lines = String(label ?? "").split("\n")
    const longest = Math.max(1, ...lines.map((l) => l.length))
    return {
        w: Math.min(260, Math.max(120, Math.round(longest * CHAR_W + 28))),
        h: Math.max(44, lines.length * 18 + 26),
    }
}

/**
 * Intrinsic size of an icon cell: the glyph, plus room for the label underneath, and
 * wide enough that a long label does not overflow the cell it is centred in.
 */
function iconSize(label: string, glyph: number): { w: number; h: number } {
    return {
        w: Math.max(96, glyph + 20, Math.min(200, label.length * 7 + 24)),
        h: glyph + 34,
    }
}

/** A container is never narrower than its own title. */
function titleFloor(label: string, pad: number): number {
    return label ? Math.ceil(label.length * CHAR_W) + pad * 2 : 0
}

function headerFor(n: ContainerNode): number {
    return n.label ? HEADER : 0
}

/**
 * measure: give every node a size, bottom-up.
 *
 * Siblings are equalised across the cross axis — frames in a row share a bottom edge,
 * frames in a column share left and right edges. Only containers stretch; a leaf keeps
 * its natural size, because stretching an icon would distort the glyph.
 */
function measure(n: DiagramNode, defaultGlyph: number): Placed {
    if (n.kind === "icon") {
        const glyph = n.size ?? defaultGlyph
        const s = iconSize(n.label, glyph)
        return { node: n, rect: { x: 0, y: 0, ...s }, children: [] }
    }
    if (n.kind === "box") {
        const auto = autoBoxSize(n.label)
        return {
            node: n,
            rect: { x: 0, y: 0, w: n.w ?? auto.w, h: n.h ?? auto.h },
            children: [],
        }
    }
    if (n.kind === "title") {
        return { node: n, rect: { x: 0, y: 0, w: 0, h: 30 }, children: [] }
    }

    const kids = n.children.map((c) => measure(c, defaultGlyph))
    const head = headerFor(n)
    const gap = n.gap

    if (n.kind === "grid") {
        const cols = Math.max(1, n.cols)
        const rows = Math.ceil(kids.length / cols) || 1
        const cellW = Math.max(0, ...kids.map((k) => k.rect.w))
        const cellH = Math.max(0, ...kids.map((k) => k.rect.h))
        const w = PAD * 2 + cols * cellW + gap * (cols - 1)
        const h = head + PAD * 2 + rows * cellH + gap * (rows - 1)
        return {
            node: n,
            rect: {
                x: 0,
                y: 0,
                w: Math.max(w, titleFloor(n.label, PAD)),
                h,
            },
            children: kids,
        }
    }

    // group: row or col
    if (n.dir === "row") {
        const tallest = Math.max(0, ...kids.map((k) => k.rect.h))
        for (const k of kids)
            if (isContainer(k.node)) k.rect.h = Math.max(k.rect.h, tallest)
        const w =
            PAD * 2 +
            kids.reduce((s, k) => s + k.rect.w, 0) +
            gap * Math.max(0, kids.length - 1)
        const h = head + PAD * 2 + Math.max(0, ...kids.map((k) => k.rect.h))
        return {
            node: n,
            rect: { x: 0, y: 0, w: Math.max(w, titleFloor(n.label, PAD)), h },
            children: kids,
        }
    }

    const widest = Math.max(0, ...kids.map((k) => k.rect.w))
    // Only groups stretch: a grid computes its own interior, so forcing it wider would
    // leave a gap inside it rather than filling the space.
    for (const k of kids)
        if (k.node.kind === "group") k.rect.w = Math.max(k.rect.w, widest)
    const w = PAD * 2 + Math.max(0, ...kids.map((k) => k.rect.w))
    const h =
        head +
        PAD * 2 +
        kids.reduce((s, k) => s + k.rect.h, 0) +
        gap * Math.max(0, kids.length - 1)
    return {
        node: n,
        rect: { x: 0, y: 0, w: Math.max(w, titleFloor(n.label, PAD)), h },
        children: kids,
    }
}

/**
 * place: assign absolute positions, top-down.
 *
 * When a container ended up larger than its content — because a sibling forced it
 * wider, or its own title did — the slack is shared between the children rather than
 * left as dead margin on one side. The extra spacing is capped at one base gap so a
 * stretched frame reads as deliberately spaced instead of sparse, and the resulting
 * cluster is centred.
 */
function place(p: Placed, x: number, y: number): void {
    p.rect.x = Math.round(x)
    p.rect.y = Math.round(y)
    const n = p.node
    if (!isContainer(n)) return

    const head = headerFor(n)
    const innerX = p.rect.x + PAD
    const innerTop = p.rect.y + head + PAD
    const innerW = p.rect.w - PAD * 2
    const innerH = p.rect.h - head - PAD * 2
    const kids = p.children

    if (n.kind === "grid") {
        const cols = Math.max(1, n.cols)
        const cellW = Math.max(0, ...kids.map((k) => k.rect.w))
        const cellH = Math.max(0, ...kids.map((k) => k.rect.h))
        kids.forEach((k, i) => {
            const r = Math.floor(i / cols)
            const c = i % cols
            const cx = innerX + c * (cellW + n.gap)
            const cy = innerTop + r * (cellH + n.gap)
            // centre each child in its cell so a short label does not sit off-axis
            place(k, cx + (cellW - k.rect.w) / 2, cy + (cellH - k.rect.h) / 2)
        })
        return
    }

    const alongRow = n.dir === "row"
    const sizes = kids.map((k) => (alongRow ? k.rect.w : k.rect.h))
    const content = sizes.reduce((s, v) => s + v, 0)
    const extent = alongRow ? innerW : innerH
    const k = kids.length
    const slack = Math.max(0, extent - content - n.gap * (k - 1))
    const gap = k > 1 ? n.gap + Math.min(n.gap, slack / (k - 1)) : n.gap
    const span = content + gap * Math.max(0, k - 1)
    let cur = (alongRow ? innerX : innerTop) + Math.max(0, (extent - span) / 2)

    for (const kid of kids) {
        if (alongRow) {
            place(kid, cur, innerTop + (innerH - kid.rect.h) / 2)
            cur += kid.rect.w + gap
        } else {
            place(kid, innerX + (innerW - kid.rect.w) / 2, cur)
            cur += kid.rect.h + gap
        }
    }
}

export interface LayoutResult {
    /** Placed roots, in the order given. */
    roots: Placed[]
    /** Page size that fits everything, with a margin. */
    page: { w: number; h: number }
}

/** Where the tree starts on the page. Leaves room for a title above it. */
const ORIGIN = { x: 40, y: 90 }
const MARGIN = { right: 40, bottom: 50 }

/**
 * Lay out a forest of roots side by side and report the page size that fits them.
 *
 * A pinned node keeps the position it already had: the user moved it deliberately, and
 * the whole point of the pin is that a re-layout does not undo that.
 */
export function layoutForest(
    roots: DiagramNode[],
    opts: { iconSize?: number; gap?: number } = {},
): LayoutResult {
    const glyph = opts.iconSize ?? ICON_SIZE
    const gap = opts.gap ?? 70
    const placed = roots.map((r) => measure(r, glyph))

    let cur = ORIGIN.x
    for (const p of placed) {
        const n = p.node
        const held =
            n.kind === "title" ? null : n.pinned ? (n.rect ?? null) : null
        if (held) {
            place(p, held.x, held.y)
        } else {
            place(p, cur, ORIGIN.y)
            cur += p.rect.w + gap
        }
    }

    let maxX = 0
    let maxY = 0
    const visit = (p: Placed) => {
        maxX = Math.max(maxX, p.rect.x + p.rect.w)
        maxY = Math.max(maxY, p.rect.y + p.rect.h)
        p.children.forEach(visit)
    }
    placed.forEach(visit)

    return {
        roots: placed,
        page: {
            w: Math.round(maxX + MARGIN.right),
            h: Math.round(maxY + MARGIN.bottom),
        },
    }
}

/** Flatten a placed forest into (node, rect, parentId) triples in document order. */
export function flatten(
    roots: Placed[],
): { node: DiagramNode; rect: Rect; parent: string }[] {
    const out: { node: DiagramNode; rect: Rect; parent: string }[] = []
    const walk = (p: Placed, parent: string) => {
        out.push({ node: p.node, rect: p.rect, parent })
        for (const c of p.children) walk(c, p.node.id)
    }
    for (const r of roots) walk(r, "1")
    return out
}
