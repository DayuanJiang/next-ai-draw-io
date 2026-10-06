import { decompressPageContent } from "@/packages/mcp-server/src/load-diagram.ts"

/** What changed on the first page between two versions of a diagram */
export interface ChangeSummary {
    shapesAdded: number
    shapesRemoved: number
    shapesChanged: number
    edgesAdded: number
    edgesRemoved: number
    edgesChanged: number
}

export interface DiagramDiff {
    summary: ChangeSummary
    /** Ids of cells that were added or changed (for highlighting) */
    touchedIds: string[]
    /** The diagram before had no shapes or connectors */
    fromScratch: boolean
}

export const EMPTY_SUMMARY: ChangeSummary = {
    shapesAdded: 0,
    shapesRemoved: 0,
    shapesChanged: 0,
    edgesAdded: 0,
    edgesRemoved: 0,
    edgesChanged: 0,
}

interface CellInfo {
    isEdge: boolean
    signature: string
}

/** A page's mxGraphModel element, inflated when the page is compressed */
function modelOfPage(diagram: Element): Element | null {
    const model = diagram.querySelector("mxGraphModel")
    if (model) return model
    const inflated = decompressPageContent(diagram.textContent || "")
    if (!inflated) return null
    const inner = new DOMParser().parseFromString(inflated, "text/xml")
    return inner.querySelector("mxGraphModel")
}

function parse(xml: string): Document | null {
    if (!xml?.trim()) return null
    const doc = new DOMParser().parseFromString(xml, "text/xml")
    return doc.querySelector("parsererror") ? null : doc
}

/** The first page's mxGraphModel element, whatever wrapper the XML has */
function firstPageModel(xml: string): Element | null {
    const doc = parse(xml)
    if (!doc) return null
    const diagram = doc.querySelector("diagram")
    if (diagram) return modelOfPage(diagram)
    return doc.querySelector("mxGraphModel") ?? doc.documentElement
}

// Values draw.io leaves out when it saves: the model may write them
const DEFAULT_VALUES: Record<string, Record<string, string>> = {
    mxCell: {
        vertex: "0",
        edge: "0",
        connectable: "1",
        visible: "1",
        collapsed: "0",
        style: "",
    },
    mxGeometry: { x: "0", y: "0", width: "0", height: "0", relative: "0" },
    mxPoint: { x: "0", y: "0" },
}
// Numbers draw.io writes back in their shortest form ("40.0" is "40"), on
// the elements that hold a position or size (a wrapper's "x" is the
// user's own data, shown as written)
const NUMBERS = new Set(["x", "y", "width", "height"])
const GEOMETRY = new Set(["mxGeometry", "mxPoint", "mxRectangle"])

/**
 * A style as draw.io reads it (mxStylesheet.getCellStyle): entries apply in
 * order and empty ones do nothing; a leading ";" leaves the default out
 */
function normalStyle(style: string): string {
    const entries = style.split(";").filter((entry) => entry.trim() !== "")
    return (style.startsWith(";") ? ";" : "") + entries.join(";")
}

/**
 * What a cell is, independent of how the XML was written: the same cell
 * saved by draw.io and written by the model can order attributes
 * differently, and draw.io drops values that are the default. Style
 * entries keep their order, which counts.
 */
function signatureOf(node: Element): string {
    const defaults = DEFAULT_VALUES[node.tagName] ?? {}
    const attrs = Array.from(node.attributes)
        .flatMap((a) => {
            let value = a.value
            // A cell's style (a wrapper's "style" is the user's own data)
            if (a.name === "style" && node.tagName === "mxCell") {
                value = normalStyle(value)
            } else if (
                GEOMETRY.has(node.tagName) &&
                NUMBERS.has(a.name) &&
                value.trim() !== ""
            ) {
                const n = Number(value)
                if (Number.isFinite(n)) value = String(n)
            }
            if (defaults[a.name] === value) return []
            return [[a.name, value]]
        })
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    // As JSON: a value can hold any text, also "name=value" pairs
    return JSON.stringify([
        node.tagName,
        attrs,
        Array.from(node.children).map(signatureOf),
    ])
}

/** The cells of a page, layers included, with the element that holds each */
function cellsIn(model: Element | null) {
    if (!model) return []
    return Array.from(model.getElementsByTagName("mxCell")).flatMap((cell) => {
        // Cells with links or custom data are wrapped; the wrapper holds the id
        const wrapper = cell.parentElement
        const isWrapped =
            wrapper?.tagName === "object" || wrapper?.tagName === "UserObject"
        const id = cell.getAttribute("id") || wrapper?.getAttribute("id")
        if (!id) return []
        return [{ id, cell, node: isWrapped && wrapper ? wrapper : cell }]
    })
}

/** Shapes and connectors of the first page (not the root and its layers) */
function collectCells(xml: string): Map<string, CellInfo> {
    const cells = new Map<string, CellInfo>()
    for (const { id, cell, node } of cellsIn(firstPageModel(xml))) {
        if (id === "0" || cell.getAttribute("parent") === "0") continue
        cells.set(id, {
            isEdge: cell.getAttribute("edge") === "1",
            signature: signatureOf(node),
        })
    }
    return cells
}

export function diffDiagrams(beforeXml: string, afterXml: string): DiagramDiff {
    const before = collectCells(beforeXml)
    const after = collectCells(afterXml)
    const summary: ChangeSummary = { ...EMPTY_SUMMARY }
    const touchedIds: string[] = []

    for (const [id, cell] of after) {
        const old = before.get(id)
        if (!old) {
            touchedIds.push(id)
            if (cell.isEdge) summary.edgesAdded++
            else summary.shapesAdded++
        } else if (old.signature !== cell.signature) {
            touchedIds.push(id)
            if (cell.isEdge) summary.edgesChanged++
            else summary.shapesChanged++
        }
    }
    for (const [id, cell] of before) {
        if (after.has(id)) continue
        if (cell.isEdge) summary.edgesRemoved++
        else summary.shapesRemoved++
    }
    return { summary, touchedIds, fromScratch: before.size === 0 }
}

// Where the view was scrolled to, saved with the page; not a change
const VIEW_ATTRIBUTES = new Set(["dx", "dy"])

// A page setting written on one side only is draw.io's default being
// filled in when the other side has that default; an empty list: any value
// is a change. Settings not listed are not compared then, like the paper
// size: a page without it keeps the canvas's (draw.io's readGraphState).
const PAGE_DEFAULTS: Record<string, string[]> = {
    background: ["none"],
    backgroundImage: [],
    extFonts: [],
    math: ["0"],
    shadow: ["0"],
    page: ["1"],
    pageScale: ["1"],
    grid: ["1"],
    gridSize: ["10"],
    guides: ["1"],
    tooltips: ["1"],
    connect: ["1"],
    arrows: ["1"],
    fold: ["1"],
}

// Settings draw.io reads as numbers (Editor.readGraphState): "10.0" is 10
const PAGE_NUMBERS = new Set([
    "gridSize",
    "pageScale",
    "pageWidth",
    "pageHeight",
])

function samePageSettings(a: Element, b: Element): boolean {
    const names = new Set(
        [...Array.from(a.attributes), ...Array.from(b.attributes)].map(
            (attr) => attr.name,
        ),
    )
    const read = (page: Element, name: string) => {
        const value = page.getAttribute(name)
        if (value === null || !PAGE_NUMBERS.has(name) || !value.trim()) {
            return value
        }
        const n = Number(value)
        return Number.isFinite(n) ? String(n) : value
    }
    for (const name of names) {
        if (VIEW_ATTRIBUTES.has(name)) continue
        const va = read(a, name)
        const vb = read(b, name)
        if (va !== null && vb !== null) {
            if (va !== vb) return false
            continue
        }
        const defaults = PAGE_DEFAULTS[name]
        if (defaults && !defaults.includes((va ?? vb) as string)) return false
    }
    return true
}

/**
 * Every cell of a page, layers included, and the order of each parent's
 * children (which shape is in front)
 */
function contentOf(model: Element | null) {
    const cells = new Map<string, string>()
    const children = new Map<string, string[]>()
    for (const { id, cell, node } of cellsIn(model)) {
        cells.set(id, signatureOf(node))
        const parent = cell.getAttribute("parent") ?? ""
        children.set(parent, [...(children.get(parent) ?? []), id])
    }
    return { cells, children }
}

function sameContent(a: Element | null, b: Element | null): boolean {
    const ca = contentOf(a)
    const cb = contentOf(b)
    if (ca.cells.size !== cb.cells.size) return false
    for (const [id, signature] of ca.cells) {
        if (cb.cells.get(id) !== signature) return false
    }
    for (const [parent, ids] of ca.children) {
        if (cb.children.get(parent)?.join("\n") !== ids.join("\n")) {
            return false
        }
    }
    return true
}

/**
 * File variables (%name% placeholders) as draw.io reads them, from JSON:
 * the same names and values in any order; none is the same as "{}"
 */
export function sameFileVars(a: string | null, b: string | null): boolean {
    if (a === b) return true
    try {
        // By name: names are unique, and a pair's text can look like another's
        const sorted = (vars: string | null) =>
            JSON.stringify(
                Object.entries(JSON.parse(vars ?? "{}")).sort(([a], [b]) =>
                    a < b ? -1 : a > b ? 1 : 0,
                ),
            )
        return sorted(a) === sorted(b)
    } catch {
        return false
    }
}

/**
 * Whether two documents hold the same pages (names, cells, their order),
 * page settings and file variables
 */
export function isSameDocument(a: string, b: string): boolean {
    const pagesOf = (doc: Document) => {
        const diagrams = Array.from(doc.getElementsByTagName("diagram"))
        if (diagrams.length === 0) {
            return [{ name: null, model: doc.querySelector("mxGraphModel") }]
        }
        return diagrams.map((d) => ({
            name: d.getAttribute("name"),
            model: modelOfPage(d),
        }))
    }
    const docA = parse(a)
    const docB = parse(b)
    if (!docA || !docB) return a === b
    const varsOf = (doc: Document) =>
        doc.documentElement.nodeName === "mxfile"
            ? doc.documentElement.getAttribute("vars")
            : null
    if (!sameFileVars(varsOf(docA), varsOf(docB))) return false
    const pagesA = pagesOf(docA)
    const pagesB = pagesOf(docB)
    if (pagesA.length !== pagesB.length) return false
    return pagesA.every((pageA, i) => {
        const pageB = pagesB[i]
        if (pageA.name !== null && pageB.name !== null) {
            if (pageA.name !== pageB.name) return false
        }
        if (pageA.model && pageB.model) {
            if (!samePageSettings(pageA.model, pageB.model)) return false
        }
        return sameContent(pageA.model, pageB.model)
    })
}
