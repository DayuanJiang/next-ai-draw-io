/**
 * The repair of a diagram of shapes and connectors a model drew, of any
 * kind: a flowchart, an architecture, an ER diagram. The shapes stay where
 * they were drawn. A connector that passes through a shape gets a new path
 * around the shapes; a connector's text that stands on a shape or on
 * another text gets a free place on its connector; shapes that stand on
 * each other are moved apart; and when there is still no room, all shapes
 * are set a little further apart, each at its size. A drawing without such
 * a problem is left as it is.
 *
 * Of 114 drawings of real requests of these kinds, 75 had such a problem:
 * 369 connectors through a shape, 301 texts of connectors on a shape or
 * on each other, 57 shapes on each other.
 *
 * What counts as a problem follows the layout check of draw.io's own MCP
 * server (jgraph/drawio-mcp, `layoutCheck`), and so does the rule to lead
 * only the connectors that cross something. Where a connector runs is
 * worked out by draw.io's own rules (drawio-paths.ts).
 *
 * A new path is found on a lattice of lines 10 apart laid over the page
 * (the middles of the shapes it connects are lines of it too): the
 * cheapest way from a side of the one shape to a side of the other, where
 * every corner, a step through a shape, a step close to one and a step
 * along another connector cost extra.
 */
import {
    type Box,
    boxOf,
    type Cell,
    lineWidth,
    readCells,
    setBox,
    setLabelPlace,
    setPoints,
    styleHas,
    styleValue,
    textOf,
    withStyle,
} from "./cells.ts"
import { centreOf, drawnPath, portOf, sideOf } from "./drawio-paths.ts"
import { type Point, type Side, stretchInBox } from "./grid-route.ts"

const STEP = 10
/** How far a new path runs straight out of a shape at least */
const LEAD = 8
/** The costs of a path, in units of length */
const BEND = 20
const CROSS = 12
const OTHER_SIDE = 15
/** Per step of the lattice */
const THROUGH = 400
const THROUGH_TEXT = 150
const THROUGH_BOX = 6
const ALONG = 80
/** A path keeps this far from the shapes where it can: per unit it comes closer, per step */
const NEAR = 24
const NEAR_COST = 0.15
/** How far apart the shapes may be set, sideways and up and down, in the order they are tried */
const SPREADS = [
    [1.2, 1],
    [1, 1.2],
    [1.2, 1.2],
    [1.4, 1.4],
    [1.6, 1.6],
]

/** The four ways a path runs: right, down, left, up */
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

interface Item {
    cell: Cell
    /** On the page, as drawn */
    drawn: Box
    /** On the page, after the shapes were moved */
    box: Box
    /** The box it stands in, by its parent or by where it was drawn */
    up: Item | null
    kids: Item[]
    /** A box that moves as one shape with all it holds */
    solid: boolean
    /** A box that lays out its own rows: a table, a class */
    table: boolean
    /** A text with no shape around it */
    plain: boolean
    /** A connector meets its outline, not its box */
    outline: "rhombus" | "ellipse" | null
    /** No plain rectangle: a new path meets it in the middle of a side */
    centred: boolean
    named: boolean
    /** A filled shape that other shapes were drawn onto: a panel behind them */
    panel: boolean
    /** A filled bar with a text across half the page or more: a heading behind the drawing */
    band: boolean
    /** Its text inside the shape, or the words of a plain text */
    words: Box | null
    /** Its text where that stands apart from the shape: the name under an icon, the title of a box */
    area: Box | null
}

interface Label {
    cell: Cell
    w: number
    h: number
    /** Where it stands on the connector as drawn */
    box: Box | null
    move: boolean
}

interface Line {
    cell: Cell
    a: Item
    b: Item
    /** The boxes its two ends stand in */
    around: Set<Item>
    /** The corner of its parent on the page: its points count from there */
    origin: Point
    /** Its waypoints, on the page */
    way: Point[]
    /** Its path: as draw.io draws it (null when that is not known), or the new one */
    path: Point[] | null
    led: boolean
    labels: Label[]
}

/** One try at the repair, with the shapes as far apart as asked */
interface Attempt {
    /** The problems it leaves */
    left: number
    /** Room that would help: between two shapes whose connector has none for its text */
    wishes: Need[]
    apply: () => string[]
}

/** Room to put in between two middles, sideways (flat) or up and down */
interface Need {
    flat: boolean
    lo: number
    hi: number
    room: number
}

/** A text wrapped at a width, word by word (CJK characters one by one): its rows and its widest row */
function wrapped(text: string, size: number, bold: boolean, room: number) {
    let rows = 0
    let widest = 0
    for (const row of text.split("\n")) {
        let line = 0
        let space = 0
        rows += 1
        for (const part of row.match(/[⺀-￯]|[^\s⺀-￯]+|\s+/g) ?? []) {
            const w = lineWidth(part, size, bold)
            if (part.trim() === "") {
                space = w
                continue
            }
            if (line > 0 && line + space + w > room) {
                widest = Math.max(widest, line)
                rows += 1
                line = w
            } else {
                line += (line > 0 ? space : 0) + w
            }
            space = 0
        }
        widest = Math.max(widest, line)
    }
    return { rows, widest }
}

const shrink = (b: Box, by: number): Box => ({
    x: b.x + by,
    y: b.y + by,
    w: b.w - 2 * by,
    h: b.h - 2 * by,
})
/** The area two boxes share */
const shared = (a: Box, b: Box) =>
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
/** Whether two boxes lie on each other by more than `by` in both directions */
const over = (a: Box, b: Box, by: number) =>
    Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > by &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > by
const inside = (inner: Box, outer: Box) =>
    inner.x >= outer.x - 2 &&
    inner.y >= outer.y - 2 &&
    inner.x + inner.w <= outer.x + outer.w + 2 &&
    inner.y + inner.h <= outer.y + outer.h + 2

/** How large draw.io shows a text that is not wrapped */
function sizeOf(text: string, style: string, fontSize: number) {
    const size = Number(styleValue(style, "fontSize") ?? fontSize)
    const bold = (Number(styleValue(style, "fontStyle") ?? 0) & 1) === 1
    const rows = text.split("\n")
    return {
        w: Math.ceil(
            Math.max(...rows.map((row) => lineWidth(row, size, bold))),
        ),
        h: Math.ceil(rows.length * size * 1.2),
        size,
        bold,
    }
}

/** Only the corners of a path: no point twice, none on the straight way between its neighbours */
function cornersOf(path: Point[]): Point[] {
    const corners: Point[] = []
    for (const p of path) {
        const a = corners[corners.length - 1]
        if (a && Math.abs(a.x - p.x) < 0.5 && Math.abs(a.y - p.y) < 0.5)
            continue
        const b = corners[corners.length - 2]
        if (
            b &&
            ((Math.abs(b.x - a.x) < 0.5 && Math.abs(a.x - p.x) < 0.5) ||
                (Math.abs(b.y - a.y) < 0.5 && Math.abs(a.y - p.y) < 0.5))
        ) {
            corners.pop()
        }
        corners.push(p)
    }
    return corners
}

const lengthOf = (path: Point[]) =>
    path
        .slice(1)
        .reduce(
            (sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.y - path[i].y),
            0,
        )

/** The point of a path so far along it, and the way the path runs there */
function pointAt(path: Point[], d: number) {
    let rest = d
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]
        const b = path[i]
        const l = Math.hypot(b.x - a.x, b.y - a.y)
        if (rest <= l || i === path.length - 1) {
            const f = l === 0 ? 0 : Math.min(1, rest / l)
            return {
                x: a.x + (b.x - a.x) * f,
                y: a.y + (b.y - a.y) * f,
                // (the stretch, as a step of length one)
                dx: l === 0 ? 0 : (b.x - a.x) / l,
                dy: l === 0 ? 0 : (b.y - a.y) / l,
                upright: Math.abs(b.x - a.x) < Math.abs(b.y - a.y),
            }
        }
        rest -= l
    }
    return { ...path[0], dx: 0, dy: 0, upright: true }
}

/** What the repair changed, for the model; empty when it left the page as it is */
export function repairLines(root: Element): string[] {
    const cells = readCells(root)
    const byId = new Map(cells.map((c) => [c.id, c]))
    // (the messages of a sequence diagram cross the lifelines between
    // their two ends: that is how they are read. Lifelines are shapes of
    // that name, or long lines down the page: thin shapes, or connectors
    // tied to nothing)
    const lifelines = cells.filter((cell) => {
        if (cell.style.includes("umlLifeline")) return true
        if (cell.vertex) {
            const box = boxOf(cell)
            return box !== null && box.w <= 14 && box.h >= 120
        }
        if (!cell.edge || cell.source || cell.target) return false
        const ends = ["sourcePoint", "targetPoint"].map((as) =>
            Array.from(cell.geometry?.children ?? []).find(
                (child) => child.getAttribute("as") === as,
            ),
        )
        const at = (end: Element | undefined, name: string) =>
            Number(end?.getAttribute(name) ?? 0)
        return (
            ends[0] !== undefined &&
            ends[1] !== undefined &&
            Math.abs(at(ends[0], "x") - at(ends[1], "x")) < 2 &&
            Math.abs(at(ends[0], "y") - at(ends[1], "y")) >= 120
        )
    })
    if (
        lifelines.length >= 2 ||
        lifelines.some((c) => c.style.includes("umlLifeline"))
    ) {
        return []
    }

    const pageBox = (cell: Cell): Box | null => {
        const box = boxOf(cell)
        if (!box) return null
        const parent = byId.get(cell.parent)
        const outer = parent?.vertex ? pageBox(parent) : null
        return outer ? { ...box, x: box.x + outer.x, y: box.y + outer.y } : box
    }
    const endIds = new Set<string>()
    for (const cell of cells) {
        if (!cell.edge) continue
        if (cell.source) endIds.add(cell.source)
        if (cell.target) endIds.add(cell.target)
    }

    const attempt = (kx: number, ky: number, more: Need[]): Attempt | null => {
        // Every shape with its box on the page
        const items = new Map<string, Item>()
        for (const cell of cells) {
            const parent = byId.get(cell.parent)
            const box = cell.vertex && !parent?.edge ? pageBox(cell) : null
            if (!box || box.w < 1 || box.h < 1) continue
            const style = cell.style
            const none = (key: string) => styleValue(style, key) === "none"
            const shape = styleValue(style, "shape")
            const bare = (key: string) =>
                (styleValue(style, key) ?? "none") === "none"
            const plain =
                ((styleHas(style, "text") || shape === "text") &&
                    bare("fillColor") &&
                    bare("strokeColor")) ||
                (none("strokeColor") &&
                    none("fillColor") &&
                    shape !== "image" &&
                    !shape?.startsWith("mxgraph."))
            const outline =
                styleHas(style, "rhombus") || shape === "rhombus"
                    ? "rhombus"
                    : styleHas(style, "ellipse") ||
                        shape === "ellipse" ||
                        shape === "doubleEllipse"
                      ? "ellipse"
                      : null
            items.set(cell.id, {
                cell,
                drawn: box,
                box,
                up: null,
                kids: [],
                solid: false,
                table:
                    styleValue(style, "childLayout") !== undefined ||
                    shape === "table",
                plain,
                outline,
                centred:
                    outline !== null ||
                    shape !== undefined ||
                    ["triangle", "hexagon", "cloud"].some((token) =>
                        styleHas(style, token),
                    ),
                named: textOf(cell) !== "",
                panel:
                    !plain && !none("fillColor") && !styleHas(style, "group"),
                band: false,
                words: null,
                area: null,
            })
        }
        const all = [...items.values()]
        // The box a shape stands in: the smallest shape of the same parent
        // that was drawn around it (or around most of it, when that shape
        // is much larger), or else its parent
        for (const item of all) {
            const area = item.drawn.w * item.drawn.h
            let around: Item | null = null
            for (const other of all) {
                if (other === item || other.cell.parent !== item.cell.parent) {
                    continue
                }
                const size = other.drawn.w * other.drawn.h
                if (size < area * 1.5 || !inside(item.drawn, other.drawn)) {
                    continue
                }
                if (!around || size < around.drawn.w * around.drawn.h) {
                    around = other
                }
            }
            item.up = around ?? items.get(item.cell.parent) ?? null
        }
        for (const item of all) item.up?.kids.push(item)
        const pageWide =
            Math.max(...all.map((item) => item.drawn.x + item.drawn.w)) -
            Math.min(...all.map((item) => item.drawn.x))
        for (const item of all) {
            // (a panel holds what was drawn onto it; a container holds its
            // children, and connectors may pass through it)
            item.panel =
                item.panel &&
                item.kids.length > 0 &&
                item.kids.every((kid) => kid.cell.parent !== item.cell.id)
            item.band =
                item.named &&
                !item.plain &&
                styleValue(item.cell.style, "fillColor") !== "none" &&
                item.drawn.h <= 40 &&
                item.drawn.w >= 10 * item.drawn.h &&
                item.drawn.w >= pageWide / 2
        }
        const chain = (item: Item): Item[] =>
            item.up ? [item.up, ...chain(item.up)] : []
        const inTable = (item: Item) => chain(item).some((up) => up.table)

        // What moves as one when shapes are moved: a box that lays out its
        // own rows or holds no end of a connector, with all it holds; a
        // small shape drawn onto a much larger one; a text right beside a
        // shape
        const below = (item: Item): Item[] =>
            item.kids.flatMap((kid) => [kid, ...below(kid)])
        for (const item of all) {
            if (item.kids.length === 0) continue
            item.solid =
                item.table ||
                below(item).every((part) => !endIds.has(part.cell.id))
        }
        const unitOf = (item: Item) =>
            [...chain(item)].reverse().find((up) => up.solid)
        const mate = new Map<Item, Item>()
        const loose = all
            .filter((item) => item.kids.length === 0 && !unitOf(item))
            .sort((p, q) => q.drawn.w * q.drawn.h - p.drawn.w * p.drawn.h)
        loose.forEach((item, index) => {
            const size = item.drawn.w * item.drawn.h
            let best: Item | null = null
            let most = 0
            for (const other of loose.slice(0, index)) {
                if (other.up !== item.up || other.plain) continue
                const w =
                    Math.min(
                        item.drawn.x + item.drawn.w,
                        other.drawn.x + other.drawn.w,
                    ) - Math.max(item.drawn.x, other.drawn.x)
                const h =
                    Math.min(
                        item.drawn.y + item.drawn.h,
                        other.drawn.y + other.drawn.h,
                    ) - Math.max(item.drawn.y, other.drawn.y)
                // (a text counts as beside a shape from 8 away)
                const pad = item.plain ? 8 : 0
                if (w + pad <= 0 || h + pad <= 0) continue
                const share = item.plain
                    ? 1 + Math.max(0, w) * Math.max(0, h)
                    : (w * h) / size
                const badge = size * 4 <= other.drawn.w * other.drawn.h
                if (share > most && (item.plain || (badge && share >= 0.2))) {
                    most = share
                    best = other
                }
            }
            if (best) mate.set(item, mate.get(best) ?? best)
        })
        const leadOf = (item: Item) => unitOf(item) ?? mate.get(item)

        // The part of a shape that the layout check counts: a diamond or
        // an ellipse by the box inside it
        const core = (item: Item, box = item.box): Box => {
            if (!item.outline) return shrink(box, 3)
            const f = item.outline === "rhombus" ? 0.25 : 0.15
            return shrink(
                {
                    x: box.x + f * box.w,
                    y: box.y + f * box.h,
                    w: (1 - 2 * f) * box.w,
                    h: (1 - 2 * f) * box.h,
                },
                1,
            )
        }

        // Where the text of a shape stands: inside it, or apart from it
        // (the name under an icon, the title of a box)
        const placeText = (item: Item) => {
            item.words = null
            item.area = null
            const text = textOf(item.cell)
            if (!text) return
            const style = item.cell.style
            const one = sizeOf(text, style, 12)
            const v = styleValue(style, "verticalLabelPosition")
            const h = styleValue(style, "labelPosition")
            const under = v === "bottom" || v === "top"
            const beside = h === "left" || h === "right"
            const c = centreOf(item.box)
            // (a wrapped text is as wide as its shape at most)
            let w = one.w
            let high = one.h
            const room = beside || under ? item.box.w : item.box.w - 2
            if (styleValue(style, "whiteSpace") === "wrap" && one.w > room) {
                const fit = wrapped(
                    text,
                    one.size,
                    one.bold,
                    Math.max(20, room),
                )
                w = Math.ceil(fit.widest)
                high = Math.ceil(fit.rows * one.size * 1.2)
            }
            const align = styleValue(style, "align") ?? "center"
            const space = (side: string) =>
                2 + Number(styleValue(style, `spacing${side}`) ?? 0)
            const left =
                align === "left"
                    ? item.box.x + space("Left")
                    : align === "right"
                      ? item.box.x + item.box.w - w - space("Right")
                      : c.x - w / 2
            if (under || beside) {
                item.area = under
                    ? {
                          x: c.x - w / 2,
                          y:
                              v === "bottom"
                                  ? item.box.y + item.box.h + 2
                                  : item.box.y - high - 2,
                          w,
                          h: high,
                      }
                    : {
                          x:
                              h === "left"
                                  ? item.box.x - w - 2
                                  : item.box.x + item.box.w + 2,
                          y: c.y - high / 2,
                          w,
                          h: high,
                      }
                return
            }
            const upright = styleValue(style, "verticalAlign") ?? "middle"
            if (item.kids.length > 0 && !item.table) {
                // The title of a box
                const swim = styleHas(style, "swimlane")
                if (
                    (!swim && upright !== "top") ||
                    styleValue(style, "horizontal") === "0"
                ) {
                    return
                }
                const strip = swim
                    ? Number(styleValue(style, "startSize") ?? 23)
                    : high + 6
                item.area = {
                    x: left,
                    y: swim
                        ? item.box.y + Math.max(0, (strip - high) / 2)
                        : item.box.y + space("Top") + 3,
                    w,
                    h: high,
                }
                return
            }
            item.words = {
                x: left,
                y:
                    upright === "top"
                        ? item.box.y + space("Top") + 3
                        : upright === "bottom"
                          ? item.box.y + item.box.h - high - space("Bottom") - 3
                          : c.y - high / 2,
                w,
                h: high,
            }
        }
        for (const item of all) placeText(item)
        // A shape grows around a text that is larger than it is
        let fitted = 0
        for (const item of all) {
            const words = item.words
            const style = item.cell.style
            if (
                !words ||
                item.plain ||
                item.kids.length > 0 ||
                leadOf(item) ||
                inTable(item) ||
                styleValue(style, "shape") === "image" ||
                styleValue(style, "overflow") !== undefined ||
                (styleValue(style, "rotation") ?? "0") !== "0" ||
                styleValue(style, "horizontal") === "0" ||
                (words.w <= item.drawn.w + 2 && words.h <= item.drawn.h + 2)
            ) {
                continue
            }
            const w = Math.max(item.drawn.w, words.w + 8)
            const h = Math.max(item.drawn.h, words.h + 8)
            const c = centreOf(item.drawn)
            item.drawn = {
                x: Math.round(c.x - w / 2),
                y: Math.round(c.y - h / 2),
                w,
                h,
            }
            item.box = item.drawn
            fitted += 1
            placeText(item)
        }

        // Shapes with a text that stand on each other are moved apart:
        // room is put in between their middles, across the whole page, so
        // that what stood in one row or one column still does
        const movers = all.filter(
            (item) =>
                !item.plain &&
                !leadOf(item) &&
                (item.kids.length === 0 || item.solid),
        )
        const units = movers.filter((item) => item.named)
        const onEachOther = (p: Item, q: Item, pBox: Box, qBox: Box) => {
            const a = core(p, pBox)
            const b = core(q, qBox)
            return over(a, b, 0) && !inside(a, b) && !inside(b, a)
        }
        // (a shape with its name beside it)
        const reachOf = (item: Item): Box => {
            const area = item.area
            if (!area) return item.drawn
            const x = Math.min(item.drawn.x, area.x)
            const y = Math.min(item.drawn.y, area.y)
            return {
                x,
                y,
                w: Math.max(item.drawn.x + item.drawn.w, area.x + area.w) - x,
                h: Math.max(item.drawn.y + item.drawn.h, area.y + area.h) - y,
            }
        }
        const nameOn = (p: Item, q: Item) =>
            p.area !== null &&
            (over(p.area, core(q, q.drawn), 1) ||
                (q.area !== null && over(p.area, q.area, 4)))
        const needs: Need[] = [...more]
        units.forEach((p, i) => {
            for (const q of units.slice(i + 1)) {
                if (
                    !onEachOther(p, q, p.drawn, q.drawn) &&
                    !nameOn(p, q) &&
                    !nameOn(q, p)
                ) {
                    continue
                }
                const pr = reachOf(p)
                const qr = reachOf(q)
                const w =
                    Math.min(pr.x + pr.w, qr.x + qr.w) - Math.max(pr.x, qr.x)
                const h =
                    Math.min(pr.y + pr.h, qr.y + qr.h) - Math.max(pr.y, qr.y)
                const a = centreOf(p.drawn)
                const b = centreOf(q.drawn)
                // (apart along the line their middles are further apart
                // on, for their sizes)
                const offX = Math.abs(a.x - b.x) / (pr.w + qr.w)
                const offY = Math.abs(a.y - b.y) / (pr.h + qr.h)
                if (Math.max(offX, offY) < 0.02) continue
                const flat = offX >= offY
                const depth = flat ? w : h
                needs.push({
                    flat,
                    lo: flat ? Math.min(a.x, b.x) : Math.min(a.y, b.y),
                    hi: flat ? Math.max(a.x, b.x) : Math.max(a.y, b.y),
                    // (a sliver: they are meant to touch)
                    room: depth <= 6 ? depth : depth + 16,
                })
            }
        })
        const warp = (flat: boolean) => {
            const knots = [
                ...new Set(
                    movers.map((u) =>
                        flat ? centreOf(u.drawn).x : centreOf(u.drawn).y,
                    ),
                ),
            ].sort((a, b) => a - b)
            const add = knots.map(() => 0)
            const mine = needs
                .filter((need) => need.flat === flat)
                .sort((a, b) => a.hi - b.hi)
            for (const need of mine) {
                let have = 0
                knots.forEach((v, j) => {
                    if (v > need.lo && v <= need.hi) have += add[j]
                })
                const at = knots.indexOf(need.hi)
                if (have < need.room && at > 0 && knots.includes(need.lo)) {
                    add[at] += need.room - have
                }
            }
            let sum = 0
            const moved = knots.map((v, j) => {
                sum += add[j]
                return v + sum
            })
            return {
                any: sum > 0,
                at: (v: number) => {
                    const last = knots.length - 1
                    if (last < 0) return v
                    if (v <= knots[0]) return v + moved[0] - knots[0]
                    if (v >= knots[last]) return v + moved[last] - knots[last]
                    let j = 1
                    while (knots[j] < v) j += 1
                    const part = (v - knots[j - 1]) / (knots[j] - knots[j - 1])
                    return moved[j - 1] + part * (moved[j] - moved[j - 1])
                },
            }
        }
        const warpX = warp(true)
        const warpY = warp(false)
        const apart = kx !== 1 || ky !== 1 || warpX.any || warpY.any
        /** Where a point of the page as drawn is now */
        const toX = (v: number) => warpX.at(v) * kx
        const toY = (v: number) => warpY.at(v) * ky
        const spread = (item: Item): Box => {
            const lead = leadOf(item)
            if (lead) {
                const moved = spread(lead)
                return {
                    ...item.drawn,
                    x: item.drawn.x + moved.x - lead.drawn.x,
                    y: item.drawn.y + moved.y - lead.drawn.y,
                }
            }
            if (item.kids.length > 0 && !item.solid) {
                const x = Math.round(toX(item.drawn.x))
                const y = Math.round(toY(item.drawn.y))
                return {
                    x,
                    y,
                    w: Math.round(toX(item.drawn.x + item.drawn.w)) - x,
                    h: Math.round(toY(item.drawn.y + item.drawn.h)) - y,
                }
            }
            const c = centreOf(item.drawn)
            return {
                x: Math.round(toX(c.x) - item.drawn.w / 2),
                y: Math.round(toY(c.y) - item.drawn.h / 2),
                w: item.drawn.w,
                h: item.drawn.h,
            }
        }
        if (apart) {
            for (const item of all) item.box = spread(item)
        }
        // A box reaches around all it holds
        let grown = 0
        const enclose = (item: Item) => {
            for (const kid of item.kids) enclose(kid)
            const own = item.kids
            if (own.length === 0 || item.solid || leadOf(item)) return
            const { x, y, w, h } = item.box
            // (a side moves only where a child reaches past it)
            const lo = (side: number, least: number) =>
                least < side - 1 ? least - 6 : side
            const hi = (side: number, most: number) =>
                most > side + 1 ? most + 6 : side
            const x0 = lo(x, Math.min(...own.map((kid) => kid.box.x)))
            const y0 = lo(y, Math.min(...own.map((kid) => kid.box.y)))
            const x1 = hi(
                x + w,
                Math.max(...own.map((kid) => kid.box.x + kid.box.w)),
            )
            const y1 = hi(
                y + h,
                Math.max(...own.map((kid) => kid.box.y + kid.box.h)),
            )
            if (x1 - x0 > w + 0.5 || y1 - y0 > h + 0.5) {
                grown += 1
                item.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
            }
        }
        for (const item of all) {
            if (!item.up) enclose(item)
        }

        for (const item of all) placeText(item)

        // The connectors between two shapes of which one has a name, with
        // the path draw.io gives each. A curved one is left alone: its
        // corners only pull at it
        const endOf = (item: Item, box = item.box) => ({
            box,
            outline: item.outline,
        })
        const lines: Line[] = []
        for (const cell of cells) {
            const a = items.get(cell.source ?? "")
            const b = items.get(cell.target ?? "")
            if (!cell.edge || !a || !b || a === b) continue
            if (styleValue(cell.style, "curved") === "1") continue
            if (!a.named && !b.named) continue
            const aUp = chain(a)
            const bUp = chain(b)
            if (aUp.includes(b) || bUp.includes(a)) continue
            const holder = byId.get(cell.parent)
            const was = holder?.vertex ? pageBox(holder) : null
            const now = items.get(cell.parent)?.box
            const origin = {
                x: now?.x ?? Math.round(toX(was?.x ?? 0)),
                y: now?.y ?? Math.round(toY(was?.y ?? 0)),
            }
            const points = Array.from(cell.geometry?.children ?? []).find(
                (child) => child.getAttribute("as") === "points",
            )
            const raw = Array.from(points?.children ?? []).map((point) => ({
                x: Number(point.getAttribute("x") ?? 0) + (was?.x ?? 0),
                y: Number(point.getAttribute("y") ?? 0) + (was?.y ?? 0),
            }))
            const way = raw.map((p) => ({
                x: Math.round(toX(p.x)),
                y: Math.round(toY(p.y)),
            }))
            if (apart && way.length > 0) {
                // (a corner in line with the end of the connector stays in
                // line with it)
                const keep = (
                    item: Item,
                    end: "exit" | "entry",
                    from: Point,
                    to: Point,
                ) => {
                    const p = portOf(endOf(item, item.drawn), cell.style, end)
                    const q = portOf(endOf(item), cell.style, end)
                    if (!p || !q) return
                    if (Math.abs(from.x - p.x) < 1) to.x = q.x
                    if (Math.abs(from.y - p.y) < 1) to.y = q.y
                }
                keep(a, "exit", raw[0], way[0])
                keep(b, "entry", raw[raw.length - 1], way[way.length - 1])
            }
            const labels: Label[] = []
            for (const own of [
                cell,
                ...cells.filter((c) => c.parent === cell.id && c.vertex),
            ]) {
                const text = textOf(own)
                if (!text) continue
                const size = sizeOf(text, own.style, 11)
                labels.push({
                    cell: own,
                    w: size.w,
                    h: size.h,
                    box: null,
                    move: false,
                })
            }
            lines.push({
                cell,
                a,
                b,
                around: new Set([...aUp, ...bUp]),
                origin,
                way,
                path: drawnPath(endOf(a), endOf(b), cell.style, way),
                led: false,
                labels,
            })
        }
        if (lines.length === 0) return null

        // What a connector must not pass through, as the layout check
        // counts it: every shape that is no box around others and neither
        // one of its ends nor around or in one; the texts beside shapes and
        // the titles of boxes, also those of its own ends; texts without a
        // shape (but a text right beside one of its ends is there for this
        // connector: a "1" or an "N" at the end of a relation)
        const inEnd = (item: Item, line: Line) => {
            const up = chain(item)
            return up.includes(line.a) || up.includes(line.b)
        }
        const ownText = (item: Item, line: Line) => {
            const lead = mate.get(item)
            return lead === line.a || lead === line.b
        }
        const blocks = (item: Item, line: Line) =>
            !item.plain &&
            !item.band &&
            (item.kids.length === 0 || item.table || item.panel) &&
            item !== line.a &&
            item !== line.b &&
            !line.around.has(item) &&
            !inEnd(item, line) &&
            !inTable(item)
        const hits = (line: Line, path: Point[]): number => {
            let count = 0
            const through = (box: Box) => {
                for (let i = 1; i < path.length; i++) {
                    if (stretchInBox(path[i - 1], path[i], box)) return true
                }
                return false
            }
            for (const item of all) {
                if (item.plain) {
                    if (
                        item.words &&
                        !ownText(item, line) &&
                        through(shrink(item.words, 2))
                    ) {
                        count += 1
                    }
                    continue
                }
                if (item.area && through(shrink(item.area, 2))) count += 1
                if (blocks(item, line) && through(core(item))) count += 1
            }
            return count
        }
        // A path that is not known is fine when nothing stands between
        // its ends
        const between = (line: Line): boolean => {
            const x = Math.min(line.a.box.x, line.b.box.x)
            const y = Math.min(line.a.box.y, line.b.box.y)
            const span = {
                x,
                y,
                w:
                    Math.max(
                        line.a.box.x + line.a.box.w,
                        line.b.box.x + line.b.box.w,
                    ) - x,
                h:
                    Math.max(
                        line.a.box.y + line.a.box.h,
                        line.b.box.y + line.b.box.h,
                    ) - y,
            }
            return all.some(
                (item) => blocks(item, line) && over(core(item), span, 0),
            )
        }
        const wrong = lines.filter((line) =>
            line.path ? hits(line, line.path) > 0 : between(line),
        )

        // Shapes that still stand on each other
        let overlaps = 0
        units.forEach((p, i) => {
            for (const q of units.slice(i + 1)) {
                if (onEachOther(p, q, p.box, q.box)) overlaps += 1
            }
        })

        // What stands in the way of a connector's text at a place: 10 and
        // more when it lies on a text or on a shape that is not one of the
        // connector's ends
        const placed: Box[] = []
        const inWay = (box: Box, line: Line, by: number): number => {
            const size = box.w * box.h
            let sum = 0
            const on = (other: Box, tolerance: number) => {
                if (over(box, other, tolerance)) {
                    sum += 10 + (10 * shared(box, other)) / size
                }
            }
            for (const item of all) {
                if (item.words) on(item.words, by)
                if (item.area) on(item.area, by)
                if (item.plain || (item.kids.length > 0 && !item.table)) {
                    continue
                }
                // (the whole shape, to its border: a text may not touch
                // it; a diamond or an ellipse by the box inside it)
                const body = item.outline ? core(item) : item.box
                if (item === line.a || item === line.b) {
                    // (on the empty part of its own end: no problem, but
                    // not the best place)
                    if (by === 0 && over(box, body, 0)) sum += 1
                    continue
                }
                // (a much larger shape is a frame the text stands in)
                if (item.named && body.w * body.h <= 16 * size) {
                    on(body, Math.min(by, 1))
                }
            }
            for (const other of placed) on(other, by)
            return sum
        }

        // Where the texts of the connectors stand, and which of them
        // stand on a shape or on another text
        for (const line of lines) {
            if (!line.path || wrong.includes(line)) continue
            const total = lengthOf(line.path)
            for (const label of line.labels) {
                const g = label.cell.geometry
                const along = Number(g?.getAttribute("x") ?? 0)
                const at = pointAt(line.path, (along / 2 + 0.5) * total)
                const offset = Array.from(g?.children ?? []).find(
                    (child) => child.getAttribute("as") === "offset",
                )
                // (its distance from the line: to the left of the way the
                // line runs)
                const beside = Number(g?.getAttribute("y") ?? 0)
                const vertical = styleValue(label.cell.style, "verticalAlign")
                const align = styleValue(label.cell.style, "align")
                const x =
                    at.x +
                    at.dy * beside +
                    Number(offset?.getAttribute("x") ?? 0) +
                    (align === "left"
                        ? label.w / 2
                        : align === "right"
                          ? -label.w / 2
                          : 0)
                const y =
                    at.y -
                    at.dx * beside +
                    Number(offset?.getAttribute("y") ?? 0) +
                    (vertical === "bottom"
                        ? -label.h / 2
                        : vertical === "top"
                          ? label.h / 2
                          : 0)
                label.box = {
                    x: x - label.w / 2,
                    y: y - label.h / 2,
                    w: label.w,
                    h: label.h,
                }
                label.move = inWay(label.box, line, 4) >= 10
                if (!label.move) placed.push(label.box)
            }
        }
        const moving = lines.some((line) => line.labels.some((l) => l.move))
        // The texts right beside a shape, and the stretch of one of the
        // shape's connectors that runs through each
        const tags = all.filter((item) => item.plain && mate.has(item))
        const cutOf = (tag: Item): Point[] | null => {
            const words = shrink(tag.words ?? tag.box, 2)
            const owner = mate.get(tag)
            for (const line of lines) {
                if ((line.a !== owner && line.b !== owner) || !line.path) {
                    continue
                }
                for (let i = 1; i < line.path.length; i++) {
                    if (stretchInBox(line.path[i - 1], line.path[i], words)) {
                        return [line.path[i - 1], line.path[i]]
                    }
                }
            }
            return null
        }
        if (
            !apart &&
            grown === 0 &&
            fitted === 0 &&
            wrong.length === 0 &&
            !moving &&
            overlaps === 0 &&
            !tags.some(cutOf)
        ) {
            return null
        }

        // The lattice: lines 10 apart over the page, and the middles of
        // the shapes that get a new path
        const reach = {
            x0: Infinity,
            y0: Infinity,
            x1: -Infinity,
            y1: -Infinity,
        }
        const take = (box: Box) => {
            reach.x0 = Math.min(reach.x0, box.x)
            reach.y0 = Math.min(reach.y0, box.y)
            reach.x1 = Math.max(reach.x1, box.x + box.w)
            reach.y1 = Math.max(reach.y1, box.y + box.h)
        }
        for (const item of all) {
            take(item.box)
            if (item.area) take(item.area)
        }
        for (const line of lines) {
            for (const p of line.path ?? []) take({ ...p, w: 0, h: 0 })
        }
        const axis = (lo: number, hi: number, middles: number[]): number[] => {
            const own: number[] = []
            for (const m of [...middles].sort((a, b) => a - b)) {
                const v = Math.round(m)
                if (own.every((o) => Math.abs(o - v) > 3)) own.push(v)
            }
            const out = [...own]
            const from = Math.floor((lo - 3 * STEP) / STEP) * STEP
            for (let v = from; v <= hi + 3 * STEP; v += STEP) {
                if (own.every((o) => Math.abs(o - v) >= STEP / 2)) out.push(v)
            }
            return out.sort((a, b) => a - b)
        }
        const ends = [...new Set(wrong.flatMap((line) => [line.a, line.b]))]
        const xs = axis(
            reach.x0,
            reach.x1,
            ends.map((item) => centreOf(item.box).x),
        )
        const ys = axis(
            reach.y0,
            reach.y1,
            ends.map((item) => centreOf(item.box).y),
        )
        const nx = xs.length
        const ny = ys.length
        /** The first line of the lattice at or after a value */
        const firstFrom = (values: number[], v: number) => {
            let lo = 0
            let hi = values.length
            while (lo < hi) {
                const mid = (lo + hi) >> 1
                if (values[mid] < v) lo = mid + 1
                else hi = mid
            }
            return lo
        }
        const nearest = (values: number[], v: number) => {
            const i = firstFrom(values, v)
            if (i === 0) return 0
            if (i === values.length) return values.length - 1
            return values[i] - v < v - values[i - 1] ? i : i - 1
        }

        // What a step onto each point of the lattice costs: through a
        // shape or a text (ground), and how far the nearest of them is
        // (gap)
        const ground = new Float32Array(nx * ny)
        const gap = new Float32Array(nx * ny).fill(NEAR)
        const lay = (box: Box, cost: number) => {
            for (let iy = firstFrom(ys, box.y - NEAR); iy < ny; iy++) {
                if (ys[iy] > box.y + box.h + NEAR) break
                for (let ix = firstFrom(xs, box.x - NEAR); ix < nx; ix++) {
                    if (xs[ix] > box.x + box.w + NEAR) break
                    const far = Math.hypot(
                        Math.max(box.x - xs[ix], 0, xs[ix] - box.x - box.w),
                        Math.max(box.y - ys[iy], 0, ys[iy] - box.y - box.h),
                    )
                    const at = iy * nx + ix
                    if (far < 4) ground[at] = Math.max(ground[at], cost)
                    gap[at] = Math.min(gap[at], far)
                }
            }
        }
        for (const item of all) {
            if (item.plain) {
                if (item.words && !tags.includes(item)) {
                    lay(item.words, THROUGH_TEXT)
                }
                continue
            }
            if (item.area) lay(item.area, THROUGH_TEXT)
            if (
                (item.kids.length === 0 || item.table) &&
                !item.band &&
                !inTable(item)
            ) {
                lay(item.box, THROUGH)
            }
        }
        // The innermost box around each point of the lattice, and the
        // text beside a shape it lies in
        const boxes = all
            .filter((item) => item.kids.length > 0 && !item.table)
            .sort((p, q) => q.box.w * q.box.h - p.box.w * p.box.h)
        const fill = (
            into: Int16Array,
            box: Box,
            index: number,
            pad: number,
        ) => {
            for (
                let iy = firstFrom(ys, box.y - pad + 0.5);
                iy < ny && ys[iy] < box.y + box.h + pad;
                iy++
            ) {
                for (
                    let ix = firstFrom(xs, box.x - pad + 0.5);
                    ix < nx && xs[ix] < box.x + box.w + pad;
                    ix++
                ) {
                    into[iy * nx + ix] = index
                }
            }
        }
        const inBox = new Int16Array(nx * ny).fill(-1)
        boxes.forEach((item, index) => {
            fill(inBox, item.box, index, 0)
        })
        const inTag = new Int16Array(nx * ny).fill(-1)
        tags.forEach((item, index) => {
            fill(inTag, item.words ?? item.box, index, 2)
        })

        // Which connector runs along each stretch of the lattice:
        // sideways from a point to the next (useH), and down (useV)
        const useH = new Int32Array(nx * ny)
        const useV = new Int32Array(nx * ny)
        const mark = (index: number, path: Point[]) => {
            for (let i = 1; i < path.length; i++) {
                const p = path[i - 1]
                const q = path[i]
                if (Math.abs(p.y - q.y) < 0.5) {
                    const iy = nearest(ys, p.y)
                    if (Math.abs(ys[iy] - p.y) > STEP / 2 + 1) continue
                    const from = nearest(xs, Math.min(p.x, q.x))
                    const to = nearest(xs, Math.max(p.x, q.x))
                    for (let ix = from; ix < to; ix++) {
                        if (!useH[iy * nx + ix]) useH[iy * nx + ix] = index + 1
                    }
                } else if (Math.abs(p.x - q.x) < 0.5) {
                    const ix = nearest(xs, p.x)
                    if (Math.abs(xs[ix] - p.x) > STEP / 2 + 1) continue
                    const from = nearest(ys, Math.min(p.y, q.y))
                    const to = nearest(ys, Math.max(p.y, q.y))
                    for (let iy = from; iy < to; iy++) {
                        if (!useV[iy * nx + ix]) useV[iy * nx + ix] = index + 1
                    }
                }
            }
        }

        // Where a path can leave a shape or reach it: on each side, at
        // the lines of the lattice that meet the side
        interface Dock {
            at: number
            way: number
            point: Point
            cost: number
        }
        const docksOf = (item: Item, wanted: Side | null): Dock[] => {
            const { x, y, w, h } = item.box
            const c = centreOf(item.box)
            const docks: Dock[] = []
            const along = (
                side: Side,
                values: number[],
                lo: number,
                size: number,
                middle: number,
                make: (i: number, off: number) => Dock | null,
            ) => {
                const inset = Math.min(10, size * 0.25)
                const centreLine = nearest(values, middle)
                for (
                    let i = firstFrom(values, lo + inset);
                    i < values.length;
                    i++
                ) {
                    if (values[i] > lo + size - inset) break
                    if (item.centred && i !== centreLine) continue
                    const dock = make(i, Math.abs(values[i] - middle))
                    if (!dock) continue
                    dock.cost += wanted && wanted !== side ? OTHER_SIDE : 0
                    docks.push(dock)
                }
            }
            const right = firstFrom(xs, x + w + LEAD)
            const left = firstFrom(xs, x - LEAD + 0.001) - 1
            const under = firstFrom(ys, y + h + LEAD)
            const above = firstFrom(ys, y - LEAD + 0.001) - 1
            along("right", ys, y, h, c.y, (iy, off) =>
                right < nx
                    ? {
                          at: iy * nx + right,
                          way: 0,
                          point: { x: x + w, y: ys[iy] },
                          cost: xs[right] - x - w + off * 0.6,
                      }
                    : null,
            )
            along("left", ys, y, h, c.y, (iy, off) =>
                left >= 0
                    ? {
                          at: iy * nx + left,
                          way: 2,
                          point: { x, y: ys[iy] },
                          cost: x - xs[left] + off * 0.6,
                      }
                    : null,
            )
            along("bottom", xs, x, w, c.x, (ix, off) =>
                under < ny
                    ? {
                          at: under * nx + ix,
                          way: 1,
                          point: { x: xs[ix], y: y + h },
                          cost: ys[under] - y - h + off * 0.6,
                      }
                    : null,
            )
            along("top", xs, x, w, c.x, (ix, off) =>
                above >= 0
                    ? {
                          at: above * nx + ix,
                          way: 3,
                          point: { x: xs[ix], y },
                          cost: y - ys[above] + off * 0.6,
                      }
                    : null,
            )
            return docks
        }

        // The cheapest path of one connector over the lattice
        const states = nx * ny * 4
        const best = new Float64Array(states)
        const round = new Int32Array(states)
        const before = new Int32Array(states)
        let search = 0
        const lead = (index: number): Point[] | null => {
            const line = lines[index]
            search += 1
            const allowed = boxes.map((box) => line.around.has(box))
            const shares = (use: number) => {
                if (use === 0 || use === index + 1) return true
                const other = lines[use - 1]
                // (two connectors from one shape, or into one, may run
                // together)
                return (other.a === line.a) !== (other.b === line.b)
            }
            const target = line.b.box
            const far = (at: number) => {
                const x = xs[at % nx]
                const y = ys[(at / nx) | 0]
                return (
                    Math.max(target.x - x, 0, x - target.x - target.w) +
                    Math.max(target.y - y, 0, y - target.y - target.h)
                )
            }
            const stand = (at: number) => {
                const box = inBox[at]
                const tag = inTag[at]
                return (
                    ground[at] +
                    (NEAR - gap[at]) * NEAR_COST +
                    (tag < 0
                        ? 0
                        : ownText(tags[tag], line)
                          ? 6
                          : THROUGH_TEXT) +
                    (box < 0 || allowed[box]
                        ? 0
                        : boxes[box].panel
                          ? THROUGH
                          : THROUGH_BOX)
                )
            }
            const wanted = (item: Item, end: "exit" | "entry") => {
                const port = portOf(endOf(item), line.cell.style, end)
                return port ? sideOf(item.box, port) : null
            }
            const starts = docksOf(line.a, wanted(line.a, "exit"))
            const goals = new Map<number, Dock>()
            for (const dock of docksOf(line.b, wanted(line.b, "entry"))) {
                goals.set(dock.at * 4 + ((dock.way + 2) & 3), dock)
            }
            if (starts.length === 0 || goals.size === 0) return null
            // (a heap of states by the cost so far plus the way still to
            // go)
            const keys: number[] = []
            const heap: number[] = []
            const push = (key: number, state: number) => {
                let i = heap.length
                heap.push(state)
                keys.push(key)
                while (i > 0) {
                    const up = (i - 1) >> 1
                    if (keys[up] <= key) break
                    heap[i] = heap[up]
                    keys[i] = keys[up]
                    i = up
                }
                heap[i] = state
                keys[i] = key
            }
            const pop = () => {
                const top = heap[0]
                const state = heap.pop() as number
                const key = keys.pop() as number
                const n = heap.length
                if (n > 0) {
                    let i = 0
                    for (;;) {
                        let kid = 2 * i + 1
                        if (kid >= n) break
                        if (kid + 1 < n && keys[kid + 1] < keys[kid]) kid += 1
                        if (keys[kid] >= key) break
                        heap[i] = heap[kid]
                        keys[i] = keys[kid]
                        i = kid
                    }
                    heap[i] = state
                    keys[i] = key
                }
                return top
            }
            const reachState = (state: number, cost: number, from: number) => {
                if (round[state] === search && best[state] <= cost) return
                round[state] = search
                best[state] = cost
                before[state] = from
                push(cost + far(state >> 2), state)
            }
            starts.forEach((dock, i) => {
                reachState(
                    dock.at * 4 + dock.way,
                    dock.cost + (stand(dock.at) * dock.cost) / STEP,
                    -1 - i,
                )
            })
            let done = Infinity
            let last = -1
            while (heap.length > 0) {
                const key = keys[0]
                const state = pop()
                if (key >= done) break
                const at = state >> 2
                const cost = best[state]
                if (key > cost + far(at) + 1e-6) continue
                const goal = goals.get(state)
                if (goal && cost + goal.cost < done) {
                    done = cost + goal.cost
                    last = state
                }
                const way = state & 3
                const ix = at % nx
                const iy = (at / nx) | 0
                for (const turn of [way, (way + 1) & 3, (way + 3) & 3]) {
                    const jx = ix + DX[turn]
                    const jy = iy + DY[turn]
                    if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue
                    const to = jy * nx + jx
                    const flat = (turn & 1) === 0
                    const length = flat
                        ? Math.abs(xs[jx] - xs[ix])
                        : Math.abs(ys[jy] - ys[iy])
                    const share = length / STEP
                    let next = cost + length + (turn === way ? 0 : BEND)
                    next += stand(to) * share
                    const use = flat
                        ? useH[iy * nx + Math.min(ix, jx)]
                        : useV[Math.min(iy, jy) * nx + ix]
                    if (!shares(use)) next += ALONG * share
                    // (across another connector)
                    const across = flat
                        ? [jy > 0 ? useV[(jy - 1) * nx + jx] : 0, useV[to]]
                        : [jx > 0 ? useH[to - 1] : 0, useH[to]]
                    if (!shares(across[0]) || !shares(across[1])) next += CROSS
                    reachState(to * 4 + turn, next, state)
                }
            }
            if (last < 0) return null
            const goal = goals.get(last) as Dock
            const path: Point[] = [goal.point]
            let state = last
            for (;;) {
                const at = state >> 2
                path.push({ x: xs[at % nx], y: ys[(at / nx) | 0] })
                const from = before[state]
                if (from < 0) {
                    path.push(starts[-1 - from].point)
                    break
                }
                state = from
            }
            return cornersOf(path.reverse())
        }

        // The shortest connectors first: they have the fewest ways to go.
        // Then each once more, now that the others have their paths
        const span = (line: Line) => {
            const p = centreOf(line.a.box)
            const q = centreOf(line.b.box)
            return Math.abs(p.x - q.x) + Math.abs(p.y - q.y)
        }
        const order = [...wrong].sort((p, q) => span(p) - span(q))
        for (let pass = 0; pass < 2; pass++) {
            for (const line of order) {
                if (pass === 1 && !line.led) continue
                const index = lines.indexOf(line)
                // (the paths of the others: of those that still wait for
                // a new one, the path as drawn is the problem)
                useH.fill(0)
                useV.fill(0)
                lines.forEach((other, i) => {
                    if (
                        i !== index &&
                        other.path &&
                        (other.led || !wrong.includes(other))
                    ) {
                        mark(i, other.path)
                    }
                })
                const path = lead(index)
                if (!path) continue
                const now = hits(line, path)
                const old = line.path ? hits(line, line.path) : Infinity
                // (a new path that is no better is not worth the change)
                if (line.led ? now > old : line.path ? now >= old : now > 0) {
                    continue
                }
                line.path = path
                line.led = true
            }
        }
        let left = overlaps
        let led = 0
        for (const line of wrong) {
            if (line.led) led += 1
            if (!line.path || hits(line, line.path) > 0) left += 1
        }

        // The texts: on the connector, from its middle outwards, at the
        // place where the least stands in the way
        const todo: (() => void)[] = []
        const wishes: Need[] = []
        const paths = lines.flatMap((line) => (line.path ? [line.path] : []))
        let moved = 0
        for (const line of lines) {
            const path = line.path
            if (!path) continue
            const total = lengthOf(path)
            for (const label of line.labels) {
                if (!line.led && !label.move) continue
                let pick = { score: Infinity, d: total / 2, dx: 0, dy: 0 }
                const stops: number[] = [total / 2]
                for (let off = 8; off <= total / 2 - 8; off += 8) {
                    stops.push(total / 2 + off, total / 2 - off)
                }
                for (const d of stops) {
                    const at = pointAt(path, d)
                    const shifts = at.upright
                        ? [0, label.w / 2 + 3, -label.w / 2 - 3].map((dx) => ({
                              dx,
                              dy: 0,
                          }))
                        : [0, -label.h / 2 - 2, label.h / 2 + 2].map((dy) => ({
                              dx: 0,
                              dy,
                          }))
                    for (const shift of shifts) {
                        const box = {
                            x: at.x + shift.dx - label.w / 2,
                            y: at.y + shift.dy - label.h / 2,
                            w: label.w,
                            h: label.h,
                        }
                        let score =
                            Math.abs(d - total / 2) / 400 +
                            inWay(shrink(box, -2), line, 0)
                        for (const other of paths) {
                            if (other === path) continue
                            for (let i = 1; i < other.length; i++) {
                                if (stretchInBox(other[i - 1], other[i], box)) {
                                    score += 3
                                }
                            }
                        }
                        if (shift.dx !== 0 || shift.dy !== 0) score += 0.5
                        if (score < pick.score) {
                            pick = { score, d, dx: shift.dx, dy: shift.dy }
                        }
                    }
                    if (pick.score < 0.5) break
                }
                const at = pointAt(path, pick.d)
                placed.push({
                    x: at.x + pick.dx - label.w / 2,
                    y: at.y + pick.dy - label.h / 2,
                    w: label.w,
                    h: label.h,
                })
                if (pick.score >= 10) {
                    left += 1
                    // Between two shapes side by side, or one above the
                    // other, room for the text would help
                    const p = line.a.drawn
                    const q = line.b.drawn
                    const gapX = Math.max(q.x - p.x - p.w, p.x - q.x - q.w)
                    const gapY = Math.max(q.y - p.y - p.h, p.y - q.y - q.h)
                    const a = centreOf(p)
                    const b = centreOf(q)
                    if (gapX > 0 && gapY <= 0 && label.w + 12 > gapX) {
                        wishes.push({
                            flat: true,
                            lo: Math.min(a.x, b.x),
                            hi: Math.max(a.x, b.x),
                            room: Math.min(160, label.w + 12) - gapX,
                        })
                    } else if (gapY > 0 && gapX <= 0 && label.h + 10 > gapY) {
                        wishes.push({
                            flat: false,
                            lo: Math.min(a.y, b.y),
                            hi: Math.max(a.y, b.y),
                            room: label.h + 10 - gapY,
                        })
                    }
                }
                if (!line.led) moved += 1
                const place = {
                    along: total === 0 ? 0 : (2 * pick.d) / total - 1,
                    dx: pick.dx,
                    dy: pick.dy,
                }
                todo.push(() => {
                    label.cell.inner.setAttribute(
                        "style",
                        withStyle(
                            label.cell.inner.getAttribute("style") ?? "",
                            {
                                align: null,
                                verticalAlign: null,
                                ...(styleValue(
                                    label.cell.style,
                                    "labelBackgroundColor",
                                ) === undefined
                                    ? { labelBackgroundColor: "default" }
                                    : {}),
                            },
                        ),
                    )
                    setLabelPlace(label.cell, place)
                })
            }
        }

        // A text beside a shape that one of the shape's connectors runs
        // through is moved off the connector, to the nearer side of it
        const writeBox = (item: Item) => {
            const parent = items.get(item.cell.parent)
            setBox(item.cell, {
                x: item.box.x - (parent?.box.x ?? 0),
                y: item.box.y - (parent?.box.y ?? 0),
                w: item.box.w,
                h: item.box.h,
            })
        }
        let aside = 0
        for (const tag of tags) {
            const words = tag.words ?? tag.box
            const cut = cutOf(tag)
            if (!cut) continue
            const c = centreOf(words)
            const upright = Math.abs(cut[0].x - cut[1].x) < 0.5
            const off = upright ? words.w / 2 + 4 : words.h / 2 + 4
            const lineAt = upright ? cut[0].x : cut[0].y
            const mid = upright ? c.x : c.y
            const sides = mid <= lineAt ? [-off, off] : [off, -off]
            for (const side of sides) {
                const shift = lineAt + side - mid
                const next = {
                    ...words,
                    x: words.x + (upright ? shift : 0),
                    y: words.y + (upright ? 0 : shift),
                }
                const free =
                    all.every(
                        (item) =>
                            item === tag ||
                            ((item.kids.length > 0 ||
                                !over(next, item.words ?? item.box, 0)) &&
                                !(item.area && over(next, item.area, 0))),
                    ) &&
                    placed.every((box) => !over(next, box, 0)) &&
                    paths.every((path) =>
                        path
                            .slice(1)
                            .every((p, i) => !stretchInBox(path[i], p, next)),
                    )
                if (!free) continue
                tag.box = {
                    ...tag.box,
                    x: tag.box.x + (upright ? shift : 0),
                    y: tag.box.y + (upright ? 0 : shift),
                }
                tag.words = next
                aside += 1
                todo.push(() => writeBox(tag))
                break
            }
        }

        const apply = (): string[] => {
            if (apart || grown > 0 || fitted > 0) {
                // The shapes, each counted from its parent's corner
                for (const cell of cells) {
                    const page = cell.vertex ? pageBox(cell) : null
                    const holder = byId.get(cell.parent)
                    if (!page || holder?.edge) continue
                    const parent = items.get(cell.parent)
                    if (holder?.vertex && !parent) continue
                    const item = items.get(cell.id)
                    if (item) {
                        writeBox(item)
                        continue
                    }
                    const c = centreOf(page)
                    setBox(cell, {
                        x: toX(c.x) - page.w / 2 - (parent?.box.x ?? 0),
                        y: toY(c.y) - page.h / 2 - (parent?.box.y ?? 0),
                    })
                }
            }
            if (apart) {
                // The corners and loose ends of every connector
                for (const cell of cells) {
                    if (!cell.edge || !cell.geometry) continue
                    const holder = byId.get(cell.parent)
                    const from = holder?.vertex ? pageBox(holder) : null
                    const now = items.get(cell.parent)?.box
                    const turn = (name: "x" | "y", point: Element) => {
                        const to = name === "x" ? toX : toY
                        const corner = from?.[name] ?? 0
                        const v = Number(point.getAttribute(name) ?? 0)
                        point.setAttribute(
                            name,
                            String(
                                Math.round(
                                    to(v + corner) -
                                        (now?.[name] ?? to(corner)),
                                ),
                            ),
                        )
                    }
                    for (const point of Array.from(
                        cell.geometry.querySelectorAll("mxPoint"),
                    )) {
                        if (point.getAttribute("as") === "offset") continue
                        turn("x", point)
                        turn("y", point)
                    }
                }
                for (const line of lines) {
                    if (line.led || line.way.length === 0) continue
                    setPoints(
                        line.cell,
                        line.way.map((p) => ({
                            x: p.x - line.origin.x,
                            y: p.y - line.origin.y,
                        })),
                    )
                }
            }
            for (const write of todo) write()
            // The new paths: the corners as waypoints, and the two ends as
            // places on the shapes. As an orthogonal connector draw.io
            // leads it through exactly these corners, and leads it anew
            // when the user moves a shape
            for (const line of lines) {
                if (!line.led || !line.path) continue
                const path = line.path
                const place = (item: Item, p: Point) => {
                    const part = (v: number) =>
                        String(Math.round(v * 1000) / 1000)
                    return {
                        x: part((p.x - item.box.x) / item.box.w),
                        y: part((p.y - item.box.y) / item.box.h),
                    }
                }
                const exit = place(line.a, path[0])
                const entry = place(line.b, path[path.length - 1])
                line.cell.inner.setAttribute(
                    "style",
                    withStyle(line.cell.inner.getAttribute("style") ?? "", {
                        edgeStyle: "orthogonalEdgeStyle",
                        elbow: null,
                        curved: null,
                        orthogonalLoop: null,
                        jettySize: null,
                        sourceJettySize: null,
                        targetJettySize: null,
                        exitX: exit.x,
                        exitY: exit.y,
                        exitDx: "0",
                        exitDy: "0",
                        exitPerimeter: null,
                        entryX: entry.x,
                        entryY: entry.y,
                        entryDx: "0",
                        entryDy: "0",
                        entryPerimeter: null,
                    }),
                )
                setPoints(
                    line.cell,
                    path.slice(1, -1).map((p) => ({
                        x: p.x - line.origin.x,
                        y: p.y - line.origin.y,
                    })),
                )
            }
            const said: string[] = []
            if (warpX.any || warpY.any) {
                said.push(
                    "The server moved shapes that stood on each other apart.",
                )
            }
            if (fitted > 0) {
                said.push(
                    `The server made ${fitted} shape${fitted === 1 ? "" : "s"} larger to hold ${fitted === 1 ? "its" : "their"} text.`,
                )
            }
            if (grown > 0) {
                said.push(
                    `The server made ${grown} box${grown === 1 ? "" : "es"} larger to hold the shapes drawn in ${grown === 1 ? "it" : "them"}.`,
                )
            }
            if (kx !== 1 || ky !== 1) {
                const way =
                    kx === ky ? "" : kx > ky ? " sideways" : " up and down"
                said.push(
                    `The server set the shapes ${Math.round((Math.max(kx, ky) - 1) * 100)}% further apart${way}, each at its size, to make room for the connectors and their texts.`,
                )
            }
            if (led > 0) {
                said.push(
                    `The server gave ${led} connector${led === 1 ? "" : "s"} that passed through a shape or a text a path around them.`,
                )
            }
            if (moved > 0) {
                said.push(
                    `The server moved ${moved} connector text${moved === 1 ? "" : "s"} that stood on a shape or on another text to a free place on the same connector.`,
                )
            }
            if (aside > 0) {
                said.push(
                    `The server moved ${aside} text${aside === 1 ? "" : "s"} that a connector ran through beside that connector.`,
                )
            }
            return said
        }
        return { left, wishes, apply }
    }

    // As drawn first; then, while problems are left, with the shapes set
    // further apart: every step further must be worth it
    const first = attempt(1, 1, [])
    if (!first) return []
    let pick = first
    let cost = first.left
    // Room where a connector has none for its text
    let more: Need[] = []
    if (first.wishes.length > 0) {
        const next = attempt(1, 1, first.wishes)
        if (next && next.left < cost) {
            pick = next
            cost = next.left
            more = first.wishes
        }
    }
    for (const [kx, ky] of SPREADS) {
        if (pick.left === 0) break
        const next = attempt(kx, ky, more)
        const price = next ? next.left + (kx * ky - 1) * 2 : Infinity
        if (next && price < cost) {
            pick = next
            cost = price
        }
    }
    return pick.apply()
}
