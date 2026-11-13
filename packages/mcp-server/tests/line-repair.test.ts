/**
 * The repair of a new drawing that has no layout of its own
 * (diagram-types/line-repair.ts): a connector through a shape gets a path
 * around it, a connector's text on a shape gets a free place, shapes on
 * each other are moved apart, and a drawing without such a problem stays
 * as it was written.
 */

import { describe, expect, it } from "vitest"
import {
    type Box,
    boxOf,
    lineWidth,
    readCells,
} from "../src/diagram-types/cells.ts"
import { drawnPath } from "../src/diagram-types/drawio-paths.ts"
import { stretchInBox } from "../src/diagram-types/grid-route.ts"
import { prepareNewDiagram } from "../src/new-diagram.ts"

const ORTHOGONAL = "edgeStyle=orthogonalEdgeStyle;html=1;"
const ACROSS = `${ORTHOGONAL}exitX=1;exitY=0.5;entryX=0;entryY=0.5;`

/** Three boxes in a row, and a connector from the first to the last */
const ROW = `<mxCell id="a" value="A" x="40" y="40" w="120" h="60"/>
<mxCell id="b" value="B" x="240" y="40" w="120" h="60"/>
<mxCell id="c" value="C" x="440" y="40" w="120" h="60"/>`

/** The drawing as the server hands it on: what it says it did, the shapes' boxes, and the path of each connector */
function drawn(cells: string, type?: string) {
    const out = prepareNewDiagram(cells, {}, type)
    if (!out.ok) throw new Error(out.error)
    const doc = new DOMParser().parseFromString(out.xml, "text/xml")
    const all = readCells(doc.querySelector("root") as Element)
    const boxes = new Map<string, Box>()
    for (const cell of all) {
        const box = boxOf(cell)
        if (box) boxes.set(cell.id, box)
    }
    const paths = new Map<string, { x: number; y: number }[]>()
    for (const cell of all) {
        const a = boxes.get(cell.source ?? "")
        const b = boxes.get(cell.target ?? "")
        if (!cell.edge || !a || !b) continue
        const points = Array.from(cell.geometry?.children ?? []).find(
            (child) => child.getAttribute("as") === "points",
        )
        const way = Array.from(points?.children ?? []).map((p) => ({
            x: Number(p.getAttribute("x")),
            y: Number(p.getAttribute("y")),
        }))
        const path = drawnPath(
            { box: a, outline: null },
            { box: b, outline: null },
            cell.style,
            way,
        )
        if (path) paths.set(cell.id, path)
    }
    const crosses = (edge: string, shape: string) => {
        const path = paths.get(edge) ?? []
        const box = boxes.get(shape) as Box
        const inner = { x: box.x + 3, y: box.y + 3, w: box.w - 6, h: box.h - 6 }
        return path.slice(1).some((p, i) => stretchInBox(path[i], p, inner))
    }
    return { out, xml: out.xml, cells: all, boxes, paths, crosses }
}

describe("a drawing without a problem", () => {
    it("stays as it was written", () => {
        const page = drawn(
            `${ROW}<mxCell id="e" source="a" target="b" style="${ACROSS}" value="next"/>`,
        )
        expect(page.out).toMatchObject({ fixes: [], laid: [] })
        expect(page.boxes.get("b")).toEqual({ x: 240, y: 40, w: 120, h: 60 })
    })

    it("keeps a connector that goes around a shape by its own waypoints", () => {
        const page = drawn(
            `${ROW}<mxCell id="e" edge="1" parent="1" source="a" target="c" style="${ORTHOGONAL}exitX=0.5;exitY=0;entryX=0.5;entryY=0;"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="100" y="10"/><mxPoint x="500" y="10"/></Array></mxGeometry></mxCell>`,
        )
        expect(page.out.laid).toEqual([])
    })
})

describe("a connector that passes through a shape", () => {
    it("gets a path around the shape, and the shapes stay where they were", () => {
        const before = drawn(ROW)
        const page = drawn(
            `${ROW}<mxCell id="e" source="a" target="c" style="${ACROSS}"/>`,
        )
        expect(page.out.laid).toEqual([
            "The server gave 1 connector that passed through a shape or a text, or ran on top of another connector, a new path.",
        ])
        expect(page.crosses("e", "b")).toBe(false)
        for (const id of ["a", "b", "c"]) {
            expect(page.boxes.get(id)).toEqual(before.boxes.get(id))
        }
        // (still a connector draw.io leads at right angles, now with
        // corners)
        const edge = page.cells.find((cell) => cell.id === "e")
        expect(edge?.style).toContain("edgeStyle=orthogonalEdgeStyle")
        expect(page.paths.get("e")?.length).toBeGreaterThan(2)
    })

    it("is told to the model among the fixes and the notes", () => {
        const { out } = drawn(
            `${ROW}<mxCell id="e" source="a" target="c" style="${ACROSS}"/>`,
        )
        expect(out.fixes).toEqual(out.laid)
        expect(out.notes).toEqual(out.laid)
    })

    it("leaves the other connectors as they were written", () => {
        const page = drawn(
            `${ROW}<mxCell id="e" source="a" target="c" style="${ACROSS}"/><mxCell id="f" source="a" target="b" style="${ACROSS}"/>`,
        )
        const kept = page.cells.find((cell) => cell.id === "f")
        expect(kept?.style).toBe(ACROSS)
        expect(kept?.geometry?.querySelector("Array")).toBeNull()
        expect(page.crosses("e", "b")).toBe(false)
    })

    it("gets a path of its own when it runs on top of another connector", () => {
        // There and back between the same two sides: one line on the page
        const page = drawn(
            `<mxCell id="a" value="A" x="40" y="40" w="120" h="60"/>
<mxCell id="b" value="B" x="340" y="40" w="120" h="60"/>
<mxCell id="e" source="a" target="b" style="${ACROSS}"/>
<mxCell id="f" source="b" target="a" style="${ORTHOGONAL}exitX=0;exitY=0.5;entryX=1;entryY=0.5;"/>`,
        )
        expect(page.out.laid).toEqual([
            "The server gave 1 connector that passed through a shape or a text, or ran on top of another connector, a new path.",
        ])
        // (the first stays where it was; the second no longer lies on it)
        expect(page.paths.get("e")).toEqual([
            { x: 160, y: 70 },
            { x: 340, y: 70 },
        ])
        const back = page.paths.get("f") ?? []
        expect(back.every((p) => p.y === 70)).toBe(false)
    })

    it("may run together with another one into the same shape", () => {
        // Two connectors that meet on their way into C
        const page = drawn(
            `<mxCell id="a" value="A" x="40" y="40" w="120" h="60"/>
<mxCell id="b" value="B" x="40" y="240" w="120" h="60"/>
<mxCell id="c" value="C" x="440" y="140" w="120" h="60"/>
<mxCell id="e" edge="1" parent="1" source="a" target="c" style="${ORTHOGONAL}exitX=1;exitY=0.5;entryX=0;entryY=0.5;"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="300" y="70"/><mxPoint x="300" y="170"/></Array></mxGeometry></mxCell>
<mxCell id="f" edge="1" parent="1" source="b" target="c" style="${ORTHOGONAL}exitX=1;exitY=0.5;entryX=0;entryY=0.5;"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="300" y="270"/><mxPoint x="300" y="170"/></Array></mxGeometry></mxCell>`,
        )
        expect(page.out.laid).toEqual([])
    })

    it("is left alone when it is curved: its corners only pull at it", () => {
        const page = drawn(
            `${ROW}<mxCell id="e" source="a" target="c" style="curved=1;${ACROSS}"/>`,
        )
        expect(page.out.laid).toEqual([])
    })

    it("is left alone in a sequence diagram, where messages cross the lifelines", () => {
        const lifeline = (id: string, x: number) =>
            `<mxCell id="${id}" value="${id}" style="shape=umlLifeline;perimeter=lifelinePerimeter;html=1;" x="${x}" y="40" w="100" h="300"/>`
        const page = drawn(
            `${lifeline("a", 40)}${lifeline("b", 240)}${lifeline("c", 440)}<mxCell id="e" source="a" target="c" style="html=1;"/>`,
        )
        expect(page.out.laid).toEqual([])
        // (lifelines drawn as thin shapes down the page)
        const thin = (id: string, x: number) =>
            `<mxCell id="${id}" value="" style="dashed=1;" x="${x}" y="100" w="1" h="300"/>`
        const plain = drawn(
            `${ROW}${thin("l1", 100)}${thin("l2", 300)}${thin("l3", 500)}<mxCell id="e" source="a" target="c" style="${ACROSS}"/>`,
        )
        expect(plain.out.laid).toEqual([])
    })
})

describe("a connector with a small step half way", () => {
    // B stands 6 lower than A: draw.io leads the connector with a step
    const row = `<mxCell id="a" value="A" x="40" y="40" w="120" h="60"/>
<mxCell id="b" value="B" x="340" y="46" w="120" h="60"/>`

    it("is made straight, by moving one of its ends along its side", () => {
        const page = drawn(
            `${row}<mxCell id="e" source="a" target="b" style="${ACROSS}"/>`,
        )
        expect(page.out.laid).toEqual([
            "The server took a small step out of 1 connector, so that it runs straight there.",
        ])
        expect(page.paths.get("e")).toEqual([
            { x: 160, y: 76 },
            { x: 340, y: 76 },
        ])
        // (the shapes stay where they are)
        expect(page.boxes.get("a")).toEqual({ x: 40, y: 40, w: 120, h: 60 })
        expect(page.boxes.get("b")).toEqual({ x: 340, y: 46, w: 120, h: 60 })
    })

    it("keeps a step that is no small one", () => {
        const page = drawn(
            `<mxCell id="a" value="A" x="40" y="40" w="120" h="60"/>
<mxCell id="b" value="B" x="340" y="90" w="120" h="60"/>
<mxCell id="e" source="a" target="b" style="${ACROSS}"/>`,
        )
        expect(page.out.laid).toEqual([])
    })

    it("is made straight up and down as well", () => {
        const page = drawn(
            `<mxCell id="a" value="A" x="40" y="40" w="120" h="60"/>
<mxCell id="b" value="B" x="46" y="200" w="120" h="60"/>
<mxCell id="e" source="a" target="b" style="${ORTHOGONAL}exitX=0.5;exitY=1;entryX=0.5;entryY=0;"/>`,
        )
        expect(page.paths.get("e")).toEqual([
            { x: 106, y: 100 },
            { x: 106, y: 200 },
        ])
    })

    it("moves the end on the rectangle, and leaves the one on the icon in its middle", () => {
        const icon =
            "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.route_53;html=1;"
        const page = drawn(
            `<mxCell id="a" value="Customer" x="40" y="40" w="90" h="50"/>
<mxCell id="b" value="Route 53" style="${icon}" x="60" y="140" w="64" h="64"/>
<mxCell id="e" source="a" target="b" style="${ORTHOGONAL}exitX=0.5;exitY=1;entryX=0.5;entryY=0;"/>`,
        )
        // (the icon's middle is at 92, the rectangle's at 85)
        const path = page.paths.get("e") ?? []
        for (const point of path) {
            expect(Math.abs(point.x - 92)).toBeLessThan(0.05)
        }
        expect(path[0].y).toBe(90)
        expect(path[path.length - 1].y).toBe(140)
    })

    it("shares the move between two icons, 10 each at most", () => {
        const icon =
            "shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;html=1;"
        const two = (off: number) =>
            drawn(
                `<mxCell id="a" value="One" style="${icon}" x="40" y="40" w="64" h="64"/>
<mxCell id="b" value="Two" style="${icon}" x="240" y="${40 + off}" w="64" h="64"/>
<mxCell id="e" source="a" target="b" style="${ACROSS}"/>`,
            )
        // 16 apart: 8 each
        expect(two(16).paths.get("e")).toEqual([
            { x: 104, y: 80 },
            { x: 240, y: 80 },
        ])
        // 24 apart: more than the two may move together
        expect(two(24).out.laid).toEqual([])
    })

    it("moves an end a little on an ellipse, and the connector still ends on its outline", () => {
        const page = drawn(
            `<mxCell id="a" value="Start" style="ellipse;whiteSpace=wrap;html=1;" x="40" y="40" w="120" h="60"/>
<mxCell id="b" value="End" style="ellipse;whiteSpace=wrap;html=1;" x="340" y="45" w="120" h="60"/>
<mxCell id="e" source="a" target="b" style="${ACROSS}"/>`,
        )
        expect(page.out.laid).toEqual([
            "The server took a small step out of 1 connector, so that it runs straight there.",
        ])
        // As draw.io draws it from the new style: one straight stretch
        const cell = page.cells.find((c) => c.id === "e")
        const path = drawnPath(
            { box: page.boxes.get("a") as Box, outline: "ellipse" },
            { box: page.boxes.get("b") as Box, outline: "ellipse" },
            cell?.style ?? "",
            [],
        )
        expect(path).not.toBeNull()
        for (const point of path ?? []) {
            expect(Math.abs(point.y - 75)).toBeLessThan(0.3)
        }
    })

    it("is taken out of the middle of a longer path too", () => {
        // The model's own corners: down at 250, 8 to the right, and on down
        const page = drawn(
            `<mxCell id="a" value="A" x="40" y="40" w="120" h="60"/>
<mxCell id="b" value="B" x="340" y="170" w="120" h="60"/>
<mxCell id="e" edge="1" parent="1" source="a" target="b" style="${ACROSS}"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="250" y="70"/><mxPoint x="250" y="120"/><mxPoint x="258" y="120"/><mxPoint x="258" y="200"/></Array></mxGeometry></mxCell>`,
        )
        expect(page.out.laid).toEqual([
            "The server took a small step out of 1 connector, so that it runs straight there.",
        ])
        expect(page.paths.get("e")).toEqual([
            { x: 160, y: 70 },
            { x: 258, y: 70 },
            { x: 258, y: 200 },
            { x: 340, y: 200 },
        ])
    })

    it("leaves its shape straight out, where draw.io led it down the shape's side first", () => {
        // The first corner is not in line with the end on A: draw.io runs
        // the connector down A's right side to it
        const page = drawn(
            `<mxCell id="a" value="A" x="40" y="40" w="120" h="60"/>
<mxCell id="b" value="B" x="340" y="170" w="120" h="60"/>
<mxCell id="e" edge="1" parent="1" source="a" target="b" style="${ORTHOGONAL}exitX=1;exitY=0.55;entryX=0;entryY=0.5;"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="190" y="120"/><mxPoint x="190" y="200"/></Array></mxGeometry></mxCell>`,
        )
        expect(page.paths.get("e")).toEqual([
            { x: 160, y: 73 },
            { x: 190, y: 73 },
            { x: 190, y: 200 },
            { x: 340, y: 200 },
        ])
    })

    it("stays when taking it out would lead the connector through a shape", () => {
        // The step at 250 keeps the connector clear of C
        const page = drawn(
            `<mxCell id="a" value="A" x="40" y="40" w="120" h="60"/>
<mxCell id="b" value="B" x="340" y="170" w="120" h="60"/>
<mxCell id="c" value="C" x="262" y="90" w="60" h="20"/>
<mxCell id="e" edge="1" parent="1" source="a" target="b" style="${ACROSS}"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="250" y="70"/><mxPoint x="250" y="140"/><mxPoint x="270" y="140"/><mxPoint x="270" y="200"/></Array></mxGeometry></mxCell>`,
        )
        expect(page.crosses("e", "c")).toBe(false)
        const path = page.paths.get("e") ?? []
        expect(path.some((p) => p.x === 250)).toBe(true)
    })

    it("stays in the middle of a diamond: the other end moves", () => {
        const page = drawn(
            `<mxCell id="a" value="A?" style="rhombus;whiteSpace=wrap;html=1;" x="40" y="40" w="120" h="60"/>
<mxCell id="b" value="B" x="340" y="46" w="120" h="60"/>
<mxCell id="e" source="a" target="b" style="${ACROSS}"/>`,
        )
        expect(page.paths.get("e")).toEqual([
            { x: 160, y: 70 },
            { x: 340, y: 70 },
        ])
    })
})

describe("a connector's text", () => {
    it("is moved off a shape to a free place on its connector", () => {
        // The text was set 45 below the line: onto the shape under it
        const page = drawn(
            `<mxCell id="a" value="A" x="40" y="40" w="120" h="60"/>
<mxCell id="c" value="C" x="440" y="40" w="120" h="60"/>
<mxCell id="d" value="D" x="240" y="100" w="120" h="40"/>
<mxCell id="e" edge="1" parent="1" source="a" target="c" value="sends" style="${ACROSS}"><mxGeometry relative="1" as="geometry"><mxPoint y="45" as="offset"/></mxGeometry></mxCell>`,
        )
        expect(page.out.laid).toEqual([
            "The server moved 1 connector text that stood on a shape or on another text to a free place on the same connector.",
        ])
        const edge = page.cells.find((cell) => cell.id === "e")
        expect(edge?.geometry?.querySelector("mxPoint")).toBeNull()
        expect(page.boxes.get("d")).toEqual({ x: 240, y: 100, w: 120, h: 40 })
    })

    it("stays where it is when it stands on nothing", () => {
        const page = drawn(
            `<mxCell id="a" value="A" x="40" y="40" w="120" h="60"/>
<mxCell id="c" value="C" x="440" y="40" w="120" h="60"/>
<mxCell id="e" edge="1" parent="1" source="a" target="c" value="sends" style="${ACROSS}"><mxGeometry relative="1" as="geometry"><mxPoint y="-12" as="offset"/></mxGeometry></mxCell>`,
        )
        expect(page.out.laid).toEqual([])
    })
})

describe("shapes", () => {
    it("that stand on each other are moved apart, and what stood beside them moves along", () => {
        const page = drawn(
            `<mxCell id="a" value="A" x="40" y="40" w="120" h="60"/>
<mxCell id="b" value="B" x="130" y="40" w="120" h="60"/>
<mxCell id="c" value="C" x="340" y="40" w="120" h="60"/>
<mxCell id="e" source="b" target="c" style="${ACROSS}"/>`,
        )
        expect(page.out.laid).toEqual([
            "The server moved shapes that stood on each other apart.",
        ])
        const a = page.boxes.get("a") as Box
        const b = page.boxes.get("b") as Box
        const c = page.boxes.get("c") as Box
        expect(a).toEqual({ x: 40, y: 40, w: 120, h: 60 })
        // (30 on each other: apart by that and a gap of 16)
        expect(b.x).toBe(176)
        expect(c.x - b.x).toBe(210)
        expect(b.y).toBe(40)
    })

    it("grow around a text that does not fit", () => {
        const page = drawn(
            `<mxCell id="a" value="A name that is much too long for a shape this small" x="40" y="40" w="60" h="30"/>
<mxCell id="b" value="B" x="240" y="40" w="120" h="30"/>
<mxCell id="e" source="a" target="b" style="${ACROSS}"/>`,
        )
        expect(page.out.laid[0]).toBe(
            "The server made 1 shape larger to hold its text.",
        )
        const a = page.boxes.get("a") as Box
        expect(a.h).toBeGreaterThan(60)
        // (around its middle)
        expect(Math.abs(a.y + a.h / 2 - 55)).toBeLessThanOrEqual(1)
    })

    it("that grow onto a neighbour get room between them", () => {
        // A word that cannot be wrapped makes A wider than the gap to B
        const page = drawn(
            `<mxCell id="a" value="https://app.example-company.com/portal" x="40" y="40" w="100" h="60"/>
<mxCell id="b" value="B" x="160" y="40" w="120" h="60"/>
<mxCell id="e" source="a" target="b" style="${ACROSS}"/>`,
        )
        const a = page.boxes.get("a") as Box
        const b = page.boxes.get("b") as Box
        expect(a.w).toBeGreaterThan(180)
        expect(b.x).toBeGreaterThanOrEqual(a.x + a.w + 10)
        expect(b.y).toBe(40)
    })

    it("in a box that they reach out of get a larger box", () => {
        const page = drawn(
            `<mxCell id="p" value="Group" style="swimlane;html=1;" x="40" y="40" w="200" h="120"/>
<mxCell id="x" value="X" parent="p" x="130" y="40" w="120" h="60"/>
<mxCell id="y" value="Y" x="440" y="80" w="120" h="60"/>
<mxCell id="e" source="x" target="y" style="${ACROSS}"/>`,
        )
        expect(page.out.laid).toEqual([
            "The server made 1 box larger to hold the shapes drawn in it.",
        ])
        // (the child reaches to 290 on the page: the box to 6 past it)
        expect(page.boxes.get("p")).toEqual({ x: 40, y: 40, w: 256, h: 120 })
    })
})

describe("a text right beside a shape", () => {
    it("is moved off the shape's connector that runs through it", () => {
        const page = drawn(
            `<mxCell id="a" value="A" x="40" y="40" w="120" h="60"/>
<mxCell id="b" value="B" x="340" y="40" w="120" h="60"/>
<mxCell id="n" value="1" style="text;html=1;align=center;verticalAlign=middle;" x="164" y="61" w="14" h="18"/>
<mxCell id="e" source="a" target="b" style="${ACROSS}"/>`,
        )
        expect(page.out.laid).toEqual([
            "The server moved 1 text that a connector ran through beside that connector.",
        ])
        const n = page.boxes.get("n") as Box
        // (above the line at y = 70 now, still beside the shape)
        expect(n.x).toBe(164)
        expect(n.y + n.h).toBeLessThanOrEqual(70)
    })
})

describe("the width of a text", () => {
    it("is the sum of its characters' widths in Helvetica", () => {
        // H 722, e 556, l 222, l 222, o 556: 2278 thousandths of the size
        expect(lineWidth("Hello", 12)).toBeCloseTo(27.34, 1)
        expect(lineWidth("Hello", 12, true)).toBeGreaterThan(27.34)
        // (a CJK character is as wide as the size; a letter with an
        // accent as wide as the letter)
        expect(lineWidth("中文", 12)).toBe(24)
        expect(lineWidth("é", 10)).toBe(lineWidth("e", 10))
    })
})
