/**
 * Workflow gate for edit_diagram.
 *
 * Instead of a wall-clock timeout (the old 30s rule rejected slow-but-correct
 * clients, see #885), we compare content: `lastSeenXml` is the state-store
 * XML the model last saw (get_diagram) or wrote itself (create_new_diagram /
 * edit_diagram / page CRUD). The store only changes on server writes or
 * browser pushes (user autosave, sync exports), so if the live store still
 * matches `lastSeenXml`, nothing happened that the model hasn't seen — the
 * edit is safe no matter how much time passed.
 *
 * "Matches" is structural, not byte-for-byte: draw.io re-serialises the
 * document when it pushes state back (different attribute order, pretty-
 * printed whitespace, regenerated diagram ids, viewport attributes like
 * dx/dy/pageWidth on <mxGraphModel>, a different mxfile host). None of that
 * is a user edit, so the fingerprint keeps only what a user can actually
 * change: the set of pages, each page's name, and each page's cell tree
 * (tags + sorted attributes + text). Byte equality is kept as a fast path.
 */
import { isMxGraphModel, normalizeToMxfile, parseMxfile } from "./pages.js"

export type EditGateResult =
    | { ok: true }
    | { ok: false; reason: "no-context" | "stale" }

/**
 * Canonical serialisation of an element subtree: tag + attributes sorted by
 * name + child elements in order + non-whitespace text. Whitespace-only text
 * nodes (pretty-printing) are dropped.
 */
function canonicalizeElement(el: Element): string {
    const attrs = Array.from(el.attributes)
        .map((a) => `${a.name}=${JSON.stringify(a.value)}`)
        .sort()
        .join(" ")
    let children = ""
    for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === 1) {
            children += canonicalizeElement(child as Element)
        } else if (child.nodeType === 3 || child.nodeType === 4) {
            const text = (child.textContent ?? "").trim()
            if (text) children += JSON.stringify(text)
        }
    }
    return `<${el.tagName} ${attrs}>${children}</${el.tagName}>`
}

/**
 * Structural fingerprint of a diagram document: page names + each page's
 * <root> subtree, ignoring everything draw.io rewrites on re-serialisation
 * (mxfile/mxGraphModel attributes, diagram ids, formatting). A bare
 * <mxGraphModel> fingerprints identically to its single-page mxfile wrapping.
 * Unparseable input falls back to the trimmed raw string, degrading to the
 * plain string comparison.
 *
 * `includeNames=false` drops page names from the fingerprint — used when the
 * other side of a comparison is a bare <mxGraphModel>, which carries no page
 * name at all (normalizeToMxfile would invent "Page-1", falsely mismatching
 * any real page name).
 */
export function contentFingerprint(xml: string, includeNames = true): string {
    const normalized = normalizeToMxfile(xml)
    const doc = normalized ? parseMxfile(normalized) : null
    if (!doc) return xml.trim()
    const pages: string[] = []
    doc.querySelectorAll("diagram").forEach((d) => {
        const name = includeNames ? d.getAttribute("name") || "" : ""
        const root = d.querySelector("root")
        // No <root> means the page content is not plain XML (e.g. draw.io's
        // compressed format) — fingerprint the raw text instead.
        const body = root
            ? canonicalizeElement(root)
            : (d.textContent || "").trim()
        pages.push(`${name}=${body}`)
    })
    return pages.join("\n")
}

export function checkEditGate(
    lastSeenXml: string,
    liveXml: string,
): EditGateResult {
    // Model never fetched or produced any diagram state in this session.
    if (!lastSeenXml) return { ok: false, reason: "no-context" }
    // Browser state moved since the model last looked (e.g. manual user
    // edits): force a re-fetch so update/delete operations don't build on
    // stale cell contents. An empty liveXml means the store has no entry to
    // compare against, so there is nothing newer to have missed.
    if (liveXml && liveXml !== lastSeenXml) {
        // A bare <mxGraphModel> on either side carries no page name, so
        // comparing names would mismatch against anything not called
        // "Page-1". Compare cell trees only in that case.
        const includeNames =
            !isMxGraphModel(liveXml) && !isMxGraphModel(lastSeenXml)
        if (
            contentFingerprint(liveXml, includeNames) !==
            contentFingerprint(lastSeenXml, includeNames)
        )
            return { ok: false, reason: "stale" }
    }
    return { ok: true }
}
