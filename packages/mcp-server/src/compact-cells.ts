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
 * expanding gives the same cells back.
 */
import { readAttributes, type TagAttribute } from "./xml-attributes.ts"

// A whole mxCell: self-closing, or with its children (cells never nest)
const CELL_BLOCK =
    /<mxCell\b((?:[^<>"']|"[^"]*"|'[^']*')*?)\s*(?:\/>|>([\s\S]*?)<\/mxCell>)/g

// The cell's own geometry, as opposed to one inside its custom data
const OWN_GEOMETRY = /<mxGeometry\b(?:[^<>"']|"[^"]*"|'[^']*')*?\bas="geometry"/

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

/** The id of the page's first layer (a cell whose parent is "0"), or "1" */
export function defaultLayerOf(xml: string): string {
    for (const [, attrText] of xml.matchAll(CELL_BLOCK)) {
        const attrs = new Map(
            readAttributes(attrText).map((a) => [a.name, a.value]),
        )
        if (attrs.get("parent") === "0" && attrs.get("id")) {
            return attrs.get("id") ?? "1"
        }
    }
    return "1"
}

/**
 * Turn compact shapes and edges into standard draw.io cells. A cell with no
 * parent goes on `layer`, the page's first layer ("1" on a new page).
 */
export function expandCompactCells(xml: string, layer = "1"): string {
    return xml.replace(CELL_BLOCK, (block, attrText: string, body?: string) => {
        const attrs = readAttributes(attrText)
        const byName = new Map(attrs.map((a) => [a.name, a.value]))
        const size = attrs.filter((a) => isSize(a.name))
        const inner = body ?? ""
        const hasGeometry = OWN_GEOMETRY.test(inner)
        const isEdge =
            byName.get("edge") === "1" ||
            (byName.get("vertex") !== "1" &&
                (byName.has("source") || byName.has("target")))
        const isVertex =
            !isEdge &&
            (byName.get("vertex") === "1" || size.length > 0 || hasGeometry)
        // Root cells and anything else the model wrote in full are left alone
        if (!isEdge && !isVertex) return block
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
                const get = (short: string, long: string, fallback: string) =>
                    byName.get(short) ?? byName.get(long) ?? fallback
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
 * model. A shape is plain when its only child is an mxGeometry with x, y,
 * width and height; an edge when its only child is the relative geometry.
 * Both must name their parent, since expanding fills in the layer for a
 * missing one. Everything else, including wrapped cells' extra data and
 * edge labels, is left as written.
 */
export function foldCells(xml: string, layer = "1"): string {
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
                !(a.name === "parent" && a.value === layer),
        )
        if (byName.get("vertex") === "1" && byName.get("edge") !== "1") {
            if (geometryKeys.join() !== "height,width,x,y") return block
            const size = `${attr("x", geometry.get("x") ?? "")}${attr("y", geometry.get("y") ?? "")}${attr("w", geometry.get("width") ?? "")}${attr("h", geometry.get("height") ?? "")}`
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
