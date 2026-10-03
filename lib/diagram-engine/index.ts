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
    applyOperations,
    collectNames,
    type Operation,
    outline,
} from "./operations"
import { parseDiagram } from "./parse"
import { renderDiagram } from "./render"
import { nearestShape, resolveShape } from "./shapes"
import { type DiagramTree, walkTree } from "./types"

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
    warnings.push(...applied.warnings)

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

    // Shape tokens: an injection-capable token is an error; an unknown-but-safe one
    // passes through (draw.io degrades it to a rectangle) but gets a warning, so a typo
    // is a one-turn fix instead of a silently rectangular "cyclinder" forever.
    for (const n of walkTree(applied.tree)) {
        if (n.kind !== "box" || !n.shape || n.shape === "box") continue
        const resolved = resolveShape(n.shape)
        if (!resolved) {
            errors.push(
                `shape "${n.shape}" (node ${n.id}) contains characters that are not allowed in a shape token.`,
            )
        } else if (resolved.passthrough) {
            const near = nearestShape(n.shape)
            warnings.push(
                `shape "${n.shape}" (node ${n.id}) is not in the engine's catalog — passed through to draw.io, which renders unknown shapes as rectangles.${near ? ` Did you mean "${near}"?` : ""}`,
            )
        }
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
