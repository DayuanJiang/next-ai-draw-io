/**
 * The page the AI works on is the page the user is viewing. These helpers
 * read that page out of a multi-page document and write a drawing into it
 * while the other pages stay as they are. A page id that matches no page
 * (or none at all, as with an external draw.io that cannot tell us) means
 * the first page, which is what the app always used before.
 */

import { decompressPageContent } from "@/packages/mcp-server/src/load-diagram.ts"
import {
    BLANK_MXFILE,
    type PageSelector,
} from "@/packages/mcp-server/src/pages.ts"

function parse(xml: string): Document | null {
    if (!xml?.trim()) return null
    const doc = new DOMParser().parseFromString(xml, "text/xml")
    return doc.querySelector("parsererror") ? null : doc
}

/** The <diagram> the AI works on: the one with this id, else the first */
export function pageElement(
    doc: Document,
    pageId: string | null | undefined,
): Element | null {
    const diagrams = Array.from(doc.getElementsByTagName("diagram"))
    if (diagrams.length === 0) return null
    return (
        (pageId &&
            diagrams.find(
                (diagram) => diagram.getAttribute("id") === pageId,
            )) ||
        diagrams[0]
    )
}

/** A page's mxGraphModel element, inflated when the page is compressed */
export function modelOfPage(diagram: Element): Element | null {
    const model = diagram.querySelector("mxGraphModel")
    if (model) return model
    const inflated = decompressPageContent(diagram.textContent || "")
    if (!inflated) return null
    return parse(inflated)?.querySelector("mxGraphModel") ?? null
}

/**
 * Selector for editDiagram and applyDiagramOperations: the page with this
 * id when the document has it, else their default (the first page)
 */
export function pageSelectorFor(
    xml: string,
    pageId: string | null | undefined,
): PageSelector {
    if (!pageId) return {}
    const doc = parse(xml)
    const found = doc
        ? Array.from(doc.getElementsByTagName("diagram")).some(
              (diagram) => diagram.getAttribute("id") === pageId,
          )
        : false
    return found ? { page_id: pageId } : {}
}

/**
 * The page's mxGraphModel as XML. A bare mxGraphModel is returned as it
 * is; null when the XML does not parse or has no model.
 */
export function pageModelXml(
    xml: string,
    pageId: string | null | undefined,
): string | null {
    const doc = parse(xml)
    if (!doc) return null
    const root = doc.documentElement
    if (root.nodeName === "mxGraphModel") return xml
    if (root.nodeName !== "mxfile") return null
    const diagram = pageElement(doc, pageId)
    const model = diagram ? modelOfPage(diagram) : null
    return model ? new XMLSerializer().serializeToString(model) : null
}

/**
 * The document with one page's content replaced by this model. The page
 * keeps its id and name, the other pages and the file's attributes (its
 * variables) stay. Without a document to put the page in, the blank
 * one-page file is used.
 */
export function replacePageModel(
    fileXml: string,
    pageId: string | null | undefined,
    modelXml: string,
): string {
    const model = parse(modelXml)
    if (model?.documentElement.nodeName !== "mxGraphModel") {
        throw new Error("replacePageModel needs an <mxGraphModel>")
    }
    let doc = parse(fileXml)
    if (doc?.documentElement.nodeName !== "mxfile") doc = parse(BLANK_MXFILE)
    let diagram = pageElement(doc as Document, pageId)
    if (!diagram) {
        doc = parse(BLANK_MXFILE)
        diagram = pageElement(doc as Document, null)
    }
    const target = diagram as Element
    while (target.firstChild) target.removeChild(target.firstChild)
    target.appendChild(
        (doc as Document).importNode(model.documentElement, true),
    )
    return new XMLSerializer().serializeToString(doc as Document)
}

/**
 * Where a drawn diagram goes. One page's worth (bare cells wrapped by
 * prepareNewDiagram, or a one-page file) replaces the AI's page of the
 * canvas file; file variables the drawn file sets replace the canvas
 * file's. A file with several pages replaces the whole document: the model
 * wrote the pages on purpose.
 */
export function placeOnPage(
    drawnXml: string,
    canvasXml: string,
    pageId: string | null | undefined,
): string {
    const doc = parse(drawnXml)
    const drawnFile =
        doc?.documentElement.nodeName === "mxfile" ? doc.documentElement : null
    if (drawnFile && drawnFile.getElementsByTagName("diagram").length > 1) {
        return drawnXml
    }
    const model = pageModelXml(drawnXml, null)
    if (!model) return drawnXml
    const placed = replacePageModel(canvasXml, pageId, model)
    const vars = drawnFile?.getAttribute("vars")
    if (vars === null || vars === undefined) return placed
    const result = parse(placed) as Document
    result.documentElement.setAttribute("vars", vars)
    return new XMLSerializer().serializeToString(result)
}
