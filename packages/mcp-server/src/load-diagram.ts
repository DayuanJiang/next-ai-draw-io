/**
 * File-loading helpers for the load_diagram tool.
 *
 * A .drawio file is an <mxfile> whose <diagram> children hold each page's
 * <mxGraphModel> either as plain XML or — draw.io's default save format —
 * compressed: encodeURIComponent(xml) → raw deflate → base64 as the
 * diagram's text content. The rest of the server assumes plain XML inside
 * every <diagram>, so loading decompresses all pages up front.
 */
import { inflateRawSync } from "node:zlib"
import { DOMParser } from "linkedom"
import {
    isMxFile,
    isMxGraphModel,
    normalizeToMxfile,
    parseMxfile,
    serializeMxfile,
} from "./pages.js"

export type LoadResult =
    | { ok: true; xml: string }
    | { ok: false; error: string }

/**
 * Decode one compressed page body (base64 → raw deflate → URI-decode).
 * Returns null if the text isn't in that format.
 */
export function decompressPageContent(compressed: string): string | null {
    try {
        const inflated = inflateRawSync(
            Buffer.from(compressed.trim(), "base64"),
        ).toString("utf-8")
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
    const trimmed = content.trim()
    if (!trimmed) return { ok: false, error: "File is empty." }

    if (isMxGraphModel(trimmed)) {
        const normalized = normalizeToMxfile(trimmed)
        return normalized
            ? { ok: true, xml: normalized }
            : { ok: false, error: "Failed to parse <mxGraphModel> XML." }
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
            inner.querySelector("parsererror") ||
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
