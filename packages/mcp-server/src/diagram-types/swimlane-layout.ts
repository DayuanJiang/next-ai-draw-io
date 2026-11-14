/**
 * The layout of a swimlane diagram a model drew: the steps keep their lane
 * and their order, and are put on a grid of rows and columns; the lanes are
 * sized around them; every connector between two steps gets a path through
 * the gaps of the grid (grid-route.ts) and its text a free place.
 *
 * Models place the steps well enough but leave the connectors to draw.io,
 * whose paths run through other steps as soon as a connector skips a row
 * or goes back: of 30 drawings of real requests, 16 had such a line.
 *
 * Works for lanes side by side and for lanes as rows (x and y swapped).
 */
import {
    type Box,
    boxOf,
    type Cell,
    readCells,
    roomFor,
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
    type GridNode,
    layoutGrid,
    type Side,
} from "./grid-route.ts"

const ANCHOR: Record<Side, [number, number]> = {
    top: [0.5, 0],
    bottom: [0.5, 1],
    left: [0, 0.5],
    right: [1, 0.5],
}
const TURNED: Record<Side, Side> = {
    top: "left",
    left: "top",
    bottom: "right",
    right: "bottom",
}

/** The gap between two rows or two columns of steps, and between the steps of two lanes */
const GAP = 40
const GAP_LANES = 80

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

/** What the layout changed, for the model; empty when the page is no swimlane diagram it can lay out */
export function layoutSwimlane(root: Element): string[] {
    const cells = readCells(root)
    const containers = cells.filter(
        (c) => c.vertex && styleHas(c.style, "swimlane") && boxOf(c),
    )
    const containerIds = new Set(containers.map((c) => c.id))
    const stepsOf = (lane: Cell) =>
        cells.filter(
            (c) =>
                c.parent === lane.id &&
                c.vertex &&
                !containerIds.has(c.id) &&
                boxOf(c),
        )
    // The lanes: the largest group of containers in one parent that hold steps
    let lanes: Cell[] = []
    for (const parent of new Set(containers.map((c) => c.parent))) {
        const group = containers.filter((c) => c.parent === parent)
        if (
            group.some((lane) => stepsOf(lane).length > 0) &&
            group.length > lanes.length
        ) {
            lanes = group
        }
    }
    if (lanes.length < 2) return []

    // Lanes as rows are laid out as lanes side by side with x and y swapped
    const turned =
        lanes.filter((l) => styleValue(l.style, "horizontal") === "0").length *
            2 >
        lanes.length
    const turn = (b: Box): Box =>
        turned ? { x: b.y, y: b.x, w: b.h, h: b.w } : b
    const laneBox = new Map(lanes.map((l) => [l.id, turn(boxOf(l) as Box)]))
    lanes.sort(
        (a, b) => (laneBox.get(a.id) as Box).x - (laneBox.get(b.id) as Box).x,
    )
    const title = Math.max(
        ...lanes.map((l) => Number(styleValue(l.style, "startSize") ?? 23)),
    )

    const steps: {
        cell: Cell
        lane: number
        box: Box
        cx: number
        cy: number
    }[] = []
    lanes.forEach((lane, index) => {
        const at = laneBox.get(lane.id) as Box
        for (const cell of stepsOf(lane)) {
            // A step is at least as large as its text needs
            const drawn = boxOf(cell) as Box
            const room = roomFor(cell, drawn)
            if (room.w > drawn.w || room.h > drawn.h) setBox(cell, room)
            const was = turn(drawn)
            steps.push({
                cell,
                lane: index,
                box: turn({ ...drawn, ...room }),
                // (its row and column are read from where it was drawn)
                cx: at.x + was.x + was.w / 2,
                cy: at.y + was.y + was.h / 2,
            })
        }
    })
    const stepIds = new Set(steps.map((s) => s.cell.id))
    const lines = cells.filter(
        (c) =>
            c.edge &&
            c.source !== c.target &&
            stepIds.has(c.source ?? "") &&
            stepIds.has(c.target ?? ""),
    )
    if (steps.length < 2 || lines.length === 0) return []
    // Shapes under the lanes that steps are connected to: a bar across all
    // lanes, an end node. Their lines run down a gap and out of the lanes
    const laneIds = new Set(lanes.map((l) => l.id))
    const drawnBottom = Math.max(...[...laneBox.values()].map((b) => b.y + b.h))
    const isUnder = (c: Cell) => {
        const box = boxOf(c)
        return (
            c.vertex &&
            c.parent === lanes[0].parent &&
            !laneIds.has(c.id) &&
            box !== null &&
            turn(box).y >= drawnBottom - 5
        )
    }
    const linesOut = cells.filter((c) => {
        if (!c.edge) return false
        const a = cells.find((o) => o.id === c.source)
        const b = cells.find((o) => o.id === c.target)
        return (
            (stepIds.has(c.source ?? "") && b !== undefined && isUnder(b)) ||
            (stepIds.has(c.target ?? "") && a !== undefined && isUnder(a))
        )
    })
    const under = cells
        .filter(
            (c) =>
                isUnder(c) &&
                linesOut.some((l) => l.source === c.id || l.target === c.id),
        )
        .sort((a, b) => turn(boxOf(a) as Box).y - turn(boxOf(b) as Box).y)

    // Rows over all lanes, columns inside each lane
    const rowOf = groupsOf(
        steps.map((s) => s.cy),
        Math.max(20, median(steps.map((s) => s.box.h)) / 2),
    )
    const nearX = Math.max(30, median(steps.map((s) => s.box.w)) * 0.4)
    const firstCol: number[] = []
    let cols = 0
    const colOf = new Array<number>(steps.length).fill(0)
    lanes.forEach((_, index) => {
        firstCol.push(cols)
        const own = steps.map((s, i) => (s.lane === index ? i : -1))
        const inLane = own.filter((i) => i >= 0)
        const groups = groupsOf(
            inLane.map((i) => steps[i].cx),
            nearX,
        )
        inLane.forEach((i, k) => {
            colOf[i] = cols + groups[k]
        })
        cols += Math.max(1, ...groups.map((g) => g + 1))
    })
    // Two steps in one place: the lower one gets a row of its own
    const seen = new Set<string>()
    const rows = rowOf.map((r) => r as number)
    steps
        .map((_, i) => i)
        .sort((a, b) => steps[a].cy - steps[b].cy)
        .forEach((i) => {
            while (seen.has(`${colOf[i]},${rows[i]}`)) rows[i] += 0.25
            seen.add(`${colOf[i]},${rows[i]}`)
        })
    const rank = [...new Set(rows)].sort((a, b) => a - b)

    const nodes: GridNode[] = steps.map((s, i) => ({
        id: s.cell.id,
        col: colOf[i],
        row: rank.indexOf(rows[i]),
        w: s.box.w,
        h: s.box.h,
        diamond: styleHas(s.cell.style, "rhombus"),
    }))
    // A line to a shape under the lanes ends, for the grid, at a point
    // under the column of its step, in a row of its own below all steps
    const stepRows = rank.length
    const outPoint = (line: Cell) => {
        const inside = stepIds.has(line.source ?? "")
            ? line.source
            : line.target
        const outside = inside === line.source ? line.target : line.source
        const col = (nodes.find((n) => n.id === inside) as GridNode).col
        const id = `${outside} under ${col}`
        if (!nodes.some((n) => n.id === id)) {
            nodes.push({
                id,
                col,
                row: stepRows + under.findIndex((c) => c.id === outside),
                w: 2,
                h: 2,
                diamond: false,
            })
        }
        return id
    }
    const fontSize = (c: Cell) => Number(styleValue(c.style, "fontSize") ?? 11)
    const sizeOf = (c: Cell) => {
        const size = textSize(textOf(c), fontSize(c))
        return turned ? { w: size.h, h: size.w } : { w: size.w, h: size.h }
    }
    const texts = new Map<string, Cell[]>()
    const outPoints = new Map<string, string>()
    const edges: GridEdge[] = [...lines, ...linesOut].map((line) => {
        const own = textOf(line) ? [line] : []
        const onIt = cells.filter(
            (c) => c.parent === line.id && c.vertex && textOf(c),
        )
        texts.set(line.id, [...own, ...onIt])
        if (linesOut.includes(line)) outPoints.set(line.id, outPoint(line))
        const end = (id: string | null) =>
            stepIds.has(id ?? "")
                ? (id as string)
                : (outPoints.get(line.id) as string)
        return {
            id: line.id,
            source: end(line.source),
            target: end(line.target),
            labels: [...own, ...onIt].map(sizeOf),
        }
    })

    // A lane is at least as wide as its name is long
    const minColW = new Array<number>(cols).fill(0)
    lanes.forEach((lane, index) => {
        const count = (firstCol[index + 1] ?? cols) - firstCol[index]
        const size = Number(styleValue(lane.style, "fontSize") ?? 12)
        const name = textSize(textOf(lane), size).w * 1.1 + 24
        const each = Math.max(0, (name - GAP_LANES - (count - 1) * GAP) / count)
        minColW.fill(each, firstCol[index], firstCol[index] + count)
    })
    const grid = layoutGrid(nodes, edges, {
        rowGap: GAP,
        colGap: GAP,
        boundaries: new Set(firstCol.slice(1)),
        boundaryGap: GAP_LANES,
        outerRowGap: 24,
        outerColGap: GAP_LANES / 2,
        track: 12,
        cols,
        emptyColW: 140,
        minColW,
    })

    // Back into the page: the lanes around their columns, the steps counted
    // from their lane's corner, the lines in the space of the lanes' parent
    const boxes = [...laneBox.values()]
    const x0 = Math.min(...boxes.map((b) => b.x))
    const y0 = Math.min(...boxes.map((b) => b.y))
    const oldRight = Math.max(...boxes.map((b) => b.x + b.w))
    const oldBottom = Math.max(...boxes.map((b) => b.y + b.h))
    const middle = (gap: number) => grid.gapX[gap] + grid.gapW[gap] / 2
    // (the lanes end under the gap below the last row of steps)
    const height =
        under.length > 0
            ? grid.gapY[stepRows] + grid.gapH[stepRows]
            : grid.height
    const newLane: Box[] = lanes.map((_, index) => {
        const last = (firstCol[index + 1] ?? cols) - 1
        const left = index === 0 ? 0 : middle(firstCol[index])
        const right = last === cols - 1 ? grid.width : middle(last + 1)
        return { x: x0 + left, y: y0, w: right - left, h: title + height }
    })
    // The shapes under the lanes: a wide one spans the lanes, a small one
    // stands under the columns of its steps
    const underBox = new Map<string, Box>()
    let below = y0 + title + height + 20
    for (const cell of under) {
        const box = turn(boxOf(cell) as Box)
        const wide = box.w >= (oldRight - x0) * 0.6
        const own = nodes.filter((n) => n.id.startsWith(`${cell.id} under `))
        const centre =
            own.reduce(
                (sum, n) => sum + (grid.nodes.get(n.id) as { x: number }).x + 1,
                0,
            ) / own.length
        const placed = {
            x: wide ? x0 : x0 + centre - box.w / 2,
            y: below,
            w: wide ? grid.width : box.w,
            h: box.h,
        }
        underBox.set(cell.id, placed)
        setBox(cell, turn(placed))
        below += box.h + 20
    }
    lanes.forEach((lane, index) => {
        setBox(lane, turn(newLane[index]))
    })
    steps.forEach((s) => {
        const at = grid.nodes.get(s.cell.id)
        if (!at) return
        const lane = newLane[s.lane]
        const place = turn({
            x: x0 + at.x - lane.x,
            y: y0 + title + at.y - lane.y,
            w: 0,
            h: 0,
        })
        setBox(s.cell, { x: place.x, y: place.y })
    })
    const point = (p: { x: number; y: number }) =>
        turned
            ? { x: y0 + title + p.y, y: x0 + p.x }
            : { x: x0 + p.x, y: y0 + title + p.y }
    for (const line of [...lines, ...linesOut]) {
        const route = grid.edges.get(line.id)
        if (!route) continue
        let exit = ANCHOR[turned ? TURNED[route.exit] : route.exit]
        let entry = ANCHOR[turned ? TURNED[route.entry] : route.entry]
        let corners = route.points
        const outId = outPoints.get(line.id)
        if (outId) {
            // The end at the shape under the lanes: on its upper side,
            // straight under the last stretch of the line
            const fromStep = stepIds.has(line.source ?? "")
            const shape = underBox.get(
                (fromStep ? line.target : line.source) as string,
            ) as Box
            const middleX = (grid.nodes.get(outId) as { x: number }).x + 1
            const leavesBeside = route.exit === "left" || route.exit === "right"
            const x =
                !fromStep && leavesBeside && corners.length > 0
                    ? corners[0].x
                    : middleX
            if (!fromStep && leavesBeside) corners = corners.slice(1)
            const share = Math.min(
                0.98,
                Math.max(0.02, (x0 + x - shape.x) / shape.w),
            )
            const anchor: [number, number] = turned ? [0, share] : [share, 0]
            if (fromStep) entry = anchor
            else exit = anchor
        }
        const labelled = (texts.get(line.id) ?? []).length > 0
        line.inner.setAttribute(
            "style",
            withStyle(line.style, {
                edgeStyle: null,
                elbow: null,
                curved: null,
                orthogonalLoop: null,
                jettySize: null,
                exitPerimeter: null,
                entryPerimeter: null,
                exitX: String(exit[0]),
                exitY: String(exit[1]),
                exitDx: "0",
                exitDy: "0",
                entryX: String(entry[0]),
                entryY: String(entry[1]),
                entryDx: "0",
                entryDy: "0",
                ...(labelled &&
                styleValue(line.style, "labelBackgroundColor") === undefined
                    ? { labelBackgroundColor: "default" }
                    : {}),
            }),
        )
        line.inner.setAttribute("parent", lanes[0].parent)
        setPoints(line, corners.map(point))
        const ownText = textOf(line) !== ""
        if (!ownText) setLabelPlace(line, null)
        ;(texts.get(line.id) ?? []).forEach((cell, i) => {
            const at = route.labels[i]
            setLabelPlace(
                cell,
                turned ? { along: at.along, dx: at.dy, dy: at.dx } : at,
            )
        })
    }

    // What stood right of the lanes or below them moves with their new size,
    // and a pool around the lanes grows with them
    const grownX = x0 + grid.width - oldRight
    const grownY = below - 20 - oldBottom
    for (const cell of cells) {
        const box = boxOf(cell)
        if (
            !box ||
            cell.parent !== lanes[0].parent ||
            laneIds.has(cell.id) ||
            underBox.has(cell.id)
        ) {
            continue
        }
        const at = turn(box)
        const moved = {
            x: at.x >= oldRight - 5 ? at.x + grownX : at.x,
            y: at.y >= oldBottom - 5 ? at.y + grownY : at.y,
            w: 0,
            h: 0,
        }
        if (moved.x !== at.x || moved.y !== at.y) {
            const back = turn(moved)
            setBox(cell, { x: back.x, y: back.y })
        }
    }
    // A title over the lanes stays over all of them
    const before = turn({ x: x0, y: y0, w: oldRight - x0, h: oldBottom - y0 })
    const after = turn({ x: x0, y: y0, w: grid.width, h: title + height })
    for (const cell of cells) {
        const box = boxOf(cell)
        if (!box || cell.parent !== lanes[0].parent || laneIds.has(cell.id)) {
            continue
        }
        const over =
            Math.min(box.x + box.w, before.x + before.w) -
            Math.max(box.x, before.x)
        if (box.y + box.h <= before.y + 5 && over >= before.w / 2) {
            setBox(cell, { x: after.x, w: after.w })
        }
    }
    const pool = cells.find((c) => c.id === lanes[0].parent)
    const poolBox = pool && boxOf(pool)
    if (pool && poolBox) {
        const at = turn(poolBox)
        setBox(
            pool,
            turn({
                ...at,
                w: at.w + grownX,
                h: at.h + y0 + title + height - oldBottom,
            }),
        )
    }

    return [
        `The server placed the ${steps.length} steps on the grid of their lanes and gave the ${lines.length + linesOut.length} connectors paths through the gaps between them, so no line crosses a step.`,
    ]
}
