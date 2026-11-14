/**
 * The paths the server works out for connectors (diagram-types/
 * drawio-paths.ts) against the paths draw.io drew: every case is a
 * connector of a real drawing, with the corners draw.io 32.0.2 led it
 * through (read from the rendered page).
 */

import { describe, expect, it } from "vitest"
import {
    drawnPath,
    type End,
    portOf,
    sideOf,
} from "../src/diagram-types/drawio-paths.ts"

interface Case {
    name: string
    a: End
    b: End
    style: string
    way: { x: number; y: number }[]
    real: number[][]
}

const CASES: Case[] = [
    {
        name: "straight, from side to side",
        a: { box: { x: 304, y: 275, w: 28, h: 28 }, outline: null },
        b: { box: { x: 329, y: 225, w: 32, h: 30 }, outline: null },
        style: "edgeStyle=none;exitX=0.5;exitY=0;entryX=0.5;entryY=1;",
        way: [],
        real: [
            [318, 275],
            [345, 255],
        ],
    },
    {
        name: "straight, onto an ellipse",
        a: { box: { x: 20, y: 80, w: 150, h: 440 }, outline: null },
        b: { box: { x: 330, y: 150, w: 160, h: 300 }, outline: "ellipse" },
        style: "edgeStyle=none;exitX=1;exitY=0.03;entryX=0;entryY=0.03;",
        way: [],
        real: [
            [170, 93.2],
            [351.7, 197.3],
        ],
    },
    {
        name: "orthogonal, two sides in line",
        a: { box: { x: 30, y: 184, w: 138, h: 58 }, outline: null },
        b: { box: { x: 178, y: 184, w: 138, h: 58 }, outline: null },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.5;entryX=0;entryY=0.5;",
        way: [],
        real: [
            [168, 213],
            [178, 213],
        ],
    },
    {
        name: "orthogonal, one corner",
        a: { box: { x: 326, y: 184, w: 138, h: 58 }, outline: null },
        b: { box: { x: 474, y: 184, w: 138, h: 58 }, outline: null },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.5;entryX=0;entryY=0.3;",
        way: [],
        real: [
            [464, 213],
            [474, 213],
            [474, 201.4],
        ],
    },
    {
        name: "orthogonal, a step half way",
        a: { box: { x: 325, y: 18, w: 300, h: 62 }, outline: null },
        b: { box: { x: 25, y: 91, w: 600, h: 55 }, outline: null },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=1;entryX=0.5;entryY=0;",
        way: [],
        real: [
            [475, 80],
            [475, 90],
            [325, 90],
            [325, 91],
        ],
    },
    {
        name: "orthogonal, around a shape's side",
        a: { box: { x: 165, y: 304, w: 135, h: 55 }, outline: null },
        b: { box: { x: 645, y: 260, w: 130, h: 74 }, outline: null },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.7;entryX=0.25;entryY=0;",
        way: [],
        real: [
            [300, 342.5],
            [472.5, 342.5],
            [472.5, 250],
            [677.5, 250],
            [677.5, 260],
        ],
    },
    {
        name: "orthogonal, around both shapes",
        a: { box: { x: 25, y: 18, w: 290, h: 62 }, outline: null },
        b: { box: { x: 25, y: 91, w: 600, h: 55 }, outline: null },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.5;entryX=0;entryY=0.5;",
        way: [],
        real: [
            [315, 49],
            [325, 49],
            [325, 90],
            [15, 90],
            [15, 118.5],
            [25, 118.5],
        ],
    },
    {
        name: "orthogonal, the long way round",
        a: { box: { x: 610, y: 390, w: 90, h: 48 }, outline: null },
        b: { box: { x: 580, y: 245, w: 145, h: 70 }, outline: null },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=0.8;exitY=1;entryX=0.5;entryY=0;",
        way: [],
        real: [
            [682, 438],
            [682, 448],
            [600, 448],
            [600, 352.5],
            [735, 352.5],
            [735, 235],
            [652.5, 235],
            [652.5, 245],
        ],
    },
    {
        name: "orthogonal, out of a diamond",
        a: { box: { x: 400, y: 370, w: 135, h: 85 }, outline: "rhombus" },
        b: { box: { x: 590, y: 350, w: 155, h: 70 }, outline: null },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.3;entryX=0;entryY=0.5;",
        way: [],
        real: [
            [515.7, 400.4],
            [562.5, 400.4],
            [562.5, 385],
            [590, 385],
        ],
    },
    {
        name: "orthogonal, out of a diamond off its corner",
        a: { box: { x: 471, y: 151, w: 88, h: 46 }, outline: "rhombus" },
        b: { box: { x: 576, y: 61, w: 138, h: 36 }, outline: null },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.5;entryX=0;entryY=0.5;",
        way: [],
        real: [
            [559, 174],
            [569, 174],
            [569, 124],
            [566, 124],
            [566, 79],
            [576, 79],
        ],
    },
    {
        name: "orthogonal, into an ellipse",
        a: { box: { x: 30, y: 260, w: 130, h: 90 }, outline: null },
        b: { box: { x: 240, y: 43, w: 145, h: 52 }, outline: "ellipse" },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.08;entryX=0;entryY=0.5;",
        way: [],
        real: [
            [160, 267.2],
            [200, 267.2],
            [200, 69],
            [240, 69],
        ],
    },
    {
        name: "orthogonal, between two diamonds",
        a: { box: { x: 470, y: 145, w: 90, h: 50 }, outline: "rhombus" },
        b: { box: { x: 471, y: 151, w: 88, h: 46 }, outline: "rhombus" },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=1;exitY=0.5;entryX=0;entryY=0.5;",
        way: [],
        real: [
            [560, 170],
            [570, 170],
            [570, 174],
            [471, 174],
        ],
    },
    {
        name: "through one waypoint",
        a: { box: { x: 665, y: 285, w: 78, h: 46 }, outline: null },
        b: { box: { x: 610, y: 455, w: 175, h: 82 }, outline: null },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=1;entryX=0.5;entryY=0;",
        way: [{ x: 704, y: 435 }],
        real: [
            [704, 331],
            [704, 435],
            [697.5, 435],
            [697.5, 455],
        ],
    },
    {
        name: "through two waypoints",
        a: { box: { x: 645, y: 267, w: 135, h: 58 }, outline: null },
        b: { box: { x: 40, y: 440, w: 570, h: 100 }, outline: null },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=0;exitY=0.5;entryX=1;entryY=0.5;",
        way: [
            { x: 625, y: 296 },
            { x: 625, y: 490 },
        ],
        real: [
            [645, 296],
            [625, 296],
            [625, 490],
            [610, 490],
        ],
    },
    {
        name: "through two waypoints with a step at the shape",
        a: { box: { x: 580, y: 245, w: 145, h: 70 }, outline: null },
        b: { box: { x: 600, y: 490, w: 155, h: 78 }, outline: null },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=0.8;exitY=1;entryX=0.2;entryY=0.7;",
        way: [
            { x: 750, y: 335 },
            { x: 770, y: 475 },
        ],
        real: [
            [696, 315],
            [696, 335],
            [750, 335],
            [750, 475],
            [600, 475],
            [600, 555],
        ],
    },
    {
        name: "through three waypoints",
        a: { box: { x: 170, y: 50, w: 130, h: 52 }, outline: null },
        b: { box: { x: 325, y: 505, w: 155, h: 68 }, outline: null },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=0.3;exitY=0;entryX=0;entryY=0.2;",
        way: [
            { x: 150, y: 30 },
            { x: 150, y: 518 },
            { x: 300, y: 518 },
        ],
        real: [
            [209, 50],
            [150, 50],
            [150, 518.6],
            [325, 518.6],
        ],
    },
    {
        name: "through waypoints out of a diamond",
        a: { box: { x: 205, y: 462, w: 155, h: 52 }, outline: "rhombus" },
        b: { box: { x: 390, y: 403, w: 195, h: 48 }, outline: null },
        style: "edgeStyle=orthogonalEdgeStyle;exitX=0.5;exitY=1;entryX=0.5;entryY=0;",
        way: [
            { x: 282, y: 438 },
            { x: 350, y: 438 },
        ],
        real: [
            [282.5, 514],
            [282.5, 438],
            [350, 438],
            [350, 403],
            [487.5, 403],
        ],
    },
]

/** Only the corners of a path */
function corners(path: { x: number; y: number }[]) {
    const out: { x: number; y: number }[] = []
    for (const p of path) {
        const a = out[out.length - 1]
        if (a && Math.abs(a.x - p.x) < 0.6 && Math.abs(a.y - p.y) < 0.6)
            continue
        const b = out[out.length - 2]
        if (
            b &&
            ((Math.abs(b.x - a.x) < 0.6 && Math.abs(a.x - p.x) < 0.6) ||
                (Math.abs(b.y - a.y) < 0.6 && Math.abs(a.y - p.y) < 0.6))
        ) {
            out.pop()
        }
        out.push(p)
    }
    return out
}

describe("the path of a connector as draw.io draws it", () => {
    it.each(CASES)("$name", ({ a, b, style, way, real }) => {
        const path = drawnPath(a, b, style, way)
        expect(path).not.toBeNull()
        const mine = corners(path ?? [])
        expect(mine).toHaveLength(real.length)
        mine.forEach((p, i) => {
            expect(Math.abs(p.x - real[i][0])).toBeLessThanOrEqual(1.5)
            expect(Math.abs(p.y - real[i][1])).toBeLessThanOrEqual(1.5)
        })
    })

    it("is not known for an edge style whose rules are not here", () => {
        const box = (x: number): End => ({
            box: { x, y: 0, w: 100, h: 40 },
            outline: null,
        })
        expect(
            drawnPath(
                box(0),
                box(300),
                "edgeStyle=entityRelationEdgeStyle;",
                [],
            ),
        ).toBeNull()
    })
})

describe("the end of a connector on a shape", () => {
    const diamond: End = {
        box: { x: 0, y: 0, w: 100, h: 60 },
        outline: "rhombus",
    }
    const rect: End = { box: { x: 0, y: 0, w: 100, h: 60 }, outline: null }

    it("lies where the style says on a rectangle, and on the outline of a diamond", () => {
        expect(portOf(rect, "exitX=0.8;exitY=1;", "exit")).toEqual({
            x: 80,
            y: 60,
        })
        // (from the middle towards that point, up to the diamond's side)
        const p = portOf(diamond, "exitX=0.8;exitY=1;", "exit")
        expect(p?.x).toBeCloseTo(68.75, 1)
        expect(p?.y).toBeCloseTo(48.75, 1)
        expect(portOf(diamond, "exitX=0.5;exitY=1;", "exit")).toEqual({
            x: 50,
            y: 60,
        })
        expect(portOf(rect, "entryX=0;entryY=0.5;", "exit")).toBeNull()
        // (a point inside a rectangle: out from the middle through it;
        // the middle itself: the right side)
        expect(portOf(rect, "exitX=0.75;exitY=0.5;", "exit")).toEqual({
            x: 100,
            y: 30,
        })
        expect(portOf(rect, "exitX=0.5;exitY=0.5;", "exit")).toEqual({
            x: 100,
            y: 30,
        })
        expect(
            portOf(rect, "exitX=0.5;exitY=0.5;exitPerimeter=0;", "exit"),
        ).toEqual({ x: 50, y: 30 })
    })

    it("is on the side it lies nearest to", () => {
        expect(sideOf(rect.box, { x: 100, y: 30 })).toBe("right")
        expect(sideOf(rect.box, { x: 68.75, y: 48.75 })).toBe("bottom")
        expect(sideOf(rect.box, { x: 100, y: 60 })).toBeNull()
        expect(sideOf(rect.box, { x: 150, y: 30 })).toBeNull()
    })
})
