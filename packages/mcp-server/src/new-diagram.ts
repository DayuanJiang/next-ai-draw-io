/**
 * A whole new diagram written by the model, for the create_new_diagram tool
 * and the web app's display_diagram tool.
 */
import { hasCells, normalizeToMxfile, wrapCellsInModel } from "./pages.ts"
import {
    addDefaultStyles,
    applyStyleClasses,
    readStyleClasses,
    type StyleClasses,
} from "./style-classes.ts"
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
 * The named style definitions are taken out first (style-classes.ts). Bare
 * cells then get the wrapper and root cells, since the strict parser rejects
 * several top-level elements. Then the XML is validated and auto-fixed while
 * it is still a bare model, where duplicate ids are renamed. The names are
 * expanded and the default styles added on the fixed XML, so repaired cells
 * get them too, and finally it is turned into an <mxfile>.
 */
/**
 * Take the named style definitions out of the model's XML (style-classes.ts).
 * Returns the error for the model when a definition never closed or when
 * nothing but definitions was sent.
 */
export function takeStyleDefinitions(input: string): {
    classes: StyleClasses
    xml: string
    error: string | null
} {
    const { classes, xml } = readStyleClasses(input)
    let error: string | null = null
    if (/<mxStyle\b/i.test(xml)) {
        error =
            'A named style definition is not closed. Write it as <mxStyle name="..." value="..."/> before the cells.'
    } else if (classes.size > 0 && !hasCells(xml)) {
        error =
            "Only named style definitions were sent, no cells. Send the mxCell elements after the definitions."
    }
    return { classes, xml, error }
}

export function prepareNewDiagram(
    input: string,
    page: { pageId?: string; pageName?: string } = {},
): NewDiagram {
    const {
        classes,
        xml: cells,
        error: styleError,
    } = takeStyleDefinitions(input)
    if (styleError) return { ok: false, error: styleError }
    const reserved = reservedIdError(cells)
    if (reserved) return { ok: false, error: reserved }
    let xml = wrapCellsInModel(cells)
    const { valid, error, fixed, fixes } = validateAndFixXml(xml)
    if (fixed) xml = fixed
    if (!valid) {
        return { ok: false, error: `XML validation failed - ${error}` }
    }
    xml = addDefaultStyles(applyStyleClasses(xml, classes))
    const normalized = normalizeToMxfile(xml, page)
    if (!normalized) {
        return {
            ok: false,
            error: "XML must be the mxCell elements of one page, a <mxGraphModel>, or an <mxfile> with one or more <diagram> children.",
        }
    }
    return { ok: true, xml: normalized, fixes }
}
