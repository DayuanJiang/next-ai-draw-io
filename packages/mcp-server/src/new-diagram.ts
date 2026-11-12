/**
 * A whole new diagram written by the model, for the create_new_diagram tool
 * and the web app's display_diagram tool.
 */
import { expandCompactCells } from "./compact-cells.ts"
import { reviewCells } from "./diagram-operations.ts"
import {
    generatePageId,
    hasCells,
    normalizeToMxfile,
    parseMxfile,
    serializeMxfile,
    wrapCellsInModel,
} from "./pages.ts"
import {
    addDefaultStyles,
    applyStyleClasses,
    readStyleClasses,
    rememberStyleClasses,
    type StyleClasses,
} from "./style-classes.ts"
import { readAttributes } from "./xml-attributes.ts"
import { getXmlSyntaxError } from "./xml-syntax.ts"
import {
    closeSlashlessCells,
    repairQuoteBeforeSlash,
    stripWrapping,
    validateAndFixXml,
} from "./xml-validation.ts"

export type NewDiagram =
    | {
          ok: true
          xml: string
          fixes: string[]
          /** What the model should know about the drawing (reviewCells) */
          notes: string[]
      }
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
        // A wrapper's id is its cell's; an mxCell counts as a shape or edge,
        // also when written compactly (a size, or a connection)
        if (
            tag !== "mxCell" ||
            attrs.get("vertex") === "1" ||
            attrs.get("edge") === "1" ||
            ["x", "y", "w", "h", "width", "height", "source", "target"].some(
                (a) => attrs.has(a),
            )
        ) {
            return 'Cell ids "0" and "1" are the root cells, which are added automatically. Give shapes and edges ids starting at "2".'
        }
    }
    return null
}

/**
 * Check if mxCell XML output is complete (not truncated).
 * Complete XML ends with a self-closing tag (/>) or closing mxCell tag.
 * Uses a robust approach that handles any LLM provider's wrapper tags
 * by finding the last valid mxCell ending and checking if suffix is just closing tags.
 * @param xml - The XML string to check
 * @returns true if XML appears complete, false if truncated or empty
 */
export function isMxCellXmlComplete(xml: string): boolean {
    // Named style definitions before the cells are not cells: output cut off
    // right after them is incomplete. A compact cell whose last quote is
    // missing is complete; prepareNewDiagram repairs it. A code fence, a
    // CDATA section or a sentence around complete cells is no cut either.
    const trimmed = repairQuoteBeforeSlash(
        readStyleClasses(stripWrapping(xml)).xml,
    ).trim()
    if (!trimmed) return false

    // Find position of last complete mxCell ending (either /> or </mxCell>)
    const lastSelfClose = trimmed.lastIndexOf("/>")
    const lastMxCellClose = trimmed.lastIndexOf("</mxCell>")

    const lastValidEnd = Math.max(lastSelfClose, lastMxCellClose)

    // No valid ending found at all
    if (lastValidEnd === -1) return false

    // If the last mxCell has no </mxCell> after it, it must be self-closing.
    // Otherwise the trailing "/>" belongs to a child such as <mxGeometry .../>
    // and the output was cut off before the cell was closed.
    const lastCellStart = trimmed.lastIndexOf("<mxCell")
    if (
        lastCellStart > lastMxCellClose &&
        // (quoted values may hold a raw "<", which the auto-fix escapes)
        !/^<mxCell\b(?:[^<>"']|"[^"]*"|'[^']*')*\/>/.test(
            trimmed.slice(lastCellStart),
        )
    ) {
        return false
    }

    // Check what comes after the last valid ending
    // For />: add 2 chars, for </mxCell>: add 9 chars
    const endOffset = lastMxCellClose > lastSelfClose ? 9 : 2
    const suffix = trimmed.slice(lastValidEnd + endOffset)

    // If suffix is empty or only contains closing tags (any provider's wrapper) or whitespace, it's complete
    // This regex matches any sequence of closing XML tags like </foo>, </bar>, </｜DSML｜xyz>
    return /^(\s*<\/[^>]+>)*\s*$/.test(suffix)
}

/**
 * Output that stops inside an mxCell would be wrapped and rejected with an
 * error about wrapper tags the model never sent. Bare cells only. Returns the
 * error for the model, or null.
 */
export function truncatedCellError(input: string): string | null {
    if (/<(mxGraphModel|mxfile)\b/.test(input)) return null
    // Comments, and closing tags such as </mxCell/> that the auto-fix
    // repairs, are no cut
    const stripped = input
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<\/([a-zA-Z][a-zA-Z0-9]*)\s*\/>/g, "</$1>")
    // No cell at all: the validator's message fits better
    if (!/<mxCell\b/.test(stripped) || isMxCellXmlComplete(stripped))
        return null
    return `The XML ends inside an unfinished mxCell, so the output was probably cut off. Nothing was drawn. It ended with:\n${input.slice(-300)}\nResend the complete diagram, or send the first cells now and add the remaining cells with edit_diagram add operations.`
}

/**
 * Take the named style definitions out of the model's XML (style-classes.ts).
 * Returns the error for the model when a definition never closed or when
 * nothing but definitions was sent.
 */
function takeStyleDefinitions(input: string): {
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

/**
 * A page written in full (<mxGraphModel> or <mxfile>) without the root cells
 * "0" and "1" gets them here. Bare cells must be sent without them, and a
 * model carries that habit over to a full page; draw.io would take the first
 * shape for the root and show a blank page.
 */
function addMissingRootCells(xml: string): string {
    return xml.replace(/<root>([\s\S]*?)<\/root>/g, (root, cells: string) => {
        const attrs = Array.from(
            cells.matchAll(/<mxCell\b((?:[^<>"']|"[^"]*"|'[^']*')*)>/g),
            ([, attrText]) =>
                new Map(readAttributes(attrText).map((a) => [a.name, a.value])),
        )
        if (attrs.length === 0 || attrs.some((a) => a.get("id") === "0")) {
            return root
        }
        // (a layer the model did write keeps its place)
        const layer = attrs.some(
            (a) => a.get("id") === "1" || a.get("parent") === "0",
        )
            ? ""
            : '<mxCell id="1" parent="0"/>'
        return `<root><mxCell id="0"/>${layer}${cells}</root>`
    })
}

/**
 * The model of one page from the XML the model wrote (also the starting
 * content of add_page). What a model may put around the XML is taken off
 * (stripWrapping), then the named style definitions (style-classes.ts).
 * Bare cells then get the wrapper and root cells, since the strict parser
 * rejects several top-level elements. Then the XML is validated and
 * auto-fixed while it is still a bare model, where duplicate ids are
 * renamed. Compact cells (compact-cells.ts) are expanded, the names
 * expanded and the default styles added on the fixed XML, so repaired cells
 * get them too.
 */
export function prepareNewModel(input: string): NewDiagram {
    const stripped = stripWrapping(input)
    if (!stripped) {
        return {
            ok: false,
            error: "The xml is empty. Send the mxCell elements of the page.",
        }
    }
    const {
        classes,
        xml: defined,
        error: styleError,
    } = takeStyleDefinitions(stripped)
    if (styleError) return { ok: false, error: styleError }
    // Kept also when the cells are rejected: the retry may come in parts,
    // with the names used in edit_diagram
    const known = rememberStyleClasses(classes)
    // Before the truncation check, which takes a last cell without its
    // slash for output that was cut off
    const cells = closeSlashlessCells(defined)
    const closed =
        cells === defined
            ? []
            : ["Closed compact cells written without the slash"]
    const reserved = reservedIdError(cells)
    if (reserved) return { ok: false, error: reserved }
    const truncated = truncatedCellError(cells)
    if (truncated) return { ok: false, error: truncated }
    let xml = addMissingRootCells(wrapCellsInModel(cells))
    const { valid, error, fixed, fixes } = validateAndFixXml(xml)
    if (fixed) xml = fixed
    if (!valid) {
        return { ok: false, error: `XML validation failed - ${error}` }
    }
    xml = addDefaultStyles(applyStyleClasses(expandCompactCells(xml), known))
    // The rewrites copy attribute values as written; a check that they
    // produced well-formed XML, in case one of them ever does not
    const rewriteError = getXmlSyntaxError(xml)
    if (rewriteError) {
        return {
            ok: false,
            error: `XML validation failed after expanding the cells - ${rewriteError}`,
        }
    }
    // Every page's cells, as they now stand (several pages name theirs)
    const doc = new DOMParser().parseFromString(xml, "text/xml")
    const roots = Array.from(doc.querySelectorAll("root"))
    const repairs: string[] = []
    const notes: string[] = []
    roots.forEach((root, index) => {
        const page = roots.length > 1 ? `Page ${index + 1}: ` : ""
        const review = reviewCells(root)
        repairs.push(...review.repairs.map((repair) => page + repair))
        notes.push(...review.notes.map((note) => page + note))
    })
    if (repairs.length > 0) xml = new XMLSerializer().serializeToString(doc)
    return {
        ok: true,
        xml,
        fixes: [...closed, ...fixes, ...repairs],
        notes: [...repairs, ...notes],
    }
}

/** prepareNewModel, and the model turned into an <mxfile> */
export function prepareNewDiagram(
    input: string,
    page: { pageId?: string; pageName?: string } = {},
): NewDiagram {
    const model = prepareNewModel(input)
    if (!model.ok) return model
    let normalized = normalizeToMxfile(model.xml, page)
    if (!normalized) {
        return {
            ok: false,
            error: "XML must be the mxCell elements of one page, a <mxGraphModel>, or an <mxfile> with one or more <diagram> children.",
        }
    }
    // A <diagram> the model sent without an id gets one here. draw.io would
    // otherwise make its own, which the server never sees, and get_selection
    // would then name a page edit_diagram cannot find
    const doc = parseMxfile(normalized)
    if (doc) {
        let added = false
        doc.querySelectorAll("diagram").forEach((d) => {
            if (!d.getAttribute("id")) {
                d.setAttribute("id", generatePageId())
                added = true
            }
        })
        if (added) normalized = serializeMxfile(doc)
    }
    return { ...model, xml: normalized }
}
