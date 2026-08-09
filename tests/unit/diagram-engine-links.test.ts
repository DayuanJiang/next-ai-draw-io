import { describe, expect, it } from "vitest"
import { restructureDiagram } from "@/lib/diagram-engine"
import { parseDiagram } from "@/lib/diagram-engine/parse"

/**
 * The connection vocabulary: arrowheads carry meaning. A crow's foot IS "many", a
 * hollow diamond IS aggregation — notation, not decoration. The engine passes the
 * head/tail tokens through to draw.io and writes fill explicitly, because UML
 * composition and aggregation differ ONLY by fill.
 */

const styleOfEdge = (xml: string, source: string, target: string): string => {
    const m = xml.match(
        new RegExp(
            `<mxCell [^>]*style="([^"]*)"[^>]*source="${source}" target="${target}"`,
        ),
    )
    return m?.[1] ?? ""
}

const two = [
    { op: "add_box" as const, id: "a", label: "customer" },
    { op: "add_box" as const, id: "b", label: "order" },
]

describe("arrowheads", () => {
    it("passes ER crow's foot through with explicit fill", () => {
        const r = restructureDiagram("", [
            ...two,
            {
                op: "link",
                source: "a",
                target: "b",
                tail: "ERone",
                head: "ERoneToMany",
            },
        ])
        expect(r.errors).toEqual([])
        const s = styleOfEdge(r.xml as string, "a", "b")
        expect(s).toContain("endArrow=ERoneToMany")
        expect(s).toContain("endFill=0")
        expect(s).toContain("startArrow=ERone")
    })

    it("UML: hollow vs filled diamond survive the round trip distinctly", () => {
        const r = restructureDiagram("", [
            ...two,
            {
                op: "link",
                source: "a",
                target: "b",
                head: "diamondThin",
                headFill: true,
            },
        ])
        const back = parseDiagram(r.xml as string)
        const l = back.tree.links.find(
            (x) => x.source === "a" && x.target === "b",
        )
        expect(l?.head).toBe("diamondThin")
        expect(l?.headFill).toBe(true)
    })

    it("rejects an injection-capable arrowhead token", () => {
        const r = restructureDiagram("", [
            ...two,
            { op: "link", source: "a", target: "b", head: "block;dashed=1" },
        ])
        expect(r.errors.join(" ")).toContain("not allowed")
    })
})

describe("parallel edges", () => {
    it("a second edge between the same pair needs an id, then both render", () => {
        const rejected = restructureDiagram("", [
            ...two,
            { op: "link", source: "a", target: "b", label: "places" },
            { op: "link", source: "a", target: "b", label: "cancels" },
        ])
        expect(rejected.errors.join(" ")).toContain("give this one an id")

        const r = restructureDiagram("", [
            ...two,
            { op: "link", source: "a", target: "b", label: "places" },
            {
                op: "link",
                id: "e2",
                source: "a",
                target: "b",
                label: "cancels",
                dashed: true,
            },
        ])
        expect(r.errors).toEqual([])
        const xml = r.xml as string
        expect(xml).toContain('value="places"')
        expect(xml).toContain('value="cancels"')
        // and both come back as separate links
        const back = parseDiagram(xml)
        expect(
            back.tree.links.filter((l) => l.source === "a" && l.target === "b"),
        ).toHaveLength(2)
    })

    it("bold renders thick and survives the round trip", () => {
        const r = restructureDiagram("", [
            ...two,
            { op: "link", source: "a", target: "b", bold: true },
        ])
        expect(styleOfEdge(r.xml as string, "a", "b")).toContain(
            "strokeWidth=4",
        )
        const back = parseDiagram(r.xml as string)
        expect(back.tree.links[0]?.bold).toBe(true)
    })
})
