/**
 * The cells of a page as the layouts of the diagram types read and write
 * them: id, parent, style, box. The page is the <root> element of an
 * expanded model (every cell has its mxGeometry).
 */

export interface Cell {
    id: string
    /** The cell, or its <object> wrapper, which holds the id and the label */
    el: Element
    /** The mxCell */
    inner: Element
    parent: string
    style: string
    vertex: boolean
    edge: boolean
    source: string | null
    target: string | null
    geometry: Element | null
}

export interface Box {
    x: number
    y: number
    w: number
    h: number
}

export function readCells(root: Element): Cell[] {
    const cells: Cell[] = []
    for (const el of Array.from(root.children)) {
        const inner = el.tagName === "mxCell" ? el : el.querySelector("mxCell")
        const id = el.getAttribute("id")
        if (!inner || !id) continue
        cells.push({
            id,
            el,
            inner,
            parent: inner.getAttribute("parent") ?? "",
            style: inner.getAttribute("style") ?? "",
            vertex: inner.getAttribute("vertex") === "1",
            edge: inner.getAttribute("edge") === "1",
            source: inner.getAttribute("source"),
            target: inner.getAttribute("target"),
            geometry:
                Array.from(inner.children).find(
                    (child) => child.tagName === "mxGeometry",
                ) ?? null,
        })
    }
    return cells
}

export const styleHas = (style: string, token: string) =>
    style.split(";").includes(token)

export function styleValue(style: string, key: string): string | undefined {
    const found = style
        .split(";")
        .reverse()
        .find((token) => token.startsWith(`${key}=`))
    return found?.slice(key.length + 1)
}

/** The style with these keys set; a key with null is taken out */
export function withStyle(
    style: string,
    changes: Record<string, string | null>,
): string {
    const kept = style
        .split(";")
        .filter((token) => token && !(token.split("=")[0] in changes))
    for (const [key, value] of Object.entries(changes)) {
        if (value !== null) kept.push(`${key}=${value}`)
    }
    return `${kept.join(";")};`
}

/** The box of a shape placed by coordinates, or null */
export function boxOf(cell: Cell): Box | null {
    const g = cell.geometry
    if (!cell.vertex || !g || g.getAttribute("relative") === "1") return null
    const number = (name: string) => Number(g.getAttribute(name) ?? 0)
    return {
        x: number("x"),
        y: number("y"),
        w: number("width"),
        h: number("height"),
    }
}

export function setBox(cell: Cell, box: Partial<Box>): void {
    const g = cell.geometry
    if (!g) return
    const set = (name: string, value: number | undefined) => {
        if (value !== undefined) g.setAttribute(name, String(Math.round(value)))
    }
    set("x", box.x)
    set("y", box.y)
    set("width", box.w)
    set("height", box.h)
}

/** The text of a cell as it is shown: tags taken off, <br> as a line break */
export function textOf(cell: Cell): string {
    // getAttributeNode gives the decoded value (linkedom's getAttribute
    // escapes it again in an XML document)
    const label =
        (cell.el.getAttributeNode("value") ?? cell.el.getAttributeNode("label"))
            ?.value ?? ""
    return (
        label
            // (a stereotype typed as <<include>>, which the review of the
            // cells writes as «include» after the layout: it is no tag)
            .replace(/<<(\p{L}[^<>]{0,40})>>/gu, "«$1»")
            .replace(/<br\s*\/?>|<\/(div|p)>/gi, "\n")
            .replace(/<[^>]*>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .trim()
    )
}

/**
 * The size a shape needs for its text: as wide as its longest word, and as
 * tall as the text wrapped at that width. A decision shows its text in the
 * middle half of its width. Never smaller than the shape is.
 */
export function roomFor(cell: Cell, box: Box): { w: number; h: number } {
    if (styleValue(cell.style, "whiteSpace") !== "wrap") return box
    const size = Number(styleValue(cell.style, "fontSize") ?? 12)
    const diamond = styleHas(cell.style, "rhombus")
    const share = diamond ? 0.55 : 1
    const text = textOf(cell)
    // (CJK text wraps between any two characters)
    const words = text.match(/[^\s⺀-￯]+/g) ?? []
    const longest = Math.max(0, ...words.map((w) => textSize(w, size).w - 4))
    // (a decision grows wider before it grows taller: wide enough for its
    // longest line on two lines, or it would be a tall, thin diamond)
    const halfLine = diamond
        ? Math.max(
              0,
              ...text.split("\n").map((l) => (textSize(l, size).w - 4) / 2),
          )
        : 0
    const w = Math.max(
        box.w,
        Math.ceil((Math.max(longest, halfLine) / share + 14) / 10) * 10,
    )
    const room = Math.max(20, w * share - 12)
    const lines = text
        .split("\n")
        .reduce(
            (sum, line) =>
                sum +
                Math.max(1, Math.ceil((textSize(line, size).w - 4) / room)),
            0,
        )
    const need = diamond ? lines * size * 2.1 + 30 : lines * size * 1.3 + 12
    return { w, h: Math.max(box.h, Math.ceil(need / 10) * 10) }
}

/**
 * About how large draw.io shows a text that is not wrapped: a CJK character
 * is as wide as the font size, other characters a little over half
 */
export function textSize(text: string, fontSize: number): Box {
    const lines = text.split("\n")
    const width = (line: string) =>
        Array.from(line).reduce(
            (sum, ch) =>
                sum + ((ch.codePointAt(0) ?? 0) > 0x2e7f ? 1 : 0.58) * fontSize,
            0,
        )
    return {
        x: 0,
        y: 0,
        w: Math.ceil(Math.max(...lines.map(width))) + 4,
        h: Math.ceil(lines.length * fontSize * 1.3) + 2,
    }
}

/** A child element of the cell's geometry with this "as" name, taken out */
function dropPart(geometry: Element, as: string): void {
    for (const child of Array.from(geometry.children)) {
        if (child.getAttribute("as") === as) geometry.removeChild(child)
    }
}

/** The corners of a line: its waypoints, replacing the ones it had */
export function setPoints(
    cell: Cell,
    points: { x: number; y: number }[],
): void {
    const g = cell.geometry
    if (!g) return
    dropPart(g, "points")
    if (points.length === 0) return
    const doc = g.ownerDocument as Document
    const array = doc.createElement("Array")
    array.setAttribute("as", "points")
    for (const p of points) {
        const point = doc.createElement("mxPoint")
        point.setAttribute("x", String(Math.round(p.x)))
        point.setAttribute("y", String(Math.round(p.y)))
        array.appendChild(point)
    }
    g.appendChild(array)
}

/**
 * Where the text of a line stands: `along` from -1 (the source) to 1 (the
 * target), and a shift from that point. For the line itself and for a text
 * cell on it.
 */
export function setLabelPlace(
    cell: Cell,
    place: { along: number; dx: number; dy: number } | null,
): void {
    const g = cell.geometry
    if (!g) return
    dropPart(g, "offset")
    if (!place) {
        g.removeAttribute("x")
        g.removeAttribute("y")
        return
    }
    g.setAttribute("x", String(Math.round(place.along * 1000) / 1000))
    g.setAttribute("y", "0")
    if (place.dx !== 0 || place.dy !== 0) {
        const offset = (g.ownerDocument as Document).createElement("mxPoint")
        offset.setAttribute("x", String(Math.round(place.dx)))
        offset.setAttribute("y", String(Math.round(place.dy)))
        offset.setAttribute("as", "offset")
        g.appendChild(offset)
    }
}
