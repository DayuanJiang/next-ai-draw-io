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
 * THE ONE INVARIANT THIS FILE OWES ITS CALLER: every vertex on the page comes back
 * either as a node in the tree or as a verbatim entry in `tree.foreign`. A re-layout
 * re-emits both, so nothing a user drew can be deleted by a round-trip. Every branch
 * that declines to interpret a cell calls `keep()`; the final sweep asserts the count.
 */

import { extractDiagramXML } from "@/lib/utils"
import {
    type Direction,
    hasMarkers,
    isLaneChrome,
    isPinned,
    MARKER,
    type NodeKind,
    readCell,
    readDir,
    readIntMarker,
    readKind,
    readList,
    readMarker,
} from "./markers"
import type {
    BoxNode,
    BoxShape,
    DiagramNode,
    DiagramTree,
    ForeignCell,
    GridNode,
    GroupNode,
    IconNode,
    LinkSpec,
    PoolCell,
    PoolNode,
    RadialNode,
    Rect,
    SequenceNode,
} from "./types"

/** Hard cap on nesting depth, matching the reference project's 50-hop guard. */
const MAX_DEPTH = 50

/**
 * How much of a cell's area must fall inside a frame before we accept that the user
 * meant to put it there. A shape merely clipping a frame's border is not "inside".
 */
const INSIDE_AREA_RATIO = 0.9

/** A flattened cell, before it becomes a node. */
interface RawCell {
    id: string
    /** The `parent` attribute, verbatim. */
    parent: string
    style: string
    value: string
    isEdge: boolean
    source: string | null
    target: string | null
    /** Geometry as written: relative to the declared parent for a nested cell. */
    geo: Rect | null
    /** Geometry resolved to page coordinates through the declared parent chain. */
    abs: Rect | null
    /** Document position, used as the tie-break for every ordering decision. */
    seq: number
    /** The cell's serialised XML, kept so unrecognised cells survive verbatim. */
    xml: string
}

export interface ParseResult {
    tree: DiagramTree
    /** True when no cell carried a `dai_*` marker — an imported or legacy diagram. */
    needsAdoption: boolean
    /** Non-fatal problems worth surfacing (cycles broken, direction guessed, cells kept aside). */
    warnings: string[]
}

// ============================================================================
// 1. Multi-page document → the cells of ONE page
// ============================================================================

/**
 * The name of every page, in document order.
 *
 * The canvas XML this repo holds is a multi-page `<mxfile>` (see the note at
 * contexts/diagram-context.tsx around line 230). A caller that wants to restructure
 * "the diagram the user is looking at" has to say WHICH page, so we expose the list
 * rather than quietly assuming page 0.
 */
export function listPages(xml: string): string[] {
    return [...xml.matchAll(/<diagram\b([^>]*)>/g)].map(
        (m, i) => attr(m[1], "name") ?? `Page-${i + 1}`,
    )
}

/** How many pages the document has. */
export function countPages(xml: string): number {
    return [...xml.matchAll(/<diagram\b[^>]*>/g)].length || 1
}

/** Index of the page with this name, or -1. */
export function findPageIndex(xml: string, name: string): number {
    return listPages(xml).indexOf(name)
}

/**
 * Pull the `<mxGraphModel>` body of one page out of whatever the caller has: an mxfile
 * document, a bare mxGraphModel, or the XML embedded in an exported SVG.
 *
 * Returns null — never throws, and never an empty-looking success — when the page
 * cannot be read. The distinction matters: an empty page and a compressed page look
 * identical to a regex, and treating a compressed page as empty would let a re-layout
 * wipe a real diagram.
 */
export function extractPage(xml: string, pageIndex = 0): string | null {
    let doc = xml.trim()

    // An exported SVG: the model is in the root element's `content` attribute, either as
    // a base64 data URI (what the embed API hands us) or as escaped markup.
    if (doc.startsWith("data:image/") || doc.startsWith("<svg")) {
        doc = unwrapSvg(doc) ?? doc
    }

    const diagrams = [...doc.matchAll(/<diagram\b[^>]*>([\s\S]*?)<\/diagram>/g)]
    if (diagrams.length > 0) {
        const idx = Math.min(Math.max(0, pageIndex), diagrams.length - 1)
        const body = diagrams[idx][1]
        // A compressed page is deflate+base64 with no markup — nothing to parse.
        if (!/<mxCell\b/.test(body)) return null
        return body
    }
    return /<mxCell\b/.test(doc) ? doc : null
}

/**
 * Get the model out of an exported SVG.
 *
 * `extractDiagramXML` handles the base64 data-URI form (it slices off the 26-character
 * `data:image/svg+xml;base64,` prefix, then inflates the payload) and throws on
 * anything else, so it is guarded. Plain SVG markup is handled here instead: the
 * `content` attribute holds the mxfile with its angle brackets escaped.
 */
function unwrapSvg(doc: string): string | null {
    try {
        const inner = extractDiagramXML(doc)
        if (inner?.includes("<mxCell")) return inner.trim()
    } catch {
        // Not a compressed data URI. Fall through to the markup path.
    }
    const content = doc.match(/\bcontent="([\s\S]*?)"/)?.[1]
    if (!content) return null
    const unescaped = unescapeXml(content)
    return unescaped.includes("<mxCell") ? unescaped.trim() : null
}

// ============================================================================
// 2. Page body → flat cells
// ============================================================================

function attr(tag: string, name: string): string | null {
    // `name` is always an internal literal (a fixed set of mxGraph attribute names).
    const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`))
    return m ? m[1] : null
}

/** Undo the XML entity escaping the builder applies to labels. `&amp;` last. */
function unescapeXml(s: string): string {
    return s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
}

/**
 * Split the page into cells with a regex rather than a DOM parser.
 *
 * @xmldom/xmldom is available, but the DOM route gives us nothing here and costs us the
 * one thing we need: each cell's raw XML preserved byte-for-byte, so a cell the engine
 * does not understand can be re-emitted untouched. Re-serialising a DOM node reorders
 * attributes and normalises whitespace. The reference project's own validator
 * (core.mjs `parseCells`) reads cells the same way.
 */
function splitCells(page: string): RawCell[] {
    const out: RawCell[] = []
    // A full <mxCell …/> or <mxCell …>…</mxCell>. mxCell never nests inside mxCell, so
    // the lazy body match cannot run past the right closing tag.
    const re = /<mxCell\b[^>]*?(?:\/>|>[\s\S]*?<\/mxCell>)/g
    let seq = 0
    for (const m of page.matchAll(re)) {
        const xml = m[0]
        const head = xml.slice(0, xml.indexOf(">") + 1)
        const id = attr(head, "id")
        if (!id) continue
        // The FIRST mxGeometry is the cell's own; a later one would belong to a nested
        // construct, and edge label offsets live in <mxPoint as="offset"/>.
        const geoTag = xml.match(/<mxGeometry\b[^>]*?(?:\/>|>)/)?.[0] ?? ""
        const num = (n: string) => {
            const v = attr(geoTag, n)
            if (v === null) return null
            const f = Number(v)
            return Number.isFinite(f) ? f : null
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
            seq: seq++,
            xml,
        })
    }
    return out
}

/**
 * Resolve every cell's geometry into page coordinates.
 *
 * A nested cell's geometry is relative to its DECLARED parent, so this walks the
 * `parent` attribute — not the corrected nesting computed later, which would double-
 * count the offsets of a cell we re-homed. A `visited` set breaks a cycle in a
 * malformed file and names the cells involved, so the caller learns the file is broken
 * instead of getting a plausible-looking wrong answer.
 */
function resolveAbsolute(cells: RawCell[]): Set<string> {
    const byId = new Map(cells.map((c) => [c.id, c]))
    const cyclic = new Set<string>()
    for (const c of cells) {
        if (!c.geo) continue
        let x = c.geo.x
        let y = c.geo.y
        const seen = new Set<string>([c.id])
        let p = byId.get(c.parent)
        let hops = 0
        while (p && hops < MAX_DEPTH) {
            if (seen.has(p.id)) {
                cyclic.add(c.id)
                break
            }
            seen.add(p.id)
            if (p.geo) {
                x += p.geo.x
                y += p.geo.y
            }
            p = byId.get(p.parent)
            hops++
        }
        if (hops >= MAX_DEPTH) cyclic.add(c.id)
        c.abs = { x, y, w: c.geo.w, h: c.geo.h }
    }
    return cyclic
}

// ============================================================================
// 3. Style reading
// ============================================================================

/** Read a style key's effective value. Last duplicate wins, as draw.io resolves them. */
function styleValue(style: string, key: string): string | undefined {
    const all = [...style.matchAll(new RegExp(`(?:^|;)${key}=([^;]*)`, "g"))]
    return all.length ? all[all.length - 1][1] : undefined
}

/** Does this style declare a draw.io container? */
function declaresContainer(style: string): boolean {
    return styleValue(style, "container") === "1"
}

/**
 * The catalog name of an icon.
 *
 * Four encodings exist in the catalogs and all four have to work:
 *   1. `shape=mxgraph.aws4.resourceIcon` + `resIcon=mxgraph.aws4.<name>` — 554 of 983
 *      AWS icons. The name is in resIcon; the shape is the generic tile.
 *   2. `shape=mxgraph.aws4.<name>` with NO resIcon — the other 429 AWS icons.
 *   3. `shape=image;image=data:image/png,<base64>` — all 626 Azure and 216 GCP icons.
 *      There is no token to read, so the name is unrecoverable and we return null; the
 *      verbatim style on the node is what re-emits it faithfully.
 *   4. `shape=mxgraph.aws4.group` + `grIcon=mxgraph.aws4.group_<name>` — group frames,
 *      handled by `groupName` instead.
 *
 * resIcon is checked first because encoding 1 carries BOTH tokens and the bare shape
 * there is the meaningless `resourceIcon` tile.
 */
function iconName(style: string): string | null {
    // The marker wins: an Azure or GCP icon is an embedded base64 image whose style
    // contains no name at all, so nothing else can identify it.
    const marked = readMarker(style, MARKER.name)
    if (marked) return marked
    const res = style.match(/(?:^|;)resIcon=mxgraph\.[a-z0-9_]+\.([\w]+)/)
    if (res) return res[1]
    const shape = style.match(/(?:^|;)shape=mxgraph\.[a-z0-9_]+\.([\w]+)/)
    if (shape && shape[1] !== "resourceIcon" && shape[1] !== "group")
        return shape[1]
    return null
}

/** The group stencil name of a container, when it has one. */
function groupName(style: string): string | null {
    return (
        style.match(/(?:^|;)grIcon=mxgraph\.[a-z0-9_]+\.([\w]+)/)?.[1] ?? null
    )
}

/** Any of the four icon encodings, without needing the name to be recoverable. */
function looksLikeIcon(style: string): boolean {
    if (/(?:^|;)resIcon=/.test(style)) return true
    if (/(?:^|;)image=data:image\//.test(style)) return true
    const shape = styleValue(style, "shape")
    if (shape === "image") return true
    if (shape && shape !== "group" && /^mxgraph\./.test(shape)) return true
    return false
}

/** A `text;`-styled cell: draw.io's label-only shape, no border and no fill. */
function looksLikeText(style: string): boolean {
    return /(?:^|;)text;/.test(style) || styleValue(style, "text") === "1"
}

/** The flowchart outline a box is drawn with, read back from its style. */
function boxShape(style: string): BoxShape | undefined {
    const shape = styleValue(style, "shape")
    if (shape === "parallelogram") return "data"
    if (shape === "document") return "document"
    if (/(?:^|;)rhombus[;=]/.test(style) || shape === "rhombus")
        return "decision"
    if (styleValue(style, "rounded") === "1") {
        // A stadium and a rounded rectangle differ only in arcSize; draw.io treats 50 as the
        // maximum, which is what makes the ends semicircular.
        const arc = Number(styleValue(style, "arcSize") ?? "0")
        return arc >= 40 ? "terminator" : "round"
    }
    return undefined
}

/**
 * The lifeline of a sequence diagram participant.
 *
 * One cell covers the head and the line below it, so this is the participant itself, not
 * chrome to be discarded — the head's label is the participant's name.
 */
function looksLikeLifeline(style: string): boolean {
    return styleValue(style, "shape") === "umlLifeline"
}

/**
 * Classify a cell into a node kind.
 *
 * Discrimination order, most authoritative first. Each step is only reached because
 * every step above it declined:
 *
 *   1. `dai_kind` — written by our own emitter and preserved by draw.io. Nothing else
 *      can be as reliable, because it records intent rather than appearance.
 *   2. Holds children → a container, whatever it is styled as. A cell with children is
 *      structurally a container no matter what draw.io calls it.
 *   3. `grIcon=` (a group stencil) or `container=1` → a container, even when empty. An
 *      empty VPC frame the user just dropped is still a VPC frame.
 *   4. Any of the four icon encodings → icon. Checked BEFORE the text test, because an
 *      icon's style also carries label-positioning tokens.
 *   5. `text;` → title/annotation. Only the first becomes `tree.title`; the rest are
 *      the user's own notes and are preserved verbatim (see `parseDiagram`).
 *   6. Anything left → box, a plain labelled rectangle.
 *
 * The old ordering put the icon test last and keyed it on `resIcon=` alone, which reads
 * 429 AWS + 842 Azure/GCP icons as plain boxes: a re-layout would then re-emit them as
 * grey rectangles and the stencils would be gone.
 */
function classify(c: RawCell, hasChildren: boolean): NodeKind {
    const marked = readKind(c.style)
    if (marked) return marked
    if (hasChildren) return "group"
    if (groupName(c.style) !== null || declaresContainer(c.style))
        return "group"
    if (looksLikeIcon(c.style)) return "icon"
    if (looksLikeText(c.style)) return "title"
    return "box"
}

// ============================================================================
// 4. Deciding each cell's true parent
// ============================================================================

/** Area of a rect, 0 when degenerate. */
function area(r: Rect): number {
    return Math.max(0, r.w) * Math.max(0, r.h)
}

/** Fraction of `inner`'s area that lies inside `outer`. */
function insideRatio(outer: Rect, inner: Rect): number {
    const a = area(inner)
    if (a === 0) return 0
    const ox = Math.max(
        0,
        Math.min(outer.x + outer.w, inner.x + inner.w) -
            Math.max(outer.x, inner.x),
    )
    const oy = Math.max(
        0,
        Math.min(outer.y + outer.h, inner.y + inner.h) -
            Math.max(outer.y, inner.y),
    )
    return (ox * oy) / a
}

/**
 * Decide each cell's true parent, resolving the one case where the `parent` attribute
 * and the visual nesting can disagree.
 *
 * WE TRUST `parent`, with a single narrow exception. The reasoning:
 *
 * `parent` is the only place draw.io records a structural DECISION. When a container
 * carries `container=1` — verified in a browser — dragging a shape into it rewrites
 * `parent` to the frame and converts the geometry to parent-relative. So on engine
 * output, `parent` is a live record of what the user did, and geometry is derived from
 * it. Preferring geometry there would be strictly worse: it would swallow the things
 * that legitimately overlap a frame without belonging to it — a legend sitting on top
 * of a region box, a status badge pinned to a subnet's corner, a callout note. Each
 * would get pulled into the frame and then re-laid-out into its child flow.
 *
 * The exception is a frame WITHOUT `container=1`. draw.io refuses to reparent into it,
 * so a shape the user dropped inside keeps `parent="1"` while sitting visually within
 * the frame (verified: parent stayed "1", geometry stayed absolute at 260,186; the same
 * stencil with `container=1;pointerEvents=0;collapsible=0;recursiveResize=0` reparented
 * to "frame" with geometry 140,106). Here `parent="1"` is not a decision at all — it is
 * the default, the absence of one. Geometry is the only signal that exists, so we use
 * it. That is the whole asymmetry: geometry fills a vacuum, it never overrules a
 * statement.
 *
 * This matters because the AWS catalog is inconsistent about it: group_region,
 * group_vpc, group_subnet, group_availability_zone, group_aws_cloud and
 * group_on_premise ship without `container=1`, while group_account, group_aws_cloud_alt,
 * group_vpc2, group_security_group and group_corporate_data_center ship with it. Our
 * emitter appends the container tokens unconditionally, so this path is for imported
 * files and output from the older hand-written-XML path — and `needsAdoption` tells the
 * caller to run an adoption pass that stamps markers, which retires the ambiguity for
 * that diagram permanently.
 *
 * Three guards keep the geometric inference safe:
 *
 *   - Only cells on the DEFAULT content layer are re-homed. A cell on another layer is
 *     an overlay by construction; overlays are meant to sit on top of things.
 *   - The frame must be STRICTLY LARGER in area than the cell. This makes the relation
 *     a strict partial order, so the result cannot contain a cycle. Without it, two
 *     frames of identical size each "contain" the other and the whole page vanishes
 *     into an unreachable cycle.
 *   - At least 90% of the cell's area must be inside the frame, so a shape clipping a
 *     border is left alone.
 */
function resolveNesting(
    cells: RawCell[],
    layers: Set<string>,
    defaultLayer: string,
): { parentOf: Map<string, string>; rehomed: string[] } {
    const byId = new Map(cells.map((c) => [c.id, c]))
    const parentOf = new Map<string, string>()
    const rehomed: string[] = []

    // Frames draw.io will NOT reparent into, so their contents may be mis-parented.
    const looseFrames = cells.filter(
        (c) =>
            !c.isEdge &&
            c.abs !== null &&
            !declaresContainer(c.style) &&
            (groupName(c.style) !== null ||
                readKind(c.style) === "group" ||
                readKind(c.style) === "grid"),
    )

    for (const c of cells) {
        let p = c.parent
        const onDefaultLayer = p === defaultLayer || !byId.has(p)
        if (
            onDefaultLayer &&
            !c.isEdge &&
            c.abs !== null &&
            !layers.has(c.id) &&
            looseFrames.length > 0
        ) {
            const mine = c.abs
            let best: RawCell | null = null
            for (const f of looseFrames) {
                if (f.id === c.id || !f.abs) continue
                // strict area growth ⇒ acyclic by construction
                if (area(f.abs) <= area(mine)) continue
                if (insideRatio(f.abs, mine) < INSIDE_AREA_RATIO) continue
                // innermost = smallest containing frame; document order breaks ties
                if (
                    best?.abs == null ||
                    area(f.abs) < area(best.abs) ||
                    (area(f.abs) === area(best.abs) && f.seq < best.seq)
                )
                    best = f
            }
            if (best) {
                p = best.id
                rehomed.push(`${c.id}→${best.id}`)
            }
        }
        parentOf.set(c.id, p)
    }
    return { parentOf, rehomed }
}

// ============================================================================
// 5. Recovering layout direction and order
// ============================================================================

interface LayoutGuess {
    dir: Direction
    gap: number
    cols: number
    /** True when no single direction describes the arrangement — worth telling the user. */
    ambiguous: boolean
}

type Span = [number, number]

const spanX = (r: Rect): Span => [r.x, r.x + r.w]
const spanY = (r: Rect): Span => [r.y, r.y + r.h]

/**
 * Are two spans in the same band?
 *
 * Overlap of more than half the SHORTER span, which is scale-free: two 48px icons need
 * to overlap by 24px, two 614px availability-zone columns by 307px. This replaces a
 * fixed pixel tolerance, which cannot be right for both at once — 20px is a third of an
 * icon but 3% of a zone.
 */
function sameBand(a: Span, b: Span): boolean {
    const overlap = Math.min(a[1], b[1]) - Math.max(a[0], b[0])
    if (overlap <= 0) return false
    const shorter = Math.min(a[1] - a[0], b[1] - b[0])
    return shorter <= 0 ? true : overlap > shorter / 2
}

/** Group rects into bands along one axis, comparing each against its band's first member. */
function bandsAlong(rects: Rect[], span: (r: Rect) => Span): Rect[][] {
    const sorted = [...rects].sort((a, b) => span(a)[0] - span(b)[0])
    const bands: Rect[][] = []
    for (const r of sorted) {
        const band = bands.find((b) => sameBand(span(b[0]), span(r)))
        if (band) band.push(r)
        else bands.push([r])
    }
    return bands
}

/** Median, or `fallback` for an empty list. */
function median(xs: number[], fallback: number): number {
    if (xs.length === 0) return fallback
    const s = [...xs].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
}

/**
 * Recover a container's stacking direction, gap and column count from its children's
 * positions. Only used when the `dai_dir` marker is absent.
 *
 * The test is SEPARATION, not spread. Children stacked in a row occupy disjoint
 * intervals on x and overlapping intervals on y; a column is the mirror image. Spread
 * (max origin minus min origin) gets this wrong whenever child sizes differ — three
 * subnet frames 187px wide stacked vertically have a y-spread of 364 and an x-spread of
 * 0, which spread reads correctly, but one wide frame beside two narrow ones defeats it.
 *
 * A 2-D GRID is only reported when the arrangement is actually rectangular: at least
 * two bands on each axis, every row band the same size, and the row bands account for
 * every child. That deliberately excludes the case where the user dragged ONE child out
 * of line — three icons in a row plus one below gives row bands of size 3 and 1, which
 * is a row with an outlier, not a 2×2 grid. The outlier keeps its place in the flow
 * order (sorted by x) and a re-layout pulls it back into line, which is what a user who
 * asks to restructure a diagram wants. A user who wanted it left where it is says so
 * with `dai_pin`.
 *
 * When neither axis fully separates and the shape is not a grid, the arrangement is
 * genuinely 2-D and no single direction can express it. We pick the axis with the
 * larger extent and set `ambiguous`, so the caller can warn that a re-layout will move
 * things. This happens on output from the reference project's `phantom` wrapper, which
 * emits no cell and so leaves its children flattened onto their grandparent — the
 * reason our own engine must not have phantoms.
 */
function inferLayout(children: RawCell[]): LayoutGuess {
    const rects = children
        .map((c) => c.abs)
        .filter((r): r is Rect => r !== null && area(r) > 0)
    if (rects.length < 2)
        return { dir: "row", gap: 20, cols: 1, ambiguous: false }

    const rows = bandsAlong(rects, spanY)
    const cols = bandsAlong(rects, spanX)

    // A real rectangular grid: uniform row sizes, ≥2 per row, ≥2 rows, all accounted for.
    const rowSize = rows[0].length
    const isGrid =
        rows.length >= 2 &&
        cols.length >= 2 &&
        rowSize >= 2 &&
        rows.every((r) => r.length === rowSize) &&
        rows.length * rowSize === rects.length
    if (isGrid) {
        const inRow = [...rows[0]].sort((a, b) => a.x - b.x)
        return {
            dir: "grid",
            gap: Math.max(0, Math.round(gapsBetween(inRow, "row"))),
            cols: rowSize,
            ambiguous: false,
        }
    }

    // How many consecutive pairs are fully separated along each axis?
    const separated = (span: (r: Rect) => Span) => {
        const s = [...rects].sort((a, b) => span(a)[0] - span(b)[0])
        let n = 0
        for (let i = 1; i < s.length; i++)
            if (!sameBand(span(s[i - 1]), span(s[i]))) n++
        return n
    }
    const need = rects.length - 1
    const sepX = separated(spanX)
    const sepY = separated(spanY)

    let dir: Direction
    if (sepX === need && sepY < need) dir = "row"
    else if (sepY === need && sepX < need) dir = "col"
    else {
        // Both fully separated (a diagonal staircase) or neither (a ragged 2-D cluster):
        // fall back to the longer extent.
        const extentX =
            Math.max(...rects.map((r) => r.x + r.w)) -
            Math.min(...rects.map((r) => r.x))
        const extentY =
            Math.max(...rects.map((r) => r.y + r.h)) -
            Math.min(...rects.map((r) => r.y))
        dir = extentX >= extentY ? "row" : "col"
    }
    const ambiguous = sepX !== need && sepY !== need

    const ordered = [...rects].sort((a, b) =>
        dir === "row" ? a.x - b.x : a.y - b.y,
    )
    return {
        dir,
        gap: Math.max(0, Math.round(gapsBetween(ordered, dir))),
        cols: 1,
        ambiguous,
    }
}

/**
 * Put a radial container's children in order, centre first.
 *
 * The centre is whichever child sits closest to the container's own middle — for a mind map
 * that is literally true, and for an org chart the root is horizontally centred above
 * everything. Identifying it by position rather than by document order is what lets the
 * user drag branches around without the layout picking a new root.
 *
 * The branches then read clockwise from the top for a mind map (which is how a reader scans
 * one) and left to right for an org chart.
 */
function orderRadial(
    kids: RawCell[],
    own: Rect | null,
    spread: "radial" | "down",
): RawCell[] {
    const placed = kids.filter((k) => k.abs !== null)
    if (placed.length < 2 || !own) return kids

    const cx = own.x + own.w / 2
    const cy = own.y + own.h / 2
    const mid = (k: RawCell) => ({
        x: (k.abs as Rect).x + (k.abs as Rect).w / 2,
        y: (k.abs as Rect).y + (k.abs as Rect).h / 2,
    })
    const dist2 = (k: RawCell) => {
        const m = mid(k)
        return (m.x - cx) ** 2 + (m.y - cy) ** 2
    }
    // For "down", the centre is the topmost child, since everything hangs below it. Its
    // horizontal position is centred but its vertical one is not, so distance to the middle
    // would pick a second-generation node instead.
    const centre =
        spread === "down"
            ? placed.reduce((best, k) =>
                  (k.abs as Rect).y < (best.abs as Rect).y ? k : best,
              )
            : placed.reduce((best, k) => (dist2(k) < dist2(best) ? k : best))

    const rest = kids.filter((k) => k.id !== centre.id)
    if (spread === "down")
        return [
            centre,
            ...rest.sort(
                (a, b) => (a.abs?.x ?? 0) - (b.abs?.x ?? 0) || a.seq - b.seq,
            ),
        ]

    // Radial: the renderer puts the first half of the branches on the right and the second
    // half on the left, top to bottom within each side. Reading them back in that same order
    // is what keeps a round-trip stable.
    const right = rest
        .filter((k) => (k.abs ? mid(k).x >= cx : true))
        .sort((a, b) => (a.abs?.y ?? 0) - (b.abs?.y ?? 0) || a.seq - b.seq)
    const left = rest
        .filter((k) => (k.abs ? mid(k).x < cx : false))
        .sort((a, b) => (a.abs?.y ?? 0) - (b.abs?.y ?? 0) || a.seq - b.seq)
    return [centre, ...right, ...left]
}

/** Median edge-to-edge distance between neighbours along the flow axis. */
function gapsBetween(ordered: Rect[], dir: Direction): number {
    const gaps: number[] = []
    for (let i = 1; i < ordered.length; i++) {
        const a = ordered[i - 1]
        const b = ordered[i]
        gaps.push(dir === "col" ? b.y - (a.y + a.h) : b.x - (a.x + a.w))
    }
    return median(
        gaps.filter((g) => g >= 0),
        20,
    )
}

/**
 * Put a container's children into layout order.
 *
 * Document order is the wrong answer on its own. The engine emits children in layout
 * order, but as soon as the user drags one past another the two disagree, and re-
 * emitting in document order silently undoes the user's reordering — a change they made
 * on purpose, reverted by the tool that was supposed to be reading their edits.
 *
 * So: sort by position along the flow axis (row-major for a grid), and use document
 * order only to break exact ties, which keeps engine output byte-stable through a
 * round-trip. Children with no geometry keep their document position.
 */
function orderChildren(kids: RawCell[], dir: Direction): RawCell[] {
    const key = (c: RawCell): number => {
        if (!c.abs) return Number.POSITIVE_INFINITY
        return dir === "col" ? c.abs.y : c.abs.x
    }
    if (dir === "grid") {
        const rects = kids
            .map((c) => c.abs)
            .filter((r): r is Rect => r !== null)
        const rows = bandsAlong(rects, spanY)
        const rowOf = new Map<Rect, number>()
        rows.forEach((band, i) => {
            for (const r of band) rowOf.set(r, i)
        })
        return [...kids].sort((a, b) => {
            const ra = a.abs ? (rowOf.get(a.abs) ?? 0) : Number.MAX_SAFE_INTEGER
            const rb = b.abs ? (rowOf.get(b.abs) ?? 0) : Number.MAX_SAFE_INTEGER
            if (ra !== rb) return ra - rb
            const dx = (a.abs?.x ?? 0) - (b.abs?.x ?? 0)
            return dx !== 0 ? dx : a.seq - b.seq
        })
    }
    return [...kids].sort((a, b) => {
        const d = key(a) - key(b)
        return d !== 0 ? d : a.seq - b.seq
    })
}

// ============================================================================
// 6. Edges → link specs
// ============================================================================

/**
 * Split a leading step number off an edge label.
 *
 * The emitter writes `"3. route"`, so the parser has to take it back off or the number
 * doubles on the next round-trip. The dot must be followed by whitespace and the number
 * must be short, because plain labels look like this too: `"3.5x throughput"` and
 * `"10.0.0.0/16 peering"` both parse as a step number under a laxer pattern, which
 * silently truncates the user's text to `"5x throughput"` and `"0.0.0/16 peering"`.
 */
function splitStep(label: string): { label: string; step?: number } {
    const m = label.match(/^(\d{1,2})\.\s+(\S[\s\S]*)$/)
    if (!m) return { label }
    return { label: m[2], step: Number(m[1]) }
}

/**
 * Turn an edge cell into a link spec.
 *
 * `style` is kept verbatim so a caller that does not re-route can re-emit it exactly.
 * Note for the emitter: it still contains `exitX`/`entryX` pins and the edge's old
 * waypoints are in the cell XML, both of which are stale once the layout moves — a
 * re-layout must drop them, not reuse them.
 */
function toLink(c: RawCell, labelOverride?: string): LinkSpec | null {
    if (!c.source || !c.target) return null
    const raw = (labelOverride ?? c.value).trim()
    const { label, step } = splitStep(raw)
    return {
        id: c.id,
        source: c.source,
        target: c.target,
        label: label || undefined,
        dashed: styleValue(c.style, "dashed") === "1" || undefined,
        step,
        style: c.style,
    }
}

// ============================================================================
// 7. The parse
// ============================================================================

/**
 * Is this cell one of the engine's own decorations rather than a real child?
 *
 * A container with no group stencil gets a corner icon emitted as a child cell named
 * `<id>__ci`, sitting flush in the frame's top-left. It is part of the container's
 * chrome; if it enters the child flow, a re-layout puts a 22px glyph in the middle of
 * the row and the frame loses its corner icon.
 */
function isDecoration(c: RawCell, parentId: string): boolean {
    if (c.id === `${parentId}__ci`) return true
    if (c.value !== "" || !c.geo) return false
    // small, unlabelled, flush to the parent's top-left corner
    return c.geo.w <= 26 && c.geo.h <= 26 && c.geo.x <= 12 && c.geo.y <= 12
}

/**
 * Re-derive the node tree from one page of canvas XML.
 *
 * Everything the tree cannot express comes back in `tree.foreign` with its XML
 * verbatim: cells on a non-default layer, the engine's boundary frames, the user's own
 * text annotations, container chrome, labels attached to edges, and anything caught by
 * the depth or cycle guards. A re-layout re-emits them untouched.
 */
export function parseDiagram(xml: string, pageIndex = 0): ParseResult {
    const warnings: string[] = []
    const pages = countPages(xml)
    if (pages > 1)
        warnings.push(
            `Document has ${pages} pages (${listPages(xml).join(", ")}); parsed page ${pageIndex + 1} only.`,
        )

    const page = extractPage(xml, pageIndex)
    if (!page)
        return {
            tree: { roots: [], links: [], foreign: [] },
            needsAdoption: true,
            warnings: [
                ...warnings,
                "No cells found — the page is empty, or the .drawio is compressed and must be decompressed first.",
            ],
        }

    const cells = splitCells(page)
    const cyclic = resolveAbsolute(cells)
    if (cyclic.size > 0)
        warnings.push(
            `Parent cycle involving ${[...cyclic].join(", ")} — geometry for those cells is unreliable; they were detached to the top level.`,
        )

    /**
     * Layers are the cells parented to the root cell "0". draw.io's default deck has
     * "0" (the root) and "1" (the default layer), the engine adds a locked
     * "boundaries" layer, and a user who adds layers in the editor gets cells with
     * generated ids. Reading `parent="0"` finds all of them; a hardcoded
     * {"0","1","boundaries"} set does not, and a missed layer gets built as a
     * borderless zero-size "group" node that a re-layout then emits as a shape.
     */
    const layers = new Set<string>(["0"])
    for (const c of cells) if (c.parent === "0") layers.add(c.id)
    // "1" is draw.io's default content layer even in a file that omits its cell.
    const defaultLayer = cells.find((c) => c.parent === "0")?.id ?? "1"
    layers.add("1")

    const marked = cells.some((c) => hasMarkers(c.style))
    const { parentOf, rehomed } = resolveNesting(cells, layers, defaultLayer)
    if (rehomed.length > 0)
        warnings.push(
            `Re-homed ${rehomed.length} cell(s) by geometry because their frame lacks container=1: ${rehomed.join(", ")}.`,
        )

    const byId = new Map(cells.map((c) => [c.id, c]))
    const vertices = cells.filter((c) => !c.isEdge && !layers.has(c.id))
    const edges = cells.filter((c) => c.isEdge)
    const edgeIds = new Set(edges.map((e) => e.id))

    const childrenOf = new Map<string, RawCell[]>()
    for (const c of vertices) {
        const p = parentOf.get(c.id) ?? ""
        const list = childrenOf.get(p)
        if (list) list.push(c)
        else childrenOf.set(p, [c])
    }

    const kindOf = new Map<string, ReturnType<typeof classify>>()
    for (const c of vertices)
        kindOf.set(c.id, classify(c, (childrenOf.get(c.id)?.length ?? 0) > 0))

    /**
     * Collapse a pool's lane bands, lifting their contents back into the pool.
     *
     * The bands exist so draw.io has something to reparent into: dragging a step onto
     * another role's band is how the user reassigns it, and the band's `dai_lane` marker
     * says which role that is. But a band is not a node — it is re-derived from the pool's
     * lane list on every layout — so on the way back its children become children of the
     * pool, each carrying the lane index of the band it was found in.
     *
     * The lane comes from the BAND, overriding whatever `dai_cell` the node still says,
     * because the band is where the user actually dropped it.
     */
    const laneOverride = new Map<string, number>()
    const chromeIds = new Set<string>()
    for (const c of vertices) {
        if (!isLaneChrome(c.style)) continue
        chromeIds.add(c.id)
        const lane = readIntMarker(c.style, MARKER.lane)
        const kids = childrenOf.get(c.id) ?? []
        const pool = parentOf.get(c.id) ?? ""
        for (const k of kids) {
            parentOf.set(k.id, pool)
            if (lane !== null) laneOverride.set(k.id, lane)
        }
        childrenOf.delete(c.id)
    }
    if (chromeIds.size > 0) {
        // Rebuild the child lists now that the bands are out of the parent chain.
        childrenOf.clear()
        for (const c of vertices) {
            if (chromeIds.has(c.id)) continue
            const p = parentOf.get(c.id) ?? ""
            const list = childrenOf.get(p)
            if (list) list.push(c)
            else childrenOf.set(p, [c])
        }
    }

    const foreign: ForeignCell[] = []
    const accounted = new Set<string>()
    /** Carry a cell through the round-trip without interpreting it. */
    const keep = (c: RawCell, parent: string) => {
        if (accounted.has(c.id)) return
        accounted.add(c.id)
        foreign.push({ id: c.id, xml: c.xml, parent })
    }

    let title: string | undefined
    const ambiguousContainers: string[] = []

    /**
     * The pool cell a node occupies.
     *
     * The band it was found in wins over the marker on the node: the band records where the
     * user dropped it, the marker records where the last layout put it. When only the marker
     * exists — the node has not been dragged — that is the answer.
     */
    const cellFor = (c: RawCell): PoolCell | undefined => {
        const marked = readCell(c.style)
        const lane = laneOverride.get(c.id)
        if (lane === undefined) return marked ?? undefined
        return { lane, col: marked?.col ?? 0 }
    }

    const build = (
        c: RawCell,
        depth: number,
        path: Set<string>,
    ): DiagramNode | null => {
        if (depth > MAX_DEPTH || path.has(c.id)) {
            warnings.push(
                path.has(c.id)
                    ? `Cycle at "${c.id}" — kept as-is instead of recursing.`
                    : `Nesting deeper than ${MAX_DEPTH} at "${c.id}" — kept as-is instead of recursing.`,
            )
            keep(c, parentOf.get(c.id) ?? defaultLayer)
            return null
        }
        const kind = kindOf.get(c.id) ?? "box"
        const pinned = isPinned(c.style) || undefined
        const rect = c.abs ?? undefined

        if (kind === "title") {
            // The first text cell is the page title. Every other one is the user's own
            // annotation — a caption, a legend entry, a note — and must survive.
            if (title === undefined) {
                title = c.value
                accounted.add(c.id)
            } else {
                keep(c, parentOf.get(c.id) ?? defaultLayer)
            }
            return null
        }

        accounted.add(c.id)

        if (kind === "icon") {
            const node: IconNode = {
                kind: "icon",
                id: c.id,
                name: iconName(c.style) ?? "",
                label: c.value,
                style: c.style,
                size: c.geo
                    ? Math.round(Math.max(c.geo.w, c.geo.h))
                    : undefined,
                pinned,
                rect,
                cell: cellFor(c),
            }
            return node
        }

        if (kind === "box") {
            // A lifeline's cell spans the head AND the line below it. Its natural size is the
            // head; keeping the full height would make the participant box grow taller on
            // every round-trip, since the next layout would add another lifeline under it.
            const lifeline = looksLikeLifeline(c.style)
            const headH = lifeline
                ? Number(styleValue(c.style, "size") ?? "44")
                : undefined
            const node: BoxNode = {
                kind: "box",
                id: c.id,
                label: c.value,
                w: c.geo ? Math.round(c.geo.w) : undefined,
                h: lifeline
                    ? Math.round(headH && headH > 0 ? headH : 44)
                    : c.geo
                      ? Math.round(c.geo.h)
                      : undefined,
                fill: styleValue(c.style, "fillColor"),
                stroke: styleValue(c.style, "strokeColor"),
                shape: boxShape(c.style),
                // A lifeline's style is chrome the renderer rebuilds, so keeping it verbatim
                // would re-emit a lifeline that no longer matches the new message count.
                style: lifeline ? undefined : c.style,
                pinned,
                rect,
                cell: cellFor(c),
            }
            return node
        }

        // ---- container ----
        const all = childrenOf.get(c.id) ?? []
        const kids: RawCell[] = []
        for (const k of all) {
            if (isDecoration(k, c.id)) keep(k, c.id)
            else kids.push(k)
        }

        const markedGap = readIntMarker(c.style, MARKER.gap)
        const nextPath = new Set(path).add(c.id)

        // ---- the three specialised containers ----
        // Each is identified only by its `dai_kind` marker: nothing about the geometry of a
        // pool distinguishes it from a grid whose cells happen to be full, and guessing wrong
        // would rearrange the diagram. An imported file has no marker and gets the generic
        // treatment, which is the safe default.
        if (kind === "pool") {
            // Order by column then lane, so the outline reads in the order things happen.
            const byCell = [...kids].sort((a, b) => {
                const ca = readCell(a.style)
                const cb = readCell(b.style)
                const la = laneOverride.get(a.id) ?? ca?.lane ?? 0
                const lb = laneOverride.get(b.id) ?? cb?.lane ?? 0
                const d = (ca?.col ?? 0) - (cb?.col ?? 0)
                return d !== 0 ? d : la !== lb ? la - lb : a.seq - b.seq
            })
            const node: PoolNode = {
                kind: "pool",
                id: c.id,
                label: c.value,
                lanes: readList(c.style, MARKER.lanes) ?? ["Lane 1"],
                phases: readList(c.style, MARKER.phases) ?? [],
                orientation:
                    readMarker(c.style, MARKER.orient) === "v"
                        ? "vertical"
                        : "horizontal",
                gap: markedGap ?? 40,
                children: byCell
                    .map((k) => build(k, depth + 1, nextPath))
                    .filter((n): n is DiagramNode => n !== null),
                style: c.style,
                pinned,
                rect,
            }
            return node
        }

        if (kind === "sequence") {
            const node: SequenceNode = {
                kind: "sequence",
                id: c.id,
                label: c.value,
                gap: markedGap ?? 60,
                step: Math.max(24, readIntMarker(c.style, MARKER.step) ?? 44),
                // Participants read left to right — that IS their order.
                children: orderChildren(kids, "row")
                    .map((k) => build(k, depth + 1, nextPath))
                    .filter((n): n is DiagramNode => n !== null),
                style: c.style,
                pinned,
                rect,
            }
            return node
        }

        if (kind === "radial") {
            const spread =
                readMarker(c.style, MARKER.spread) === "down"
                    ? "down"
                    : "radial"
            const node: RadialNode = {
                kind: "radial",
                id: c.id,
                label: c.value,
                spread,
                gap: markedGap ?? 40,
                // A flat list, in the order the layout will read it. The hierarchy is in the
                // arrows, so document order is all the child list has to carry — and keeping
                // it means a re-layout reproduces the same picture.
                children: orderRadial(kids, c.abs, spread)
                    .map((k) => build(k, depth + 1, nextPath))
                    .filter((n): n is DiagramNode => n !== null),
                style: c.style,
                pinned,
                rect,
            }
            return node
        }

        // ---- group or grid ----
        // The direction has to be inferred here rather than above, because the specialised
        // containers arrange their children two-dimensionally on purpose. Running the
        // inference on a pool or a radial map would warn that "no single direction describes
        // this arrangement", which is true and not a problem.
        const markedDir = readDir(c.style)
        const markedCols = readIntMarker(c.style, MARKER.cols)
        const guess =
            markedDir === null || markedGap === null || markedCols === null
                ? inferLayout(kids)
                : null
        const dir: Direction = markedDir ?? guess?.dir ?? "row"
        const gap = markedGap ?? guess?.gap ?? 20
        if (markedDir === null && guess?.ambiguous)
            ambiguousContainers.push(c.id)

        const built = orderChildren(kids, dir)
            .map((k) => build(k, depth + 1, nextPath))
            .filter((n): n is DiagramNode => n !== null)

        const common = {
            id: c.id,
            gname: groupName(c.style),
            label: c.value,
            gap,
            children: built,
            fill: styleValue(c.style, "fillColor"),
            stroke: styleValue(c.style, "strokeColor"),
            style: c.style,
            pinned,
            rect,
        }

        if (kind === "grid" || dir === "grid") {
            const node: GridNode = {
                kind: "grid",
                ...common,
                cols: Math.max(
                    1,
                    markedCols ??
                        guess?.cols ??
                        Math.ceil(Math.sqrt(built.length)),
                ),
            }
            return node
        }
        const node: GroupNode = {
            kind: "group",
            ...common,
            dir: dir === "col" ? "col" : "row",
        }
        return node
    }

    // ---- roots ----
    // A cell is a root when its resolved parent is a layer or does not exist. Cells on
    // a layer other than the default one are overlays (a locked annotation layer, the
    // engine's "boundaries" frames) and are preserved verbatim rather than restructured.
    // A cell parented to an EDGE is that edge's label; it never belongs in the forest.
    const rootCells: RawCell[] = []
    for (const c of vertices) {
        // A pool's lane bands and label strips are chrome the renderer rebuilds from the
        // pool's own lane list. They are the ONE thing deliberately not carried through
        // verbatim: re-emitting a stale band would leave it at the old size while the new
        // bands are drawn underneath it.
        if (chromeIds.has(c.id)) {
            accounted.add(c.id)
            continue
        }
        const p = parentOf.get(c.id) ?? ""
        if (edgeIds.has(p)) continue // handled with the edges below
        if (byId.has(p) && !layers.has(p)) continue // a real child
        if (p !== defaultLayer && layers.has(p)) {
            keep(c, p)
            continue
        }
        rootCells.push(c)
    }
    const roots = orderChildren(rootCells, "row")
        .map((c) => build(c, 0, new Set()))
        .filter((n): n is DiagramNode => n !== null)

    // ---- links ----
    // draw.io stores a repositioned edge label as a child vertex of the edge. If the
    // edge itself has no value, that child holds the real label and we lift it into the
    // spec; otherwise we cannot merge the two and the child is preserved verbatim.
    const labelCellsOf = new Map<string, RawCell[]>()
    for (const c of vertices) {
        const p = parentOf.get(c.id) ?? ""
        if (!edgeIds.has(p)) continue
        const list = labelCellsOf.get(p)
        if (list) list.push(c)
        else labelCellsOf.set(p, [c])
    }
    const links: LinkSpec[] = []
    for (const e of edges) {
        const labelCells = labelCellsOf.get(e.id) ?? []
        let override: string | undefined
        for (const lc of labelCells) {
            if (override === undefined && e.value.trim() === "" && lc.value) {
                override = lc.value
                accounted.add(lc.id)
            } else {
                keep(lc, e.id)
            }
        }
        const link = toLink(e, override)
        if (link) links.push(link)
        else
            warnings.push(
                `Edge "${e.id}" has no source or target — dropped from the link list.`,
            )
    }

    // ---- the invariant ----
    // Anything not turned into a node, lifted into the title, or explicitly kept aside
    // is a parser bug. Sweep it into `foreign` so the bug costs a warning, not a cell.
    for (const c of vertices) {
        if (accounted.has(c.id)) continue
        keep(c, parentOf.get(c.id) ?? defaultLayer)
        warnings.push(
            `Cell "${c.id}" could not be placed in the tree — kept verbatim.`,
        )
    }

    if (ambiguousContainers.length > 0)
        warnings.push(
            `Children of ${ambiguousContainers.join(", ")} are arranged in two dimensions, which no single direction describes; a re-layout will move them.`,
        )

    return {
        tree: { roots, links, title, foreign },
        needsAdoption: !marked,
        warnings,
    }
}
