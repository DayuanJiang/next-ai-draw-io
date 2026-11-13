/**
 * The layout of a sequence diagram a model drew: the lifelines are spaced
 * so that every message's text fits between them, every message gets a row
 * of its own that is as tall as its text, and a frame gets a row for its
 * title above its first message and is sized around its messages.
 *
 * Models keep the lifelines 100 to 200 px apart whatever the texts are, so
 * in drawings of real requests long texts ran over each other and over the
 * frames' titles: of 27 drawings, 12 had texts on texts.
 *
 * A drawing that already has the room it needs comes out as it was. One
 * with shapes on its lifelines (activation bars) is left alone.
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

/** The least distance between two rows, and between a text and the line above it */
const ROW = 40
const TEXT_GAP = 16

interface Message {
    cell: Cell
    from: number
    to: number
    /** Where it was drawn, for its place in the order */
    y: number
    text: Box
    /** Its line, counted from the top of the lifelines */
    line: number
}

interface Frame {
    cell: Cell
    drawn: Box
    tab: { w: number; h: number }
    /** The messages inside it, by their place in the order */
    first: number
    last: number
    /** Frames inside this one */
    depth: number
    title: Cell | null
    titleRoom: number
    top: number
    bottom: number
    left: number
    right: number
}

/** What the layout changed, for the model; empty when nothing had to move or the page is no sequence diagram it can lay out */
export function layoutSequence(root: Element): string[] {
    const cells = readCells(root)
    const lifelines = cells
        .filter(
            (c) =>
                c.vertex &&
                styleValue(c.style, "shape") === "umlLifeline" &&
                boxOf(c),
        )
        .sort((a, b) => (boxOf(a) as Box).x - (boxOf(b) as Box).x)
    if (lifelines.length < 2) return []
    const index = new Map(lifelines.map((l, i) => [l.id, i]))
    // (a shape on a lifeline holds messages of its own)
    if (cells.some((c) => c.vertex && index.has(c.parent))) return []
    const space = lifelines[0].parent
    const drawnLife = lifelines.map((l) => boxOf(l) as Box)
    const top = Math.min(...drawnLife.map((b) => b.y))
    const head = Number(styleValue(lifelines[0].style, "size") ?? 40)

    // A message to itself written without its ends, as models sometimes
    // write it: a line with waypoints just right of a lifeline is that
    // lifeline's
    let adopted = 0
    for (const cell of cells) {
        if (!cell.edge || (cell.source && cell.target)) continue
        const known = cell.source ?? cell.target
        const point = cell.geometry?.querySelector("Array mxPoint")
        if (!point || (known && !index.has(known))) continue
        const x = Number(point.getAttribute("x"))
        const at = known
            ? (index.get(known) as number)
            : drawnLife.findIndex((b) => {
                  const middle = b.x + b.w / 2
                  return x > middle && x <= middle + 80
              })
        if (at < 0) continue
        cell.source = lifelines[at].id
        cell.target = lifelines[at].id
        cell.inner.setAttribute("source", cell.source)
        cell.inner.setAttribute("target", cell.target)
        adopted += 1
    }

    // The messages in the order they were drawn in, from top to bottom
    const drawnY = (cell: Cell, before: number) => {
        const source = drawnLife[index.get(cell.source as string) as number]
        const share = styleValue(cell.style, "exitY")
        return share === undefined
            ? before + 0.001
            : source.y +
                  source.h * Number(share) +
                  Number(styleValue(cell.style, "exitDy") ?? 0)
    }
    const messages: Message[] = []
    for (const cell of cells) {
        if (
            !cell.edge ||
            !index.has(cell.source ?? "") ||
            !index.has(cell.target ?? "")
        ) {
            continue
        }
        const size = Number(styleValue(cell.style, "fontSize") ?? 11)
        messages.push({
            cell,
            from: index.get(cell.source as string) as number,
            to: index.get(cell.target as string) as number,
            y: drawnY(cell, messages[messages.length - 1]?.y ?? top + head),
            text: textOf(cell)
                ? textSize(textOf(cell), size)
                : { x: 0, y: 0, w: 0, h: 0 },
            line: 0,
        })
    }
    if (messages.length === 0) return []
    messages.sort((a, b) => a.y - b.y)
    // (the distance the drawing itself keeps between rows, when it is more)
    const gaps = messages.slice(1).map((m, i) => m.y - messages[i].y)
    const usual =
        [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? ROW
    const pitch = Math.min(80, Math.max(ROW, Math.round(usual)))

    // The frames, the messages each holds, and the text beside a frame's tab
    const frames: Frame[] = cells
        .filter(
            (c) =>
                c.vertex &&
                styleValue(c.style, "shape") === "umlFrame" &&
                c.parent === space &&
                boxOf(c),
        )
        .map((cell) => {
            const drawn = boxOf(cell) as Box
            const inside = messages
                .map((m, i) =>
                    m.y > drawn.y && m.y < drawn.y + drawn.h ? i : -1,
                )
                .filter((i) => i >= 0)
            return {
                cell,
                drawn,
                tab: {
                    w: Number(styleValue(cell.style, "width") ?? 60),
                    h: Number(styleValue(cell.style, "height") ?? 30),
                },
                first: inside[0] ?? -1,
                last: inside[inside.length - 1] ?? -1,
                depth: 0,
                title: null,
                titleRoom: 0,
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
            }
        })
        .filter((f) => f.first >= 0)
    const within = (inner: Box, outer: Box) =>
        inner.x >= outer.x - 2 &&
        inner.y >= outer.y - 2 &&
        inner.x + inner.w <= outer.x + outer.w + 2 &&
        inner.y + inner.h <= outer.y + outer.h + 2
    for (const frame of frames) {
        frame.depth = frames.filter(
            (f) => f !== frame && within(f.drawn, frame.drawn),
        ).length
    }
    const loose = cells.filter(
        (c) =>
            c.vertex &&
            c.parent === space &&
            !index.has(c.id) &&
            !frames.some((f) => f.cell === c) &&
            boxOf(c),
    )
    const titles = new Set<Cell>()
    for (const cell of loose) {
        if (!styleHas(cell.style, "text")) continue
        const box = boxOf(cell) as Box
        // The smallest frame whose title row the text starts in
        const frame = frames
            .filter(
                (f) =>
                    box.x >= f.drawn.x - 5 &&
                    box.x <= f.drawn.x + f.drawn.w &&
                    box.y >= f.drawn.y - 5 &&
                    box.y <= f.drawn.y + f.tab.h + 6,
            )
            .sort((a, b) => a.drawn.w * a.drawn.h - b.drawn.w * b.drawn.h)[0]
        if (frame && !frame.title) {
            frame.title = cell
            titles.add(cell)
        }
    }

    // The lifelines: as wide as their names, and as far apart as the texts
    // between them need
    const width = lifelines.map((l, i) => {
        const size = Number(styleValue(l.style, "fontSize") ?? 12)
        return Math.max(drawnLife[i].w, textSize(textOf(l), size).w + 16)
    })
    const apart = lifelines.slice(1).map((_, i) => {
        const drawn =
            drawnLife[i + 1].x +
            drawnLife[i + 1].w / 2 -
            (drawnLife[i].x + drawnLife[i].w / 2)
        return Math.max(drawn, (width[i] + width[i + 1]) / 2 + 20)
    })
    const span = (a: number, b: number) =>
        apart
            .slice(Math.min(a, b), Math.max(a, b))
            .reduce((sum, d) => sum + d, 0)
    const widen = (a: number, b: number, need: number) => {
        const lo = Math.min(a, b)
        const hi = Math.max(a, b)
        const short = need - span(lo, hi)
        if (short <= 0) return
        for (let i = lo; i < hi; i++) apart[i] += short / (hi - lo)
    }
    const byReach = [...messages].sort(
        (a, b) => Math.abs(a.to - a.from) - Math.abs(b.to - b.from),
    )
    for (const m of byReach) {
        if (m.from !== m.to) widen(m.from, m.to, m.text.w + 28)
        // (a message to itself has its text right of its loop)
        else if (m.from < lifelines.length - 1) {
            widen(m.from, m.from + 1, m.text.w + 60)
        }
    }
    const x0 = Math.min(...drawnLife.map((b) => b.x))
    const middle: number[] = [x0 + width[0] / 2]
    for (const d of apart) middle.push(middle[middle.length - 1] + d)

    // The frames from side to side: around the lifelines of their messages
    for (const frame of frames) {
        const own = messages.slice(frame.first, frame.last + 1)
        const reach = own.flatMap((m) => [m.from, m.to])
        const pad = 30 + 14 * frame.depth
        frame.left = middle[Math.min(...reach)] - pad
        frame.right = middle[Math.max(...reach)] + pad
        for (const m of own) {
            // (texts that are wider than the way between their lifelines)
            const centre = (middle[m.from] + middle[m.to]) / 2
            if (m.from === m.to) {
                frame.right = Math.max(
                    frame.right,
                    middle[m.from] + 46 + m.text.w + pad / 2,
                )
            } else {
                frame.left = Math.min(frame.left, centre - m.text.w / 2 - 8)
                frame.right = Math.max(frame.right, centre + m.text.w / 2 + 8)
            }
        }
        if (frame.title) {
            // The text beside the tab, wrapped when the frame is narrower
            const size = Number(styleValue(frame.title.style, "fontSize") ?? 12)
            const text = textSize(textOf(frame.title), size)
            const room = Math.max(
                60,
                frame.right - frame.left - frame.tab.w - 16,
            )
            const lines = Math.ceil(text.w / room)
            frame.titleRoom = Math.ceil(lines * size * 1.3) + 4
        }
    }

    // The rows: each message as far below the line before it as its text
    // needs, a frame's title row above its first message
    const rowItems = loose.filter((c) => {
        const box = boxOf(c) as Box
        return !titles.has(c) && box.y + box.h / 2 > top + head
    })
    const itemY = new Map<Cell, number>()
    const takeItems = (until: number, at: number) => {
        // Notes and other shapes that stood above this row keep a row of their own
        let used = 0
        for (const cell of rowItems) {
            const box = boxOf(cell) as Box
            if (itemY.has(cell) || box.y + box.h / 2 >= until) continue
            itemY.set(cell, at + used + 8)
            used += box.h + 12
        }
        return used
    }
    // (`low`: the lowest y in use so far; `loop`: how far below its line
    // the message before came back to itself)
    let low = head
    let loop = 0
    messages.forEach((m, i) => {
        let room = takeItems(m.y - 1, low)
        const opening = frames
            .filter((f) => f.first === i)
            .sort((a, b) => b.depth - a.depth)
        for (const frame of opening) {
            frame.top = low + room + 10
            room += 10 + Math.max(frame.tab.h, frame.titleRoom) + 4
        }
        // Right after a message to itself the row is counted from that
        // message's line, as the guide has it: the text only has to clear
        // the loop
        m.line =
            loop > 0 && room === 0
                ? low - loop + Math.max(pitch, loop + m.text.h + 2)
                : low + room + Math.max(pitch, m.text.h + TEXT_GAP)
        loop = m.from === m.to ? 20 : 0
        low = m.line + loop
        const closing = frames
            .filter((f) => f.last === i)
            .sort((a, b) => a.depth - b.depth)
        for (const frame of closing) {
            low += 12
            loop = 0
            frame.bottom = low
        }
    })
    low += takeItems(Number.POSITIVE_INFINITY, low + 20)
    const height = low + ROW

    // Back into the page; what changes is counted
    let changed = adopted
    for (const frame of frames) {
        // (the tab of a frame is as wide as its word)
        const size = Number(styleValue(frame.cell.style, "fontSize") ?? 12)
        const word = textSize(textOf(frame.cell), size).w + 14
        if (word > frame.tab.w) {
            frame.tab.w = Math.ceil(word)
            frame.cell.style = withStyle(frame.cell.style, {
                width: String(frame.tab.w),
            })
            frame.cell.inner.setAttribute("style", frame.cell.style)
            changed += 1
        }
    }
    const move = (cell: Cell, to: Partial<Box>) => {
        const now = boxOf(cell) as Box
        const differs = (Object.keys(to) as (keyof Box)[]).some(
            (key) => Math.abs((to[key] as number) - now[key]) >= 1,
        )
        if (differs) {
            setBox(cell, to)
            changed += 1
        }
    }
    lifelines.forEach((l, i) => {
        move(l, { x: middle[i] - width[i] / 2, y: top, w: width[i], h: height })
    })
    for (const m of messages) {
        const self = m.from === m.to
        const style = withStyle(m.cell.style, {
            edgeStyle: null,
            exitPerimeter: null,
            entryPerimeter: null,
            exitX: "0.5",
            exitY: "0",
            exitDx: "0",
            exitDy: String(Math.round(m.line)),
            entryX: "0.5",
            entryY: "0",
            entryDx: "0",
            entryDy: String(Math.round(m.line + (self ? 20 : 0))),
            // (the text above the line; right of the loop of a message to itself)
            ...(self
                ? { align: "left", verticalAlign: "middle", spacingLeft: "4" }
                : { verticalAlign: "bottom" }),
        })
        const drawn = `${m.cell.style};`.replace(/;;$/, ";")
        const same = (a: string, b: string) =>
            a.split(";").filter(Boolean).sort().join(";") ===
            b.split(";").filter(Boolean).sort().join(";")
        const had = Array.from(
            m.cell.geometry?.querySelectorAll("Array mxPoint") ?? [],
        )
        const points = self
            ? [
                  { x: middle[m.from] + 30, y: top + m.line },
                  { x: middle[m.from] + 30, y: top + m.line + 20 },
              ]
            : []
        const samePoints =
            had.length === points.length &&
            had.every(
                (p, i) =>
                    Math.abs(Number(p.getAttribute("x")) - points[i].x) < 1 &&
                    Math.abs(Number(p.getAttribute("y")) - points[i].y) < 1,
            )
        if (!same(drawn, style) || !samePoints) {
            // (a style that only names the default exitDx and entryDx anew is no change)
            const plain = withStyle(m.cell.style, { exitDx: "0", entryDx: "0" })
            if (!same(plain, style) || !samePoints) changed += 1
            m.cell.inner.setAttribute("style", style)
            setPoints(m.cell, points)
            setLabelPlace(m.cell, null)
        }
    }
    for (const frame of frames) {
        move(frame.cell, {
            x: frame.left,
            y: top + frame.top,
            w: frame.right - frame.left,
            h: frame.bottom - frame.top,
        })
        if (frame.title) {
            move(frame.title, {
                x: frame.left + frame.tab.w + 10,
                y: top + frame.top,
                w: Math.max(60, frame.right - frame.left - frame.tab.w - 16),
                h: Math.max(20, frame.titleRoom),
            })
        }
    }
    // The other shapes: in the row they had, as far from the lifeline left
    // of them as they were
    for (const [cell, y] of itemY) {
        const box = boxOf(cell) as Box
        const drawnMiddles = drawnLife.map((b) => b.x + b.w / 2)
        let anchor = 0
        drawnMiddles.forEach((mx, i) => {
            if (mx <= box.x) anchor = i
        })
        move(cell, {
            x: box.x + middle[anchor] - drawnMiddles[anchor],
            y: top + y,
        })
    }

    return changed > 0
        ? [
              `The server spaced the ${lifelines.length} participants for the texts between them and gave the ${messages.length} messages rows that fit their texts${frames.length > 0 ? `, with the ${frames.length} frames around their messages` : ""}.`,
          ]
        : []
}
