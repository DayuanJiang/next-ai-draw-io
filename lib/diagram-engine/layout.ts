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

import { resolveShape } from "./shapes"
import { type Role, roleMetrics } from "./theme"
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

/** A group's interior padding: its own `pad` when declared, the default otherwise. */
function padOf(n: ContainerNode): number {
    return n.kind === "group" && n.pad != null ? Math.max(0, n.pad) : PAD
}

/** The flex-grow weight a node declared, 0 when none. */
function growOf(n: DiagramNode): number {
    const g = (n.kind === "box" || n.kind === "group") && n.grow
    return typeof g === "number" && g > 0 ? g : 0
}

/** The cross-axis alignment a node declared. */
function alignOf(n: DiagramNode): "start" | "center" | "end" | "stretch" {
    const a = (n.kind === "box" || n.kind === "group") && n.align
    return a === "start" || a === "end" || a === "stretch" ? a : "center"
}
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
const PHASE_LABEL = 26
/** A pool's own title strip. */
const POOL_HEADER = 34
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

/** How far a sequence diagram's lifelines run, and where each message sits. */
export interface SequenceMetrics {
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
    // The first message hangs a fixed distance below the participant heads.
    const first = rect.y + head + PAD + HEAD_H + LIFELINE_TOP
    return {
        bottom: first + Math.max(0, messages - 1) * n.step + LIFELINE_TAIL,
        messageY: (step) => first + Math.max(0, step - 1) * n.step,
    }
}

/** A node with its computed box. Layout works on this, leaving the tree untouched. */
export interface Placed {
    node: DiagramNode
    rect: Rect
    children: Placed[]
}

/**
 * The arrows layout needs, which the node tree alone does not carry.
 *
 * Three of the five container kinds are laid out from the diagram's arrows, not from
 * nesting: a sequence diagram's messages set how tall the lifelines have to be, and a mind
 * map's hierarchy IS its arrows. Links live on the tree, not on the node, so they are
 * passed down rather than read from a parent pointer.
 */
export type LayoutLinks = { source: string; target: string; step?: number }[]

/**
 * Reduce a label to the text draw.io will actually lay out.
 *
 * Labels may carry inline HTML (every style has `html=1`): a <br> is a line break, any
 * other tag is invisible markup around visible text. Measuring the raw string counted
 * `<font color="#B85450">` as thirty characters of text, making rich boxes twice as
 * wide as their content.
 */
function visibleText(label: string): string {
    return String(label ?? "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/?(?:b|i|u|s|sub|sup|font|span|div)(?:\s[^<>]*)?>/gi, "")
}

/**
 * Intrinsic size of a text box: widest wrapped line by line count.
 *
 * The role scales the estimate: a banner sets 20px type and a footnote 9px, and layout has
 * to reserve what render will draw or the text overflows its cell.
 */
export function autoBoxSize(
    label: string,
    role?: Role,
    shape?: string,
): { w: number; h: number } {
    const spec = shape ? resolveShape(shape)?.spec : undefined
    // A glyph shape (umlActor…) has a fixed figure with the label below it: the slot is
    // the figure plus a line of text, and the text length does not scale the figure.
    if (spec?.labelOutside && spec.glyph) {
        const text = visibleText(label)
        return {
            w: Math.max(spec.glyph.w + 20, Math.min(160, text.length * 7 + 16)),
            h: spec.glyph.h + 22,
        }
    }
    const r = roleMetrics(role)
    const maxW = Math.round(260 * Math.max(1, r.charScale))
    const explicit = visibleText(label).split("\n")
    const longest = Math.max(1, ...explicit.map((l) => l.length))
    const w = Math.min(
        maxW,
        Math.max(120, Math.round(longest * CHAR_W * r.charScale + 28)),
    )
    // Count the lines the text ACTUALLY occupies: draw.io wraps at the box width, so a
    // long line becomes several. Estimating by explicit newlines alone left the box one
    // line tall while the text wrapped to six — and overflowed straight out of it.
    const charsPerLine = Math.max(
        8,
        Math.floor((w - 28) / (CHAR_W * r.charScale)),
    )
    const lines = explicit.reduce(
        (sum, l) => sum + Math.max(1, Math.ceil(l.length / charsPerLine)),
        0,
    )
    const lineH = Math.round(r.fontSize * 1.6)
    const h = Math.max(r.minH, lines * lineH + 26)
    // A non-rectangular outline inscribes a smaller text area than its bounding box —
    // a rhombus exactly half — so the box grows by the shape's measured factor.
    // Verified in the real editor: the same sentence overflows a 1.0× rhombus and fits
    // a 1.5× one.
    const s = spec?.textScale ?? 1
    return { w: Math.round(w * s), h: Math.round(h * s) }
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
 * The cell a node occupies inside a pool. Absent means (0,0).
 *
 * No clamping needed: `add_icon`/`add_box` clamp at the boundary where the model's numbers
 * arrive, and the only other way a cell gets set is the parser, whose `dai_cell` pattern
 * matches digits only. So by here it is already non-negative.
 */
export function poolCellOf(n: DiagramNode): { lane: number; col: number } {
    if ((n.kind === "icon" || n.kind === "box") && n.cell) return n.cell
    return { lane: 0, col: 0 }
}

/**
 * How many messages a sequence container has: the highest step number among the links
 * between its participants, or the link count when the model numbered nothing.
 *
 * Steps are what order the messages vertically, so a diagram whose links carry no step
 * still needs one row per message — otherwise every arrow lands on the same y.
 */
export function messageCount(n: SequenceNode, links: LayoutLinks): number {
    const own = new Set(n.children.map((c) => c.id))
    const mine = links.filter((l) => own.has(l.source) && own.has(l.target))
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
    links: LayoutLinks,
    across: "w" | "h",
    gap: number,
): { root: RadialTree; branches: RadialTree[] } | null {
    if (kids.length === 0) return null
    const own = new Map(kids.map((k) => [k.node.id, k]))
    const parent = new Map<string, string>()
    for (const l of links) {
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
        // An orphan, or a node whose parent chain loops back on itself, attaches to the root.
        // `up === k.node.id` cannot happen: self-links are skipped when `parent` is built.
        const attach =
            up !== undefined && rootOf(k.node.id) === rootId ? up : rootId
        const list = childrenOf.get(attach)
        if (list) list.push(k)
        else childrenOf.set(attach, [k])
    }

    // No visited-set needed: `parent` records at most one parent per node, so `childrenOf`
    // is a forest by construction, and `rootOf` above already reattached anything whose
    // parent chain looped. The recursion cannot revisit a node.
    const build = (p: Placed): RadialTree => {
        const kidTrees = (childrenOf.get(p.node.id) ?? []).map(build)
        const total =
            kidTrees.reduce((s, t) => s + t.extent, 0) +
            gap * Math.max(0, kidTrees.length - 1)
        return {
            p,
            kids: kidTrees,
            extent: Math.max(p.rect[across], total),
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
    // widestPerLevel writes one entry per generation that exists, so its length IS the depth
    // of the deepest branch on this side. An empty side yields an empty list, and reducing
    // that from 0 already gives 0.
    return widestPerLevel(side, along).reduce((s, v) => s + v + gap, 0)
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
    links: LayoutLinks,
): Placed {
    if (n.kind === "icon") {
        const glyph = n.size ?? defaultGlyph
        const s = iconSize(n.label, glyph)
        return { node: n, rect: { x: 0, y: 0, ...s }, children: [] }
    }
    if (n.kind === "box") {
        const auto = autoBoxSize(n.label, n.role, n.shape)
        return {
            node: n,
            rect: { x: 0, y: 0, w: n.w ?? auto.w, h: n.h ?? auto.h },
            children: [],
        }
    }
    if (n.kind === "title") {
        return { node: n, rect: { x: 0, y: 0, w: 0, h: 30 }, children: [] }
    }

    const kids = n.children.map((c) => measure(c, defaultGlyph, links))
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
            messageCount(n, links),
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
        const tree = radialHierarchy(kids, links, across, n.gap)
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
    const pad = padOf(n)
    if (n.dir === "row") {
        const tallest = Math.max(0, ...kids.map((k) => k.rect.h))
        // Only a group stretches to match its siblings. A leaf keeps its natural size,
        // because stretching an icon distorts the glyph; and a grid, pool, sequence or
        // radial computes its interior from its own rule, so forcing one bigger leaves dead
        // space inside rather than filling anything — and for a pool it would detach the
        // lane bands from the nodes sitting on them.
        for (const k of kids)
            if (k.node.kind === "group") k.rect.h = Math.max(k.rect.h, tallest)
        const w =
            pad * 2 +
            kids.reduce((s, k) => s + k.rect.w, 0) +
            gap * Math.max(0, kids.length - 1)
        const h = head + pad * 2 + Math.max(0, ...kids.map((k) => k.rect.h))
        return {
            node: n,
            rect: { x: 0, y: 0, w: Math.max(w, titleFloor(n.label, pad)), h },
            children: kids,
        }
    }

    const widest = Math.max(0, ...kids.map((k) => k.rect.w))
    // Only a group stretches — same reasoning as the row branch above.
    for (const k of kids)
        if (k.node.kind === "group") k.rect.w = Math.max(k.rect.w, widest)
    const w = pad * 2 + Math.max(0, ...kids.map((k) => k.rect.w))
    const h =
        head +
        pad * 2 +
        kids.reduce((s, k) => s + k.rect.h, 0) +
        gap * Math.max(0, kids.length - 1)
    return {
        node: n,
        rect: { x: 0, y: 0, w: Math.max(w, titleFloor(n.label, pad)), h },
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
function place(p: Placed, x: number, y: number, links: LayoutLinks): void {
    p.rect.x = Math.round(x)
    p.rect.y = Math.round(y)
    const n = p.node
    if (!isContainer(n)) return

    const head = headerFor(n)
    const pad = n.kind === "group" ? padOf(n) : PAD
    const innerX = p.rect.x + pad
    const innerTop = p.rect.y + head + pad
    const innerW = p.rect.w - pad * 2
    const innerH = p.rect.h - head - pad * 2
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
                links,
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
                links,
            )
        }
        return
    }

    if (n.kind === "sequence") {
        // Participants in a row across the top. Their lifelines hang below, emitted by the
        // renderer, so nothing else has to be placed here.
        let cur = innerX
        for (const k of kids) {
            place(k, cur, innerTop, links)
            cur += k.rect.w + n.gap
        }
        return
    }

    if (n.kind === "radial") {
        placeRadial(p, n, innerX, innerTop, innerW, innerH, links)
        return
    }

    const alongRow = n.dir === "row"
    const sizes = kids.map((k) => (alongRow ? k.rect.w : k.rect.h))
    const content = sizes.reduce((s, v) => s + v, 0)
    const extent = alongRow ? innerW : innerH
    const k = kids.length
    let slack = Math.max(0, extent - content - n.gap * (k - 1))

    // flex-grow: children with a weight split the leftover space between them, TeX's
    // glue. This runs before the gap stretch below — declared weights are a statement
    // about where the slack should go, and padding it into the gaps instead would
    // silently override that statement.
    const weights = kids.map((kid) => growOf(kid.node))
    const totalWeight = weights.reduce((s, v) => s + v, 0)
    if (totalWeight > 0 && slack > 0) {
        kids.forEach((kid, i) => {
            const extra = (slack * weights[i]) / totalWeight
            if (alongRow) kid.rect.w += extra
            else kid.rect.h += extra
        })
        slack = 0
    }

    const gap = k > 1 ? n.gap + Math.min(n.gap, slack / (k - 1)) : n.gap
    const span =
        kids.reduce((s, kid) => s + (alongRow ? kid.rect.w : kid.rect.h), 0) +
        gap * Math.max(0, k - 1)
    let cur = (alongRow ? innerX : innerTop) + Math.max(0, (extent - span) / 2)

    for (const kid of kids) {
        // A stretching role fills the cross axis: a masthead spans its page, a section
        // heading spans its column. Measured at its text width, then widened here — the
        // container's size still comes from the widest ordinary child.
        const kn = kid.node
        const a = alignOf(kn)
        const stretches =
            a === "stretch" ||
            (kn.kind === "box" && kn.role && roleMetrics(kn.role).stretch)
        // Cross-axis position: centred unless the child asked for an edge.
        const cross = (room: number, size: number): number => {
            if (a === "start") return 0
            if (a === "end") return Math.max(0, room - size)
            return (room - size) / 2
        }
        if (alongRow) {
            if (stretches) kid.rect.h = innerH
            place(kid, cur, innerTop + cross(innerH, kid.rect.h), links)
            cur += kid.rect.w + gap
        } else {
            if (stretches) kid.rect.w = innerW
            place(kid, innerX + cross(innerW, kid.rect.w), cur, links)
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
    links: LayoutLinks,
): void {
    const down = n.spread === "down"
    const along = down ? "h" : "w"
    const across = down ? "w" : "h"
    const tree = radialHierarchy(p.children, links, across, n.gap)
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
            if (down) place(b.p, mid - b.p.rect.w / 2, a, links)
            else place(b.p, a, mid - b.p.rect.h / 2, links)

            if (b.kids.length) {
                // `alongPos` means the NEAR edge going outwards and the FAR edge coming back,
                // which is why the two directions are not symmetric here: on the left the
                // recursion subtracts the child's own width, so subtracting the ring width as
                // well would place it a full ring too far out — off the frame.
                const next = sign > 0 ? a + b.p.rect[along] + n.gap : a - n.gap
                spread(b.kids, mid, next, sign)
            }
            cur += b.extent + n.gap
        }
    }

    if (down) {
        place(centre, innerX + (innerW - centre.rect.w) / 2, innerTop, links)
        spread(
            branches,
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
        links,
    )
    const midY = centre.rect.y + centre.rect.h / 2
    spread(right, midY, centre.rect.x + centre.rect.w + n.gap, 1)
    spread(left, midY, centre.rect.x - n.gap, -1)
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
        links?: LayoutLinks
    } = {},
): LayoutResult {
    const glyph = opts.iconSize ?? ICON_SIZE
    const gap = opts.gap ?? 70
    const links: LayoutLinks = opts.links ?? []
    const placed = roots.map((r) => measure(r, glyph, links))

    let cur = ORIGIN.x
    for (const p of placed) {
        const n = p.node
        const held =
            n.kind === "title" ? null : n.pinned ? (n.rect ?? null) : null
        if (held) {
            place(p, held.x, held.y, links)
        } else {
            place(p, cur, ORIGIN.y, links)
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
