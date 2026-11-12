/**
 * Compact cells: the short way the model writes shapes and edges.
 *
 * A shape is one self-closing mxCell with its position and size as x, y, w
 * and h attributes; an edge is one with source and target. The fixed parts
 * of draw.io's XML are left out and filled in here:
 *
 *   <mxCell id="2" value="Start" style="step;" x="40" y="40" w="120" h="60"/>
 *   <mxCell id="5" style="down;" source="2" target="3"/>
 *
 * becomes
 *
 *   <mxCell id="2" value="Start" style="step;" vertex="1" parent="1">
 *     <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
 *   </mxCell>
 *   <mxCell id="5" style="down;" edge="1" parent="1" source="2" target="3">
 *     <mxGeometry relative="1" as="geometry"/>
 *   </mxCell>
 *
 * The long form stays accepted, and anything beyond the plain case (edge
 * waypoints, a label on an edge, a parent other than the layer) is written
 * the long way, so a cell may mix both: compact attributes with an explicit
 * parent, for example. A cell is an edge when it says so or connects a
 * source or target, a shape when it says so, has a size or has a geometry.
 *
 * foldCells is the reverse, for the diagram shown to the model: it writes
 * the plain shapes and edges compactly and leaves everything else as it is,
 * so the model reads the notation it is asked to write. Folding then
 * expanding gives the same cells back, except that the data of embedded
 * pictures becomes a reference (embedded-images.ts).
 */
import { hideImageData } from "./embedded-images.ts"
import { readAttributes, type TagAttribute } from "./xml-attributes.ts"

// A whole mxCell: self-closing, or with its children (cells never nest)
const CELL_BLOCK =
    /<mxCell\b((?:[^<>"']|"[^"]*"|'[^']*')*?)\s*(?:\/>|>([\s\S]*?)<\/mxCell>)/g

// CELL_BLOCK after the opening tag of the <object> or <UserObject> around
// the cell, which holds the id of a cell with a link or custom data
const WRAPPED_CELL_BLOCK =
    /(?:<(?:UserObject|object)\b((?:[^<>"']|"[^"]*"|'[^']*')*?)\s*>\s*)?<mxCell\b((?:[^<>"']|"[^"]*"|'[^']*')*?)\s*(?:\/>|>([\s\S]*?)<\/mxCell>)/g

// The cell's own geometry, as opposed to one inside its custom data
const OWN_GEOMETRY =
    /<mxGeometry\b(?:[^<>"']|"[^"]*"|'[^']*')*?\bas=(?:"geometry"|'geometry')/

// The four compact attributes and the names draw.io uses for them
const SIZE_ATTRS = new Map([
    ["x", "x"],
    ["y", "y"],
    ["w", "width"],
    ["h", "height"],
    ["width", "width"],
    ["height", "height"],
])
const isSize = (name: string) => SIZE_ATTRS.has(name)

// Attributes a cell is written with, in draw.io's usual order
const FIRST = ["id", "value", "style"]
const LAST = ["vertex", "edge", "parent", "source", "target"]

// A value read from a single-quoted attribute may hold a double quote
const attr = (name: string, value: string) =>
    ` ${name}="${value.replace(/"/g, "&quot;")}"`
const attributeText = (attrs: TagAttribute[]) =>
    attrs.map((a) => attr(a.name, a.value)).join("")

/**
 * "edge" or "vertex" by the rule above; null for a root cell or a layer, and
 * for anything else that is neither
 */
function kindOf(
    byName: Map<string, string>,
    body: string,
): "edge" | "vertex" | null {
    if (
        byName.get("edge") === "1" ||
        (byName.get("vertex") !== "1" &&
            (byName.has("source") || byName.has("target")))
    ) {
        return "edge"
    }
    return byName.get("vertex") === "1" ||
        [...byName.keys()].some(isSize) ||
        OWN_GEOMETRY.test(body)
        ? "vertex"
        : null
}

/**
 * A page's root cell and its layers. The root cell is the cell without a
 * parent that is no shape or edge, and the layers are its children. draw.io
 * calls them "0" and "1"; a file made from one of its templates has longer
 * ids ("WIyWlLk6GJQsqaUBKTNV-0" and "WIyWlLk6GJQsqaUBKTNV-1").
 *
 * root: the root cell's id, "0" when the page has no root cell. rootEnd:
 * where the root cell ends in the XML, or undefined without one.
 */
export function rootAndLayersOf(xml: string): {
    root: string
    rootEnd?: number
    layers: string[]
} {
    const attrsOf = (text: string) =>
        new Map(readAttributes(text).map((a) => [a.name, a.value]))
    const cells = Array.from(xml.matchAll(WRAPPED_CELL_BLOCK), (match) => {
        const byName = attrsOf(match[2])
        return {
            id: (match[1] === undefined ? byName : attrsOf(match[1])).get("id"),
            byName,
            body: match[3] ?? "",
            end: match.index + match[0].length,
        }
    })
    const rootCell = cells.find(
        ({ byName, body }) =>
            !byName.has("parent") && kindOf(byName, body) === null,
    )
    const root = rootCell?.id ?? "0"
    const layers = cells.flatMap(({ id, byName }) =>
        id && byName.get("parent") === root ? [id] : [],
    )
    return { root, rootEnd: rootCell?.end, layers }
}

/**
 * The layer a cell without a parent goes on: layer "1" when the page has
 * it, as foldCells leaves parent="1" out (draw.io may save another layer
 * before it); otherwise the page's first layer, or "1" on a page without
 * layers
 */
export function defaultLayerOf(xml: string): string {
    const { layers } = rootAndLayersOf(xml)
    return layers.includes("1") ? "1" : (layers[0] ?? "1")
}

/**
 * Whether the XML holds a shape that says vertex="1" but not where it is:
 * no x, y, w or h and no mxGeometry. expandCompactCells gives such a shape
 * the default place, the page's corner, which suits a new cell but would
 * move one that an update replaces.
 */
export function hasShapeWithoutPlace(xml: string): boolean {
    return Array.from(xml.matchAll(CELL_BLOCK)).some(([, attrText, body]) => {
        const byName = new Map(
            readAttributes(attrText).map((a) => [a.name, a.value]),
        )
        return (
            kindOf(byName, body ?? "") === "vertex" &&
            ![...byName.keys()].some(isSize) &&
            !OWN_GEOMETRY.test(body ?? "")
        )
    })
}

/**
 * Turn compact shapes and edges into standard draw.io cells. A cell with no
 * parent goes on `layer`, the page's default layer (defaultLayerOf; "1" on
 * a new page).
 */
export function expandCompactCells(xml: string, layer = "1"): string {
    return xml.replace(CELL_BLOCK, (block, attrText: string, body?: string) => {
        const attrs = readAttributes(attrText)
        const byName = new Map(attrs.map((a) => [a.name, a.value]))
        const size = attrs.filter((a) => isSize(a.name))
        const inner = body ?? ""
        const hasGeometry = OWN_GEOMETRY.test(inner)
        const kind = kindOf(byName, inner)
        // Root cells and anything else the model wrote in full are left alone
        if (!kind) return block
        const isEdge = kind === "edge"
        const isVertex = kind === "vertex"
        const complete =
            size.length === 0 &&
            byName.has(isEdge ? "edge" : "vertex") &&
            byName.has("parent") &&
            hasGeometry
        if (complete) return block

        // The compact attributes become the geometry; when the cell has its
        // own geometry already they stay as written, in case they mean
        // something else to whoever wrote them
        const consumed = !hasGeometry && isVertex
        const rest = attrs.filter(
            (a) =>
                !FIRST.includes(a.name) &&
                !LAST.includes(a.name) &&
                !(consumed && isSize(a.name)) &&
                !(isEdge && isSize(a.name)),
        )
        // Rebuilt in the usual order: id, value, style, the rest, then the
        // flags and the connections
        const ordered: [string, string][] = [
            ...FIRST.flatMap((n): [string, string][] =>
                byName.has(n) ? [[n, byName.get(n) ?? ""]] : [],
            ),
            ...rest.map((a): [string, string] => [a.name, a.value]),
            [isEdge ? "edge" : "vertex", "1"],
            ["parent", byName.get("parent") ?? layer],
            ...["source", "target"].flatMap((n): [string, string][] =>
                byName.has(n) ? [[n, byName.get(n) ?? ""]] : [],
            ),
        ]
        const written = ordered.map(([n, v]) => attr(n, v)).join("")
        let geometry = ""
        if (!hasGeometry) {
            if (isEdge) {
                geometry = '<mxGeometry relative="1" as="geometry"/>'
            } else {
                // A model may end a number as it ends a style entry (h="19;").
                // draw.io reads 19 and writes 19 back, so the semicolon is
                // dropped here: left in, draw.io's copy of the cell would
                // differ from the saved one and look like a hand edit
                const get = (short: string, long: string, fallback: string) =>
                    (byName.get(short) ?? byName.get(long) ?? fallback).replace(
                        /^(-?\d+(?:\.\d+)?);$/,
                        "$1",
                    )
                geometry = `<mxGeometry${attr("x", get("x", "x", "0"))}${attr("y", get("y", "y", "0"))}${attr("width", get("w", "width", "120"))}${attr("height", get("h", "height", "60"))} as="geometry"/>`
            }
        }
        return `<mxCell${written}>${geometry}${inner}</mxCell>`
    })
}

/** Attributes of a single self-closing mxGeometry, or null for anything else */
function plainGeometry(body: string): Map<string, string> | null {
    const trimmed = body.trim()
    const m = trimmed.match(
        /^<mxGeometry\b((?:[^<>"']|"[^"]*"|'[^']*')*?)\s*\/>$/,
    )
    if (!m) return null
    const attrs = new Map(readAttributes(m[1]).map((a) => [a.name, a.value]))
    // Anything odd, such as a wrong "as", stays as written so folding and
    // expanding give the same cells back
    return attrs.get("as") === "geometry" ? attrs : null
}

/**
 * Write plain shapes and edges compactly, for the diagram shown to the
 * model. A shape is plain when its only child is an mxGeometry with width
 * and height, and x and y unless they are 0; an edge when its only child
 * is the relative geometry.
 * Both must name their parent, since expanding fills in the layer for a
 * missing one. Everything else, including wrapped cells' extra data and
 * edge labels, is left as written, apart from embedded pictures' data.
 */
export function foldCells(input: string): string {
    const xml = hideImageData(input)
    return xml.replace(CELL_BLOCK, (block, attrText: string, body?: string) => {
        if (body === undefined) return block
        const attrs = readAttributes(attrText)
        const byName = new Map(attrs.map((a) => [a.name, a.value]))
        if (attrs.some((a) => isSize(a.name))) return block
        if (!byName.has("parent")) return block
        const geometry = plainGeometry(body)
        if (!geometry) return block
        const geometryKeys = [...geometry.keys()]
            .filter((k) => k !== "as")
            .sort()
        const kept = attrs.filter(
            (a) =>
                a.name !== "vertex" &&
                a.name !== "edge" &&
                !(a.name === "parent" && a.value === "1"),
        )
        if (byName.get("vertex") === "1" && byName.get("edge") !== "1") {
            // draw.io leaves out an x or y of 0
            const known = geometryKeys.filter((k) => k !== "x" && k !== "y")
            if (known.join() !== "height,width") return block
            const size = `${attr("x", geometry.get("x") ?? "0")}${attr("y", geometry.get("y") ?? "0")}${attr("w", geometry.get("width") ?? "")}${attr("h", geometry.get("height") ?? "")}`
            return `<mxCell${attributeText(kept)}${size}/>`
        }
        if (byName.get("edge") === "1" && byName.get("vertex") !== "1") {
            if (
                geometryKeys.join() !== "relative" ||
                geometry.get("relative") !== "1"
            ) {
                return block
            }
            if (!byName.has("source") || !byName.has("target")) return block
            return `<mxCell${attributeText(kept)}/>`
        }
        return block
    })
}
