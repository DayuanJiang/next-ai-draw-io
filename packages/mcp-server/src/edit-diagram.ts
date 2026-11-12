/**
 * Core of the edit_diagram tool, kept free of session state so it can be
 * unit tested.
 *
 * All-or-nothing, like the web app (hooks/use-diagram-tool-handlers.ts):
 * if any operation fails, nothing is written and every failure is reported,
 * so the model never builds on a half-applied edit.
 */

import {
    defaultLayerOf,
    expandCompactCells,
    hasShapeWithoutPlace,
} from "./compact-cells.ts"
import {
    applyDiagramOperations,
    type DiagramOperation,
    reviewCells,
} from "./diagram-operations.ts"
import { restoreImageData } from "./embedded-images.ts"
import { findPageElement, type PageSelector, projectPage } from "./pages.ts"
import {
    addDefaultStyles,
    applyStyleClasses,
    edgeIdsOf,
    labelOf,
    plainLabelsOf,
} from "./style-classes.ts"
import { readAttributes } from "./xml-attributes.ts"
import {
    stripWrapping,
    validateAndFixXml,
    validateMxCellStructure,
} from "./xml-validation.ts"

export type EditOutcome =
    | {
          ok: true
          xml: string
          applied: number
          fixes: string[]
          /** Ids of updates that sent the cell as it already was */
          unchanged: string[]
          /** What the model should know about the edit (reviewCells) */
          notes: string[]
      }
    | { ok: false; errors: string[]; pageError: boolean }

/**
 * An operation as the model sends it. In a long list a model sometimes
 * leaves cell_id out of an add or update; the cell in new_xml carries the id.
 */
export type EditOperation = Omit<DiagramOperation, "cell_id"> & {
    cell_id?: string
}

/** Number of top-level elements in an XML fragment. */
function countTopLevelElements(fragment: string): number {
    const doc = new DOMParser().parseFromString(
        `<wrapper>${fragment}</wrapper>`,
        "text/xml",
    )
    // On a syntax error the browser adds a <parsererror> element (Chrome
    // next to the cells, Firefox as the root); the syntax is checked later
    const root = doc.documentElement
    if (!root || root.tagName === "parsererror") return 1
    return Array.from(root.children).filter(
        (el) => el.tagName !== "parsererror",
    ).length
}

/** The target page as a one-page <mxfile>, or the whole document. */
export function targetPageXml(xml: string, selector: PageSelector): string {
    const projection = projectPage(xml, selector)
    return projection.ok ? projection.xml : xml
}

export function editDiagram(
    xml: string,
    operations: EditOperation[],
    selector: PageSelector,
): EditOutcome {
    const errors: string[] = []
    const fixes: string[] = []
    const prepared: DiagramOperation[] = []

    // Edges already on the page, so a label added to one is not wrapped,
    // its plain text labels, which an update keeps plain, and the layer a
    // compact cell without a parent goes on
    const page = targetPageXml(xml, selector)
    const edges = edgeIdsOf(page)
    const plainLabels = plainLabelsOf(page)
    const layer = defaultLayerOf(page)
    for (const [index, sent] of operations.entries()) {
        // Without cell_id, the id written on the cell says which cell is
        // meant (the first id in new_xml: the cell's own, or its wrapper's)
        const cellId =
            sent.cell_id ||
            readAttributes(sent.new_xml ?? "").find((a) => a.name === "id")
                ?.value
        if (!cellId) {
            errors.push(
                `${sent.operation} (operation ${index + 1} of ${operations.length}): cell_id is missing${sent.new_xml ? " and the cell in new_xml has no id" : ""}`,
            )
            continue
        }
        const op: DiagramOperation = { ...sent, cell_id: cellId }
        if (op.operation === "delete" || !op.new_xml) {
            prepared.push(op)
            continue
        }
        // (a code fence or a CDATA section around the cell is taken off)
        const newXml = stripWrapping(op.new_xml)
        if (/<mxStyle\b/i.test(newXml)) {
            errors.push(
                `${op.operation} ${op.cell_id}: named styles (mxStyle) are not available in edit_diagram; write the cell's complete style`,
            )
            continue
        }
        // Checked before validation: several cells fail the strict parser
        // with a misleading "only one root" syntax error.
        if (countTopLevelElements(newXml) > 1) {
            errors.push(
                `${op.operation} ${op.cell_id}: new_xml must contain exactly one cell; use one add operation per cell`,
            )
            continue
        }
        const check = validateAndFixXml(newXml)
        if (!check.valid) {
            errors.push(
                `${op.operation} ${op.cell_id}: invalid new_xml: ${check.error}`,
            )
            continue
        }
        if (check.fixed) {
            fixes.push(`${op.cell_id}: ${check.fixes.join(", ")}`)
        }
        const cellXml = check.fixed ?? newXml
        // <mxCell id="3" value="Renamed" vertex="1" parent="1"/> replaces
        // the cell with one that has no place: expanded below, it would
        // get the default one and jump to the page's corner
        if (op.operation === "update" && hasShapeWithoutPlace(cellXml)) {
            errors.push(
                `update ${op.cell_id}: new_xml has no position or size (x, y, w, h), so the cell would move to the page's corner. update replaces the whole cell: send its value, style and position too`,
            )
            continue
        }
        // The defaults the model is told not to write (style-classes.ts),
        // added after the fixes so a repaired cell gets them too; the
        // pictures it was shown as references (embedded-images.ts) go back
        // in, and the named styles of the drawings so far are expanded
        prepared.push({
            ...op,
            new_xml: addDefaultStyles(
                applyStyleClasses(
                    expandCompactCells(restoreImageData(cellXml, xml), layer),
                ),
                edges,
                plainLabels.get(op.cell_id) === labelOf(cellXml),
            ),
        })
    }
    if (errors.length > 0) return { ok: false, errors, pageError: false }

    const operated = applyDiagramOperations(xml, prepared, selector)
    const { errors: opErrors, unchanged } = operated
    let result = operated.result
    // An empty cellId means the page itself could not be edited
    const pageLevel = opErrors.find((e) => e.cellId === "")
    if (pageLevel) {
        return { ok: false, errors: [pageLevel.message], pageError: true }
    }
    if (opErrors.length > 0) {
        return {
            ok: false,
            errors: opErrors.map((e) => `${e.type} ${e.cellId}: ${e.message}`),
            pageError: false,
        }
    }

    // The cells this edit wrote, as they now stand on their page. Done here,
    // after applyDiagramOperations: the web app's streaming preview applies
    // half an edit with that function, where an edge still waits for its
    // target.
    const doc = new DOMParser().parseFromString(result, "text/xml")
    const edited =
        doc.documentElement.tagName === "mxfile"
            ? findPageElement(doc as unknown as Document, selector)?.element
            : doc.documentElement
    const root = edited?.querySelector("root")
    const review = root
        ? reviewCells(
              root,
              prepared
                  .filter((op) => op.operation !== "delete")
                  .map((op) => op.cell_id),
          )
        : { repairs: [], notes: [] }
    if (review.repairs.length > 0) {
        result = new XMLSerializer().serializeToString(doc)
    }

    // Validate only the target page, and reject only errors this edit
    // introduced: problems already in other pages or in a loaded file must
    // not block every edit.
    const after = validateMxCellStructure(targetPageXml(result, selector))
    if (after && !validateMxCellStructure(targetPageXml(xml, selector))) {
        return {
            ok: false,
            errors: [`the edit would make the page invalid: ${after}`],
            pageError: false,
        }
    }

    return {
        ok: true,
        xml: result,
        applied: operations.length,
        fixes: [...fixes, ...review.repairs],
        unchanged,
        notes: [...operated.notes, ...review.repairs, ...review.notes],
    }
}
