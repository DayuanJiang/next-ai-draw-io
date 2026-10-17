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
import {
    findPageElement,
    isMxGraphModel,
    normalizeToMxfile,
    type PageSelector,
    parseMxfile,
    serializeMxfile,
} from "./pages.ts"

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

/**
 * The model was shown only the selected page of liveXml (get_diagram with a
 * page selector, or a rejected edit's error). It has seen the whole document
 * if the other pages are as it last saw them, or if it saw nothing before
 * (it then has no old copy of them to edit from). Returns the new
 * lastSeenXml: liveXml, or lastSeenXml unchanged.
 */
export function markPageSeen(
    lastSeenXml: string,
    liveXml: string,
    selector: PageSelector,
): string {
    const parse = (xml: string) => {
        const normalized = normalizeToMxfile(xml)
        return normalized ? parseMxfile(normalized) : null
    }
    // An empty record also follows load_diagram and page tools that wrote
    // over unseen changes, when the model may remember older pages: only
    // a one-page document is then fully seen
    if (!lastSeenXml) {
        const pages = parse(liveXml)?.querySelectorAll("diagram").length ?? 1
        return pages <= 1 ? liveXml : lastSeenXml
    }
    const otherPages = (xml: string) => {
        const doc = parse(xml)
        if (!doc) return null
        findPageElement(doc, selector)?.element.remove()
        return contentFingerprint(serializeMxfile(doc))
    }
    const before = otherPages(lastSeenXml)
    return before !== null && before === otherPages(liveXml)
        ? liveXml
        : lastSeenXml
}

const CELL_TAGS = new Set(["mxCell", "UserObject", "object"])

/** The cells of a page by id: the direct children of its <root>. */
function pageCells(page: Element): Map<string, Element> {
    const cells = new Map<string, Element>()
    for (const el of Array.from(page.querySelector("root")?.children ?? [])) {
        const id = el.getAttribute("id")
        if (id && CELL_TAGS.has(el.tagName)) cells.set(id, el)
    }
    return cells
}

/** `id ("label")`: the cell's value without HTML, cut at 30 characters. */
function describeCell(id: string, cell: Element): string {
    // getAttributeNode gives the decoded value (linkedom's getAttribute
    // escapes it again); an HTML label then still holds tags and entities
    const label = (
        (cell.getAttributeNode("value") ?? cell.getAttributeNode("label"))
            ?.value ?? ""
    )
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim()
    if (!label) return id
    return `${id} ("${label.length > 30 ? `${label.slice(0, 30)}...` : label}")`
}

/** At most 20 entries, then "and N more". */
function listCells(cells: string[]): string {
    const shown = cells.slice(0, 20).join(", ")
    return cells.length > 20 ? `${shown} and ${cells.length - 20} more` : shown
}

/** A cell's flag, which a wrapped cell keeps on its inner mxCell */
function cellFlag(cell: Element, name: string): string | null {
    const inner =
        cell.tagName === "mxCell" ? cell : cell.querySelector("mxCell")
    return inner?.getAttribute(name) ?? null
}

/**
 * What changed from one version to the next, counted by kind, for
 * restore_version's list: "added 2 shapes, changed 1 connector". Pages are
 * paired by index and cells by id, as in describeChanges. "" when no shape
 * or connector changed.
 */
export function countChanges(beforeXml: string, afterXml: string): string {
    const parse = (xml: string) => {
        const normalized = normalizeToMxfile(xml)
        return normalized ? parseMxfile(normalized) : null
    }
    const before = parse(beforeXml)
    const after = parse(afterXml)
    if (!before || !after) return ""
    const pagesBefore = Array.from(before.querySelectorAll("diagram"))
    const pagesAfter = Array.from(after.querySelectorAll("diagram"))
    const counts = new Map<string, number>()
    const count = (action: string, cell: Element) => {
        const kind =
            cellFlag(cell, "edge") === "1"
                ? "connector"
                : cellFlag(cell, "vertex") === "1"
                  ? "shape"
                  : null
        if (!kind) return
        const key = `${action} ${kind}`
        counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const pageCount = Math.max(pagesBefore.length, pagesAfter.length)
    for (let i = 0; i < pageCount; i++) {
        const cellsBefore = pagesBefore[i]
            ? pageCells(pagesBefore[i])
            : new Map<string, Element>()
        const cellsAfter = pagesAfter[i]
            ? pageCells(pagesAfter[i])
            : new Map<string, Element>()
        for (const [id, cell] of cellsAfter) {
            const old = cellsBefore.get(id)
            if (!old) count("added", cell)
            else if (canonicalizeElement(old) !== canonicalizeElement(cell))
                count("changed", cell)
        }
        for (const [id, cell] of cellsBefore) {
            if (!cellsAfter.has(id)) count("removed", cell)
        }
    }
    const parts: string[] = []
    const pagesAdded = pagesAfter.length - pagesBefore.length
    if (pagesAdded !== 0) {
        const n = Math.abs(pagesAdded)
        parts.push(
            `${pagesAdded > 0 ? "added" : "removed"} ${n} page${n > 1 ? "s" : ""}`,
        )
    }
    for (const action of ["added", "changed", "removed"]) {
        for (const kind of ["shape", "connector"]) {
            const n = counts.get(`${action} ${kind}`)
            if (n) parts.push(`${action} ${n} ${kind}${n > 1 ? "s" : ""}`)
        }
    }
    return parts.join(", ")
}

/**
 * One paragraph naming what the user changed between the XML the model last
 * saw and the live store, for stale rejections and get_diagram. Pages are
 * paired by index (draw.io regenerates diagram ids on re-serialisation) and
 * cells by id. Returns "" when there is nothing to compare or the two sides
 * have the same content.
 */
export function describeChanges(lastSeenXml: string, liveXml: string): string {
    if (!lastSeenXml || lastSeenXml === liveXml) return ""
    const parse = (xml: string) => {
        const normalized = normalizeToMxfile(xml)
        return normalized ? parseMxfile(normalized) : null
    }
    const before = parse(lastSeenXml)
    const live = parse(liveXml)
    if (!before || !live) return ""
    // Same rule as checkEditGate: a bare <mxGraphModel> carries no page name
    const includeNames =
        !isMxGraphModel(liveXml) && !isMxGraphModel(lastSeenXml)
    if (
        contentFingerprint(lastSeenXml, includeNames) ===
        contentFingerprint(liveXml, includeNames)
    )
        return ""

    const pagesBefore = Array.from(before.querySelectorAll("diagram"))
    const pagesLive = Array.from(live.querySelectorAll("diagram"))
    const pageCount = Math.max(pagesBefore.length, pagesLive.length)
    const clauses: string[] = []
    const renames: string[] = []
    for (let i = 0; i < pageCount; i++) {
        const pageBefore = pagesBefore[i]
        const pageLive = pagesLive[i]
        if (!pageBefore || !pageLive) {
            clauses.push(`page ${i + 1} ${pageLive ? "added" : "removed"}`)
            continue
        }
        const cellsBefore = pageCells(pageBefore)
        const cellsLive = pageCells(pageLive)
        const modified: string[] = []
        const added: string[] = []
        const removed: string[] = []
        for (const [id, cell] of cellsLive) {
            const old = cellsBefore.get(id)
            if (!old) added.push(describeCell(id, cell))
            else if (canonicalizeElement(old) !== canonicalizeElement(cell))
                modified.push(describeCell(id, cell))
        }
        for (const [id, cell] of cellsBefore) {
            if (!cellsLive.has(id)) removed.push(describeCell(id, cell))
        }
        // Name the page only when the document has several
        const where = pageCount > 1 ? `page ${i + 1} ` : ""
        if (modified.length)
            clauses.push(`${where}modified ${listCells(modified)}`)
        if (added.length) clauses.push(`${where}added ${listCells(added)}`)
        if (removed.length)
            clauses.push(`${where}removed ${listCells(removed)}`)
        if (includeNames) {
            const name = pageLive.getAttribute("name") ?? ""
            if (name !== (pageBefore.getAttribute("name") ?? ""))
                renames.push(`Page ${i + 1} renamed to "${name}".`)
        }
    }
    // The fingerprint also covers the cell order (z-order) and anything in
    // <root> that is not a cell
    if (!clauses.length && !renames.length)
        clauses.push("the order of the cells changed")
    const intro = "Since you last saw it, the user changed the diagram"
    const body = clauses.length
        ? `${intro}: ${clauses.join("; ")}.`
        : `${intro}.`
    return [body, ...renames].join(" ")
}
