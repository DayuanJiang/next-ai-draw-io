/**
 * XML → tree. The reverse direction, which the reference project (drawio-ai-kit) does
 * not have — it only goes tree → XML.
 *
 * This is what lets the canvas be the single source of truth. The model never holds a
 * copy of the tree; whenever it wants to restructure a diagram we re-derive the tree
 * from whatever is on the canvas right now, including everything the user changed by
 * hand. There is no second copy of the state to drift out of sync.
 *
 * Two things make this viable, and both were verified against the real editor:
 *
 *   - Engine-emitted containers carry `container=1`, so when a user drags a shape into
 *     a frame draw.io sets the shape's `parent` to that frame and rewrites its geometry
 *     to be parent-relative. The `parent` attribute therefore tracks what the user did.
 *   - draw.io preserves unknown style keys, so the `dai_*` markers written at emit time
 *     are still there on the way back.
 *
 * When a container lacks `container=1` (an imported file, or output from the old
 * hand-written-XML path) the `parent` attribute and the visual nesting can disagree: a
 * shape sits inside a frame on screen but its parent is still the root layer. We trust
 * GEOMETRY over `parent` in exactly that case, and only that case — see resolveNesting.
 */

import { extractDiagramXML } from "@/lib/utils"
import {
    type Direction,
    hasMarkers,
    isPinned,
    readDir,
    readIntMarker,
    readKind,
} from "./markers"
import type {
    BoxNode,
    DiagramNode,
    DiagramTree,
    ForeignCell,
    GridNode,
    GroupNode,
    IconNode,
    LinkSpec,
    Rect,
} from "./types"

/** draw.io's own layer/root cells, plus the boundaries layer the engine emits. */
const LAYER_IDS = new Set(["0", "1", "boundaries"])

/** A flattened cell, before it becomes a node. */
interface RawCell {
    id: string
    parent: string
    style: string
    value: string
    isEdge: boolean
    source: string | null
    target: string | null
    /** Geometry as written: relative to the parent for a nested cell. */
    geo: Rect | null
    /** Geometry resolved to page coordinates through the parent chain. */
    abs: Rect | null
    /** The cell's serialised XML, kept so unrecognised cells survive verbatim. */
    xml: string
}

export interface ParseResult {
    tree: DiagramTree
    /** True when no cell carried a `dai_*` marker — an imported or legacy diagram. */
    needsAdoption: boolean
    /** Non-fatal problems worth surfacing (cycles broken, cells dropped). */
    warnings: string[]
}

/**
 * Pull the mxGraphModel body of one page out of whatever the caller has: an mxfile
 * document, a bare mxGraphModel, or the XML embedded in an exported SVG.
 */
export function extractPage(xml: string, pageIndex = 0): string | null {
    let doc = xml.trim()
    if (doc.startsWith("<svg") || doc.includes("<svg ")) {
        const inner = extractDiagramXML(doc)
        if (inner) doc = inner.trim()
    }
    const diagrams = [...doc.matchAll(/<diagram\b[^>]*>([\s\S]*?)<\/diagram>/g)]
    if (diagrams.length > 0) {
        const body = diagrams[Math.min(pageIndex, diagrams.length - 1)][1]
        // A compressed page is base64 with no markup — nothing to parse.
        if (!/<mxCell\b/.test(body)) return null
        return body
    }
    return /<mxCell\b/.test(doc) ? doc : null
}

/** How many pages the document has. */
export function countPages(xml: string): number {
    return [...xml.matchAll(/<diagram\b[^>]*>/g)].length || 1
}

function attr(tag: string, name: string): string | null {
    const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`))
    return m ? m[1] : null
}

/** Undo the XML entity escaping the builder applies to labels. */
function unescapeXml(s: string): string {
    return s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
}

/**
 * Split the page into cells with a regex rather than a DOM parser.
 *
 * The DOM route needs a real parser (browser DOMParser or @xmldom/xmldom) and gives us
 * nothing extra here: we want each cell's raw XML preserved byte-for-byte so foreign
 * cells can be re-emitted untouched, and re-serialising a DOM node changes attribute
 * order and whitespace. The reference project's validator parses the same way.
 */
function splitCells(page: string): RawCell[] {
    const out: RawCell[] = []
    // Match a full <mxCell …/> or <mxCell …>…</mxCell>.
    const re = /<mxCell\b[^>]*?(?:\/>|>[\s\S]*?<\/mxCell>)/g
    for (const m of page.matchAll(re)) {
        const xml = m[0]
        const head = xml.slice(0, xml.indexOf(">") + 1)
        const id = attr(head, "id")
        if (!id) continue
        const geoTag = xml.match(/<mxGeometry\b[^>]*?(?:\/>|>)/)?.[0] ?? ""
        const num = (n: string) => {
            const v = attr(geoTag, n)
            return v === null ? null : Number(v)
        }
        const x = num("x")
        const y = num("y")
        const w = num("width")
        const h = num("height")
        out.push({
            id,
            parent: attr(head, "parent") ?? "",
            style: attr(head, "style") ?? "",
            value: unescapeXml(attr(head, "value") ?? ""),
            isEdge: attr(head, "edge") === "1",
            source: attr(head, "source"),
            target: attr(head, "target"),
            geo:
                w !== null && h !== null
                    ? { x: x ?? 0, y: y ?? 0, w, h }
                    : null,
            abs: null,
            xml,
        })
    }
    return out
}

/**
 * Resolve every cell's geometry into page coordinates.
 *
 * A nested cell's geometry is relative to its parent, so absolute position is the sum
 * down the parent chain. The hop limit breaks a cycle in a malformed file instead of
 * hanging.
 */
function resolveAbsolute(cells: RawCell[], warnings: string[]): void {
    const byId = new Map(cells.map((c) => [c.id, c]))
    for (const c of cells) {
        if (!c.geo) continue
        let x = c.geo.x
        let y = c.geo.y
        let p = byId.get(c.parent)
        let hops = 0
        while (p && hops < 50) {
            if (p.geo) {
                x += p.geo.x
                y += p.geo.y
            }
            p = byId.get(p.parent)
            hops++
        }
        if (hops >= 50)
            warnings.push(
                `Parent chain of "${c.id}" exceeded 50 hops — possible cycle; geometry may be wrong.`,
            )
        c.abs = { x, y, w: c.geo.w, h: c.geo.h }
    }
}

/** Does this style declare a draw.io container? Last duplicate wins, as draw.io does. */
function declaresContainer(style: string): boolean {
    const matches = [...style.matchAll(/(?:^|;)container=([^;]*)/g)]
    if (matches.length === 0) return false
    return matches[matches.length - 1][1] === "1"
}

/**
 * Classify a cell.
 *
 * The marker wins when present. Without one we fall back to the shape, which has to
 * cover four different icon encodings: `resIcon=mxgraph.aws4.<name>` (554 of the 983
 * AWS icons), a bare `shape=mxgraph.aws4.<name>` (the other 429), `shape=image` with an
 * embedded data URI (all 626 Azure and 216 GCP icons), and `grIcon=` for group frames.
 * Keying only on `resIcon=` would misread well over a thousand icons as plain boxes.
 */
function classify(
    c: RawCell,
    hasChildren: boolean,
): "group" | "grid" | "icon" | "box" | "title" {
    const marked = readKind(c.style)
    if (marked) return marked

    if (/(?:^|;)text;/.test(c.style) || c.id === "__title") return "title"
    // A group stencil, or anything draw.io treats as a container, or anything that
    // actually holds children — all are containers regardless of how they were styled.
    if (/grIcon=/.test(c.style) || declaresContainer(c.style) || hasChildren)
        return "group"
    if (
        /resIcon=/.test(c.style) ||
        /shape=mxgraph\.[a-z0-9_]+\./.test(c.style) ||
        /shape=image/.test(c.style)
    )
        return "icon"
    return "box"
}

/** The catalog name of an icon, when it can be recovered from the style. */
function iconName(style: string): string | null {
    return (
        style.match(/resIcon=mxgraph\.[a-z0-9_]+\.([a-zA-Z0-9_]+)/)?.[1] ??
        style.match(/shape=mxgraph\.[a-z0-9_]+\.([a-zA-Z0-9_]+)/)?.[1] ??
        null
    )
}

/** The group stencil name of a container, when it has one. */
function groupName(style: string): string | null {
    return (
        style.match(/grIcon=mxgraph\.[a-z0-9_]+\.([a-zA-Z0-9_]+)/)?.[1] ?? null
    )
}

function styleValue(style: string, key: string): string | undefined {
    const all = [...style.matchAll(new RegExp(`(?:^|;)${key}=([^;]*)`, "g"))]
    return all.length ? all[all.length - 1][1] : undefined
}

/**
 * Decide each cell's true parent.
 *
 * Normally `parent` is authoritative: with `container=1` in place draw.io maintains it
 * as the user drags things around. The exception is a container WITHOUT `container=1`
 * — draw.io will not reparent into it, so a shape the user dropped inside it visually
 * still claims the root layer as its parent. There, and only there, we believe the
 * geometry: if a cell sits geometrically inside such a frame and its declared parent is
 * a layer, we re-home it into the smallest frame that contains it.
 *
 * Trusting geometry unconditionally would be wrong the other way round: a legitimately
 * reparented cell whose geometry got stale for a frame, or a deliberately overlapping
 * badge, would be silently moved.
 */
function resolveNesting(cells: RawCell[]): Map<string, string> {
    const byId = new Map(cells.map((c) => [c.id, c]))
    const parentOf = new Map<string, string>()

    const contains = (outer: Rect, inner: Rect) =>
        inner.x >= outer.x - 2 &&
        inner.y >= outer.y - 2 &&
        inner.x + inner.w <= outer.x + outer.w + 2 &&
        inner.y + inner.h <= outer.y + outer.h + 2

    // Frames that draw.io will NOT reparent into, so their contents may be mis-parented.
    const looseFrames = cells.filter(
        (c) =>
            !c.isEdge &&
            c.abs !== null &&
            !declaresContainer(c.style) &&
            (/grIcon=/.test(c.style) || readKind(c.style) === "group"),
    )

    for (const c of cells) {
        let p = c.parent
        const declaredIsLayer = LAYER_IDS.has(p) || !byId.has(p)
        if (declaredIsLayer && c.abs && !c.isEdge && looseFrames.length > 0) {
            let best: RawCell | null = null
            for (const f of looseFrames) {
                if (f.id === c.id || !f.abs) continue
                if (!contains(f.abs, c.abs)) continue
                // smallest containing frame — the innermost one the user dropped into
                if (!best?.abs || f.abs.w * f.abs.h < best.abs.w * best.abs.h)
                    best = f
            }
            if (best) p = best.id
        }
        parentOf.set(c.id, p)
    }
    return parentOf
}

/**
 * Recover a container's stacking direction and gap from its children's positions.
 *
 * Used only when the style marker is missing. Compares how much the children spread
 * along each axis: a row varies in x and shares y, a column the reverse. Ties and
 * genuinely two-dimensional arrangements fall back to a row, which is what an
 * unlabelled cluster of icons most often is.
 */
function inferLayout(children: RawCell[]): { dir: Direction; gap: number } {
    const boxes = children
        .map((c) => c.abs)
        .filter((r): r is Rect => r !== null)
    if (boxes.length < 2) return { dir: "row", gap: 20 }

    const xs = boxes.map((b) => b.x)
    const ys = boxes.map((b) => b.y)
    const spreadX = Math.max(...xs) - Math.min(...xs)
    const spreadY = Math.max(...ys) - Math.min(...ys)

    // Distinct row/column bands, to notice a real grid.
    const bands = (vals: number[], tol: number) => {
        const sorted = [...vals].sort((a, b) => a - b)
        let n = 1
        for (let i = 1; i < sorted.length; i++)
            if (sorted[i] - sorted[i - 1] > tol) n++
        return n
    }
    const rows = bands(ys, 20)
    const cols = bands(xs, 20)
    if (rows > 1 && cols > 1) return { dir: "grid", gap: 20 }

    const dir: Direction = spreadX >= spreadY ? "row" : "col"

    // Gap = median edge-to-edge distance between neighbours along the flow axis.
    const sorted = [...boxes].sort((a, b) =>
        dir === "row" ? a.x - b.x : a.y - b.y,
    )
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]
        const cur = sorted[i]
        gaps.push(
            dir === "row"
                ? cur.x - (prev.x + prev.w)
                : cur.y - (prev.y + prev.h),
        )
    }
    gaps.sort((a, b) => a - b)
    const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 20
    return { dir, gap: Math.max(0, Math.round(median)) }
}

/** Turn an edge cell into a link spec. */
function toLink(c: RawCell): LinkSpec | null {
    if (!c.source || !c.target) return null
    let label = c.value
    let step: number | undefined
    const m = label.match(/^(\d+)\.\s*(.*)$/)
    if (m) {
        step = Number(m[1])
        label = m[2]
    }
    return {
        id: c.id,
        source: c.source,
        target: c.target,
        label: label || undefined,
        dashed: /(?:^|;)dashed=1/.test(c.style) || undefined,
        step,
        style: c.style,
    }
}

/**
 * Re-derive the node tree from a page of canvas XML.
 *
 * Cells the classifier cannot place — a shape whose parent is a foreign cell, anything
 * on the boundaries layer — are returned in `tree.foreign` and re-emitted verbatim, so
 * a re-layout never deletes a user's annotations.
 */
export function parseDiagram(xml: string, pageIndex = 0): ParseResult {
    const warnings: string[] = []
    const page = extractPage(xml, pageIndex)
    if (!page)
        return {
            tree: { roots: [], links: [], foreign: [] },
            needsAdoption: true,
            warnings: [
                "No cells found — the page is empty or the .drawio is compressed.",
            ],
        }

    const cells = splitCells(page)
    resolveAbsolute(cells, warnings)

    const marked = cells.some((c) => hasMarkers(c.style))
    const parentOf = resolveNesting(cells)

    const vertices = cells.filter((c) => !c.isEdge && !LAYER_IDS.has(c.id))
    const edges = cells.filter((c) => c.isEdge)

    // children, in document order — which is layout order for engine output
    const childrenOf = new Map<string, RawCell[]>()
    for (const c of vertices) {
        const p = parentOf.get(c.id) ?? ""
        if (!childrenOf.has(p)) childrenOf.set(p, [])
        childrenOf.get(p)?.push(c)
    }

    const byId = new Map(cells.map((c) => [c.id, c]))
    const kindOf = new Map<string, ReturnType<typeof classify>>()
    for (const c of vertices)
        kindOf.set(c.id, classify(c, (childrenOf.get(c.id)?.length ?? 0) > 0))

    const foreign: ForeignCell[] = []
    let title: string | undefined

    const build = (c: RawCell, depth: number): DiagramNode | null => {
        if (depth > 50) {
            warnings.push(
                `Nesting deeper than 50 at "${c.id}" — subtree dropped.`,
            )
            return null
        }
        const kind = kindOf.get(c.id) ?? "box"
        const pinned = isPinned(c.style) || undefined
        const rect = c.abs ?? undefined

        if (kind === "title") {
            if (title === undefined) title = c.value
            return null // laid out separately, not part of the flow
        }

        if (kind === "icon") {
            const node: IconNode = {
                kind: "icon",
                id: c.id,
                name: iconName(c.style) ?? "",
                label: c.value,
                style: c.style,
                size: c.geo ? Math.round(c.geo.w) : undefined,
                pinned,
                rect,
            }
            return node
        }

        if (kind === "box") {
            const node: BoxNode = {
                kind: "box",
                id: c.id,
                label: c.value,
                w: c.geo ? Math.round(c.geo.w) : undefined,
                h: c.geo ? Math.round(c.geo.h) : undefined,
                fill: styleValue(c.style, "fillColor"),
                stroke: styleValue(c.style, "strokeColor"),
                style: c.style,
                pinned,
                rect,
            }
            return node
        }

        // container
        const kids = childrenOf.get(c.id) ?? []
        const built = kids
            .map((k) => build(k, depth + 1))
            .filter((n): n is DiagramNode => n !== null)
        const markedDir = readDir(c.style)
        const markedGap = readIntMarker(c.style, "dai_gap")
        const inferred = markedDir === null ? inferLayout(kids) : null
        const dir = markedDir ?? inferred?.dir ?? "row"
        const gap = markedGap ?? inferred?.gap ?? 20

        if (kind === "grid" || dir === "grid") {
            const cols =
                readIntMarker(c.style, "dai_cols") ??
                Math.max(1, Math.round(Math.sqrt(built.length)))
            const node: GridNode = {
                kind: "grid",
                id: c.id,
                gname: groupName(c.style),
                label: c.value,
                cols,
                gap,
                children: built,
                fill: styleValue(c.style, "fillColor"),
                stroke: styleValue(c.style, "strokeColor"),
                style: c.style,
                pinned,
                rect,
            }
            return node
        }

        const node: GroupNode = {
            kind: "group",
            id: c.id,
            gname: groupName(c.style),
            label: c.value,
            dir: dir === "col" ? "col" : "row",
            gap,
            children: built,
            fill: styleValue(c.style, "fillColor"),
            stroke: styleValue(c.style, "strokeColor"),
            style: c.style,
            pinned,
            rect,
        }
        return node
    }

    // Roots: cells parented to a layer. The boundaries layer holds engine-drawn
    // cluster frames, which are decoration over the real nesting — keep them verbatim.
    const roots: DiagramNode[] = []
    for (const c of vertices) {
        const p = parentOf.get(c.id) ?? ""
        if (byId.has(p) && !LAYER_IDS.has(p)) continue // not a root
        if (p === "boundaries") {
            foreign.push({ id: c.id, xml: c.xml, parent: p })
            continue
        }
        const n = build(c, 0)
        if (n) roots.push(n)
    }

    const links = edges.map(toLink).filter((l): l is LinkSpec => l !== null)

    const pages = countPages(xml)
    if (pages > 1)
        warnings.push(
            `Document has ${pages} pages; parsed page ${pageIndex + 1} only.`,
        )

    return {
        tree: { roots, links, title, foreign },
        needsAdoption: !marked,
        warnings,
    }
}
