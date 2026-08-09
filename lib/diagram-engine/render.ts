/**
 * tree → XML. Takes a laid-out forest and writes the mxCell elements draw.io reads.
 *
 * Every cell it emits carries `container=1` on containers and `dai_*` markers recording
 * the layout parameters, so parse.ts can read the structure back. That round-trip is
 * what lets the canvas stay the single source of truth.
 *
 * Ported from drawio-ai-kit (MIT) — see NOTICE.
 */

import { flatten, ICON_SIZE, layoutForest, type Placed } from "./layout"
import { stampContainer, stampLeaf } from "./markers"
import { type RoutedEdge, routeEdges } from "./route"
import type { DiagramNode, DiagramTree, LinkSpec, Rect } from "./types"

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
            if (n.fill) base += `fillColor=${n.fill};`
            if (n.stroke) base += `strokeColor=${n.stroke};`
            if (n.bold) base += "fontStyle=1;"
        }
        return stampLeaf(base, "box")
    }

    // container
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

    // Parents come before children (flatten guarantees it), which draw.io requires.
    for (const f of flat) {
        const parentRect =
            f.parent === "1" ? null : (rectById.get(f.parent) ?? null)
        cells.push(
            vertexXml(
                f.node,
                f.rect,
                f.parent,
                parentRect,
                opts.resolveStyle,
                glyph,
            ),
        )
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

    // Route with the whole page in view. Only leaf shapes are obstacles: an edge from
    // outside a VPC to something inside it has to cross the VPC's border, so a container
    // frame must not block it.
    const obstacles = new Set(
        flat
            .filter((f) => f.node.kind === "icon" || f.node.kind === "box")
            .map((f) => f.node.id),
    )
    // Frames are passable but not free to ignore: a line that runs alongside a border, or
    // cuts through a frame only one of its endpoints belongs to, reads as a mistake even
    // though it hits nothing.
    const frames = new Set(
        flat
            .filter((f) => f.node.kind === "group" || f.node.kind === "grid")
            .map((f) => f.node.id),
    )
    const routes = routeEdges(
        drawable.map((l, i) => ({
            id: l.id ?? `ed${i + 1}`,
            source: l.source,
            target: l.target,
            hasLabel: edgeLabel(l) !== "",
        })),
        cellById,
        obstacles,
        frames,
    )
    drawable.forEach((l, i) => {
        cells.push(edgeXml(l, i, routes[i]))
    })

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
