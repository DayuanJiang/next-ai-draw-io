/**
 * tree → XML. Takes a laid-out forest and writes the mxCell elements draw.io reads.
 *
 * Every cell it emits carries `container=1` on containers and `dai_*` markers recording
 * the layout parameters, so parse.ts can read the structure back. That round-trip is
 * what lets the canvas stay the single source of truth.
 *
 * Ported from drawio-ai-kit (MIT) — see NOTICE.
 */

import {
    flatten,
    ICON_SIZE,
    LANE_LABEL,
    layoutForest,
    type Placed,
    POOL_PAD,
    poolMetrics,
    sequenceMetrics,
} from "./layout"
import {
    stampCell,
    stampContainer,
    stampLane,
    stampLeaf,
    stampPool,
    stampPoolDecoration,
    stampRadial,
    stampSequence,
} from "./markers"
import { type RoutedEdge, routeEdges } from "./route"
import type {
    BoxShape,
    DiagramNode,
    DiagramTree,
    LinkSpec,
    PoolNode,
    Rect,
    SequenceNode,
} from "./types"

/** Escape the five characters that would break an XML attribute. */
export function esc(s: string): string {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

/** Resolve a catalog name to a style. Injected so the engine does not own the catalog. */
export type StyleResolver = (
    name: string,
    kind: "icon" | "group",
) => string | null

const FALLBACK_BOX =
    "rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#5A6B7B;fontColor=#1A1A1A;fontSize=11;verticalAlign=middle;"
const FALLBACK_FRAME =
    "rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#999999;fontColor=#1A1A1A;fontSize=12;fontStyle=1;verticalAlign=top;align=left;spacingLeft=8;spacingTop=4;"
const TITLE_STYLE =
    "text;html=1;align=center;fontStyle=1;fontSize=14;fontColor=light-dark(#232F3E,#E8E8E8);"
const EDGE_STYLE =
    "edgeStyle=orthogonalEdgeStyle;html=1;rounded=0;jettySize=auto;orthogonalLoop=1;fontSize=10;fontColor=light-dark(#1B2733,#CFE0F0);strokeColor=light-dark(#1A1A1A,#E0E0E0);strokeWidth=1;"

/**
 * Flowchart outlines, as mxGraph draws them.
 *
 * All six are core mxGraph shapes, not stencils from a shape library, so they render
 * without the catalog and without any extra dependency. The notation is conventional: a
 * reader takes a diamond to mean a branch and a stadium to mean a start or end point, so
 * drawing every step as the same rectangle loses information the shape was carrying.
 */
const BOX_SHAPES: Record<BoxShape, string> = {
    box: "rounded=0;",
    round: "rounded=1;arcSize=12;",
    /** Decision — a diamond. */
    decision: "rhombus;",
    /** Start or end — a stadium. draw.io draws `rounded=1` at arcSize 50 as a full stadium. */
    terminator: "rounded=1;arcSize=50;",
    /** Input or output — a parallelogram. */
    data: "shape=parallelogram;perimeter=parallelogramPerimeter;fixedSize=1;size=14;",
    /** A document or report — a rectangle with a wavy bottom edge. */
    document: "shape=document;boundedLbl=1;",
}

// ---- swimlane pool chrome ----

/** Hairline between lane bands: present, but quieter than the shapes sitting on it. */
const POOL_HAIR = "#D8E0E8"
/** Alternating band tint, so a reader can follow one lane across a wide diagram. */
const POOL_BAND_ALT = "#F5F8FB"
/** Lane-name column, slightly darker than the bands so it reads as a header. */
const POOL_LABEL_FILL = "#EEF2F7"
const POOL_FILL = "#FFFFFF"
const POOL_STROKE = "#5A6B7B"

/**
 * A participant head in a sequence diagram: the box at the top of a lifeline.
 *
 * `umlLifeline` is a core mxGraph shape whose cell covers the head AND the line below it,
 * with `size` giving the head's height. Emitting head and line as one cell is what makes
 * draw.io keep them together when the user drags the participant sideways.
 */
const LIFELINE_STYLE =
    "shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=0;collapsible=0;recursiveResize=0;outlineConnect=0;fillColor=#FFFFFF;strokeColor=#5A6B7B;fontColor=#1A1A1A;fontSize=11;fontStyle=1;"

export interface RenderOptions {
    /** Resolves a catalog icon/group name to its verbatim draw.io style. */
    resolveStyle?: StyleResolver
    /** Diagram-wide glyph size. */
    iconSize?: number
    /** Gap between top-level roots. */
    rootGap?: number
}

/**
 * Build the style for one node.
 *
 * A style recovered from XML is preferred over re-resolving the catalog name: it is
 * what is already on the canvas, including any colour the user changed by hand. We only
 * re-stamp the markers on top, so layout parameters stay current.
 */
function styleFor(n: DiagramNode, resolve: StyleResolver | undefined): string {
    if (n.kind === "title") return TITLE_STYLE

    if (n.kind === "icon") {
        const base =
            n.style ??
            (n.name ? resolve?.(n.name, "icon") : null) ??
            FALLBACK_BOX
        return stampLeaf(base, "icon", { name: n.name })
    }

    if (n.kind === "box") {
        let base = n.style ?? FALLBACK_BOX
        if (!n.style) {
            // The outline comes first: BOX_SHAPES carries `rounded=`, which the fallback
            // also sets, and appending lets the shape's value win.
            if (n.shape) base += BOX_SHAPES[n.shape]
            if (n.fill) base += `fillColor=${n.fill};`
            if (n.stroke) base += `strokeColor=${n.stroke};`
            if (n.bold) base += "fontStyle=1;"
        }
        const stamped = stampLeaf(base, "box")
        return n.cell ? stampCell(stamped, n.cell) : stamped
    }

    if (n.kind === "pool") {
        return stampPool(n.style ?? poolFrameStyle(), {
            lanes: n.lanes,
            phases: n.phases,
            orientation: n.orientation,
            gap: n.gap,
        })
    }

    if (n.kind === "sequence" || n.kind === "radial") {
        // Both draw their own contents — lifelines, branch arrows — so the container itself
        // is a frame only when the model labelled it, and invisible otherwise.
        const base =
            n.style ?? (n.label ? FALLBACK_FRAME : INVISIBLE_FRAME_STYLE)
        return n.kind === "sequence"
            ? stampSequence(base, { gap: n.gap, step: n.step })
            : stampRadial(base, { spread: n.spread, gap: n.gap })
    }

    // group or grid
    const fromCatalog = n.gname ? resolve?.(n.gname, "group") : null
    // An unlabelled frame with no stencil is a layout-only wrapper: emit a real cell so
    // the structure survives a round-trip, but draw nothing. This replaces the
    // reference project's "phantom", which emitted no cell and therefore lost the
    // wrapper's direction and grouping on the way back.
    const invisible = !n.gname && !n.label && !n.fill && !n.stroke
    let base = n.style ?? fromCatalog ?? FALLBACK_FRAME
    if (!n.style && !fromCatalog) {
        if (n.fill) base += `fillColor=${n.fill};`
        if (n.stroke) base += `strokeColor=${n.stroke};`
    }
    return stampContainer(base, {
        kind: n.kind,
        dir: n.kind === "grid" ? "grid" : n.dir,
        gap: n.gap,
        cols: n.kind === "grid" ? n.cols : undefined,
        invisible,
    })
}

/** A pool's outer frame: a plain titled rectangle, since the bands supply the structure. */
function poolFrameStyle(): string {
    return (
        `rounded=0;whiteSpace=wrap;html=1;fillColor=${POOL_FILL};strokeColor=${POOL_STROKE};` +
        `fontColor=#1A1A1A;fontSize=13;fontStyle=1;verticalAlign=top;align=left;spacingLeft=8;spacingTop=4;`
    )
}

const INVISIBLE_FRAME_STYLE =
    "rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=none;"

/**
 * One `<mxCell>` for a vertex, with geometry relative to its parent.
 *
 * An icon's cell is the glyph square, not the measured slot. Layout reserves a wider,
 * taller slot so the label underneath has room, but the cell itself must stay square:
 * the stencil scales to the cell, and `verticalLabelPosition=bottom` renders the label
 * outside it. Emitting the padded slot would both stretch the glyph and — because the
 * padding depends on the label length — make the size grow on every round-trip.
 */
/**
 * The rectangle a node actually occupies in the XML.
 *
 * For everything except an icon this is the slot layout measured. An icon's slot is wider
 * and taller than the glyph, to leave room for the label underneath, but the cell itself
 * is the glyph square centred in that slot.
 *
 * The router has to use this, not the slot: a slot is roughly twice the glyph's width, so
 * collision tests against slots both miss real overlaps and invent false ones.
 */
export function cellRect(
    n: DiagramNode,
    slot: Rect,
    defaultGlyph: number,
): Rect {
    if (n.kind !== "icon") return slot
    const glyph = n.size ?? defaultGlyph
    return {
        x: Math.round(slot.x + (slot.w - glyph) / 2),
        y: slot.y,
        w: glyph,
        h: glyph,
    }
}

function vertexXml(
    n: DiagramNode,
    rect: Rect,
    parent: string,
    parentRect: Rect | null,
    resolve: StyleResolver | undefined,
    defaultGlyph: number,
): string {
    const ox = parentRect?.x ?? 0
    const oy = parentRect?.y ?? 0
    const box = cellRect(n, rect, defaultGlyph)
    return (
        `<mxCell id="${esc(n.id)}" value="${esc("label" in n ? n.label : "")}"` +
        ` style="${styleFor(n, resolve)}" vertex="1" parent="${esc(parent)}">` +
        `<mxGeometry x="${box.x - ox}" y="${box.y - oy}" width="${box.w}" height="${box.h}" as="geometry"/>` +
        `</mxCell>`
    )
}

/** The lane a node declared, or 0. */
function poolLaneOf(n: DiagramNode): number {
    return (n.kind === "icon" || n.kind === "box") && n.cell
        ? Math.max(0, n.cell.lane)
        : 0
}

/**
 * How many messages a sequence container has.
 *
 * The highest step number, or the message count when the model numbered nothing — either
 * way, one row per message, so the arrows do not stack on a single y.
 */
function countMessages(
    n: SequenceNode,
    links: { source: string; target: string; step?: number }[],
): number {
    const own = new Set(n.children.map((c) => c.id))
    const mine = links.filter((l) => own.has(l.source) && own.has(l.target))
    const steps = mine
        .map((l) => l.step)
        .filter((s): s is number => s != null && s > 0)
    return Math.max(mine.length, ...(steps.length ? steps : [0]))
}

/** One chrome cell: a lane band, a label column, a milestone strip, a lifeline. */
function chromeXml(
    id: string,
    parent: string,
    rect: Rect,
    parentRect: Rect | null,
    style: string,
    label: string,
): string {
    const ox = parentRect?.x ?? 0
    const oy = parentRect?.y ?? 0
    return (
        `<mxCell id="${esc(id)}" value="${esc(label)}" style="${style}" vertex="1" parent="${esc(parent)}">` +
        `<mxGeometry x="${Math.round(rect.x - ox)}" y="${Math.round(rect.y - oy)}"` +
        ` width="${Math.round(rect.w)}" height="${Math.round(rect.h)}" as="geometry"/></mxCell>`
    )
}

/**
 * The lane bands, role-name column and milestone strip of a swimlane pool.
 *
 * Emitted BEFORE the pool's children so the nodes render on top of the bands, and derived
 * from the same `poolMetrics` layout used, so a band cannot end up offset from the nodes
 * sitting on it.
 *
 * The bands are draw.io containers and the nodes are their children. That is what makes a
 * user dragging a step onto another role's band record the change: draw.io rewrites the
 * node's `parent` to that band, and the band's `dai_lane` marker says which lane it is.
 */
function poolChrome(
    n: PoolNode,
    rect: Rect,
    kids: { rect: Rect }[],
): { xml: string[]; bands: { id: string; rect: Rect }[] } {
    const m = poolMetrics(n, rect, kids)
    const xml: string[] = []
    const bands: { id: string; rect: Rect }[] = []

    for (let i = 0; i < m.lanes; i++) {
        const band: Rect = m.horizontal
            ? {
                  x: m.contentX,
                  y: m.contentY + i * m.cellH,
                  w: m.contentW,
                  h: m.cellH,
              }
            : {
                  x: rect.x + POOL_PAD + i * m.cellW,
                  y: m.contentY,
                  w: m.cellW,
                  h: m.contentH,
              }
        const tint = i % 2 ? POOL_BAND_ALT : POOL_FILL
        xml.push(
            chromeXml(
                `${n.id}__band${i}`,
                n.id,
                band,
                rect,
                stampLane(
                    `rounded=0;whiteSpace=wrap;html=1;fillColor=${tint};strokeColor=${POOL_HAIR};`,
                    i,
                ),
                "",
            ),
        )
        bands.push({ id: `${n.id}__band${i}`, rect: band })

        // The role name, in its own column beside the band.
        const label: Rect = m.horizontal
            ? {
                  x: rect.x + POOL_PAD,
                  y: m.contentY + i * m.cellH,
                  w: LANE_LABEL,
                  h: m.cellH,
              }
            : {
                  x: rect.x + POOL_PAD + i * m.cellW,
                  y: rect.y + m.header + POOL_PAD,
                  w: m.cellW,
                  h: LANE_LABEL,
              }
        xml.push(
            chromeXml(
                `${n.id}__lane${i}`,
                n.id,
                label,
                rect,
                stampPoolDecoration(
                    `rounded=0;whiteSpace=wrap;html=1;fillColor=${POOL_LABEL_FILL};strokeColor=${POOL_HAIR};` +
                        `verticalAlign=middle;align=center;fontStyle=1;fontSize=11;${m.horizontal ? "" : "horizontal=1;"}`,
                ),
                n.lanes[i] ?? "",
            ),
        )
    }

    // Milestone labels, each spanning its even share of the columns.
    for (let j = 0; j < n.phases.length; j++) {
        const count = n.phases.length
        const from = Math.floor((j * m.cols) / count)
        const to = Math.floor(((j + 1) * m.cols) / count)
        const last = j === count - 1
        const span = (to - from) * (m.cellW + n.gap) - (last ? n.gap : 0)
        const strip: Rect = m.horizontal
            ? {
                  x: m.contentX + from * (m.cellW + n.gap),
                  y: rect.y + m.header,
                  w: Math.max(0, span),
                  h: m.phaseLabel,
              }
            : {
                  x: rect.x + POOL_PAD + m.contentW + n.gap,
                  y: m.contentY + from * (m.cellH + n.gap),
                  w: m.phaseLabel,
                  h: Math.max(
                      0,
                      (to - from) * (m.cellH + n.gap) - (last ? n.gap : 0),
                  ),
              }
        xml.push(
            chromeXml(
                `${n.id}__phase${j}`,
                n.id,
                strip,
                rect,
                stampPoolDecoration(
                    `rounded=0;whiteSpace=wrap;html=1;fillColor=${POOL_FILL};strokeColor=${POOL_HAIR};` +
                        `verticalAlign=middle;align=center;fontStyle=1;fontSize=11;`,
                ),
                n.phases[j] ?? "",
            ),
        )
    }
    return { xml, bands }
}

/**
 * The lifelines of a sequence diagram: one per participant, hanging from its head.
 *
 * Head and line are ONE cell, using mxGraph's `umlLifeline` shape with `size` set to the
 * head's height. That is what keeps them together when the user drags a participant
 * sideways — two separate cells would come apart, and the line would be left behind.
 *
 * The participant node itself is therefore not emitted as its own cell: this replaces it.
 */
function sequenceChrome(
    n: SequenceNode,
    rect: Rect,
    kids: { node: DiagramNode; rect: Rect }[],
    messages: number,
): { xml: string[]; replaced: Set<string> } {
    const m = sequenceMetrics(n, rect, messages)
    const xml: string[] = []
    const replaced = new Set<string>()
    for (const k of kids) {
        const head = k.rect
        xml.push(
            chromeXml(
                k.node.id,
                n.id,
                {
                    x: head.x,
                    y: head.y,
                    w: head.w,
                    h: Math.max(head.h, m.bottom - head.y),
                },
                rect,
                `${LIFELINE_STYLE}size=${Math.round(head.h)};`,
                "label" in k.node ? k.node.label : "",
            ),
        )
        replaced.add(k.node.id)
    }
    return { xml, replaced }
}

/** The label an edge renders, with its step number prefixed. */
function edgeLabel(l: LinkSpec): string {
    if (l.step == null) return l.label ?? ""
    return l.label ? `${l.step}. ${l.label}` : `${l.step}.`
}

/**
 * One `<mxCell>` for an edge, carrying the route the router computed.
 *
 * Connection points are always written. They are fractions of the terminal's bounds, so
 * draw.io recomputes them from live geometry on every edit — they follow a node when the
 * user drags it. Without them draw.io picks the side itself, knowing only the two
 * terminals and nothing about the other icons, which is how arrows end up running through
 * unrelated shapes and stacking several on one point.
 *
 * Waypoints are absolute, so draw.io keeps them after a drag and the route deforms. They
 * are written only when the router says they are load-bearing: a labelled bend (the label
 * sits at the path midpoint and needs a straight segment under it) or a deliberate detour
 * around something a straight line would have hit.
 */
function edgeXml(l: LinkSpec, index: number, route?: RoutedEdge): string {
    const label = edgeLabel(l)
    let style = l.style ?? EDGE_STYLE
    if (!l.style) {
        if (l.dashed) style += "dashed=1;"
        if (label) style += "labelBackgroundColor=light-dark(#FFFFFF,#0B0F14);"
    }
    if (route)
        style +=
            `exitX=${route.exit.x};exitY=${route.exit.y};exitDx=0;exitDy=0;` +
            `entryX=${route.entry.x};entryY=${route.entry.y};entryDx=0;entryDy=0;`
    const id = l.id ?? `ed${index + 1}`
    const points =
        route?.freeze && route.waypoints.length
            ? `<Array as="points">${route.waypoints
                  .map(
                      (p) =>
                          `<mxPoint x="${Math.round(p.x)}" y="${Math.round(p.y)}"/>`,
                  )
                  .join("")}</Array>`
            : ""
    return (
        `<mxCell id="${esc(id)}" value="${esc(label)}" style="${style}" edge="1" parent="1"` +
        ` source="${esc(l.source)}" target="${esc(l.target)}">` +
        `<mxGeometry relative="1" as="geometry">${points}</mxGeometry>` +
        `</mxCell>`
    )
}

/**
 * One message of a sequence diagram: a horizontal arrow between two lifelines.
 *
 * Written with absolute endpoints rather than terminal references, because that is the only
 * way to control the HEIGHT. A message's vertical position is its position in the
 * conversation; if draw.io picked it, the reading order would be whatever the geometry
 * happened to give. The source and target are still recorded, so the arrow follows a
 * participant the user drags sideways and the parser can read the message back.
 *
 * A self-message — an object calling itself — cannot be a straight line, so it steps out to
 * the right and comes back one row lower.
 */
function messageXml(
    l: LinkSpec,
    index: number,
    y: number,
    rects: Map<string, Rect>,
): string {
    const a = rects.get(l.source)
    const b = rects.get(l.target)
    const centre = (r: Rect | undefined) => (r ? r.x + r.w / 2 : 0)
    const from = centre(a)
    const to = centre(b)
    const self = l.source === l.target
    let style = l.style ?? EDGE_STYLE
    if (!l.style) {
        style += "endArrow=block;endFill=1;html=1;"
        if (l.dashed) style += "dashed=1;"
        style += "labelBackgroundColor=light-dark(#FFFFFF,#0B0F14);"
        style += self ? "edgeStyle=orthogonalEdgeStyle;" : "edgeStyle=none;"
    }
    const id = l.id ?? `ed${index + 1}`
    // A self-message loops out 40px and drops half a row, so it reads as one call and return.
    const points = self
        ? `<Array as="points"><mxPoint x="${Math.round(from + 40)}" y="${Math.round(y)}"/>` +
          `<mxPoint x="${Math.round(from + 40)}" y="${Math.round(y + 22)}"/></Array>`
        : ""
    const endY = self ? y + 22 : y
    return (
        `<mxCell id="${esc(id)}" value="${esc(edgeLabel(l))}" style="${style}" edge="1" parent="1"` +
        ` source="${esc(l.source)}" target="${esc(l.target)}">` +
        `<mxGeometry relative="1" as="geometry">${points}` +
        `<mxPoint x="${Math.round(from)}" y="${Math.round(y)}" as="sourcePoint"/>` +
        `<mxPoint x="${Math.round(self ? from : to)}" y="${Math.round(endY)}" as="targetPoint"/>` +
        `</mxGeometry></mxCell>`
    )
}

export interface RenderResult {
    /** A complete `<mxfile>` document, ready for the editor. */
    xml: string
    page: { w: number; h: number }
    /** Ids the links referenced that no node provides — these edges were dropped. */
    danglingLinks: string[]
}

/**
 * Render a tree to a complete draw.io document.
 *
 * Links whose endpoints do not exist are dropped rather than emitted: draw.io renders a
 * dangling edge as an arrow floating in space, which looks like a bug in the diagram.
 * The dropped ids are reported so the caller can tell the model what happened.
 */
export function renderDiagram(
    tree: DiagramTree,
    opts: RenderOptions = {},
): RenderResult {
    const { roots, page } = layoutForest(tree.roots, {
        iconSize: opts.iconSize,
        gap: opts.rootGap,
        links: tree.links,
    })

    const flat = flatten(roots)
    const glyph = opts.iconSize ?? ICON_SIZE
    // Slot rectangles, for positioning children relative to their parent.
    const rectById = new Map<string, Rect>()
    for (const f of flat) rectById.set(f.node.id, f.rect)
    // Emitted-cell rectangles, which is what the router must see.
    const cellById = new Map<string, Rect>()
    for (const f of flat)
        cellById.set(f.node.id, cellRect(f.node, f.rect, glyph))

    const cells: string[] = []

    // Title spans the page width, above the content.
    if (tree.title)
        cells.push(
            `<mxCell id="__title" value="${esc(tree.title)}" style="${TITLE_STYLE}" vertex="1" parent="1">` +
                `<mxGeometry x="0" y="24" width="${page.w}" height="30" as="geometry"/></mxCell>`,
        )

    // A pool's children are parented to its lane BANDS, not to the pool: that is what
    // records the role assignment when the user drags a step to another lane.
    const bandOf = new Map<string, Rect & { id: string }>()
    // Participants a sequence container emits as lifelines instead of ordinary cells.
    const asLifeline = new Set<string>()
    // Message y-positions per sequence container, so its arrows can be pinned to a height.
    const messageYOf = new Map<string, (step: number) => number>()
    // Chrome cells, keyed by the container they belong to so they can be emitted just after
    // it — a band has to exist before the node that names it as parent.
    const chrome = new Map<string, string[]>()

    for (const f of flat) {
        const n = f.node
        if (n.kind === "pool") {
            const kids = n.children
                .map((c) => rectById.get(c.id))
                .filter((r): r is Rect => r !== undefined)
                .map((rect) => ({ rect }))
            const { xml, bands } = poolChrome(n, f.rect, kids)
            chrome.set(n.id, xml)
            for (const c of n.children) {
                const band = bands[Math.min(poolLaneOf(c), bands.length - 1)]
                if (band) bandOf.set(c.id, { ...band.rect, id: band.id })
            }
        } else if (n.kind === "sequence") {
            const kids = n.children
                .map((c) => ({ node: c, rect: rectById.get(c.id) }))
                .filter(
                    (k): k is { node: DiagramNode; rect: Rect } =>
                        k.rect !== undefined,
                )
            const count = countMessages(n, tree.links)
            const { xml, replaced } = sequenceChrome(n, f.rect, kids, count)
            chrome.set(n.id, xml)
            for (const id of replaced) asLifeline.add(id)
            messageYOf.set(n.id, sequenceMetrics(n, f.rect, count).messageY)
        }
    }

    // Parents come before children (flatten guarantees it), which draw.io requires.
    for (const f of flat) {
        // A lifeline cell already carries its participant's label and geometry.
        if (asLifeline.has(f.node.id)) continue
        const band = bandOf.get(f.node.id)
        const parent = band?.id ?? f.parent
        const parentRect =
            band ?? (parent === "1" ? null : (rectById.get(parent) ?? null))
        cells.push(
            vertexXml(
                f.node,
                f.rect,
                parent,
                parentRect,
                opts.resolveStyle,
                glyph,
            ),
        )
        const own = chrome.get(f.node.id)
        if (own) cells.push(...own)
    }

    // Cells the parser could not interpret — user annotations, imported shapes — go back
    // verbatim. A re-layout must not delete work the engine does not understand.
    const foreignLayer = tree.foreign.some((c) => c.parent === "boundaries")
    if (foreignLayer)
        cells.push(
            `<mxCell id="boundaries" value="Boundaries (locked)" parent="0" style="locked=1;"/>`,
        )
    for (const c of tree.foreign) cells.push(c.xml)

    const known = new Set(flat.map((f) => f.node.id))
    for (const c of tree.foreign) known.add(c.id)
    const dangling: string[] = []
    const drawable: LinkSpec[] = []
    for (const l of tree.links) {
        if (!known.has(l.source) || !known.has(l.target)) {
            if (!known.has(l.source)) dangling.push(l.source)
            if (!known.has(l.target)) dangling.push(l.target)
            continue
        }
        drawable.push(l)
    }

    // A message between two participants of the same sequence container is a horizontal
    // arrow at a fixed height, so it bypasses the router entirely: there is nothing to route
    // around, and the height is the message's ORDER, which a router is not allowed to move.
    const seqOwner = new Map<string, string>()
    for (const f of flat)
        if (f.node.kind === "sequence")
            for (const c of f.node.children) seqOwner.set(c.id, f.node.id)

    const messages: { link: LinkSpec; index: number; y: number }[] = []
    const routable: { link: LinkSpec; index: number }[] = []
    // Fallback numbering is per container: a page with two sequence diagrams on it must not
    // have the second one's messages continue the first one's count, which would push them
    // below the bottom of their own lifelines.
    const autoStep = new Map<string, number>()
    for (const [i, l] of drawable.entries()) {
        const owner = seqOwner.get(l.source)
        const yOf =
            owner && owner === seqOwner.get(l.target)
                ? messageYOf.get(owner)
                : undefined
        if (yOf && owner) {
            const next = (autoStep.get(owner) ?? 0) + 1
            autoStep.set(owner, next)
            messages.push({ link: l, index: i, y: yOf(l.step ?? next) })
        } else {
            routable.push({ link: l, index: i })
        }
    }

    // Route with the whole page in view. Only leaf shapes are obstacles: an edge from
    // outside a VPC to something inside it has to cross the VPC's border, so a container
    // frame must not block it. Lifelines are excluded too: a message's whole job is to run
    // from one lifeline to another, and every message crosses whatever lifelines lie between.
    const obstacles = new Set(
        flat
            .filter(
                (f) =>
                    (f.node.kind === "icon" || f.node.kind === "box") &&
                    !asLifeline.has(f.node.id),
            )
            .map((f) => f.node.id),
    )
    // Frames are passable but not free to ignore: a line that runs alongside a border, or
    // cuts through a frame only one of its endpoints belongs to, reads as a mistake even
    // though it hits nothing.
    const frames = new Set(
        flat
            .filter(
                (f) =>
                    f.node.kind === "group" ||
                    f.node.kind === "grid" ||
                    f.node.kind === "pool" ||
                    f.node.kind === "sequence" ||
                    f.node.kind === "radial",
            )
            .map((f) => f.node.id),
    )
    const routes = routeEdges(
        routable.map(({ link: l, index }) => ({
            id: l.id ?? `ed${index + 1}`,
            source: l.source,
            target: l.target,
            hasLabel: edgeLabel(l) !== "",
        })),
        cellById,
        obstacles,
        frames,
    )
    routable.forEach(({ link, index }, i) => {
        cells.push(edgeXml(link, index, routes[i]))
    })
    for (const m of messages)
        cells.push(messageXml(m.link, m.index, m.y, cellById))

    const model =
        `<mxGraphModel dx="1400" dy="900" grid="0" gridSize="10" guides="1" tooltips="1"` +
        ` connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${page.w}"` +
        ` pageHeight="${page.h}" math="0" shadow="0"><root><mxCell id="0"/>` +
        `<mxCell id="1" parent="0"/>${cells.join("")}</root></mxGraphModel>`

    return {
        xml: `<mxfile host="app.diagrams.net"><diagram name="Page-1" id="page-1">${model}</diagram></mxfile>`,
        page,
        danglingLinks: [...new Set(dangling)],
    }
}

/** Re-export so callers can lay out without rendering. */
export type { Placed }
