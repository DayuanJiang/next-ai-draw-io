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
    style?: string
    pinned?: boolean
    rect?: Rect
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

export type ContainerNode = GroupNode | GridNode
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
    return n.kind === "group" || n.kind === "grid"
}

export function isLeaf(n: DiagramNode): n is LeafNode {
    return !isContainer(n)
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
