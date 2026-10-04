/**
 * Core of the edit_diagram tool, kept free of session state so it can be
 * unit tested.
 *
 * All-or-nothing, like the web app (hooks/use-diagram-tool-handlers.ts):
 * if any operation fails, nothing is written and every failure is reported,
 * so the model never builds on a half-applied edit.
 */

import {
    applyDiagramOperations,
    type DiagramOperation,
} from "./diagram-operations.ts"
import { type PageSelector, projectPage } from "./pages.ts"
import { validateAndFixXml, validateMxCellStructure } from "./xml-validation.ts"

export type EditOutcome =
    | { ok: true; xml: string; applied: number; fixes: string[] }
    | { ok: false; errors: string[]; pageError: boolean }

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
    operations: DiagramOperation[],
    selector: PageSelector,
): EditOutcome {
    const errors: string[] = []
    const fixes: string[] = []
    const prepared: DiagramOperation[] = []

    for (const op of operations) {
        if (op.operation === "delete" || !op.new_xml) {
            prepared.push(op)
            continue
        }
        // Checked before validation: several cells fail the strict parser
        // with a misleading "only one root" syntax error.
        if (countTopLevelElements(op.new_xml) > 1) {
            errors.push(
                `${op.operation} ${op.cell_id}: new_xml must contain exactly one cell; use one add operation per cell`,
            )
            continue
        }
        const check = validateAndFixXml(op.new_xml)
        if (!check.valid) {
            errors.push(
                `${op.operation} ${op.cell_id}: invalid new_xml: ${check.error}`,
            )
            continue
        }
        if (check.fixed) {
            fixes.push(`${op.cell_id}: ${check.fixes.join(", ")}`)
        }
        prepared.push({ ...op, new_xml: check.fixed ?? op.new_xml })
    }
    if (errors.length > 0) return { ok: false, errors, pageError: false }

    const { result, errors: opErrors } = applyDiagramOperations(
        xml,
        prepared,
        selector,
    )
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

    return { ok: true, xml: result, applied: operations.length, fixes }
}
