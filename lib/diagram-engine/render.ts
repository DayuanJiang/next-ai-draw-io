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
    let box = rect
    if (n.kind === "icon") {
        const glyph = n.size ?? defaultGlyph
        box = {
            x: Math.round(rect.x + (rect.w - glyph) / 2),
            y: rect.y,
            w: glyph,
            h: glyph,
        }
    }
    return (
        `<mxCell id="${esc(n.id)}" value="${esc("label" in n ? n.label : "")}"` +
        ` style="${styleFor(n, resolve)}" vertex="1" parent="${esc(parent)}">` +
        `<mxGeometry x="${box.x - ox}" y="${box.y - oy}" width="${box.w}" height="${box.h}" as="geometry"/>` +
        `</mxCell>`
    )
}

/**
 * One `<mxCell>` for an edge.
 *
 * No waypoints: draw.io's own orthogonal router recomputes the route from the terminals
 * on every edit, so a user who moves a node never has to re-link an arrow. Freezing a
 * pre-computed route would look better on first open and then deform the moment anyone
 * touched the diagram — the wrong trade for an editor.
 */
function edgeXml(l: LinkSpec, index: number): string {
    const label =
        l.step != null
            ? l.label
                ? `${l.step}. ${l.label}`
                : `${l.step}.`
            : (l.label ?? "")
    let style = l.style ?? EDGE_STYLE
    if (!l.style) {
        if (l.dashed) style += "dashed=1;"
        if (label) style += "labelBackgroundColor=light-dark(#FFFFFF,#0B0F14);"
    }
    const id = l.id ?? `ed${index + 1}`
    return (
        `<mxCell id="${esc(id)}" value="${esc(label)}" style="${style}" edge="1" parent="1"` +
        ` source="${esc(l.source)}" target="${esc(l.target)}">` +
        `<mxGeometry relative="1" as="geometry"/>` +
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
    const rectById = new Map<string, Rect>()
    for (const f of flat) rectById.set(f.node.id, f.rect)

    const cells: string[] = []

    // Title spans the page width, above the content.
    if (tree.title)
        cells.push(
            `<mxCell id="__title" value="${esc(tree.title)}" style="${TITLE_STYLE}" vertex="1" parent="1">` +
                `<mxGeometry x="0" y="24" width="${page.w}" height="30" as="geometry"/></mxCell>`,
        )

    // Parents come before children (flatten guarantees it), which draw.io requires.
    const glyph = opts.iconSize ?? ICON_SIZE
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
    let emitted = 0
    for (const l of tree.links) {
        if (!known.has(l.source) || !known.has(l.target)) {
            if (!known.has(l.source)) dangling.push(l.source)
            if (!known.has(l.target)) dangling.push(l.target)
            continue
        }
        cells.push(edgeXml(l, emitted++))
    }

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
