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
    | { ok: true; xml: string }
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
 * Parse the content of a .drawio file into the canonical session shape:
 * an <mxfile> whose every page holds plain <mxGraphModel> XML. Accepts a
 * bare <mxGraphModel> (wrapped into a one-page mxfile) and decompresses
 * any compressed pages.
 */
export function parseDrawioFileContent(content: string): LoadResult {
    let trimmed = content.trim()
    if (!trimmed) return { ok: false, error: "File is empty." }

    if (isMxGraphModel(trimmed)) {
        const normalized = normalizeToMxfile(trimmed)
        if (!normalized) {
            return { ok: false, error: "Failed to parse <mxGraphModel> XML." }
        }
        // Parsed below like any <mxfile>, so a broken model is an error
        trimmed = normalized
    }
    if (!isMxFile(trimmed)) {
        return {
            ok: false,
            error: "Not a draw.io file: expected an <mxfile> or <mxGraphModel> root element.",
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
    return { ok: true, xml: decompressedAny ? serializeMxfile(doc) : trimmed }
}
