import { describe, expect, it } from "vitest"
import { drawGraph, restructureDiagram } from "@/lib/diagram-engine"
import {
    absoluteRects,
    escapesParent,
    outsidePage,
    overlaps,
    rectOf,
} from "./fixtures/geometry"

/**
 * Roles: a node says WHAT IT IS and the engine's theme decides how that looks.
 *
 * This is what lets one engine cover poster-style content — paper summaries, cheat
 * sheets — that previously had to be hand-written XML with no layout guarantees. The
 * model judges "this is a heading, this is a warning"; the theme guarantees the same
 * role always renders the same way.
 */

const styleOf = (xml: string, id: string): string =>
    xml.match(new RegExp(`id="${id}"[^>]*style="([^"]*)"`))?.[1] ?? ""
const last = (style: string, key: string): string | undefined =>
    [...style.matchAll(new RegExp(`${key}=([^;]*)`, "g"))].pop()?.[1]

describe("roles", () => {
    it("styles each role from the theme, and measures type at its real size", () => {
        const r = restructureDiagram("", [
            { op: "add_container", id: "page", label: "", dir: "col", gap: 12 },
            {
                op: "add_box",
                id: "mast",
                parent: "page",
                label: "Title",
                role: "banner",
            },
            {
                op: "add_box",
                id: "note",
                parent: "page",
                label: "fine print",
                role: "muted",
            },
            {
                op: "add_box",
                id: "num",
                parent: "page",
                label: "18% -> 57%",
                role: "metric",
            },
            { op: "add_box", id: "plain", parent: "page", label: "ordinary" },
        ])
        expect(r.errors).toEqual([])
        const xml = r.xml as string
        expect(last(styleOf(xml, "mast"), "fontSize")).toBe("20")
        expect(last(styleOf(xml, "mast"), "fillColor")).toBe("#1A237E")
        expect(last(styleOf(xml, "note"), "fontSize")).toBe("9")
        expect(last(styleOf(xml, "num"), "fontSize")).toBe("20")
        // The default look is unchanged: the fallback's own 11px, no theme tokens.
        expect(last(styleOf(xml, "plain"), "fontSize")).toBe("11")
        expect(styleOf(xml, "plain")).not.toContain("dai_role")

        // Layout reserved room for the larger type: the banner's cell is taller than a
        // plain box, or its 20px line would overflow.
        const rects = absoluteRects(xml)
        expect(rectOf(rects, "mast").h).toBeGreaterThan(
            rectOf(rects, "plain").h,
        )
    })

    it("a banner spans its column; a heading spans its section", () => {
        const r = restructureDiagram("", [
            { op: "add_container", id: "page", label: "", dir: "col", gap: 12 },
            {
                op: "add_box",
                id: "mast",
                parent: "page",
                label: "T",
                role: "banner",
            },
            {
                op: "add_container",
                id: "wide",
                parent: "page",
                label: "",
                dir: "row",
                gap: 12,
            },
            {
                op: "add_box",
                id: "a",
                parent: "wide",
                label: "left column content here",
            },
            {
                op: "add_box",
                id: "b",
                parent: "wide",
                label: "right column content here",
            },
        ])
        const rects = absoluteRects(r.xml as string)
        const mast = rectOf(rects, "mast")
        const wide = rectOf(rects, "wide")
        // The masthead fills the page column's width, not just its own text width.
        expect(mast.w).toBeGreaterThanOrEqual(wide.w - 1)
    })

    it("roles survive the round trip", () => {
        const r = restructureDiagram("", [
            { op: "add_box", id: "m", label: "Title", role: "banner" },
        ])
        const again = restructureDiagram(r.xml as string, [])
        expect(styleOf(again.xml as string, "m")).toContain("dai_role=banner")
        expect(last(styleOf(again.xml as string, "m"), "fontSize")).toBe("20")
        // Fixed point: a third pass matches the second.
        const third = restructureDiagram(again.xml as string, [])
        expect(third.xml).toBe(again.xml)
    })

    it("draw_graph nodes accept roles too", () => {
        const r = drawGraph(
            [
                { id: "t", label: "Pipeline", role: "heading" },
                { id: "a", label: "Build" },
                { id: "warn", label: "Flaky stage", role: "bad" },
            ],
            [
                { source: "t", target: "a" },
                { source: "a", target: "warn" },
            ],
        )
        expect(r.errors).toEqual([])
        expect(last(styleOf(r.xml as string, "warn"), "fillColor")).toBe(
            "#F8CECC",
        )
    })

    it("a full poster lays out with no sibling overlaps and nothing outside the page", () => {
        const r = restructureDiagram("", [
            { op: "add_container", id: "page", label: "", dir: "col", gap: 16 },
            {
                op: "add_box",
                id: "mast",
                parent: "page",
                label: "Chain-of-Thought Prompting",
                role: "banner",
            },
            {
                op: "add_box",
                id: "byline",
                parent: "page",
                label: "Wei et al. | NeurIPS 2022",
                role: "muted",
            },
            {
                op: "add_container",
                id: "cols",
                parent: "page",
                label: "",
                dir: "row",
                gap: 20,
            },
            {
                op: "add_container",
                id: "c1",
                parent: "cols",
                label: "",
                dir: "col",
                gap: 14,
            },
            {
                op: "add_container",
                id: "c2",
                parent: "cols",
                label: "",
                dir: "col",
                gap: 14,
            },
            {
                op: "add_container",
                id: "core",
                parent: "c1",
                label: "Core Idea",
                role: "heading",
                dir: "col",
                gap: 8,
            },
            {
                op: "add_box",
                id: "def",
                parent: "core",
                label: "CoT = intermediate reasoning steps",
                role: "callout",
            },
            {
                op: "add_container",
                id: "vs",
                parent: "c1",
                label: "Standard vs CoT",
                role: "heading",
                dir: "row",
                gap: 8,
            },
            {
                op: "add_box",
                id: "std",
                parent: "vs",
                label: "Often wrong",
                role: "bad",
            },
            {
                op: "add_box",
                id: "cot",
                parent: "vs",
                label: "Correct",
                role: "good",
            },
            {
                op: "add_container",
                id: "res",
                parent: "c2",
                label: "Key Results",
                role: "heading",
                dir: "col",
                gap: 8,
            },
            {
                op: "add_box",
                id: "m1",
                parent: "res",
                label: "GSM8K: 18% -> 57%",
                role: "metric",
            },
        ])
        expect(r.errors).toEqual([])
        const xml = r.xml as string
        const rects = absoluteRects(xml)
        // Overlaps are judged among siblings — containment of children is by design.
        const parentOfId = new Map<string, string>()
        for (const m of xml.matchAll(
            /<mxCell id="([^"]+)"[^>]*vertex="1" parent="([^"]+)"/g,
        ))
            parentOfId.set(m[1], m[2])
        const byParent = new Map<string, string[]>()
        for (const [id, p] of parentOfId) {
            if (id.startsWith("__")) continue
            const l = byParent.get(p) ?? []
            l.push(id)
            byParent.set(p, l)
        }
        for (const sibs of byParent.values())
            expect(overlaps(rects, sibs)).toEqual([])
        expect(outsidePage(xml)).toEqual([])
        expect(escapesParent(xml)).toEqual([])
    })
})
