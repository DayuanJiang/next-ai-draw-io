/**
 * File-loading helpers for the load_diagram tool.
 *
 * A .drawio file is an <mxfile> whose <diagram> children hold each page's
 * <mxGraphModel> either as plain XML or — draw.io's default save format —
 * compressed: encodeURIComponent(xml) → raw deflate → base64 as the
 * diagram's text content. The rest of the server assumes plain XML inside
 * every <diagram>, so loading decompresses all pages up front.
 */
import { inflateRaw } from "pako"
import {
    isMxFile,
    isMxGraphModel,
    normalizeToMxfile,
    parseMxfile,
    serializeMxfile,
} from "./pages.ts"
import { getXmlSyntaxError } from "./xml-syntax.ts"

export type LoadResult =
    | { ok: true; xml: string; hadCompressedPages: boolean }
    | { ok: false; error: string }

/**
 * Decode one compressed page body (base64 → raw deflate → URI-decode).
 * Returns null if the text isn't in that format.
 */
export function decompressPageContent(compressed: string): string | null {
    try {
        // atob and pako work in Node and in the browser
        const bytes = Uint8Array.from(atob(compressed.trim()), (c) =>
            c.charCodeAt(0),
        )
        const inflated = inflateRaw(bytes, { to: "string" })
        try {
            return decodeURIComponent(inflated)
        } catch {
            // Not URI-encoded (older files) — the inflated text is the XML.
            return inflated
        }
    } catch {
        return null
    }
}

/**
 * Read the diagram XML a .drawio.svg (Editable SVG) carries in its root
 * element's content attribute. Returns undefined when the text is not an
 * SVG, and "" when the SVG has no embedded diagram. The root may carry a
 * namespace prefix (<svg:svg>).
 *
 * Uses getAttributeNode().value rather than getAttribute(): linkedom's
 * getAttribute re-escapes <, > and & in XML documents, which would turn
 * the embedded "<mxfile" into "&lt;mxfile".
 */
export function extractSvgEmbeddedXml(text: string): string | undefined {
    const doc = new DOMParser().parseFromString(text, "text/xml")
    const root = doc.documentElement
    // (linkedom keeps the prefix in localName too)
    if (root?.tagName.split(":").pop() !== "svg") return undefined
    return (root.getAttributeNode("content")?.value ?? "").trim()
}

// What XML allows before the root element: the declaration, comments, a
// DOCTYPE (the root checks below expect the root first)
const XML_PROLOG =
    /^(?:\s|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>)*/i

/**
 * Parse the content of a .drawio file into the canonical session shape:
 * an <mxfile> whose every page holds plain <mxGraphModel> XML. Accepts a
 * bare <mxGraphModel> (wrapped into a one-page mxfile), a .drawio.svg with
 * the diagram embedded, and decompresses any compressed pages.
 */
export function parseDrawioFileContent(content: string): LoadResult {
    let trimmed = content.replace(XML_PROLOG, "").trim()
    if (!trimmed) return { ok: false, error: "File is empty." }

    if (isMxGraphModel(trimmed)) {
        // Parsed below like any <mxfile>, so a broken model is an error
        trimmed = normalizeToMxfile(trimmed) as string
    }
    if (!isMxFile(trimmed)) {
        // Parsed whole: the SVG's DOCTYPE may define entities its content uses
        const embedded = extractSvgEmbeddedXml(content)
        if (embedded === undefined) {
            return {
                ok: false,
                error: "Not a draw.io file: expected an <mxfile> or <mxGraphModel> root element, or a .drawio.svg with the diagram embedded.",
            }
        }
        if (!embedded) {
            return {
                ok: false,
                error: "This SVG has no embedded diagram. Only .drawio.svg (Editable SVG) files can be loaded; ask for the .drawio file or redraw from the image.",
            }
        }
        if (isMxFile(embedded) || isMxGraphModel(embedded)) {
            return parseDrawioFileContent(embedded)
        }
        return {
            ok: false,
            error: "The SVG's embedded content is not draw.io XML.",
        }
    }
    const doc = parseMxfile(trimmed)
    if (!doc) return { ok: false, error: "Failed to parse <mxfile> XML." }

    let decompressedAny = false
    for (const d of Array.from(doc.querySelectorAll("diagram"))) {
        if (d.querySelector("mxGraphModel")) continue
        const text = (d.textContent || "").trim()
        if (!text) continue // an empty page is valid
        const pageLabel =
            d.getAttribute("name") || d.getAttribute("id") || "unnamed"
        const xml = decompressPageContent(text)
        if (!xml || !isMxGraphModel(xml)) {
            return {
                ok: false,
                error: `Page "${pageLabel}" has content that is neither plain <mxGraphModel> XML nor draw.io's compressed format.`,
            }
        }
        const inner = new DOMParser().parseFromString(xml, "text/xml")
        if (
            getXmlSyntaxError(xml) ||
            inner.documentElement?.tagName !== "mxGraphModel"
        ) {
            return {
                ok: false,
                error: `Page "${pageLabel}" decompressed but its XML failed to parse.`,
            }
        }
        d.textContent = ""
        d.appendChild(
            doc.importNode(inner.documentElement as unknown as Node, true),
        )
        decompressedAny = true
    }
    // Nothing changed — keep the file's own serialisation.
    return {
        ok: true,
        xml: decompressedAny ? serializeMxfile(doc) : trimmed,
        hadCompressedPages: decompressedAny,
    }
}
