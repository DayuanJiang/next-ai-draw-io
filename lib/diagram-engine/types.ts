/**
 * The declarative node tree the layout engine works on.
 *
 * The model never writes coordinates. It declares nesting and direction; the engine
 * computes every x/y/width/height. The tree is not persisted anywhere — it is
 * re-derived from the canvas XML whenever it is needed (see parse.ts), so the canvas
 * stays the single source of truth and a user's manual edits are an input, never
 * something to be reconciled against a second copy of the state.
 */

import type { Direction } from "./markers"

export type { Direction } from "./markers"

/**
 * Which cell of a swimlane pool a node sits in.
 *
 * `lane` indexes the role band, `col` the position along the flow. Cells are sparse:
 * nothing has to fill lane 1 column 3 for lane 2 column 3 to exist.
 */
export interface PoolCell {
    lane: number
    col: number
}

/**
 * The outline a flowchart box is drawn with.
 *
 * Flowchart notation is conventional, not decorative: a reader takes a diamond to mean a
 * branch and a stadium to mean an entry or exit point. Rendering every step as the same
 * rectangle throws that away.
 */
export type BoxShape =
    | "box"
    | "decision"
    | "terminator"
    | "round"
    | "data"
    | "document"

/** A catalog icon: a real stencil, drawn at a fixed glyph size with a label below. */
export interface IconNode {
    kind: "icon"
    id: string
    /** Catalog name, e.g. "s3" or "azure_virtual_machine". Resolved to a style by the catalog. */
    name: string
    label: string
    /** Glyph size in px. Defaults to the diagram's icon size. */
    size?: number
    /** Verbatim style, when recovered from XML. Preferred over re-resolving `name`. */
    style?: string
    /** User froze this node's position — the engine must not move it. */
    pinned?: boolean
    /** Absolute geometry, when recovered from XML. Only meaningful for a pinned node. */
    rect?: Rect
    /** Position within a `pool` parent. Ignored elsewhere. */
    cell?: PoolCell
}

/** A plain labelled rectangle, for things the catalog has no icon for. */
export interface BoxNode {
    kind: "box"
    id: string
    label: string
    w?: number
    h?: number
    fill?: string
    stroke?: string
    bold?: boolean
    /** Flowchart outline. Absent means a plain rectangle. */
    shape?: BoxShape
    style?: string
    pinned?: boolean
    rect?: Rect
    /** Position within a `pool` parent. Ignored elsewhere. */
    cell?: PoolCell
}

/** A page title. At most one per diagram; laid out outside the tree flow. */
export interface TitleNode {
    kind: "title"
    id: string
    label: string
}

/**
 * A container that stacks its children in one direction.
 *
 * `gname` is the catalog group stencil (group_vpc, group_region, …). When null the
 * container renders as a plain frame — a labelled rectangle with a border.
 */
export interface GroupNode {
    kind: "group"
    id: string
    gname: string | null
    label: string
    dir: Extract<Direction, "row" | "col">
    gap: number
    children: DiagramNode[]
    fill?: string
    stroke?: string
    style?: string
    pinned?: boolean
    rect?: Rect
}

/** A container that packs its children into a fixed number of columns. */
export interface GridNode {
    kind: "grid"
    id: string
    gname: string | null
    label: string
    cols: number
    gap: number
    children: DiagramNode[]
    fill?: string
    stroke?: string
    style?: string
    pinned?: boolean
    rect?: Rect
}

/**
 * A swimlane pool: a sparse grid of (lane, column) cells.
 *
 * `lanes` names the role bands. Each child declares which cell it occupies, and empty
 * cells stay empty — that is the whole point of a swimlane diagram, where a step belongs
 * to exactly one role and the columns show the order things happen in.
 *
 * `phases` is an optional band of milestone labels above the columns.
 */
export interface PoolNode {
    kind: "pool"
    id: string
    label: string
    /** Role names, one per band. */
    lanes: string[]
    /** Milestone labels spanning the columns. Empty means no milestone band. */
    phases: string[]
    /** "horizontal": lanes stack downwards, flow left to right. "vertical": the mirror. */
    orientation: "horizontal" | "vertical"
    gap: number
    children: DiagramNode[]
    style?: string
    pinned?: boolean
    rect?: Rect
}

/**
 * A sequence diagram: participants across the top, lifelines hanging below them.
 *
 * Children are the participant heads, in left-to-right order. The messages are ordinary
 * links whose `step` gives the vertical order — so the same `link` operation that draws
 * an arrow in a flowchart draws a message here.
 *
 * The engine emits the lifelines as separate cells; they are not nodes, because nothing
 * ever attaches to a lifeline directly.
 */
export interface SequenceNode {
    kind: "sequence"
    id: string
    label: string
    /** Horizontal distance between participant centres. */
    gap: number
    /** Vertical distance between consecutive messages. */
    step: number
    children: DiagramNode[]
    style?: string
    pinned?: boolean
    rect?: Rect
}

/**
 * A mind map or org chart: a root with branches radiating from it.
 *
 * Children are a FLAT list of every node in the map. The hierarchy comes from the links —
 * an arrow from A to B means B is a branch of A — not from nesting.
 *
 * That is not a shortcut, it is the only thing that works: a branch of a mind map is a
 * labelled box that also has sub-branches, and a box cannot hold children. Reading the
 * hierarchy from the arrows also matches what the diagram means, since in a mind map or an
 * org chart the arrows ARE the structure.
 *
 * `spread: "radial"` fans branches out on both sides of the centre, which is what a mind
 * map wants. `spread: "down"` puts every branch below the centre, which is what an org
 * chart wants: a reporting line only reads correctly downwards.
 */
export interface RadialNode {
    kind: "radial"
    id: string
    label: string
    spread: "radial" | "down"
    /** Distance from a parent's edge to its children. */
    gap: number
    children: DiagramNode[]
    style?: string
    pinned?: boolean
    rect?: Rect
}

export type ContainerNode =
    | GroupNode
    | GridNode
    | PoolNode
    | SequenceNode
    | RadialNode
export type LeafNode = IconNode | BoxNode | TitleNode
export type DiagramNode = ContainerNode | LeafNode

export interface Rect {
    x: number
    y: number
    w: number
    h: number
}

/** An arrow. Routing is the engine's business; the model only says what connects to what. */
export interface LinkSpec {
    /** Cell id, so an existing edge can be addressed by later operations. */
    id?: string
    source: string
    target: string
    label?: string
    /** Dashed line — replication, sync, policy, lineage. */
    dashed?: boolean
    /** Step number, rendered as an "N. " prefix on the label. */
    step?: number
    /** Verbatim style, when recovered from XML. */
    style?: string
}

/** A whole diagram page: the node forest plus its arrows. */
export interface DiagramTree {
    /** Top-level nodes, in layout order. */
    roots: DiagramNode[]
    links: LinkSpec[]
    /** Page title, if the diagram has one. */
    title?: string
    /**
     * Cells the parser could not fit into the tree — a user's own annotation boxes, a
     * legend, shapes from an imported file. Kept verbatim and re-emitted untouched so
     * a re-layout never destroys work the engine does not understand.
     */
    foreign: ForeignCell[]
}

/** A cell carried through the round-trip without interpretation. */
export interface ForeignCell {
    id: string
    /** The cell's own serialised XML, verbatim. */
    xml: string
    /** Parent id at parse time, so it can be re-attached. */
    parent: string
}

export function isContainer(n: DiagramNode): n is ContainerNode {
    return (
        n.kind === "group" ||
        n.kind === "grid" ||
        n.kind === "pool" ||
        n.kind === "sequence" ||
        n.kind === "radial"
    )
}

export function isLeaf(n: DiagramNode): n is LeafNode {
    return !isContainer(n)
}

/**
 * A container that can carry a catalog group stencil and a hand-set fill or stroke.
 *
 * The specialised containers draw their own chrome — a pool paints lane bands, a sequence
 * paints lifelines — so a stencil frame or an arbitrary fill would fight what they emit.
 */
export function hasStencilFrame(n: DiagramNode): n is GroupNode | GridNode {
    return n.kind === "group" || n.kind === "grid"
}

/** A container whose children stack along one axis, so `dir` is meaningful. */
export function isDirectional(n: DiagramNode): n is GroupNode {
    return n.kind === "group"
}

/** Depth-first walk over a node and its descendants. */
export function* walk(n: DiagramNode): Generator<DiagramNode> {
    yield n
    if (isContainer(n)) for (const c of n.children) yield* walk(c)
}

/** Every node in a tree, in document order. */
export function* walkTree(t: DiagramTree): Generator<DiagramNode> {
    for (const r of t.roots) yield* walk(r)
}

/** Find a node by id, or null. */
export function findNode(t: DiagramTree, id: string): DiagramNode | null {
    for (const n of walkTree(t)) if (n.id === id) return n
    return null
}

/** The container holding `id`, or null when it is a root or absent. */
export function findParent(t: DiagramTree, id: string): ContainerNode | null {
    for (const n of walkTree(t)) {
        if (!isContainer(n)) continue
        if (n.children.some((c) => c.id === id)) return n
    }
    return null
}
