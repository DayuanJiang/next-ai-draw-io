/**
 * Multi-page (mxfile) helpers for draw.io diagrams.
 *
 * The on-disk and embed-protocol shape of a draw.io document is:
 *
 *   <mxfile host="...">
 *     <diagram id="..." name="...">
 *       <mxGraphModel><root><mxCell .../>...</root></mxGraphModel>
 *     </diagram>
 *     ...one or more <diagram> children...
 *   </mxfile>
 *
 * This module centralises page CRUD so that index.ts, xml-validation.ts,
 * and diagram-operations.ts can all agree on:
 *   - what "the canonical in-memory shape" is (always mxfile),
 *   - how to find a page (id, name, or index),
 *   - how to add/rename/delete pages without re-parsing ad-hoc.
 */

import { DOMParser } from "linkedom"

export interface PageInfo {
    id: string
    name: string
    index: number
    cellCount: number
}

/** Selector used by all multi-page-aware tools. All fields optional. */
export interface PageSelector {
    page_id?: string
    page_name?: string
    page_index?: number
}

/** True if the selector targets a specific page (any field set). */
export function hasPageSelector(s?: PageSelector | null): boolean {
    if (!s) return false
    return (
        Boolean(s.page_id) || Boolean(s.page_name) || s.page_index !== undefined
    )
}

/**
 * Generate a short page id similar in shape to drawio's auto-assigned ids.
 * Format: 12 chars alphanumeric with a single dash. Not a UUID — drawio itself
 * uses short ids; collisions are still astronomically unlikely for one session.
 */
export function generatePageId(): string {
    const a = Math.random().toString(36).substring(2, 10)
    const b = Math.random().toString(36).substring(2, 6)
    return `${a}-${b}`
}

/** Cheap regex check — does the XML start with an <mxfile> root? */
export function isMxFile(xml: string): boolean {
    return /^\s*(<\?xml[^>]*\?>\s*)?<mxfile[\s>]/i.test(xml)
}

/** Cheap regex check — does the XML start with a bare <mxGraphModel>? */
export function isMxGraphModel(xml: string): boolean {
    return /^\s*(<\?xml[^>]*\?>\s*)?<mxGraphModel[\s>]/i.test(xml)
}

function escapeAttr(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
}

/**
 * Strip a leading <?xml ... ?> declaration from an XML string. The XML spec
 * only permits the declaration at the very start of a document, so embedding
 * a declaration inside another element produces invalid XML. Callers must
 * strip before splicing a fragment into a wrapper.
 */
function stripXmlDeclaration(xml: string): string {
    return xml.replace(/^\s*<\?xml[^>]*\?>\s*/i, "")
}

/**
 * Wrap a bare <mxGraphModel> XML string in <mxfile><diagram>...</diagram></mxfile>.
 * If the input is already an mxfile, returns it unchanged.
 * If the input is neither shape, returns null so the caller can surface a clear error.
 *
 * Strips any leading <?xml ?> declaration before embedding — a declaration is
 * only valid at the very start of a document, never inside a <diagram>.
 */
export function normalizeToMxfile(
    xml: string,
    opts: { pageId?: string; pageName?: string; host?: string } = {},
): string | null {
    const trimmed = xml.trim()
    if (!trimmed) return null
    if (isMxFile(trimmed)) return trimmed
    if (!isMxGraphModel(trimmed)) return null

    const pageId = opts.pageId || generatePageId()
    const pageName = opts.pageName || "Page-1"
    const host = opts.host || "app.diagrams.net"
    const inner = stripXmlDeclaration(trimmed)
    return `<mxfile host="${escapeAttr(host)}"><diagram id="${escapeAttr(pageId)}" name="${escapeAttr(pageName)}">${inner}</diagram></mxfile>`
}

/**
 * Parse an mxfile XML string. Returns null on parse error or if the root
 * isn't <mxfile> — callers are expected to have run normalizeToMxfile first.
 */
export function parseMxfile(xml: string): Document | null {
    try {
        const doc = new DOMParser().parseFromString(xml, "text/xml")
        if (doc.querySelector("parsererror")) return null
        if (doc.documentElement?.tagName !== "mxfile") return null
        return doc as unknown as Document
    } catch {
        return null
    }
}

/** Serialise an mxfile doc back to a string via the global XMLSerializer polyfill. */
export function serializeMxfile(doc: Document): string {
    const serializer = new XMLSerializer()
    return serializer.serializeToString(doc)
}

export type PageProjection =
    | { ok: true; xml: string; index: number; name: string }
    | { ok: false; reason: "parse" | "notfound" }

/**
 * Project a single page out of an mxfile string into a standalone one-page
 * <mxfile>. Used by get_diagram and export_diagram so the three call sites
 * share one parse → find → serialise path.
 *
 * Returns { ok:false, reason:"parse" } if the xml isn't a parseable mxfile,
 * or { ok:false, reason:"notfound" } if the selector matches no page.
 */
export function projectPage(
    xml: string,
    selector: PageSelector,
): PageProjection {
    const doc = parseMxfile(xml)
    if (!doc) return { ok: false, reason: "parse" }
    const found = findPageElement(doc, selector)
    if (!found) return { ok: false, reason: "notfound" }
    const serializer = new XMLSerializer()
    return {
        ok: true,
        xml: `<mxfile host="app.diagrams.net">${serializer.serializeToString(found.element)}</mxfile>`,
        index: found.index,
        name: found.element.getAttribute("name") || "",
    }
}

/** Walk every <diagram> child of <mxfile> and return summary info. */
export function listPagesFromDoc(doc: Document): PageInfo[] {
    const diagrams = doc.querySelectorAll("diagram")
    const result: PageInfo[] = []
    diagrams.forEach((d, idx) => {
        const root = d.querySelector("root")
        const cellCount = root ? root.querySelectorAll("mxCell").length : 0
        result.push({
            id: d.getAttribute("id") || "",
            name: d.getAttribute("name") || `Page-${idx + 1}`,
            index: idx,
            cellCount,
        })
    })
    return result
}

/**
 * Resolve a page selector to its <diagram> element.
 * Resolution order: page_id → page_name → page_index → default (first page).
 *
 * When no selector field is set we return the first page — the "active page
 * by convention" mentioned in §3.4 of the design doc.
 */
export function findPageElement(
    doc: Document,
    selector?: PageSelector,
): { element: Element; index: number } | null {
    const diagrams = Array.from(doc.querySelectorAll("diagram"))
    if (diagrams.length === 0) return null

    if (!hasPageSelector(selector)) {
        return { element: diagrams[0], index: 0 }
    }

    if (selector?.page_id) {
        for (let i = 0; i < diagrams.length; i++) {
            if (diagrams[i].getAttribute("id") === selector.page_id) {
                return { element: diagrams[i], index: i }
            }
        }
        return null
    }
    if (selector?.page_name) {
        for (let i = 0; i < diagrams.length; i++) {
            if (diagrams[i].getAttribute("name") === selector.page_name) {
                return { element: diagrams[i], index: i }
            }
        }
        return null
    }
    if (selector && selector.page_index !== undefined) {
        const idx = selector.page_index
        if (Number.isInteger(idx) && idx >= 0 && idx < diagrams.length) {
            return { element: diagrams[idx], index: idx }
        }
        return null
    }

    return null
}

/**
 * Append a new <diagram> to the mxfile doc. The new page's model defaults to
 * an empty <mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>.
 *
 * `opts.xml` must be a BARE <mxGraphModel> — passing a full <mxfile> would
 * end up nested inside <diagram>, which is malformed. We reject the mxfile
 * shape explicitly and strip any <?xml ?> declaration (only valid at
 * document start, never inside <diagram>).
 *
 * Returns the new PageInfo. Throws if the requested id collides or the xml
 * shape is wrong.
 */
export function addPageToDoc(
    doc: Document,
    opts: { id?: string; name?: string; xml?: string } = {},
): PageInfo {
    const existing = listPagesFromDoc(doc)
    const id = opts.id || generatePageId()
    if (existing.some((p) => p.id === id)) {
        throw new Error(`Page id "${id}" already exists`)
    }
    const name = opts.name || `Page-${existing.length + 1}`

    let inner: string
    if (opts.xml?.trim()) {
        const trimmed = stripXmlDeclaration(opts.xml.trim())
        if (isMxFile(trimmed)) {
            throw new Error(
                "addPageToDoc: opts.xml must be a bare <mxGraphModel>; received a full <mxfile>. Extract the target diagram's <mxGraphModel> first.",
            )
        }
        if (!isMxGraphModel(trimmed)) {
            throw new Error(
                "addPageToDoc: opts.xml must be a bare <mxGraphModel>.",
            )
        }
        inner = trimmed
    } else {
        inner = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>`
    }

    const snippet = `<wrapper><diagram id="${escapeAttr(id)}" name="${escapeAttr(name)}">${inner}</diagram></wrapper>`
    const tempDoc = new DOMParser().parseFromString(snippet, "text/xml")
    if (tempDoc.querySelector("parsererror")) {
        throw new Error(
            "Failed to parse new page xml — make sure it is a valid <mxGraphModel>",
        )
    }
    const newDiagram = tempDoc.querySelector("diagram")
    if (!newDiagram) {
        throw new Error("Failed to construct <diagram> element for new page")
    }

    const imported = doc.importNode(newDiagram, true) as Element
    doc.documentElement.appendChild(imported)

    return {
        id,
        name,
        index: existing.length,
        cellCount: imported.querySelectorAll("mxCell").length,
    }
}

/** Rename the page matched by selector. Returns true on success. */
export function renamePageInDoc(
    doc: Document,
    selector: PageSelector,
    newName: string,
): boolean {
    const found = findPageElement(doc, selector)
    if (!found) return false
    found.element.setAttribute("name", newName)
    return true
}

/**
 * Delete a page. Refuses to delete the last remaining page — the embed needs
 * at least one diagram to render anything, and silently recreating one would
 * be surprising behaviour for an MCP caller.
 */
export function deletePageFromDoc(
    doc: Document,
    selector: PageSelector,
): { ok: boolean; reason?: string; deletedId?: string; deletedIndex?: number } {
    const pages = listPagesFromDoc(doc)
    if (pages.length <= 1) {
        return { ok: false, reason: "Cannot delete the only remaining page" }
    }
    const found = findPageElement(doc, selector)
    if (!found) {
        return { ok: false, reason: "Page not found" }
    }
    const id = found.element.getAttribute("id") || ""
    const index = found.index
    found.element.parentNode?.removeChild(found.element)
    return { ok: true, deletedId: id, deletedIndex: index }
}
