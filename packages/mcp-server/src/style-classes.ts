/**
 * Named styles, written once and used by name like CSS classes.
 *
 * The model defines a style before the cells and refers to it from any
 * number of cells, so a style string is not repeated in every cell:
 *
 *   <mxStyle name="blue" value="fillColor=#dae8fc;strokeColor=#6c8ebf;"/>
 *   <mxCell id="2" value="A" style="rounded=1;blue;" vertex="1" parent="1">...</mxCell>
 *   <mxCell id="3" value="B" style="rhombus;blue;fontSize=14;" vertex="1" parent="1">...</mxCell>
 *
 * draw.io resolves a style token without "=" through its stylesheet, which
 * is not saved in the file, so the names are expanded here and the saved
 * XML is plain draw.io XML. A name without a definition is left as it is:
 * draw.io ignores it, unless its own stylesheet knows the name (text,
 * ellipse, label, blue, green, ...), which then keeps its meaning.
 *
 * html=1 and whiteSpace=wrap, which draw.io itself puts on every new shape,
 * are added here too, so the model never has to write them.
 *
 * The callers validate and auto-fix the XML first and rewrite the styles
 * after, so a repaired cell (quotes written as entities, a lowercase tag)
 * gets its defaults too, and the rewrite only ever sees proper attributes.
 */
import { readAttributes } from "./xml-attributes.ts"

export type StyleClasses = Map<string, string>

// <mxStyle name="..." value="..."/> with the whitespace after it, also when
// written as <mxStyle ...> or <mxStyle ...></mxStyle>; quoted values may hold ">"
const STYLE_DEFINITION =
    /<mxStyle\b((?:[^<>"']|"[^"]*"|'[^']*')*?)\s*\/?>(?:\s*<\/mxStyle>)?\s*/gi

// An mxCell opening tag; the attributes stop before a closing "/" so a
// self-closing cell keeps its "/>"
const CELL_TAG = /<mxCell\b((?:[^<>"']|"[^"]*"|'[^']*')*?)\s*(\/?)>/g

// draw.io reads keys and tokens as written, " html" is not "html", so the
// checks are exact too
/** Whether the style sets the key (as `key=` at the start or after a ";") */
const hasKey = (style: string, key: string) =>
    new RegExp(`(^|;)${key}=`).test(style)

/** Whether the style holds this exact token */
const hasToken = (style: string, token: string) =>
    style.split(";").includes(token)

/**
 * Replace the names among the tokens with their definitions. The tokens are
 * kept exactly as written, empty ones included: a leading ";" is draw.io's
 * "no default style" marker, and an entity such as &quot; ends in ";" too.
 * A name whose definition is empty is dropped, so it does not leave such a
 * marker behind.
 */
function applyToStyle(style: string, classes: StyleClasses): string {
    const out: string[] = []
    for (const token of style.split(";")) {
        const definition = token.includes("=")
            ? undefined
            : classes.get(token.trim())
        if (definition === undefined) out.push(token)
        else if (definition !== "") out.push(definition)
    }
    return out.join(";")
}

/**
 * A definition's value goes into a style attribute unchecked by the XML
 * validator (the definitions are taken out before it runs), so the two
 * characters that would break the attribute are escaped here, the way the
 * validator repairs them in cells.
 */
function escapeForAttribute(value: string): string {
    return value
        .replace(
            /&(?!(?:lt|gt|amp|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/g,
            "&amp;",
        )
        .replace(/</g, "&lt;")
}

/**
 * The definitions, resolved against each other, and the XML without them.
 * A definition may use names defined before or after it; a name using
 * itself stays a bare token.
 */
export function readStyleClasses(xml: string): {
    classes: StyleClasses
    xml: string
} {
    const classes: StyleClasses = new Map()
    const rest = xml.replace(STYLE_DEFINITION, (_match, attrText: string) => {
        const attrs = new Map(
            readAttributes(attrText).map((a) => [a.name, a.value]),
        )
        // "name" may end in the ";" the model is used to; "style" is the
        // attribute the model may reach for instead of "value"
        const name = attrs.get("name")?.trim().replace(/;+$/, "")
        const value = attrs.get("value") ?? attrs.get("style")
        if (name && value !== undefined) {
            // Without the trailing ";", so a name followed by ";" in a cell
            // expands to "...;" and not to "...;;"
            classes.set(name, escapeForAttribute(value).replace(/;+$/, ""))
        }
        return ""
    })
    // Two passes resolve names used by other definitions, in either order
    for (let pass = 0; pass < 2; pass++) {
        for (const [name, value] of classes) {
            const others = new Map(classes)
            others.delete(name)
            classes.set(name, applyToStyle(value, others))
        }
    }
    return { classes, xml: rest }
}

/**
 * Rewrite the style of every mxCell. The callback returns the new style, or
 * undefined to leave the cell alone. A cell without a style attribute gets
 * one when the callback returns a style for it.
 */
function rewriteCellStyles(
    xml: string,
    rewrite: (
        style: string | undefined,
        attrs: Map<string, string>,
    ) => string | undefined,
): string {
    return xml.replace(CELL_TAG, (tag, attrText: string, selfClose: string) => {
        const attributes = readAttributes(attrText)
        const attrs = new Map(attributes.map((a) => [a.name, a.value]))
        const style = attributes.find((a) => a.name === "style")
        const next = rewrite(style?.value, attrs)
        if (next === undefined || next === style?.value) return tag
        // The value is copied from attributes as written, so only a quote
        // from a single-quoted source needs escaping
        const written = `style="${next.replace(/"/g, "&quot;")}"`
        if (!style) {
            return `<mxCell${attrText} ${written}${selfClose}>`
        }
        // Keep the attribute where it was, with the whitespace before it
        const space =
            attrText.slice(style.start, style.end).match(/^\s*/)?.[0] ?? " "
        return `<mxCell${attrText.slice(0, style.start)}${space}${written}${attrText.slice(style.end)}${selfClose}>`
    })
}

/** Expand the names in every cell's style; the overrides after a name still win */
export function applyStyleClasses(xml: string, classes: StyleClasses): string {
    if (classes.size === 0) return xml
    return rewriteCellStyles(xml, (style) =>
        style === undefined ? undefined : applyToStyle(style, classes),
    )
}

/** The ids of the edges in the XML, whose child vertices are edge labels */
export function edgeIdsOf(xml: string): Set<string> {
    const ids = new Set<string>()
    for (const [, attrText] of xml.matchAll(CELL_TAG)) {
        const attrs = new Map(
            readAttributes(attrText).map((a) => [a.name, a.value]),
        )
        const id = attrs.get("id")
        if (id && attrs.get("edge") === "1") ids.add(id)
    }
    return ids
}

/**
 * Whether the label sits outside the shape, as with library icons (their
 * styles position the label below) and images, so wrapping it to the
 * shape's width would be wrong.
 */
function hasLabelOutside(style: string): boolean {
    return (
        hasKey(style, "verticalLabelPosition") ||
        hasKey(style, "labelPosition") ||
        hasKey(style, "image") ||
        hasToken(style, "shape=image")
    )
}

/**
 * draw.io's own defaults for a new shape: html=1 (so labels may hold <br>
 * and <b>) and whiteSpace=wrap. Wrapping is not added to shapes whose label
 * sits outside (icons, images), to text that sizes itself (autosize=1), to
 * edge labels (their label box has no width of its own) or next to html=0
 * (draw.io renders a wrapping label as HTML). Edges get html=1. Root cells
 * and cells that already set a key are left alone.
 *
 * An edit adds cells to a page the XML does not show, so the caller passes
 * the ids of the edges already on it (edgeIdsOf), or new edge labels would
 * be wrapped like shapes.
 */
export function addDefaultStyles(
    xml: string,
    knownEdgeIds: Iterable<string> = [],
): string {
    const edges = new Set([...knownEdgeIds, ...edgeIdsOf(xml)])
    return rewriteCellStyles(xml, (style, attrs) => {
        // A cell marked as both is drawn as an edge
        const isEdge = attrs.get("edge") === "1"
        const isVertex = attrs.get("vertex") === "1" && !isEdge
        if (!isVertex && !isEdge) return undefined
        const current = style ?? ""
        const isEdgeLabel =
            hasToken(current, "edgeLabel") ||
            attrs.get("connectable") === "0" ||
            edges.has(attrs.get("parent") ?? "")
        const added: string[] = []
        if (
            isVertex &&
            !hasKey(current, "whiteSpace") &&
            !hasLabelOutside(current) &&
            !isEdgeLabel &&
            !hasToken(current, "autosize=1") &&
            !hasToken(current, "html=0")
        ) {
            added.push("whiteSpace=wrap")
        }
        if (!hasKey(current, "html")) added.push("html=1")
        if (added.length === 0) return undefined
        const separator = current === "" || current.endsWith(";") ? "" : ";"
        return `${current}${separator}${added.join(";")};`
    })
}

/** Expand the named styles of a model's XML and add the default styles */
export function expandStyles(xml: string): string {
    const { classes, xml: cells } = readStyleClasses(xml)
    return addDefaultStyles(applyStyleClasses(cells, classes))
}
