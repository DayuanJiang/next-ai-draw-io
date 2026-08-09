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
 * Five container kinds share those two passes, because they differ only in how a parent
 * distributes its interior:
 *
 *   group     — children stacked along one axis. Cloud architecture, nested frames.
 *   grid      — children packed into a fixed number of columns.
 *   pool      — a sparse (lane × column) grid. Swimlane and BPMN diagrams.
 *   sequence  — participants across the top, lifelines below. Sequence diagrams.
 *   radial    — a centre with branches fanning out, or hanging below. Mind maps, org charts.
 *
 * Ported from drawio-ai-kit (MIT) — see NOTICE. The pool geometry follows that project's
 * `pool()` primitive; sequence and radial are original to this repository.
 */

import type {
    ContainerNode,
    DiagramNode,
    PoolNode,
    RadialNode,
    Rect,
    SequenceNode,
} from "./types"
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

// ---- pool geometry, shared with render.ts so the bands land under the nodes ----

/** Interior padding of a pool. Tighter than a group's: lane bands sit flush. */
export const POOL_PAD = 16
/** Width of the lane-name column (height, when the pool is vertical). */
export const LANE_LABEL = 110
/** Height of the milestone band (width, when the pool is vertical). */
export const PHASE_LABEL = 26
/** A pool's own title strip. */
export const POOL_HEADER = 34
/** Vertical padding inside a lane band, so nodes do not touch the band's edges. */
const LANE_PAD = 14

// ---- sequence geometry ----

/** Height of a participant head. */
const HEAD_H = 44
/** Vertical distance from the participant heads to the first message. */
const LIFELINE_TOP = 28
/** How far the lifeline runs past the last message. */
const LIFELINE_TAIL = 36

/**
 * The geometry a pool needs, derived once and used by both layout and rendering.
 *
 * Rendering has to paint the lane bands and label columns at exactly the positions layout
 * used, or the nodes sit off their bands. Computing it in one place is what keeps the two
 * from drifting.
 */
export interface PoolMetrics {
    horizontal: boolean
    lanes: number
    cols: number
    /** Cell size along the flow axis. */
    cellW: number
    /** Cell size across the lane axis. */
    cellH: number
    header: number
    phaseLabel: number
    /** Where cell (0,0) starts. */
    contentX: number
    contentY: number
    /** Total extent of the cell area. */
    contentW: number
    contentH: number
}

export function poolMetrics(
    n: PoolNode,
    rect: Rect,
    kids: { rect: Rect }[],
): PoolMetrics {
    const horizontal = n.orientation !== "vertical"
    const lanes = Math.max(1, n.lanes.length)
    const cols = Math.max(1, ...n.children.map((c) => poolCellOf(c).col + 1))
    const cellW = Math.max(80, ...kids.map((k) => k.rect.w))
    const cellH = Math.max(40, ...kids.map((k) => k.rect.h)) + LANE_PAD
    const header = n.label ? POOL_HEADER : 0
    const phaseLabel = n.phases.length ? PHASE_LABEL : 0
    const contentW = horizontal
        ? cols * cellW + n.gap * (cols - 1)
        : lanes * cellW
    const contentH = horizontal
        ? lanes * cellH
        : cols * cellH + n.gap * (cols - 1)
    return {
        horizontal,
        lanes,
        cols,
        cellW,
        cellH,
        header,
        phaseLabel,
        contentX: horizontal
            ? rect.x + POOL_PAD + LANE_LABEL
            : rect.x + POOL_PAD,
        contentY: horizontal
            ? rect.y + header + phaseLabel + POOL_PAD
            : rect.y + header + POOL_PAD + LANE_LABEL,
        contentW,
        contentH,
    }
}

/** Where a sequence diagram's lifelines start and how far they run. */
export interface SequenceMetrics {
    /** Top of the lifeline, just under the participant heads. */
    top: number
    /** Bottom of the lifeline. */
    bottom: number
    /** Vertical position of message N, for N starting at 1. */
    messageY: (step: number) => number
}

export function sequenceMetrics(
    n: SequenceNode,
    rect: Rect,
    messages: number,
): SequenceMetrics {
    const head = n.label ? HEADER : 0
    const top = rect.y + head + PAD + HEAD_H
    const first = top + LIFELINE_TOP
    return {
        top,
        bottom: first + Math.max(0, messages - 1) * n.step + LIFELINE_TAIL,
        messageY: (step) => first + Math.max(0, step - 1) * n.step,
    }
}

/** A node with its computed box. Layout works on this, leaving the tree untouched. */
export interface Placed {
    node: DiagramNode
    rect: Rect
    children: Placed[]
    /**
     * For a node inside a radial container: the extent of its whole subtree across the
     * branching axis. Measured on the way up, spent on the way down — a parent needs its
     * children's subtree extents to divide its own span between them.
     */
    extent?: number
}

/**
 * What layout needs to know that the tree alone does not carry.
 *
 * Three of the five container kinds are laid out from the diagram's arrows, not from
 * nesting: a sequence diagram's messages set how tall the lifelines have to be, and a mind
 * map's hierarchy IS its arrows. Links live on the tree, not on the node, so they are
 * passed in rather than read from a parent pointer.
 */
export interface LayoutContext {
    /** Every link in the diagram, source → target. */
    links: { source: string; target: string; step?: number }[]
}

const NO_CONTEXT: LayoutContext = { links: [] }

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
    if (n.kind === "pool") return n.label ? POOL_HEADER : 0
    return n.label ? HEADER : 0
}

/**
 * May this node be stretched to match a sibling's size?
 *
 * Only a `group` may. A leaf keeps its natural size, because stretching an icon distorts
 * the glyph. The three specialised containers compute their interiors from their own rules
 * — lane bands, lifeline positions, ring radii — so forcing one wider leaves dead space
 * inside it rather than filling anything, and forcing one taller detaches its lane bands
 * from the nodes sitting on them.
 */
function stretches(n: DiagramNode): boolean {
    return n.kind === "group"
}

/** The cell a node occupies inside a pool. Absent means (0,0). */
function poolCellOf(n: DiagramNode): { lane: number; col: number } {
    if ((n.kind === "icon" || n.kind === "box") && n.cell)
        return { lane: Math.max(0, n.cell.lane), col: Math.max(0, n.cell.col) }
    return { lane: 0, col: 0 }
}

/**
 * How many messages a sequence container has: the highest step number among the links
 * between its participants, or the link count when the model numbered nothing.
 *
 * Steps are what order the messages vertically, so a diagram whose links carry no step
 * still needs one row per message — otherwise every arrow lands on the same y.
 */
function messageCount(n: SequenceNode, ctx: LayoutContext): number {
    const own = new Set(n.children.map((c) => c.id))
    const mine = ctx.links.filter((l) => own.has(l.source) && own.has(l.target))
    const steps = mine
        .map((l) => l.step)
        .filter((s): s is number => s != null && s > 0)
    return Math.max(mine.length, ...(steps.length ? steps : [0]))
}

/**
 * One node of a radial tree: a placed box plus the branches hanging off it.
 *
 * Separate from `Placed` because the tree is derived from the LINKS, not from nesting, so it
 * exists only during a radial container's layout.
 */
interface RadialTree {
    p: Placed
    kids: RadialTree[]
    /** How much room this whole subtree needs across the branching axis. */
    extent: number
    /** How many generations deep this subtree goes, counting itself as 1. */
    depth: number
}

/**
 * Build the branch hierarchy of a radial container from the diagram's arrows.
 *
 * The root is the node nothing points at. Every other node hangs off whichever node points
 * at it — the FIRST one, if several do, since a mind map is a tree and a second parent has
 * to be drawn as a plain cross-link instead.
 *
 * A node no arrow reaches at all becomes a branch of the root, so it is still drawn. Dropping
 * it would silently lose a box the model asked for.
 */
function radialHierarchy(
    kids: Placed[],
    ctx: LayoutContext,
    across: "w" | "h",
    gap: number,
): { root: RadialTree; branches: RadialTree[] } | null {
    if (kids.length === 0) return null
    const own = new Map(kids.map((k) => [k.node.id, k]))
    const parent = new Map<string, string>()
    for (const l of ctx.links) {
        if (!own.has(l.source) || !own.has(l.target)) continue
        if (l.source === l.target) continue
        if (!parent.has(l.target)) parent.set(l.target, l.source)
    }
    // Guard against a cycle in the arrows: walking up must terminate.
    const rootOf = (id: string): string => {
        const seen = new Set<string>([id])
        let cur = id
        for (;;) {
            const up = parent.get(cur)
            if (up === undefined || seen.has(up)) return cur
            seen.add(up)
            cur = up
        }
    }
    // The first declared node that is nobody's child is the centre. Falling back to the first
    // child keeps a cycle-only graph drawable.
    const rootId =
        kids.find((k) => !parent.has(k.node.id))?.node.id ??
        rootOf(kids[0].node.id)

    const childrenOf = new Map<string, Placed[]>()
    for (const k of kids) {
        if (k.node.id === rootId) continue
        const up = parent.get(k.node.id)
        // An orphan, or a node whose parent chain loops back to itself, attaches to the root.
        const attach =
            up !== undefined && up !== k.node.id && rootOf(k.node.id) === rootId
                ? up
                : rootId
        const list = childrenOf.get(attach)
        if (list) list.push(k)
        else childrenOf.set(attach, [k])
    }

    const seen = new Set<string>()
    const build = (p: Placed): RadialTree => {
        seen.add(p.node.id)
        const kidTrees = (childrenOf.get(p.node.id) ?? [])
            .filter((c) => !seen.has(c.node.id))
            .map(build)
        const total =
            kidTrees.reduce((s, t) => s + t.extent, 0) +
            gap * Math.max(0, kidTrees.length - 1)
        return {
            p,
            kids: kidTrees,
            extent: Math.max(p.rect[across], total),
            depth: kidTrees.length
                ? 1 + Math.max(...kidTrees.map((t) => t.depth))
                : 1,
        }
    }
    const root = build(own.get(rootId) as Placed)
    return { root, branches: root.kids }
}

/** Widest node at each generation, for laying a radial tree out in even rings. */
function widestPerLevel(trees: RadialTree[], along: "w" | "h"): number[] {
    const out: number[] = []
    const visit = (t: RadialTree, level: number) => {
        out[level] = Math.max(out[level] ?? 0, t.p.rect[along])
        for (const k of t.kids) visit(k, level + 1)
    }
    for (const t of trees) visit(t, 0)
    return out
}

/**
 * How far one side of a radial map reaches from the centre.
 *
 * Each generation contributes one gap plus the width of the widest node in it. This has to be
 * computed per SIDE, not once for the whole map: a mind map whose left branches go three
 * generations deep and whose right branches go one needs an asymmetric frame, and reserving
 * the same room on both sides would push the deeper side off the page.
 */
function radialReach(
    side: RadialTree[],
    along: "w" | "h",
    gap: number,
): number {
    if (side.length === 0) return 0
    const levels = widestPerLevel(side, along)
    const generations = Math.max(...side.map((b) => b.depth))
    return levels.slice(0, generations).reduce((s, v) => s + v + gap, 0)
}

/**
 * Split a radial map's branches into the two sides they will be drawn on.
 *
 * The same split has to be used by measure and by place, or the frame is sized for one
 * arrangement and the branches are drawn in another.
 */
function radialSides(branches: RadialTree[]): {
    right: RadialTree[]
    left: RadialTree[]
} {
    const half = Math.ceil(branches.length / 2)
    return { right: branches.slice(0, half), left: branches.slice(half) }
}

/**
 * measure: give every node a size, bottom-up.
 *
 * Siblings are equalised across the cross axis — frames in a row share a bottom edge,
 * frames in a column share left and right edges. Only containers stretch; a leaf keeps
 * its natural size, because stretching an icon would distort the glyph.
 */
function measure(
    n: DiagramNode,
    defaultGlyph: number,
    ctx: LayoutContext = NO_CONTEXT,
): Placed {
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

    const kids = n.children.map((c) => measure(c, defaultGlyph, ctx))
    const head = headerFor(n)
    const gap = n.gap

    if (n.kind === "pool") {
        const m = poolMetrics(n, { x: 0, y: 0, w: 0, h: 0 }, kids)
        const w = m.horizontal
            ? POOL_PAD * 2 + LANE_LABEL + m.contentW
            : POOL_PAD * 2 + m.contentW + m.phaseLabel
        const h = m.horizontal
            ? m.header + m.phaseLabel + POOL_PAD * 2 + m.contentH
            : m.header + POOL_PAD * 2 + LANE_LABEL + m.contentH
        return {
            node: n,
            rect: {
                x: 0,
                y: 0,
                w: Math.max(w, titleFloor(n.label, POOL_PAD)),
                h,
            },
            children: kids,
        }
    }

    if (n.kind === "sequence") {
        // Participants sit side by side; the lifelines below them set the height.
        const w =
            PAD * 2 +
            kids.reduce((s, k) => s + k.rect.w, 0) +
            gap * Math.max(0, kids.length - 1)
        const m = sequenceMetrics(
            n,
            { x: 0, y: 0, w: 0, h: 0 },
            messageCount(n, ctx),
        )
        return {
            node: n,
            rect: {
                x: 0,
                y: 0,
                w: Math.max(w, titleFloor(n.label, PAD)),
                h: m.bottom + PAD,
            },
            children: kids,
        }
    }

    if (n.kind === "radial") {
        const down = n.spread === "down"
        const across = down ? "w" : "h"
        const tree = radialHierarchy(kids, ctx, across, n.gap)
        if (!tree)
            return {
                node: n,
                rect: { x: 0, y: 0, w: PAD * 2, h: head + PAD * 2 },
                children: kids,
            }
        const { root, branches } = tree
        const spanOf = (bs: RadialTree[]) =>
            bs.length === 0
                ? 0
                : bs.reduce((s, b) => s + b.extent, 0) + n.gap * (bs.length - 1)

        if (down) {
            // Everything hangs below the centre: one direction, so one reach.
            const h = root.p.rect.h + radialReach(branches, "h", n.gap)
            const w = Math.max(root.p.rect.w, spanOf(branches))
            return {
                node: n,
                rect: {
                    x: 0,
                    y: 0,
                    w: Math.max(PAD * 2 + w, titleFloor(n.label, PAD)),
                    h: head + PAD * 2 + h,
                },
                children: kids,
            }
        }

        // Radial: the two sides reach different distances, so each is measured on its own.
        // Using one figure for both would leave the deeper side hanging outside the frame.
        const { right, left } = radialSides(branches)
        const w =
            radialReach(left, "w", n.gap) +
            root.p.rect.w +
            radialReach(right, "w", n.gap)
        const h = Math.max(root.p.rect.h, spanOf(right), spanOf(left))
        return {
            node: n,
            rect: {
                x: 0,
                y: 0,
                w: Math.max(PAD * 2 + w, titleFloor(n.label, PAD)),
                h: head + PAD * 2 + h,
            },
            children: kids,
        }
    }

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
            if (stretches(k.node)) k.rect.h = Math.max(k.rect.h, tallest)
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
function place(
    p: Placed,
    x: number,
    y: number,
    ctx: LayoutContext = NO_CONTEXT,
): void {
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
            place(
                k,
                cx + (cellW - k.rect.w) / 2,
                cy + (cellH - k.rect.h) / 2,
                ctx,
            )
        })
        return
    }

    if (n.kind === "pool") {
        // Each child goes to the (lane, column) cell it declared. Empty cells stay empty:
        // in a swimlane diagram, "this role does nothing at this step" is information.
        const m = poolMetrics(n, p.rect, kids)
        for (const k of kids) {
            const { lane, col } = poolCellOf(k.node)
            const cx = m.horizontal
                ? m.contentX + col * (m.cellW + n.gap)
                : m.contentX + Math.min(lane, m.lanes - 1) * m.cellW
            const cy = m.horizontal
                ? m.contentY + Math.min(lane, m.lanes - 1) * m.cellH
                : m.contentY + col * (m.cellH + n.gap)
            place(
                k,
                cx + (m.cellW - k.rect.w) / 2,
                cy + (m.cellH - k.rect.h) / 2,
                ctx,
            )
        }
        return
    }

    if (n.kind === "sequence") {
        // Participants in a row across the top. Their lifelines hang below, emitted by the
        // renderer, so nothing else has to be placed here.
        let cur = innerX
        for (const k of kids) {
            place(k, cur, innerTop, ctx)
            cur += k.rect.w + n.gap
        }
        return
    }

    if (n.kind === "radial") {
        placeRadial(p, n, innerX, innerTop, innerW, innerH, ctx)
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
            place(kid, cur, innerTop + (innerH - kid.rect.h) / 2, ctx)
            cur += kid.rect.w + gap
        } else {
            place(kid, innerX + (innerW - kid.rect.w) / 2, cur, ctx)
            cur += kid.rect.h + gap
        }
    }
}

/**
 * Place a radial container: a centre with its branches fanning out.
 *
 * Two shapes, because a mind map and an org chart want opposite things. A mind map reads
 * best with branches on both sides of the centre, which keeps it compact and balanced. An
 * org chart must hang everything downwards — a reporting line drawn upwards or sideways
 * reads as the wrong relationship, no matter how much space it saves.
 *
 * Each generation sits in its own ring, the ring's depth set by the widest node in it, so
 * siblings line up instead of stepping raggedly outwards.
 */
function placeRadial(
    p: Placed,
    n: RadialNode,
    innerX: number,
    innerTop: number,
    innerW: number,
    innerH: number,
    ctx: LayoutContext,
): void {
    const down = n.spread === "down"
    const along = down ? "h" : "w"
    const across = down ? "w" : "h"
    const tree = radialHierarchy(p.children, ctx, across, n.gap)
    if (!tree) return
    const { root, branches } = tree
    const centre = root.p

    /**
     * Lay one generation out along the cross axis, then recurse.
     *
     * `start` is the middle of the band this generation has to fill; each branch gets a slice
     * of it as wide as its own subtree needs, and is centred in that slice. Sizing slices by
     * subtree extent — not by branch count — is what keeps a bushy branch from being drawn
     * over a bare sibling.
     */
    const spread = (
        items: RadialTree[],
        level: number,
        start: number,
        alongPos: number,
        sign: 1 | -1,
    ) => {
        const total =
            items.reduce((s, b) => s + b.extent, 0) +
            n.gap * Math.max(0, items.length - 1)
        let cur = start - total / 2
        for (const b of items) {
            const mid = cur + b.extent / 2
            // On the left side the ring position is the branch's FAR edge, so its own size has
            // to come off to get its origin.
            const a = sign > 0 ? alongPos : alongPos - b.p.rect[along]
            if (down) place(b.p, mid - b.p.rect.w / 2, a, ctx)
            else place(b.p, a, mid - b.p.rect.h / 2, ctx)

            if (b.kids.length) {
                // `alongPos` means the NEAR edge going outwards and the FAR edge coming back,
                // which is why the two directions are not symmetric here: on the left the
                // recursion subtracts the child's own width, so subtracting the ring width as
                // well would place it a full ring too far out — off the frame.
                const next = sign > 0 ? a + b.p.rect[along] + n.gap : a - n.gap
                spread(b.kids, level + 1, mid, next, sign)
            }
            cur += b.extent + n.gap
        }
    }

    if (down) {
        place(centre, innerX + (innerW - centre.rect.w) / 2, innerTop, ctx)
        spread(
            branches,
            0,
            centre.rect.x + centre.rect.w / 2,
            centre.rect.y + centre.rect.h + n.gap,
            1,
        )
        return
    }

    // Radial: split the branches between the two sides, keeping declaration order within each
    // side so the model can predict where a branch lands.
    //
    // The centre goes at the LEFT side's reach, not at the frame's middle. Those are the same
    // only when both sides are equally deep; centring a lopsided map would push the deeper
    // side out past the frame's edge and off the page.
    const { right, left } = radialSides(branches)
    place(
        centre,
        innerX + radialReach(left, "w", n.gap),
        innerTop + (innerH - centre.rect.h) / 2,
        ctx,
    )
    const midY = centre.rect.y + centre.rect.h / 2
    spread(right, 0, midY, centre.rect.x + centre.rect.w + n.gap, 1)
    spread(left, 0, midY, centre.rect.x - n.gap, -1)
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
    opts: {
        iconSize?: number
        gap?: number
        /** The diagram's links. Needed by sequence containers, which size themselves from
         *  the number of messages between their participants. */
        links?: LayoutContext["links"]
    } = {},
): LayoutResult {
    const glyph = opts.iconSize ?? ICON_SIZE
    const gap = opts.gap ?? 70
    const ctx: LayoutContext = { links: opts.links ?? [] }
    const placed = roots.map((r) => measure(r, glyph, ctx))

    let cur = ORIGIN.x
    for (const p of placed) {
        const n = p.node
        const held =
            n.kind === "title" ? null : n.pinned ? (n.rect ?? null) : null
        if (held) {
            place(p, held.x, held.y, ctx)
        } else {
            place(p, cur, ORIGIN.y, ctx)
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
