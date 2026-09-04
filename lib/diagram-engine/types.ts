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
import type { Role } from "./theme"

export type { Direction } from "./markers"
export type { Role } from "./theme"

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
 * Cross-axis behaviour of a child inside a row/col group, CSS's align-items per child:
 * pin to either edge, centre (the default), or stretch to fill the axis.
 */
export type Align = "start" | "center" | "end" | "stretch"

/**
 * Presentation a node may override, beyond what its `role` decides.
 *
 * The admission test is that draw.io can draw the distinction FAITHFULLY — see tw.ts for the
 * properties that failed it and why. Most fields here are one style key with one value; a few
 * (`shadow`, `borderStyle`, the radius trio) expand to a fixed group of keys, which is fine
 * because the field still names one visual decision. What is not allowed is a field whose
 * values collapse onto fewer pictures than it promises.
 *
 * Kept as one optional object rather than a dozen loose fields so the round-trip has one
 * thing to carry and the node type does not grow a field per CSS property.
 *
 * `role` remains the primary way to say what a node IS; this is for the cases where the
 * model needs to override one aspect of how it looks.
 */
export interface TextStyle {
    /** Bold. draw.io's fontStyle carries one bold bit, not a weight ladder. */
    bold?: boolean
    italic?: boolean
    underline?: boolean
    /** Strikethrough — a fourth bit in the same mask, so it combines with the others. */
    strike?: boolean
    /** Type size in px. */
    size?: number
    /** Horizontal text alignment inside the shape. */
    align?: "left" | "center" | "right"
    /** Vertical text alignment inside the shape. */
    valign?: "top" | "middle" | "bottom"
    /** Keep the label on one line instead of wrapping it. */
    nowrap?: boolean
    /** Border thickness in px. */
    borderWidth?: number
    /** Border line style. Dashed and dotted read as "planned", "optional", "logical". */
    borderStyle?: "solid" | "dashed" | "dotted"
    /**
     * Corner radius in px.
     *
     * Real pixels, not a percentage: draw.io's `arcSize` is a percentage of the shape by
     * default, but `absoluteArcSize=1` switches it to absolute units, and it halves the
     * value, so an 8px radius is emitted as `arcSize=16` (mxShape.getArcSize,
     * mxShape.js:1172-1189).
     *
     * Overrides the radius of a shape that has one of its own: `round` and `terminator` are
     * rounded rectangles already, and changing how round they are does not change what they
     * are, so a radius class is allowed to win.
     */
    radius?: number
    /** No border at all — a plain colour field. */
    borderless?: boolean
    /**
     * Drop shadow, as a rung: 1–4 for Tailwind's sm/md/lg/xl, 0 for explicitly none.
     *
     * A rung rather than raw offsets because draw.io takes five separate numbers
     * (`shadowOffsetX/Y`, `shadowBlur`, `shadowColor`, `shadowOpacity` — mxShape.js:505-535)
     * and letting a caller set them individually is exactly the magic-number freedom this
     * vocabulary exists to remove.
     */
    shadow?: number
}

/**
 * How a container spreads its children along its own stacking axis — CSS's
 * justify-content, and Yoga's six values.
 *
 * Until this existed the policy was hard-coded and differed per axis: a row padded its
 * gaps and centred the result, a column packed to the top and left every spare pixel in
 * one slab at the bottom. That slab is the empty bottom-left corner of a poster, and
 * nothing the model could declare would move it.
 */
export type Justify =
    | "start"
    | "center"
    | "end"
    | "between"
    | "around"
    | "evenly"

/**
 * What a box IS, drawn as its conventional outline.
 *
 * Open vocabulary: catalog names ("cylinder", "decision", "person"…) get full engine
 * support — correct perimeter, text sized to fit the outline. Any other draw.io shape
 * token passes through verbatim and degrades to a rectangle if the editor does not
 * know it. See shapes.ts.
 */
export type BoxShape = string

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
    /** What this node IS in the information hierarchy; the theme decides how that looks. */
    role?: Role
    /** Semantic zone name; every node sharing a group gets the same hue ramp. */
    group?: string
    /** Share of the parent's leftover flow-axis space, like flex-grow. 0/absent = natural size. */
    grow?: number
    /** Cross-axis behaviour within the parent. Absent = center; stretch = fill it. */
    align?: Align
    /**
     * Hard cap on width, px. Text rewraps to fit instead of running the box wider, so
     * this is what stops one long sentence stretching a whole page into a letterbox.
     * Higher priority than `grow`, matching Yoga's min/max rule.
     */
    maxW?: number
    /** Let a `grow` weight shrink this below its own text width — CSS's `min-width: 0`. */
    minW0?: boolean
    /** Presentation overrides: type, alignment, border. Absent means the role decides. */
    text?: TextStyle
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
    /** Section role; a themed panel for its children. */
    role?: Role
    /** Semantic zone name; the panel takes this hue's tint. */
    group?: string
    /** Share of the parent's leftover flow-axis space, like flex-grow. */
    grow?: number
    /** Cross-axis behaviour within the parent. Absent = center; stretch = fill it. */
    align?: Align
    /** How the children spread along `dir`. Absent = start (packed, no extra spacing). */
    justify?: Justify
    /** Cross-axis default for every child that does not declare its own `align`. */
    alignItems?: Align
    /** Hard cap on width, px. Children wrap or shrink to fit rather than overflow it. */
    maxW?: number
    /**
     * Let a `grow` weight shrink this below its own content width — CSS's `min-width: 0`.
     *
     * Without it a weighted child is floored by its text, which is real flexbox behaviour
     * (`min-width` defaults to `auto`) but means a declared 2:1 quietly resolves to
     * whatever the two columns' text allows.
     */
    minW0?: boolean
    /** Presentation overrides: title type, alignment, frame border. */
    text?: TextStyle
    /** Interior padding, px. Absent = the default (24). */
    pad?: number
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
    /**
     * A bold arrow: the relationship IS the point — a transformation, the main flow.
     * Thick and coloured, a visual element rather than a hairline connector.
     */
    bold?: boolean
    /**
     * Arrowhead at the target / at the source. draw.io endArrow/startArrow tokens:
     * block, open, diamond, diamondThin, oval, cross, ERone, ERmany, ERoneToMany,
     * ERzeroToMany, ERzeroToOne, none… Unset means the default (classic at the target,
     * nothing at the source). `headFill`/`tailFill` distinguish UML composition
     * (filled diamond) from aggregation (hollow) — conventions where fill IS meaning.
     */
    head?: string
    tail?: string
    headFill?: boolean
    tailFill?: boolean
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
     * Target width : height of the whole page. 1 is square, 1.6 landscape, 0.7 portrait.
     *
     * This is the one number that decides whether a diagram reads as a poster or as a
     * letterbox, and it cannot be derived: the same content is a legitimate 1-column
     * portrait or 3-column landscape. So the model declares it, the engine gives the top
     * level a width to match, and every proportional rule below finally has a share of
     * something real to divide up.
     */
    aspect?: number
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
