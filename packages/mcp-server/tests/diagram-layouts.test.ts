/**
 * The layouts of the diagram types (diagram-types/layouts.ts): a drawing
 * whose type the model named gets its shapes spaced and its lines led.
 * What they promise is checked on the result: no line through a shape, and
 * every shape still where the model meant it (its lane, its order).
 */

import { describe, expect, it } from "vitest"
import {
    type GridEdge,
    type GridNode,
    layoutGrid,
    stretchInBox,
} from "../src/diagram-types/grid-route.ts"
import { DIAGRAM_TYPES } from "../src/diagram-types/index.ts"
import { layoutOfType } from "../src/diagram-types/layouts.ts"
import { prepareNewDiagram } from "../src/new-diagram.ts"

interface Box {
    x: number
    y: number
    w: number
    h: number
}

/** The shapes of a drawn page with their boxes on the page, and its lines as the points they run through */
function drawn(xml: string) {
    const doc = new DOMParser().parseFromString(xml, "text/xml")
    const cells = Array.from(doc.querySelectorAll("mxCell"))
    const byId = new Map(cells.map((c) => [c.getAttribute("id") as string, c]))
    const number = (el: Element | null | undefined, name: string) =>
        Number(el?.getAttribute(name) ?? 0)
    const box = (cell: Element): Box => {
        const g = cell.querySelector("mxGeometry")
        const parent = byId.get(cell.getAttribute("parent") ?? "")
        const origin =
            parent?.getAttribute("vertex") === "1"
                ? box(parent)
                : { x: 0, y: 0 }
        return {
            x: origin.x + number(g, "x"),
            y: origin.y + number(g, "y"),
            w: number(g, "width"),
            h: number(g, "height"),
        }
    }
    const style = (cell: Element, key: string) =>
        (cell.getAttribute("style") ?? "")
            .split(";")
            .find((token) => token.startsWith(`${key}=`))
            ?.slice(key.length + 1)
    const shapes = cells
        .filter((c) => c.getAttribute("vertex") === "1")
        .map((cell) => ({
            id: cell.getAttribute("id") as string,
            parent: cell.getAttribute("parent"),
            container: (cell.getAttribute("style") ?? "").includes("swimlane"),
            box: box(cell),
        }))
    const boxOf = new Map(shapes.map((s) => [s.id, s.box]))
    const lines = cells
        .filter((c) => c.getAttribute("edge") === "1")
        .map((cell) => {
            const end = (which: "source" | "target", prefix: string) => {
                const at = boxOf.get(cell.getAttribute(which) ?? "") as Box
                const fx = style(cell, `${prefix}X`)
                const fy = style(cell, `${prefix}Y`)
                return fx === undefined || fy === undefined
                    ? { x: at.x + at.w / 2, y: at.y + at.h / 2 }
                    : {
                          x: at.x + at.w * Number(fx),
                          y: at.y + at.h * Number(fy),
                      }
            }
            const points = Array.from(
                cell.querySelectorAll("Array mxPoint"),
            ).map((p) => ({ x: number(p, "x"), y: number(p, "y") }))
            return {
                id: cell.getAttribute("id") as string,
                source: cell.getAttribute("source") as string,
                target: cell.getAttribute("target") as string,
                ported: style(cell, "exitX") !== undefined,
                path: [
                    end("source", "exit"),
                    ...points,
                    end("target", "entry"),
                ],
            }
        })
    return { shapes, lines }
}

/** The lines that pass through a shape other than their two ends */
function crossings(xml: string): string[] {
    const { shapes, lines } = drawn(xml)
    const found: string[] = []
    for (const line of lines) {
        for (const shape of shapes) {
            if (
                shape.container ||
                shape.id === line.source ||
                shape.id === line.target
            ) {
                continue
            }
            // (a little inside the box: a line may touch a border)
            const inner = {
                x: shape.box.x + 2,
                y: shape.box.y + 2,
                w: shape.box.w - 4,
                h: shape.box.h - 4,
            }
            for (let i = 1; i < line.path.length; i++) {
                if (stretchInBox(line.path[i - 1], line.path[i], inner)) {
                    found.push(`${line.id} through ${shape.id}`)
                }
            }
        }
    }
    return found
}

describe("layoutOfType", () => {
    it("has a layout for sequence, swimlane and use case diagrams, none for other types", () => {
        expect(layoutOfType("swimlane")).toBeDefined()
        expect(layoutOfType(" Swimlane-Horizontal ")).toBeDefined()
        expect(layoutOfType("usecase")).toBeDefined()
        expect(layoutOfType("sequence")).toBeDefined()
        expect(layoutOfType("flowchart")).toBeUndefined()
        expect(layoutOfType(undefined)).toBeUndefined()
    })
})

describe("a drawing with a type", () => {
    it("is drawn as written when no type is named", () => {
        const swimlane = DIAGRAM_TYPES.find((t) => t.name === "swimlane")
        const plain = prepareNewDiagram(swimlane?.example ?? "")
        expect(plain).toMatchObject({ ok: true, fixes: [], laid: [] })
    })

    it("says what the layout did, among the fixes and the notes", () => {
        const swimlane = DIAGRAM_TYPES.find((t) => t.name === "swimlane")
        const out = prepareNewDiagram(swimlane?.example ?? "", {}, "swimlane")
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.laid).toEqual([
            "The server placed the 7 steps on the grid of their lanes and gave the 6 connectors paths through the gaps between them, so no line crosses a step.",
        ])
        expect(out.fixes).toEqual(out.laid)
        expect(out.notes).toEqual(out.laid)
    })

    it("leaves a drawing of another kind alone, whatever type it is called", () => {
        const flow = `<mxCell id="2" value="A" x="40" y="40" w="120" h="60"/><mxCell id="3" value="B" x="240" y="40" w="120" h="60"/><mxCell id="4" source="2" target="3"/>`
        for (const type of [
            "swimlane",
            "usecase",
            "sequence",
            "no such type",
        ]) {
            expect(prepareNewDiagram(flow, {}, type)).toMatchObject({
                ok: true,
                fixes: [],
                laid: [],
            })
        }
    })
})

describe.each(
    // (the sequence guide's example needs no layout: tested below)
    DIAGRAM_TYPES.filter((t) => layoutOfType(t.name) && t.name !== "sequence"),
)("the layout of the $name guide's example", (type) => {
    const out = prepareNewDiagram(type.example, {}, type.name)
    const xml = out.ok ? out.xml : ""

    it("leads no line through a shape", () => {
        expect(out.ok).toBe(true)
        expect(crossings(xml)).toEqual([])
    })

    it("keeps every shape in its container and every line on its two shapes", () => {
        const before = prepareNewDiagram(type.example)
        const was = drawn(before.ok ? before.xml : "")
        const now = drawn(xml)
        expect(now.shapes.map((s) => [s.id, s.parent])).toEqual(
            was.shapes.map((s) => [s.id, s.parent]),
        )
        expect(now.lines.map((l) => [l.id, l.source, l.target])).toEqual(
            was.lines.map((l) => [l.id, l.source, l.target]),
        )
    })

    it("puts no shape on another", () => {
        const { shapes } = drawn(xml)
        const solid = shapes.filter((s) => !s.container)
        for (const a of solid) {
            for (const b of solid) {
                if (a.id >= b.id) continue
                const apart =
                    a.box.x + a.box.w <= b.box.x ||
                    b.box.x + b.box.w <= a.box.x ||
                    a.box.y + a.box.h <= b.box.y ||
                    b.box.y + b.box.h <= a.box.y
                expect(apart, `${a.id} and ${b.id}`).toBe(true)
            }
        }
    })
})

describe("the swimlane layout", () => {
    // A decision whose branch skips a row, a line back to the first step,
    // and two steps of one lane that the model put on each other
    const cells = `<mxCell id="2" value="Sales" style="swimlane;startSize=30;" x="40" y="40" w="220" h="540"/>
<mxCell id="3" value="Warehouse" style="swimlane;startSize=30;" x="260" y="40" w="220" h="540"/>
<mxCell id="4" value="Take order" style="rounded=1;" parent="2" x="40" y="50" w="140" h="60"/>
<mxCell id="5" value="In stock?" style="rhombus;" parent="3" x="40" y="140" w="140" h="80"/>
<mxCell id="6" value="Pick" style="rounded=1;" parent="3" x="40" y="250" w="140" h="60"/>
<mxCell id="7" value="Pack" style="rounded=1;" parent="3" x="40" y="350" w="140" h="60"/>
<mxCell id="8" value="Tell customer" style="rounded=1;" parent="2" x="40" y="350" w="140" h="60"/>
<mxCell id="9" value="Close order" style="rounded=1;" parent="2" x="40" y="360" w="140" h="60"/>
<mxCell id="10" style="edgeStyle=orthogonalEdgeStyle;" source="4" target="5"/>
<mxCell id="11" value="Yes" style="edgeStyle=orthogonalEdgeStyle;" source="5" target="6"/>
<mxCell id="12" value="No" style="edgeStyle=orthogonalEdgeStyle;" source="5" target="8"/>
<mxCell id="13" style="edgeStyle=orthogonalEdgeStyle;" source="6" target="7"/>
<mxCell id="14" style="edgeStyle=orthogonalEdgeStyle;" source="7" target="9"/>
<mxCell id="15" value="Next order" style="edgeStyle=orthogonalEdgeStyle;" source="9" target="4"/>`
    const out = prepareNewDiagram(cells, {}, "swimlane")
    const xml = out.ok ? out.xml : ""
    const { shapes, lines } = drawn(xml)
    const at = (id: string) => shapes.find((s) => s.id === id)?.box as Box

    it("leads every connector around the steps, the one back to the start too", () => {
        expect(out.ok).toBe(true)
        expect(crossings(xml)).toEqual([])
        expect(lines.every((l) => l.ported)).toBe(true)
    })

    it("gives the two steps drawn on each other a row each", () => {
        expect(at("9").y).toBeGreaterThanOrEqual(at("8").y + at("8").h + 20)
    })

    it("keeps the order of the rows and the lane of every step", () => {
        const rows = ["4", "5", "6", "7"].map((id) => at(id).y)
        expect(rows).toEqual([...rows].sort((a, b) => a - b))
        expect(new Set(rows).size).toBe(4)
        for (const [id, lane] of [
            ["4", "2"],
            ["8", "2"],
            ["9", "2"],
            ["5", "3"],
            ["6", "3"],
            ["7", "3"],
        ]) {
            expect(shapes.find((s) => s.id === id)?.parent).toBe(lane)
            const lanes = at(lane)
            const step = at(id)
            expect(step.x).toBeGreaterThanOrEqual(lanes.x)
            expect(step.x + step.w).toBeLessThanOrEqual(lanes.x + lanes.w)
            expect(step.y + step.h).toBeLessThanOrEqual(lanes.y + lanes.h)
        }
    })

    it("makes the lanes one height, side by side without a gap", () => {
        expect(at("2").h).toBe(at("3").h)
        expect(at("2").y).toBe(at("3").y)
        expect(at("2").x + at("2").w).toBe(at("3").x)
    })

    it("lays out lanes as rows the same way, turned by a quarter", () => {
        const turned = cells
            .replace(
                /swimlane;startSize=30;/g,
                "swimlane;horizontal=0;startSize=30;",
            )
            .replace(
                / x="(\d+)" y="(\d+)" w="(\d+)" h="(\d+)"/g,
                (_, x, y, w, h) => ` x="${y}" y="${x}" w="${h}" h="${w}"`,
            )
        const rows = prepareNewDiagram(turned, {}, "swimlane-horizontal")
        expect(rows.ok).toBe(true)
        if (!rows.ok) return
        expect(crossings(rows.xml)).toEqual([])
        const page = drawn(rows.xml)
        const box = (id: string) =>
            page.shapes.find((s) => s.id === id)?.box as Box
        // The lanes are stacked, the flow runs to the right
        expect(box("2").y + box("2").h).toBe(box("3").y)
        expect(box("5").x).toBeGreaterThan(box("4").x + box("4").w)
    })
})

describe("the use case layout", () => {
    // An actor on each side, at the height of the second row; "Log in" is
    // used by both and stands in the left column, so the right actor's
    // straight line to it would cross "Refund"
    const cells = `<mxStyle name="actor" value="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;"/>
<mxCell id="2" value="Shop" style="swimlane;startSize=30;" x="200" y="40" w="440" h="300"/>
<mxCell id="3" value="Log in" style="ellipse;" parent="2" x="40" y="130" w="160" h="50"/>
<mxCell id="4" value="Order" style="ellipse;" parent="2" x="40" y="50" w="160" h="50"/>
<mxCell id="5" value="Refund" style="ellipse;" parent="2" x="260" y="130" w="160" h="50"/>
<mxCell id="6" value="Ship" style="ellipse;" parent="2" x="260" y="50" w="160" h="50"/>
<mxCell id="7" value="Customer" style="actor;" x="80" y="165" w="30" h="60"/>
<mxCell id="8" value="Clerk" style="actor;" x="730" y="165" w="30" h="60"/>
<mxCell id="9" style="endArrow=none;" source="7" target="3"/>
<mxCell id="10" style="endArrow=none;" source="7" target="4"/>
<mxCell id="11" style="endArrow=none;" source="8" target="5"/>
<mxCell id="12" style="endArrow=none;" source="8" target="6"/>
<mxCell id="13" style="endArrow=none;" source="8" target="3"/>
<mxCell id="14" value="«include»" style="dashed=1;endArrow=open;" source="4" target="3"/>`
    const out = prepareNewDiagram(cells, {}, "usecase")
    const xml = out.ok ? out.xml : ""
    const { shapes, lines } = drawn(xml)
    const at = (id: string) => shapes.find((s) => s.id === id)?.box as Box

    it("leads the one line that would cross a use case around it, the others stay straight", () => {
        expect(out.ok).toBe(true)
        expect(out.ok && out.laid[0]).toContain("led 1 of the 6 lines")
        expect(crossings(xml)).toEqual([])
        expect(lines.filter((l) => l.ported).map((l) => l.id)).toEqual(["13"])
    })

    it("keeps the use cases in the system's box and the actors outside it", () => {
        const system = at("2")
        for (const id of ["3", "4", "5", "6"]) {
            const oval = at(id)
            expect(shapes.find((s) => s.id === id)?.parent).toBe("2")
            expect(oval.x).toBeGreaterThan(system.x)
            expect(oval.x + oval.w).toBeLessThan(system.x + system.w)
            expect(oval.y).toBeGreaterThan(system.y + 30)
            expect(oval.y + oval.h).toBeLessThan(system.y + system.h)
        }
        expect(at("7").x + at("7").w).toBeLessThan(system.x)
        expect(at("8").x).toBeGreaterThan(system.x + system.w)
    })

    it("keeps the columns and rows as drawn", () => {
        expect(at("4").x).toBe(at("3").x)
        expect(at("6").x).toBe(at("5").x)
        expect(at("4").y).toBe(at("6").y)
        expect(at("3").y).toBeGreaterThan(at("4").y)
        expect(at("5").x).toBeGreaterThan(at("3").x + at("3").w)
    })
})

describe("the sequence layout", () => {
    const STYLES = `<mxStyle name="life" value="shape=umlLifeline;perimeter=lifelinePerimeter;size=40;"/>
<mxStyle name="msg" value="verticalAlign=bottom;endArrow=block;"/>`
    const at = (d: number) =>
        `exitX=0.5;exitY=0;exitDy=${d};entryX=0.5;entryY=0;entryDy=${d};`
    const styleNumber = (cell: Element | undefined, key: string) =>
        Number(
            (cell?.getAttribute("style") ?? "")
                .split(";")
                .find((token) => token.startsWith(`${key}=`))
                ?.slice(key.length + 1),
        )
    const page = (xml: string) => {
        const doc = new DOMParser().parseFromString(xml, "text/xml")
        const cell = (id: string) =>
            doc.querySelector(`mxCell[id="${id}"]`) ?? undefined
        const number = (id: string, name: string) =>
            Number(cell(id)?.querySelector("mxGeometry")?.getAttribute(name))
        return { cell, number }
    }

    it("leaves a drawing that has the room it needs as it is: the guide's example", () => {
        const sequence = DIAGRAM_TYPES.find((t) => t.name === "sequence")
        const out = prepareNewDiagram(sequence?.example ?? "", {}, "sequence")
        expect(out).toMatchObject({ ok: true, fixes: [], notes: [], laid: [] })
        const plain = prepareNewDiagram(sequence?.example ?? "")
        expect(
            out.ok && plain.ok && out.xml.replace(/id="[^"]*" name/, "name"),
        ).toBe(plain.ok && plain.xml.replace(/id="[^"]*" name/, "name"))
    })

    it("moves the participants apart for a text that is longer than the way between them", () => {
        const long = "Send the monthly settlement report for review"
        const out = prepareNewDiagram(
            `${STYLES}
<mxCell id="2" value="A" style="life;" x="40" y="40" w="120" h="160"/>
<mxCell id="3" value="B" style="life;" x="180" y="40" w="120" h="160"/>
<mxCell id="4" value="C" style="life;" x="320" y="40" w="120" h="160"/>
<mxCell id="5" value="${long}" style="msg;${at(80)}" source="2" target="3"/>
<mxCell id="6" value="OK" style="msg;${at(120)}" source="3" target="4"/>`,
            {},
            "sequence",
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.laid).toEqual([
            "The server spaced the 3 participants for the texts between them and gave the 2 messages rows that fit their texts.",
        ])
        const { number } = page(out.xml)
        // About 6.4 px a letter at 11 px: the text needs some 290 px
        expect(number("3", "x") - number("2", "x")).toBeGreaterThan(280)
        // The pair with the short text stays as far apart as it was drawn
        expect(number("4", "x") - number("3", "x")).toBe(140)
    })

    it("gives messages drawn in one row a row each, and a text of three lines a taller row", () => {
        const out = prepareNewDiagram(
            `${STYLES}
<mxCell id="2" value="A" style="life;" x="40" y="40" w="120" h="200"/>
<mxCell id="3" value="B" style="life;" x="240" y="40" w="120" h="200"/>
<mxCell id="4" value="one" style="msg;${at(80)}" source="2" target="3"/>
<mxCell id="5" value="two" style="msg;${at(80)}" source="3" target="2"/>
<mxCell id="6" value="three&lt;br&gt;lines&lt;br&gt;here" style="msg;${at(120)}" source="2" target="3"/>`,
            {},
            "sequence",
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        const { cell, number } = page(out.xml)
        const rows = ["4", "5", "6"].map((id) =>
            styleNumber(cell(id), "exitDy"),
        )
        expect(rows[0]).toBe(80)
        expect(rows[1]).toBe(120)
        // 3 lines of 11 px text and the room above them
        expect(rows[2] - rows[1]).toBeGreaterThan(55)
        // The lifelines reach below the last row
        expect(number("2", "height")).toBe(rows[2] + 40)
        expect(number("3", "height")).toBe(rows[2] + 40)
    })

    it("keeps a row for a frame's title above its first message and puts the frame around its messages", () => {
        const out = prepareNewDiagram(
            `${STYLES}
<mxCell id="2" value="A" style="life;" x="40" y="40" w="120" h="240"/>
<mxCell id="3" value="B" style="life;" x="240" y="40" w="120" h="240"/>
<mxCell id="4" value="start" style="msg;${at(80)}" source="2" target="3"/>
<mxCell id="5" value="loop" style="shape=umlFrame;width=50;height=20;fillColor=none;" x="90" y="130" w="220" h="110"/>
<mxCell id="6" value="while items remain" style="text;align=left;" x="150" y="130" w="150" h="20"/>
<mxCell id="7" value="next item" style="msg;${at(140)}" source="2" target="3"/>
<mxCell id="8" value="done" style="msg;${at(180)}" source="3" target="2"/>`,
            {},
            "sequence",
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        const { cell, number } = page(out.xml)
        const row = (id: string) => 40 + styleNumber(cell(id), "exitDy")
        const top = number("5", "y")
        const bottom = top + number("5", "height")
        // The message before the frame is above it; the first one inside
        // is below the title row, with room for its own text
        expect(row("4")).toBeLessThan(top)
        expect(row("7")).toBeGreaterThanOrEqual(top + 20 + 16)
        expect(row("8")).toBeLessThan(bottom)
        // The condition stands in the title row, right of the tab
        expect(number("6", "y")).toBe(top)
        expect(number("6", "x")).toBeGreaterThanOrEqual(number("5", "x") + 50)
        // Around both lifelines
        expect(number("5", "x")).toBeLessThan(100)
        expect(number("5", "x") + number("5", "width")).toBeGreaterThan(300)
    })

    it("takes a message to itself that was written without its ends for its lifeline's", () => {
        const out = prepareNewDiagram(
            `${STYLES}
<mxCell id="2" value="A" style="life;" x="40" y="40" w="120" h="200"/>
<mxCell id="3" value="B" style="life;" x="240" y="40" w="120" h="200"/>
<mxCell id="4" value="ask" style="msg;${at(80)}" source="2" target="3"/>
<mxCell id="5" value="think" style="msg;exitX=0.5;exitY=0;exitDy=120;entryX=0.5;entryY=0;entryDy=140;"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="330" y="160"/><mxPoint x="330" y="180"/></Array></mxGeometry></mxCell>
<mxCell id="6" value="answer" style="msg;${at(160)}" source="3" target="2"/>`,
            {},
            "sequence",
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        const { cell } = page(out.xml)
        expect(cell("5")?.getAttribute("edge")).toBe("1")
        expect(cell("5")?.getAttribute("source")).toBe("3")
        expect(cell("5")?.getAttribute("target")).toBe("3")
        expect(styleNumber(cell("5"), "entryDy")).toBe(
            styleNumber(cell("5"), "exitDy") + 20,
        )
        // The message after it is below its return
        expect(styleNumber(cell("6"), "exitDy")).toBeGreaterThanOrEqual(
            styleNumber(cell("5"), "entryDy") + 20,
        )
    })

    it("keeps a message drawn in a frame's title row in the frame, and moves it below the title", () => {
        // The frame starts at 130 and its tab is 20 high: the message at
        // 40 + 120 = 160 lies on the frame's condition. Whether it is the
        // last message before the frame or the first one in it, only the
        // drawing says: it is in the frame's box
        const out = prepareNewDiagram(
            `${STYLES}
<mxCell id="2" value="A" style="life;" x="40" y="40" w="120" h="240"/>
<mxCell id="3" value="B" style="life;" x="240" y="40" w="120" h="240"/>
<mxCell id="4" value="start" style="msg;${at(80)}" source="2" target="3"/>
<mxCell id="5" value="alt" style="shape=umlFrame;width=50;height=20;fillColor=none;" x="90" y="130" w="220" h="150"/>
<mxCell id="6" value="found" style="text;align=left;" x="150" y="130" w="150" h="20"/>
<mxCell id="7" value="send it" style="msg;${at(120)}" source="3" target="2"/>
<mxCell id="9" value="else not found" style="text;align=left;" x="100" y="205" w="150" h="20"/>
<mxCell id="8" value="say so" style="msg;${at(200)}" source="3" target="2"/>`,
            {},
            "sequence",
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        const { cell, number } = page(out.xml)
        const row = (id: string) => 40 + styleNumber(cell(id), "exitDy")
        const top = number("5", "y")
        expect(row("7")).toBeGreaterThanOrEqual(top + 20 + 16)
        expect(row("8")).toBeLessThan(top + number("5", "height"))
        // The text of the second part: between the two messages, inside
        // the frame at its left
        expect(number("9", "y")).toBeGreaterThan(row("7"))
        expect(number("9", "y") + 20).toBeLessThan(row("8"))
        expect(number("9", "x")).toBe(number("5", "x") + 8)
    })

    it("leaves a drawing with shapes on its lifelines alone", () => {
        const out = prepareNewDiagram(
            `${STYLES}
<mxCell id="2" value="A" style="life;" x="40" y="40" w="120" h="160"/>
<mxCell id="3" value="B" style="life;" x="140" y="40" w="120" h="160"/>
<mxCell id="4" value="" parent="3" x="55" y="70" w="10" h="60"/>
<mxCell id="5" value="A text that is longer than the way between them" style="msg;${at(80)}" source="2" target="3"/>`,
            {},
            "sequence",
        )
        expect(out).toMatchObject({ ok: true, laid: [] })
    })
})

describe("layoutGrid", () => {
    const node = (id: string, col: number, row: number): GridNode => ({
        id,
        col,
        row,
        w: 120,
        h: 60,
        diamond: false,
    })
    const edge = (id: string, source: string, target: string): GridEdge => ({
        id,
        source,
        target,
        labels: [],
    })
    const options = {
        rowGap: 40,
        colGap: 40,
        boundaries: new Set<number>(),
        boundaryGap: 80,
        outerRowGap: 20,
        outerColGap: 20,
        track: 12,
    }

    it("draws a line to the shape straight below without a corner", () => {
        const grid = layoutGrid(
            [node("a", 0, 0), node("b", 0, 1)],
            [edge("e", "a", "b")],
            options,
        )
        expect(grid.edges.get("e")).toMatchObject({
            exit: "bottom",
            entry: "top",
            points: [],
        })
    })

    it("gives two lines that would lie on each other in one gap a track each", () => {
        // a and b in row 0, c and d in row 1, crosswise
        const grid = layoutGrid(
            [
                node("a", 0, 0),
                node("b", 1, 0),
                node("c", 0, 1),
                node("d", 1, 1),
            ],
            [edge("e1", "a", "d"), edge("e2", "b", "c")],
            options,
        )
        const y1 = grid.edges.get("e1")?.points[0].y
        const y2 = grid.edges.get("e2")?.points[0].y
        expect(y1).not.toBe(y2)
        // The gap grew to hold both
        expect(grid.gapH[1]).toBeGreaterThanOrEqual(36)
    })

    it("leads a line past a shape in its way through the gap beside it", () => {
        const grid = layoutGrid(
            [node("a", 0, 0), node("b", 0, 1), node("c", 0, 2)],
            [edge("e", "a", "c")],
            options,
        )
        const route = grid.edges.get("e")
        expect(route?.points).toHaveLength(4)
        const b = grid.nodes.get("b") as { x: number; y: number }
        // Its upright stretch runs right of b
        expect(route?.points[1].x).toBeGreaterThan(b.x + 120)
        expect(route?.points[1].x).toBe(route?.points[2].x)
    })

    it("puts a text where it covers no shape, and makes room for it", () => {
        const grid = layoutGrid(
            [node("a", 0, 0), node("b", 1, 0)],
            [{ ...edge("e", "a", "b"), labels: [{ w: 90, h: 16 }] }],
            options,
        )
        // The gap between the two is as wide as the text needs
        expect(grid.gapW[1]).toBeGreaterThanOrEqual(98)
        const a = grid.nodes.get("a") as { x: number; y: number }
        const b = grid.nodes.get("b") as { x: number; y: number }
        const label = grid.edges.get("e")?.labels[0]
        const length = b.x - (a.x + 120)
        const middle = a.x + 120 + (((label?.along ?? 0) + 1) / 2) * length
        expect(middle - 45).toBeGreaterThanOrEqual(a.x + 120)
        expect(middle + 45).toBeLessThanOrEqual(b.x)
    })
})
