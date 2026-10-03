import { describe, expect, it } from "vitest"
import { restructureDiagram } from "@/lib/diagram-engine"
import { autoBoxSize } from "@/lib/diagram-engine/layout"
import { parseDiagram } from "@/lib/diagram-engine/parse"
import {
    mergeStyle,
    nearestShape,
    resolveShape,
} from "@/lib/diagram-engine/shapes"

/**
 * The open shape vocabulary: catalog shapes fully understood, anything else passed
 * through. What these tests pin down is not the happy path but the failure modes the
 * design review flagged: silent degradation without feedback, round-trips freezing
 * measurements, appearance-based reverse mapping dropping declarations, and string
 * concatenation emitting contradictory style keys.
 */

const styleOf = (xml: string, id: string): string =>
    xml.match(new RegExp(`id="${id}"[^>]*style="([^"]*)"`))?.[1] ?? ""

describe("style merge ownership", () => {
    it("keeps one token per key, later fragments winning", () => {
        const out = mergeStyle(
            "rounded=0;fillColor=#FFF;",
            "rounded=1;arcSize=50;",
        )
        expect(out.match(/rounded=/g)).toHaveLength(1)
        expect(out).toContain("rounded=1")
        expect(out).toContain("fillColor=#FFF")
    })
    it("a later shape class displaces an earlier bare class", () => {
        expect(mergeStyle("rhombus;", "ellipse;")).not.toContain("rhombus")
        // and an explicit shape= displaces a bare class too
        const out = mergeStyle("rhombus;", "shape=cloud;")
        expect(out).not.toContain("rhombus")
        expect(out).toContain("shape=cloud")
    })
})

describe("shape resolution", () => {
    it("catalog shapes carry their perimeter", () => {
        expect(resolveShape("decision")?.spec.style).toContain(
            "perimeter=rhombusPerimeter",
        )
        expect(resolveShape("hexagon")?.spec.style).toContain(
            "perimeter=hexagonPerimeter2",
        )
    })
    it("unknown-but-safe tokens pass through; injection-capable ones are rejected", () => {
        const pass = resolveShape("mxgraph.flowchart.or")
        expect(pass?.passthrough).toBe(true)
        expect(pass?.spec.style).toBe("shape=mxgraph.flowchart.or;")
        expect(resolveShape("x;fillColor=red")).toBeNull()
        expect(resolveShape("a=b")).toBeNull()
    })
    it("suggests the nearest catalog name for a typo", () => {
        expect(nearestShape("cyclinder")).toBe("cylinder")
        expect(nearestShape("hexgon")).toBe("hexagon")
        expect(nearestShape("zzzzzz")).toBeNull()
    })
})

describe("engine integration", () => {
    it("renders a catalog shape with theme colours composed on top", () => {
        const r = restructureDiagram("", [
            {
                op: "add_box",
                id: "db",
                label: "users",
                shape: "cylinder",
                group: "storage",
            },
        ])
        expect(r.errors).toEqual([])
        const s = styleOf(r.xml as string, "db")
        expect(s).toContain("shape=cylinder3")
        // theme owns colour: the group hue's tint, not the fallback white
        expect(s).toContain("fillColor=#DAE8FC")
        // exactly one fillColor — structured merge, not concatenation
        expect(s.match(/fillColor=/g)).toHaveLength(1)
    })

    it("warns (not errors) on a pass-through token, with a near-match hint", () => {
        const r = restructureDiagram("", [
            { op: "add_box", id: "a", label: "x", shape: "cyclinder" },
        ])
        expect(r.errors).toEqual([])
        expect(r.xml).toBeTruthy()
        expect(r.warnings.join(" ")).toContain('Did you mean "cylinder"?')
    })

    it("rejects an injection-capable token as an error", () => {
        const r = restructureDiagram("", [
            {
                op: "add_box",
                id: "a",
                label: "x",
                shape: "box;container=1",
            },
        ])
        expect(r.errors.join(" ")).toContain("not allowed")
        expect(r.xml).toBeNull()
    })

    it("sizes a decision box larger than a plain box for the same text", () => {
        const text = "Is the request authorized to proceed?"
        const plain = autoBoxSize(text)
        const rhombus = autoBoxSize(text, undefined, "decision")
        expect(rhombus.w).toBeGreaterThan(plain.w * 1.3)
        expect(rhombus.h).toBeGreaterThan(plain.h * 1.3)
    })
})

describe("round trip", () => {
    it("carries the declared token back via dai_shape, aliases intact", () => {
        const r = restructureDiagram("", [
            { op: "add_box", id: "d", label: "choice?", shape: "diamond" },
            { op: "add_box", id: "q", label: "jobs", shape: "queue" },
        ])
        const back = parseDiagram(r.xml as string)
        const d = back.tree.roots.find((n) => n.id === "d")
        const q = back.tree.roots.find((n) => n.id === "q")
        // "diamond" must not come back as "decision" — the declaration survives.
        expect(d?.kind === "box" && d.shape).toBe("diamond")
        // "queue" is a rotated cylinder; appearance alone cannot tell them apart.
        expect(q?.kind === "box" && q.shape).toBe("queue")
    })

    it("re-measures on label change instead of freezing the first layout's size", () => {
        const r1 = restructureDiagram("", [
            { op: "add_box", id: "a", label: "hi" },
        ])
        const r2 = restructureDiagram(r1.xml as string, [
            {
                op: "set_label",
                id: "a",
                label: "a much longer label that plainly needs a wider box to fit",
            },
        ])
        const w = (xml: string) =>
            Number(
                xml.match(
                    /id="a"[^>]*>\s*<mxGeometry[^>]*width="([\d.]+)"/,
                )?.[1],
            )
        expect(w(r2.xml as string)).toBeGreaterThan(w(r1.xml as string))
    })

    it("a box with an mxgraph.* token stays a box, keeping role and group", () => {
        const r = restructureDiagram("", [
            {
                op: "add_box",
                id: "b",
                label: "x",
                shape: "mxgraph.flowchart.or",
                role: "callout",
                group: "z1",
            },
        ])
        const back = parseDiagram(r.xml as string)
        const b = back.tree.roots.find((n) => n.id === "b")
        expect(b?.kind).toBe("box")
        if (b?.kind !== "box") return
        expect(b.shape).toBe("mxgraph.flowchart.or")
        expect(b.role).toBe("callout")
        expect(b.group).toBe("z1")
    })
})

describe("set_shape / set_role / set_group", () => {
    it("changes shape in place, dropping the stale style and size", () => {
        const r1 = restructureDiagram("", [
            { op: "add_box", id: "a", label: "db" },
        ])
        const r2 = restructureDiagram(r1.xml as string, [
            { op: "set_shape", id: "a", shape: "cylinder" },
        ])
        expect(r2.errors).toEqual([])
        expect(styleOf(r2.xml as string, "a")).toContain("shape=cylinder3")
    })
    it("set_role and set_group restyle without losing the label", () => {
        const r1 = restructureDiagram("", [
            { op: "add_box", id: "a", label: "warn" },
        ])
        const r2 = restructureDiagram(r1.xml as string, [
            { op: "set_role", id: "a", role: "bad" },
            { op: "set_group", id: "a", group: "zone1" },
        ])
        expect(r2.errors).toEqual([])
        const s = styleOf(r2.xml as string, "a")
        expect(s).toContain("dai_role=bad")
        expect(s).toContain("dai_group=zone1")
        expect(r2.xml).toContain('value="warn"')
    })
})
