import { describe, expect, it } from "vitest"
import {
    drawGraph,
    type GraphEdge,
    type GraphNode,
    graphToOperations,
} from "@/lib/diagram-engine"
import {
    absoluteRects,
    edgePaths,
    nodeCollisions,
    rectOf,
} from "./fixtures/geometry"

const n = (id: string, label = id): GraphNode => ({ id, label })
const e = (source: string, target: string, label?: string): GraphEdge => ({
    source,
    target,
    ...(label ? { label } : {}),
})

describe("graphToOperations: layering", () => {
    it("puts a chain in one node per layer", () => {
        const { layers } = graphToOperations(
            [n("a"), n("b"), n("c")],
            [e("a", "b"), e("b", "c")],
        )
        expect(layers).toEqual([["a"], ["b"], ["c"]])
    })

    it("puts the branches of a decision in the same layer", () => {
        const { layers } = graphToOperations(
            [n("q"), n("yes"), n("no")],
            [e("q", "yes"), e("q", "no")],
        )
        expect(layers[0]).toEqual(["q"])
        expect(layers[1].sort()).toEqual(["no", "yes"])
    })

    it("uses the LONGEST path, so no arrow points sideways", () => {
        // a→b, a→c, c→b. The shortest path would put b in layer 1 beside c, leaving c→b
        // pointing sideways. b has to come after c.
        const { layers } = graphToOperations(
            [n("a"), n("b"), n("c")],
            [e("a", "b"), e("a", "c"), e("c", "b")],
        )
        expect(layers).toEqual([["a"], ["c"], ["b"]])
    })

    it("keeps a node with no arrows at all", () => {
        const { layers } = graphToOperations(
            [n("a"), n("b"), n("island")],
            [e("a", "b")],
        )
        expect(layers.flat().sort()).toEqual(["a", "b", "island"])
    })

    it("draws a loop but does not let it set the layering", () => {
        const r = graphToOperations(
            [n("a"), n("b"), n("c")],
            [e("a", "b"), e("b", "c"), e("c", "a")],
        )
        expect(r.layers).toEqual([["a"], ["b"], ["c"]])
        expect(r.backEdges).toEqual([{ source: "c", target: "a" }])
        // The loop is still drawn.
        expect(r.operations.filter((o) => o.op === "link").length).toBe(3)
    })

    it("draws a self-loop and keeps it out of the layering", () => {
        const r = graphToOperations(
            [n("a"), n("b")],
            [e("a", "b"), e("a", "a")],
        )
        expect(r.layers).toEqual([["a"], ["b"]])
        expect(r.operations.filter((o) => o.op === "link").length).toBe(2)
    })

    it("reports an edge naming a node that does not exist", () => {
        const r = graphToOperations([n("a")], [e("a", "ghost")])
        expect(r.unknownEndpoints).toEqual(["ghost"])
        expect(r.operations.filter((o) => o.op === "link")).toEqual([])
    })

    it("survives a graph that is nothing but a cycle", () => {
        const r = graphToOperations(
            [n("a"), n("b")],
            [e("a", "b"), e("b", "a")],
        )
        expect(r.layers.flat().sort()).toEqual(["a", "b"])
    })
})

describe("graphToOperations: within-layer ordering", () => {
    it("reverses a layer when that removes the crossings", () => {
        // a→z, b→y, c→x. Declared order would make all three cross.
        const { layers } = graphToOperations(
            [n("a"), n("b"), n("c"), n("x"), n("y"), n("z")],
            [e("a", "z"), e("b", "y"), e("c", "x")],
        )
        expect(layers[0]).toEqual(["a", "b", "c"])
        expect(layers[1]).toEqual(["z", "y", "x"])
    })

    it("leaves an already-good order alone", () => {
        const { layers } = graphToOperations(
            [n("a"), n("b"), n("x"), n("y")],
            [e("a", "x"), e("b", "y")],
        )
        expect(layers[1]).toEqual(["x", "y"])
    })
})

describe("graphToOperations: emitted operations", () => {
    it("does not wrap a layer holding one node", () => {
        const { operations } = graphToOperations(
            [n("a"), n("b")],
            [e("a", "b")],
        )
        const containers = operations.filter((o) => o.op === "add_container")
        // Only the outer flow container: neither single-node layer needs a wrapper.
        expect(containers.length).toBe(1)
    })

    it("wraps a layer holding several nodes", () => {
        const { operations } = graphToOperations(
            [n("q"), n("yes"), n("no")],
            [e("q", "yes"), e("q", "no")],
        )
        const containers = operations.filter((o) => o.op === "add_container")
        expect(containers.length).toBe(2)
        // The layer band runs ACROSS the flow.
        const band = containers.find((c) => c.id !== "__layers")
        expect(band?.dir).toBe("row")
    })

    it("flips both axes when the flow runs left to right", () => {
        const { operations } = graphToOperations(
            [n("q"), n("yes"), n("no")],
            [e("q", "yes"), e("q", "no")],
            { flow: "row" },
        )
        const containers = operations.filter((o) => o.op === "add_container")
        expect(containers.find((c) => c.id === "__layers")?.dir).toBe("row")
        expect(containers.find((c) => c.id !== "__layers")?.dir).toBe("col")
    })

    it("carries shapes and labels through", () => {
        const { operations } = graphToOperations(
            [
                { id: "s", label: "Start", shape: "terminator" },
                { id: "q", label: "OK?", shape: "decision" },
            ],
            [e("s", "q", "go")],
        )
        const boxes = operations.filter((o) => o.op === "add_box")
        expect(boxes.map((b) => b.shape)).toEqual(["terminator", "decision"])
        expect(operations.find((o) => o.op === "link")?.label).toBe("go")
    })

    it("emits an icon node as an icon", () => {
        const { operations } = graphToOperations(
            [{ id: "s3", label: "Bucket", icon: "s3" }],
            [],
        )
        const icon = operations.find((o) => o.op === "add_icon")
        expect(icon).toMatchObject({ id: "s3", name: "s3", label: "Bucket" })
    })

    it("does not emit a plain box shape as an explicit shape", () => {
        const { operations } = graphToOperations(
            [{ id: "a", label: "A", shape: "box" }],
            [],
        )
        expect(operations.find((o) => o.op === "add_box")).not.toHaveProperty(
            "shape",
        )
    })
})

describe("drawGraph: the whole pipeline", () => {
    it("draws a decision flow with no arrow hitting an unrelated box", () => {
        const ids = ["start", "check", "mgr", "auto", "ship", "reject"]
        const r = drawGraph(
            [
                { id: "start", label: "Order received", shape: "terminator" },
                { id: "check", label: "Amount > $1000?", shape: "decision" },
                n("mgr", "Manager approval"),
                n("auto", "Auto-approve"),
                n("ship", "Ship order"),
                { id: "reject", label: "Reject", shape: "terminator" },
            ],
            [
                e("start", "check"),
                e("check", "mgr", "yes"),
                e("check", "auto", "no"),
                e("mgr", "ship", "approved"),
                e("mgr", "reject", "denied"),
                e("auto", "ship"),
            ],
            { title: "Order Approval" },
        )
        expect(r.errors).toEqual([])
        const xml = r.xml as string
        const rects = absoluteRects(xml)
        expect(nodeCollisions(edgePaths(xml, rects), rects, ids)).toEqual([])

        // Layers descend in flow order.
        expect(rectOf(rects, "start").y).toBeLessThan(rectOf(rects, "check").y)
        expect(rectOf(rects, "check").y).toBeLessThan(rectOf(rects, "mgr").y)
        expect(rectOf(rects, "mgr").y).toBe(rectOf(rects, "auto").y)

        expect(xml).toContain("Order Approval")
    })

    it("renders a decision as a diamond and a terminator as a stadium", () => {
        const r = drawGraph(
            [
                { id: "s", label: "Start", shape: "terminator" },
                { id: "q", label: "OK?", shape: "decision" },
                { id: "d", label: "Report", shape: "document" },
                { id: "i", label: "Input", shape: "data" },
            ],
            [e("s", "q"), e("q", "d"), e("q", "i")],
        )
        expect(r.errors).toEqual([])
        const xml = r.xml as string
        expect(xml).toMatch(/id="q"[^>]*rhombus/)
        expect(xml).toMatch(/id="s"[^>]*arcSize=50/)
        expect(xml).toMatch(/id="d"[^>]*shape=document/)
        expect(xml).toMatch(/id="i"[^>]*shape=parallelogram/)
    })

    it("keeps a 14-node pipeline free of arrows through boxes", () => {
        const ids = [
            "commit",
            "lint",
            "unit",
            "build",
            "itest",
            "sec",
            "stage",
            "smoke",
            "approve",
            "prod",
            "canary",
            "monitor",
            "alert",
            "rollback",
        ]
        const r = drawGraph(
            ids.map((id) => n(id)),
            [
                e("commit", "lint"),
                e("commit", "unit"),
                e("lint", "build"),
                e("unit", "build"),
                e("build", "itest"),
                e("build", "sec"),
                e("itest", "stage"),
                e("sec", "stage"),
                e("stage", "smoke"),
                e("smoke", "approve"),
                e("approve", "prod"),
                e("prod", "canary"),
                e("canary", "monitor"),
                e("monitor", "alert"),
                e("alert", "rollback"),
                e("rollback", "stage"),
            ],
        )
        expect(r.errors).toEqual([])
        const rects = absoluteRects(r.xml as string)
        expect(
            nodeCollisions(edgePaths(r.xml as string, rects), rects, ids),
        ).toEqual([])
    })

    it("rejects an empty node list rather than drawing nothing", () => {
        const r = drawGraph([], [])
        expect(r.xml).toBeNull()
        expect(r.errors[0]).toContain("no nodes")
    })

    it("rejects a duplicate id instead of silently dropping one", () => {
        const r = drawGraph([n("a"), n("a")], [])
        expect(r.xml).toBeNull()
        expect(r.errors[0]).toContain("duplicate")
    })

    it("warns about an edge naming a node that is not there", () => {
        const r = drawGraph([n("a")], [e("a", "ghost")])
        expect(r.errors).toEqual([])
        expect(r.warnings.join(" ")).toContain("ghost")
    })

    it("warns which arrows were treated as loops", () => {
        const r = drawGraph(
            [n("a"), n("b")],
            [e("a", "b"), e("b", "a", "retry")],
        )
        expect(r.errors).toEqual([])
        expect(r.warnings.join(" ")).toContain("b→a")
    })
})
