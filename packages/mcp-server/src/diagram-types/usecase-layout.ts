/**
 * The layout of a use case diagram a model drew: the actors and use cases
 * keep their rows and columns and are spaced evenly, the system's box is
 * sized around its use cases, and a line that would run through another
 * shape or through an actor's name gets a path around it (grid-route.ts).
 * The other lines stay straight, as a use case diagram has them.
 *
 * With an actor on each side and three columns of use cases, a straight
 * line to the far column crosses the near one: of 24 drawings of real
 * requests, 12 had such a line.
 */
import {
    type Box,
    boxOf,
    type Cell,
    readCells,
    setBox,
    setLabelPlace,
    setPoints,
    styleHas,
    styleValue,
    textOf,
    textSize,
    withStyle,
} from "./cells.ts"
import {
    type GridEdge,
    type GridLayout,
    type GridNode,
    layoutGrid,
    type Side,
    stretchInBox,
} from "./grid-route.ts"

/** The room under an actor's figure that its name takes */
const NAME = 22
/** Between two columns, where the texts of the lines stand; between two rows */
const COLUMN_GAP = 90
const ROW_GAP = 26
/** Around the border of the system's box */
const BORDER_GAP = 100

// The grid's flow runs downwards; a use case diagram reads from left to
// right, so it is laid out with x and y swapped. A side there is this side
// on the page
const ON_PAGE: Record<Side, Side> = {
    top: "left",
    left: "top",
    bottom: "right",
    right: "bottom",
}

/** The group of each value: values closer than `near` to a group's first one join it */
function groupsOf(values: number[], near: number): number[] {
    const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b])
    const group = new Array<number>(values.length).fill(0)
    let current = -1
    let first = Number.NEGATIVE_INFINITY
    for (const i of order) {
        if (values[i] - first > near) {
            current += 1
            first = values[i]
        }
        group[i] = current
    }
    return group
}

const median = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0

interface Shape {
    cell: Cell
    actor: boolean
    /** As drawn, in the space of the system's parent */
    drawn: Box
    /** A text cell under an actor's figure that is its name */
    name: Cell | null
    /** The place it takes in the grid: an actor with its name under it */
    w: number
    h: number
    col: number
    row: number
}

/** What the layout changed, for the model; empty when the page is no use case diagram it can lay out */
export function layoutUsecase(root: Element): string[] {
    const cells = readCells(root)
    const byId = new Map(cells.map((c) => [c.id, c]))
    const actors = cells.filter(
        (c) =>
            c.vertex && styleValue(c.style, "shape") === "umlActor" && boxOf(c),
    )
    const ovals = cells.filter(
        (c) =>
            c.vertex && styleHas(c.style, "ellipse") && boxOf(c) && textOf(c),
    )
    if (actors.length === 0 || ovals.length < 2) return []

    // The system: the one container the use cases are children of
    const parents = [...new Set(ovals.map((c) => c.parent))].filter((id) => {
        const parent = byId.get(id)
        return parent?.vertex && boxOf(parent)
    })
    if (parents.length > 1) return []
    const frame = parents.length === 1 ? (byId.get(parents[0]) as Cell) : null
    const space = frame ? frame.parent : ovals[0].parent
    const frameAt = frame ? (boxOf(frame) as Box) : { x: 0, y: 0, w: 0, h: 0 }
    const inSpace = (c: Cell): Box | null => {
        const box = boxOf(c) as Box
        if (c.parent === space) return box
        if (frame && c.parent === frame.id) {
            return { ...box, x: box.x + frameAt.x, y: box.y + frameAt.y }
        }
        return null
    }

    // A figure drawn without a text, with its name as a text cell under it
    const ends = new Set(cells.flatMap((c) => [c.source, c.target]))
    const loose = cells.filter(
        (c) =>
            c.vertex &&
            c.parent === space &&
            c !== frame &&
            !actors.includes(c) &&
            !ovals.includes(c) &&
            !ends.has(c.id) &&
            boxOf(c) &&
            textOf(c),
    )
    const nameOf = (actor: Cell, at: Box): Cell | null => {
        if (textOf(actor)) return null
        const under = loose.filter((c) => {
            const box = boxOf(c) as Box
            const middle = box.x + box.w / 2
            return (
                middle > at.x - 40 &&
                middle < at.x + at.w + 40 &&
                box.y > at.y + at.h - 8 &&
                box.y < at.y + at.h + 30
            )
        })
        return under[0] ?? null
    }

    const shapes: Shape[] = []
    for (const cell of [...actors, ...ovals]) {
        const drawn = inSpace(cell)
        if (!drawn) return []
        const actor = actors.includes(cell)
        const name = actor ? nameOf(cell, drawn) : null
        const text = actor ? textSize(textOf(name ?? cell), 12) : null
        // An actor's name stands under its figure, on one line: drawn on
        // the figure it would not fit in it
        if (
            actor &&
            textOf(cell) &&
            styleValue(cell.style, "verticalLabelPosition") !== "bottom"
        ) {
            cell.style = withStyle(cell.style, {
                verticalLabelPosition: "bottom",
                verticalAlign: "top",
                whiteSpace: null,
            })
            cell.inner.setAttribute("style", cell.style)
        }
        shapes.push({
            cell,
            actor,
            drawn,
            name,
            w: text ? Math.max(drawn.w, text.w) : drawn.w,
            h: text ? drawn.h + NAME : drawn.h,
            col: 0,
            row: 0,
        })
    }
    const ovalShapes = shapes.filter((s) => !s.actor)
    const columns = groupsOf(
        shapes.map((s) => s.drawn.x + s.drawn.w / 2),
        Math.max(30, median(ovalShapes.map((s) => s.w)) * 0.4),
    )
    const rowsDrawn = groupsOf(
        shapes.map((s) => s.drawn.y + s.drawn.h / 2),
        Math.max(15, median(ovalShapes.map((s) => s.h)) * 0.45),
    )
    // Two shapes in one place: the lower one gets a row of its own
    const seen = new Set<string>()
    const rowValue = rowsDrawn.map((r) => r as number)
    shapes
        .map((_, i) => i)
        .sort((a, b) => shapes[a].drawn.y - shapes[b].drawn.y)
        .forEach((i) => {
            while (seen.has(`${columns[i]},${rowValue[i]}`)) rowValue[i] += 0.25
            seen.add(`${columns[i]},${rowValue[i]}`)
        })
    const rank = [...new Set(rowValue)].sort((a, b) => a - b)
    shapes.forEach((s, i) => {
        s.col = columns[i]
        s.row = rank.indexOf(rowValue[i])
    })
    const shapeOf = new Map(shapes.map((s) => [s.cell.id, s]))

    const lines = cells.filter(
        (c) =>
            c.edge &&
            c.source !== c.target &&
            shapeOf.has(c.source ?? "") &&
            shapeOf.has(c.target ?? ""),
    )
    if (lines.length === 0) return []
    const texts = new Map<string, Cell[]>()
    for (const line of lines) {
        const own = textOf(line) ? [line] : []
        const onIt = cells.filter(
            (c) => c.parent === line.id && c.vertex && textOf(c),
        )
        texts.set(line.id, [...own, ...onIt])
    }
    // The grid leads a line best from an earlier column to a later one;
    // which end of a line is its source makes no difference to its path
    const turnedRound = (line: Cell) =>
        (shapeOf.get(line.source as string) as Shape).col >
        (shapeOf.get(line.target as string) as Shape).col
    const gridEdge = (line: Cell, straight: boolean): GridEdge => {
        const round = turnedRound(line)
        return {
            id: line.id,
            source: (round ? line.target : line.source) as string,
            target: (round ? line.source : line.target) as string,
            labels: (texts.get(line.id) ?? []).map((c) => {
                const size = textSize(
                    textOf(c),
                    Number(styleValue(c.style, "fontSize") ?? 11),
                )
                return { w: size.h, h: size.w }
            }),
            straight,
        }
    }
    const nodes: GridNode[] = shapes.map((s) => ({
        id: s.cell.id,
        col: s.row,
        row: s.col,
        w: s.h,
        h: s.w,
        diamond: false,
    }))

    // The system's box: its border lies in the middle of the gaps around
    // its use cases, and its name has room above the first row
    const title = frame ? Number(styleValue(frame.style, "startSize") ?? 23) : 0
    const framed = frame ? ovalShapes : []
    const first = (pick: (s: Shape) => number) => Math.min(...framed.map(pick))
    const last = (pick: (s: Shape) => number) =>
        Math.max(...framed.map(pick)) + 1
    const leftGap = frame ? first((s) => s.col) : -1
    const rightGap = frame ? last((s) => s.col) : -1
    const topGap = frame ? first((s) => s.row) : -1
    const bottomGap = frame ? last((s) => s.row) : -1
    const options = {
        rowGap: COLUMN_GAP,
        colGap: ROW_GAP,
        boundaries: new Set(frame ? [bottomGap] : []),
        rowBoundaries: new Set(frame ? [leftGap, rightGap] : []),
        boundaryGap: BORDER_GAP,
        minColGap: new Map(frame ? [[topGap, title + 60]] : []),
        outerRowGap: 20,
        outerColGap: 20,
        track: 12,
    }
    const x0 = Math.min(
        ...shapes.map((s) => s.drawn.x),
        frame ? frameAt.x : Infinity,
    )
    const y0 = Math.min(
        ...shapes.map((s) => s.drawn.y),
        frame ? frameAt.y : Infinity,
    )

    // Lines stay straight; the ones that would cross a shape or the name of
    // their own actor get a path. A new path can move the shapes, so look
    // again until none crosses
    const elbows = lines.filter((l) =>
        /edgeStyle=(orthogonal|elbow)/.test(l.style),
    )
    const led = new Set<string>(
        elbows.length * 2 > lines.length ? lines.map((l) => l.id) : [],
    )
    let grid: GridLayout = layoutGrid(nodes, [], options)
    const placeOf = (s: Shape): Box => {
        const at = grid.nodes.get(s.cell.id) as { x: number; y: number }
        return { x: x0 + at.y, y: y0 + at.x, w: s.w, h: s.h }
    }
    for (let pass = 0; pass < 4; pass++) {
        grid = layoutGrid(
            nodes,
            lines.map((l) => gridEdge(l, !led.has(l.id))),
            options,
        )
        const places = new Map(shapes.map((s) => [s.cell.id, placeOf(s)]))
        const middle = (id: string) => {
            const s = shapeOf.get(id) as Shape
            const at = places.get(id) as Box
            return { x: at.x + at.w / 2, y: at.y + s.drawn.h / 2 }
        }
        let more = false
        for (const line of lines) {
            if (led.has(line.id)) continue
            const a = middle(line.source as string)
            const b = middle(line.target as string)
            const hit = shapes.some((s) => {
                const at = places.get(s.cell.id) as Box
                if (s.cell.id === line.source || s.cell.id === line.target) {
                    // (its own actor's name, under the figure)
                    return (
                        s.actor &&
                        stretchInBox(a, b, {
                            x: at.x,
                            y: at.y + s.drawn.h + 2,
                            w: at.w,
                            h: NAME - 2,
                        })
                    )
                }
                // (an oval is measured by the box inside it)
                const box = s.actor
                    ? at
                    : {
                          x: at.x + at.w * 0.12,
                          y: at.y + at.h * 0.12,
                          w: at.w * 0.76,
                          h: at.h * 0.76,
                      }
                return stretchInBox(a, b, box)
            })
            if (hit) {
                led.add(line.id)
                more = true
            }
        }
        if (!more) break
    }

    // Back into the page
    const gapX = (i: number) => x0 + grid.gapY[i]
    const gapY = (i: number) => y0 + grid.gapX[i]
    const drawnRight = Math.max(
        ...shapes.map((s) => s.drawn.x + s.drawn.w),
        frame ? frameAt.x + frameAt.w : -Infinity,
    )
    const drawnBottom = Math.max(
        ...shapes.map((s) => s.drawn.y + s.drawn.h),
        frame ? frameAt.y + frameAt.h : -Infinity,
    )
    let frameNow = frameAt
    if (frame) {
        const left =
            leftGap === 0 ? gapX(0) + 4 : gapX(leftGap) + grid.gapH[leftGap] / 2
        const right =
            rightGap === grid.gapY.length - 1
                ? gapX(rightGap) + grid.gapH[rightGap] - 4
                : gapX(rightGap) + grid.gapH[rightGap] / 2
        const top = gapY(topGap) + grid.gapW[topGap] - title - 16
        const bottom =
            bottomGap === grid.gapX.length - 1
                ? gapY(bottomGap) + grid.gapW[bottomGap] - 4
                : gapY(bottomGap) + grid.gapW[bottomGap] / 2
        frameNow = { x: left, y: top, w: right - left, h: bottom - top }
        setBox(frame, frameNow)
    }
    const cellPlace = new Map<string, Box>()
    for (const s of shapes) {
        const at = placeOf(s)
        // (the figure stands in the middle over its name)
        const cell = {
            x: at.x + (s.w - s.drawn.w) / 2,
            y: at.y,
            w: s.drawn.w,
            h: s.drawn.h,
        }
        cellPlace.set(s.cell.id, cell)
        const inFrame = frame && s.cell.parent === frame.id
        setBox(s.cell, {
            x: cell.x - (inFrame ? frameNow.x : 0),
            y: cell.y - (inFrame ? frameNow.y : 0),
        })
        if (s.name) {
            const text = boxOf(s.name) as Box
            setBox(s.name, {
                x: at.x + (s.w - text.w) / 2,
                y: cell.y + cell.h + 2,
            })
        }
    }
    // What stood right of the diagram or below it moves with its new size
    const names = new Set(shapes.map((s) => s.name?.id))
    for (const cell of loose) {
        if (names.has(cell.id)) continue
        const box = boxOf(cell) as Box
        setBox(cell, {
            x:
                box.x >= drawnRight - 5
                    ? box.x + x0 + grid.height - drawnRight
                    : box.x,
            y:
                box.y >= drawnBottom - 5
                    ? box.y + y0 + grid.width - drawnBottom
                    : box.y,
        })
    }

    // With a shape above the box, lines come down through the band of its
    // name: the name stands in the middle, at the left or at the right,
    // where none of them crosses it
    if (frame && topGap > 0) {
        const size = Number(styleValue(frame.style, "fontSize") ?? 12)
        const width = textSize(textOf(frame), size).w * 1.15 + 8
        const middleOf = (id: string) => {
            const cell = cellPlace.get(id) as Box
            return { x: cell.x + cell.w / 2, y: cell.y + cell.h / 2 }
        }
        const paths = lines.map((line) => [
            middleOf(line.source as string),
            ...(grid.edges.get(line.id)?.points ?? []).map((q) => ({
                x: x0 + q.y,
                y: y0 + q.x,
            })),
            middleOf(line.target as string),
        ])
        const spots: [string, number][] = [
            ["center", frameNow.x + (frameNow.w - width) / 2],
            ["left", frameNow.x + 8],
            ["right", frameNow.x + frameNow.w - width - 8],
        ]
        const free = spots.find(([, x]) => {
            const band = { x, y: frameNow.y, w: width, h: title }
            return !paths.some((path) =>
                path.some(
                    (q, i) => i > 0 && stretchInBox(path[i - 1], q, band),
                ),
            )
        })
        if (free && free[0] !== "center") {
            frame.inner.setAttribute(
                "style",
                withStyle(frame.style, {
                    align: free[0],
                    spacingLeft: "8",
                    spacingRight: "8",
                }),
            )
        }
    }

    const NO_PORTS = {
        edgeStyle: null,
        elbow: null,
        curved: null,
        orthogonalLoop: null,
        jettySize: null,
        exitX: null,
        exitY: null,
        exitDx: null,
        exitDy: null,
        exitPerimeter: null,
        entryX: null,
        entryY: null,
        entryDx: null,
        entryDy: null,
        entryPerimeter: null,
    }
    /** Where a line meets its shape: the middle of that side of the shape's place in the grid */
    const port = (id: string, side: Side) => {
        const s = shapeOf.get(id) as Shape
        const at = placeOf(s)
        const cell = cellPlace.get(id) as Box
        const p = {
            x:
                at.x +
                (side === "left" ? 0 : side === "right" ? at.w : at.w / 2),
            y:
                at.y +
                (side === "top" ? 0 : side === "bottom" ? at.h : at.h / 2),
        }
        const round = (v: number) => String(Math.round(v * 1000) / 1000)
        return {
            x: round((p.x - cell.x) / cell.w),
            y: round((p.y - cell.y) / cell.h),
            // (an actor's place reaches below its figure, where its name is)
            free: s.actor,
        }
    }
    for (const line of lines) {
        const route = grid.edges.get(line.id)
        const labels = texts.get(line.id) ?? []
        if (!route) {
            line.inner.setAttribute("style", withStyle(line.style, NO_PORTS))
            setPoints(line, [])
            if (!textOf(line)) setLabelPlace(line, null)
            for (const cell of labels) {
                setLabelPlace(cell, { along: 0, dx: 0, dy: 0 })
            }
            continue
        }
        const round = turnedRound(line)
        const exit = port(
            line.source as string,
            ON_PAGE[round ? route.entry : route.exit],
        )
        const entry = port(
            line.target as string,
            ON_PAGE[round ? route.exit : route.entry],
        )
        line.inner.setAttribute(
            "style",
            withStyle(line.style, {
                ...NO_PORTS,
                exitX: exit.x,
                exitY: exit.y,
                exitDx: "0",
                exitDy: "0",
                ...(exit.free ? { exitPerimeter: "0" } : {}),
                entryX: entry.x,
                entryY: entry.y,
                entryDx: "0",
                entryDy: "0",
                ...(entry.free ? { entryPerimeter: "0" } : {}),
                ...(labels.length > 0 &&
                styleValue(line.style, "labelBackgroundColor") === undefined
                    ? { labelBackgroundColor: "default" }
                    : {}),
            }),
        )
        line.inner.setAttribute("parent", space)
        const points = route.points.map((p) => ({ x: x0 + p.y, y: y0 + p.x }))
        setPoints(line, round ? points.reverse() : points)
        if (!textOf(line)) setLabelPlace(line, null)
        labels.forEach((cell, i) => {
            const at = route.labels[i]
            setLabelPlace(cell, {
                along: round ? -at.along : at.along,
                dx: at.dy,
                dy: at.dx,
            })
        })
    }

    return [
        `The server spaced the ${ovalShapes.length} use cases and ${actors.length} actors evenly in the rows and columns they were drawn in${led.size > 0 ? ` and led ${led.size} of the ${lines.length} lines around the shapes they would have crossed` : ""}.`,
    ]
}
