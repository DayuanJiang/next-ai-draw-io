/**
 * The engine's entry point: one call takes the current canvas XML plus a list of
 * structural operations and returns new canvas XML.
 *
 *   current XML → parse → apply operations → check names → layout → render → new XML
 *
 * The tree is not stored anywhere between calls. It is re-derived from the canvas every
 * time, so a user's manual edits — moving a shape into a different frame, recolouring a
 * box, adding an annotation — are simply part of the input to the next layout. There is
 * no second copy of the state, and therefore nothing to reconcile.
 */

import { checkNames, resolveStyle } from "./catalog"
import {
    type GraphEdge,
    type GraphNode,
    type GraphOptions,
    graphToOperations,
} from "./graph"
import {
    applyOperations,
    collectNames,
    type Operation,
    outline,
} from "./operations"
import { parseDiagram } from "./parse"
import { renderDiagram } from "./render"
import type { DiagramTree } from "./types"

export interface RestructureResult {
    /** New canvas XML, or null when the request could not be carried out. */
    xml: string | null
    /** Compact outline of the resulting structure, for the model to read back. */
    outline: string
    /** Operations that could not be applied, and invented stencil names. */
    errors: string[]
    /** Non-fatal notes: pages skipped, structure that could not be read cleanly. */
    warnings: string[]
}

export interface RestructureOptions {
    /** Which page of a multi-page document to work on. */
    pageIndex?: number
    /** Diagram-wide icon glyph size. */
    iconSize?: number
}

/**
 * Apply structural operations to whatever is on the canvas.
 *
 * `currentXml` may be empty — that is how a diagram gets built from scratch.
 *
 * An invented stencil name is a hard error, not a silent fallback: draw.io renders an
 * unknown `resIcon` as a blank square, so a diagram that "worked" would be quietly
 * missing icons. The error carries suggestions from the catalog so the model can fix it
 * in one more turn.
 */
export function restructureDiagram(
    currentXml: string,
    ops: Operation[],
    opts: RestructureOptions = {},
): RestructureResult {
    const warnings: string[] = []

    let tree: DiagramTree
    if (currentXml.trim()) {
        const parsed = parseDiagram(currentXml, opts.pageIndex ?? 0)
        tree = parsed.tree
        warnings.push(...parsed.warnings)
    } else {
        tree = { roots: [], links: [], foreign: [] }
    }

    const applied = applyOperations(tree, ops)
    const errors = [...applied.errors]

    // Catch invented names before rendering, so the model gets a correctable error
    // instead of a diagram with blank squares in it.
    for (const bad of checkNames(collectNames(applied.tree))) {
        const hint = bad.suggestions.length
            ? ` Did you mean: ${bad.suggestions.join(", ")}?`
            : ""
        errors.push(
            `"${bad.name}" (node ${bad.id}) is not in the stencil catalog.${hint}`,
        )
    }

    if (errors.length > 0)
        return { xml: null, outline: outline(applied.tree), errors, warnings }

    const rendered = renderDiagram(applied.tree, {
        resolveStyle,
        iconSize: opts.iconSize,
    })
    if (rendered.danglingLinks.length)
        warnings.push(
            `Dropped edge(s) pointing at missing nodes: ${rendered.danglingLinks.join(", ")}.`,
        )

    return {
        xml: rendered.xml,
        outline: outline(applied.tree),
        errors: [],
        warnings,
    }
}

/**
 * Draw a flowchart, dependency graph, ER diagram or site map from nodes and arrows alone.
 *
 * The model gives no positions and no nesting — just what the boxes are and what points at
 * what. The engine works out how many rows there are, who shares a row, and who goes left
 * of whom, then hands the result to the same layout and edge router the architecture
 * diagrams use.
 *
 * This exists because declaring a flowchart as nesting does not work: six steps declared in
 * their natural order become one column, and every branch then has to jump over the step
 * beside it. The layering has to come from the arrows, and only the engine can see all of
 * them at once.
 *
 * Replaces the whole diagram rather than adding to it: the layer assignment depends on every
 * arrow, so one new edge can move half the nodes. Editing afterwards goes through
 * `restructureDiagram` as usual.
 */
export function drawGraph(
    nodes: GraphNode[],
    edges: GraphEdge[],
    opts: RestructureOptions & GraphOptions & { title?: string } = {},
): RestructureResult {
    if (nodes.length === 0)
        return {
            xml: null,
            outline: "",
            errors: ["draw_graph: no nodes — nothing to draw."],
            warnings: [],
        }

    const dupes = nodes
        .map((n) => n.id)
        .filter((id, i, all) => all.indexOf(id) !== i)
    if (dupes.length > 0)
        return {
            xml: null,
            outline: "",
            errors: [
                `draw_graph: duplicate node id(s): ${[...new Set(dupes)].join(", ")}.`,
            ],
            warnings: [],
        }

    const graph = graphToOperations(nodes, edges, opts)
    const warnings: string[] = []
    if (graph.unknownEndpoints.length)
        warnings.push(
            `Dropped edge(s) naming nodes that were not in the node list: ${graph.unknownEndpoints.join(", ")}.`,
        )
    if (graph.backEdges.length)
        warnings.push(
            `Loop(s) drawn but not used for ordering: ${graph.backEdges
                .map((e) => `${e.source}→${e.target}`)
                .join(", ")}.`,
        )

    const ops: Operation[] = opts.title
        ? [{ op: "set_title", title: opts.title }, ...graph.operations]
        : graph.operations
    const result = restructureDiagram("", ops, opts)
    return { ...result, warnings: [...warnings, ...result.warnings] }
}

/** Read the current canvas structure without changing it. */
export function describeDiagram(
    currentXml: string,
    pageIndex = 0,
): { outline: string; warnings: string[]; needsAdoption: boolean } {
    if (!currentXml.trim())
        return { outline: "(empty canvas)", warnings: [], needsAdoption: false }
    const { tree, warnings, needsAdoption } = parseDiagram(
        currentXml,
        pageIndex,
    )
    return { outline: outline(tree), warnings, needsAdoption }
}

export { CATALOG_SIZE, lookupStencil, searchStencils } from "./catalog"
export {
    type GraphEdge,
    type GraphNode,
    type GraphOptions,
    graphToOperations,
} from "./graph"
export { type Operation, OperationSchema } from "./operations"
export { parseDiagram } from "./parse"
export { renderDiagram } from "./render"
export type { DiagramNode, DiagramTree } from "./types"
