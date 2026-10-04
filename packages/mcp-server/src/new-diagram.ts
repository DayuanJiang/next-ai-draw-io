/**
 * A whole new diagram written by the model, for the create_new_diagram tool
 * and the web app's display_diagram tool.
 */
import { normalizeToMxfile, wrapCellsInModel } from "./pages.ts"
import { validateAndFixXml } from "./xml-validation.ts"

export type NewDiagram =
    | { ok: true; xml: string; fixes: string[] }
    | { ok: false; error: string }

/**
 * Bare cells get the wrapper and root cells first, since the strict parser
 * rejects several top-level elements. Then the XML is validated and
 * auto-fixed while it is still a bare model, where duplicate ids are
 * renamed, and finally turned into an <mxfile>.
 */
export function prepareNewDiagram(
    input: string,
    page: { pageId?: string; pageName?: string } = {},
): NewDiagram {
    let xml = wrapCellsInModel(input)
    const { valid, error, fixed, fixes } = validateAndFixXml(xml)
    if (fixed) xml = fixed
    if (!valid) {
        return { ok: false, error: `XML validation failed - ${error}` }
    }
    const normalized = normalizeToMxfile(xml, page)
    if (!normalized) {
        return {
            ok: false,
            error: "XML must be the mxCell elements of one page, a <mxGraphModel>, or an <mxfile> with one or more <diagram> children.",
        }
    }
    return { ok: true, xml: normalized, fixes }
}
