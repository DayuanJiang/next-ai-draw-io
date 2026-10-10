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
 * waypoints, a label on an edge, a parent other than "1") is written the
 * long way, so a cell may mix both: compact attributes with an explicit
 * parent, for example.
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

// The four compact attributes and the names draw.io uses for them
const SIZE_ATTRS: Record<string, string> = {
    x: "x",
    y: "y",
    w: "width",
    h: "height",
    width: "width",
    height: "height",
}

const attributeText = (attrs: TagAttribute[]) =>
    attrs.map((a) => ` ${a.name}="${a.value}"`).join("")

// Attributes a cell is written with, in draw.io's usual order
const FIRST = ["id", "value", "style"]
const LAST = ["vertex", "edge", "parent", "source", "target"]

/** Turn compact shapes and edges into standard draw.io cells */
export function expandCompactCells(xml: string): string {
    return xml.replace(CELL_BLOCK, (block, attrText: string, body?: string) => {
        const attrs = readAttributes(attrText)
        const byName = new Map(attrs.map((a) => [a.name, a.value]))
        const size = attrs.filter((a) => a.name in SIZE_ATTRS)
        const isEdge =
            byName.get("edge") === "1" ||
            (size.length === 0 &&
                byName.get("vertex") !== "1" &&
                byName.has("source") &&
                byName.has("target"))
        const isVertex =
            !isEdge && (byName.get("vertex") === "1" || size.length > 0)
        // Root cells and anything else the model wrote in full are left alone
        if (!isEdge && !isVertex) return block
        const inner = body ?? ""
        const hasGeometry = /<mxGeometry\b/.test(inner)
        const complete =
            size.length === 0 &&
            byName.has(isEdge ? "edge" : "vertex") &&
            byName.has("parent") &&
            hasGeometry
        if (complete) return block

        // Rebuild the attributes in the usual order: id, value, style, the
        // rest, then the flags and the connections
        const rest = attrs.filter(
            (a) =>
                !FIRST.includes(a.name) &&
                !LAST.includes(a.name) &&
                !(a.name in SIZE_ATTRS),
        )
        const ordered = [
            ...FIRST.flatMap((n) =>
                byName.has(n) ? [[n, byName.get(n) ?? ""]] : [],
            ),
            ...rest.map((a) => [a.name, a.value]),
            [isEdge ? "edge" : "vertex", "1"],
            ["parent", byName.get("parent") ?? "1"],
            ...["source", "target"].flatMap((n) =>
                byName.has(n) ? [[n, byName.get(n) ?? ""]] : [],
            ),
        ]
        const written = ordered.map(([n, v]) => ` ${n}="${v}"`).join("")
        let geometry = ""
        if (!hasGeometry) {
            if (isEdge) {
                geometry = '<mxGeometry relative="1" as="geometry"/>'
            } else {
                const get = (short: string, long: string, fallback: string) =>
                    byName.get(short) ?? byName.get(long) ?? fallback
                geometry = `<mxGeometry x="${get("x", "x", "0")}" y="${get("y", "y", "0")}" width="${get("w", "width", "120")}" height="${get("h", "height", "60")}" as="geometry"/>`
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
 * Everything else, including wrapped cells' extra data and edge labels,
 * is left as written.
 */
export function foldCells(xml: string): string {
    return xml.replace(CELL_BLOCK, (block, attrText: string, body?: string) => {
        if (body === undefined) return block
        const attrs = readAttributes(attrText)
        const byName = new Map(attrs.map((a) => [a.name, a.value]))
        if (attrs.some((a) => a.name in SIZE_ATTRS)) return block
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
            if (geometryKeys.join() !== "height,width,x,y") return block
            const size = ` x="${geometry.get("x")}" y="${geometry.get("y")}" w="${geometry.get("width")}" h="${geometry.get("height")}"`
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
