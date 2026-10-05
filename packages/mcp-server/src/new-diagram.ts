/**
 * A whole new diagram written by the model, for the create_new_diagram tool
 * and the web app's display_diagram tool.
 */
import { normalizeToMxfile, wrapCellsInModel } from "./pages.ts"
import { readAttributes } from "./xml-attributes.ts"
import { validateAndFixXml } from "./xml-validation.ts"

export type NewDiagram =
    | { ok: true; xml: string; fixes: string[] }
    | { ok: false; error: string }

/**
 * Bare cells get the root cells "0" and "1". A shape or edge with one of
 * these ids would be renamed as a duplicate, breaking its edges. Its id may
 * be on a <UserObject> or <object> wrapper. Returns the error for the model,
 * or null.
 */
export function reservedIdError(input: string): string | null {
    if (/<(mxGraphModel|mxfile)\b/.test(input)) return null
    // Each opening tag with its attributes; quoted values are read as a
    // whole, so text such as label="id='1'" is not an attribute
    const tags = input.matchAll(
        /<(mxCell|UserObject|object)\b((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/g,
    )
    for (const [, tag, attrText] of tags) {
        const attrs = new Map(
            readAttributes(attrText).map((a) => [a.name, a.value]),
        )
        const id = attrs.get("id")
        if (id !== "0" && id !== "1") continue
        // A wrapper's id is its cell's; an mxCell counts as a shape or edge
        if (
            tag !== "mxCell" ||
            attrs.get("vertex") === "1" ||
            attrs.get("edge") === "1"
        ) {
            return 'Cell ids "0" and "1" are the root cells, which are added automatically. Give shapes and edges ids starting at "2".'
        }
    }
    return null
}

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
    const reserved = reservedIdError(input)
    if (reserved) return { ok: false, error: reserved }
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
