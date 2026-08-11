import { describe, expect, it } from "vitest"
import type { Operation } from "@/lib/diagram-engine"
import { restructureDiagram } from "@/lib/diagram-engine"
import {
    absoluteRects,
    escapesParent,
    outsidePage,
    overlaps,
} from "./fixtures/geometry"

const page = (x: string) => {
    const m = x.match(/pageWidth="(\d+)" pageHeight="(\d+)"/)!
    return { w: +m[1], h: +m[2], aspect: +m[1] / +m[2] }
}
const ink = (x: string) => {
    const p = page(x)
    let a = 0
    for (const [, r] of absoluteRects(x)) a += r.w * r.h
    return a / (p.w * p.h)
}

/**
 * The whole pipeline on one realistic diagram, built exactly the way the tool description
 * tells the model to build a poster.
 *
 * Every other test here checks one field in isolation, and each of those passed while the
 * realistic case was still wrong: the declared 2:1 columns came out 1:1 because the row
 * holding them was never given a width, and the declared portrait page came out landscape
 * because widening the page rewraps the text and shortens it, which one pass cannot account
 * for. Neither showed up until the pieces were used together.
 */
describe("a poster built exactly as the tool description now instructs", () => {
    const r = restructureDiagram("", [
        { op: "set_page", aspect: 0.8 },
        {
            op: "add_container",
            id: "page",
            label: "",
            dir: "col",
            class: "gap-4",
        },
        {
            op: "add_box",
            id: "mast",
            parent: "page",
            label: "Chain-of-Thought Prompting",
            role: "banner",
            class: "self-stretch",
        },
        {
            op: "add_box",
            id: "by",
            parent: "page",
            label: "Wei et al., 2022 · NeurIPS",
            role: "muted",
        },
        {
            op: "add_container",
            id: "cols",
            parent: "page",
            label: "",
            dir: "row",
            class: "gap-4",
        },
        {
            op: "add_container",
            id: "left",
            parent: "cols",
            label: "",
            dir: "col",
            class: "grow-2 min-w-0 gap-3 items-stretch",
        },
        {
            op: "add_container",
            id: "right",
            parent: "cols",
            label: "",
            dir: "col",
            class: "grow-1 min-w-0 gap-3 items-stretch justify-between",
        },
        {
            op: "add_box",
            id: "h1",
            parent: "left",
            label: "What it is",
            role: "heading",
            group: "idea",
        },
        {
            op: "add_box",
            id: "p1",
            parent: "left",
            label: "Ask the model to lay out its intermediate steps before answering, instead of jumping straight to a result.",
            group: "idea",
        },
        {
            op: "add_box",
            id: "h2",
            parent: "left",
            label: "Why it helps",
            role: "heading",
            group: "why",
        },
        {
            op: "add_box",
            id: "p2",
            parent: "left",
            label: "Breaking a hard problem into easy sub-steps makes the reasoning visible, so it can be checked and debugged. The biggest gains show up on maths, logic and multi-hop questions.",
            group: "why",
        },
        {
            op: "add_box",
            id: "h3",
            parent: "left",
            label: "Worked example",
            role: "heading",
            group: "eg",
        },
        {
            op: "add_box",
            id: "p3",
            parent: "left",
            label: "Roger has 5 tennis balls and buys 2 cans of 3 balls each. 2 x 3 = 6 new balls; 5 + 6 = 11 balls.",
            group: "eg",
        },
        {
            op: "add_box",
            id: "h4",
            parent: "right",
            label: "Costs & limits",
            role: "heading",
            group: "cost",
        },
        {
            op: "add_box",
            id: "p4",
            parent: "right",
            label: "More tokens, slower, pricier.",
            group: "cost",
        },
        {
            op: "add_box",
            id: "p5",
            parent: "right",
            label: "Steps can look sound yet still be wrong.",
            role: "bad",
        },
        {
            op: "add_box",
            id: "m1",
            parent: "right",
            label: "+40%",
            role: "metric",
        },
        {
            op: "add_box",
            id: "p6",
            parent: "right",
            label: "Mainly emerges in large models.",
            role: "muted",
        },
    ] as Operation[])

    it("builds cleanly, portrait, in proportion, with nothing spilling", () => {
        expect(r.errors).toEqual([])
        const xml = r.xml as string
        const p = page(xml)
        const rects = absoluteRects(xml)
        console.log("  page:", p, " ink:", (ink(xml) * 100).toFixed(0) + "%")
        console.log(
            "  columns — left:",
            rects.get("left")!.w,
            "right:",
            rects.get("right")!.w,
            "ratio:",
            (rects.get("left")!.w / rects.get("right")!.w).toFixed(2),
        )
        console.log("  warnings:", r.warnings.length ? r.warnings : "none")

        // Portrait was asked for.
        expect(p.aspect).toBeLessThan(1.0)
        // 2:1 was asked for, and min-w-0 was given on both columns.
        const ratio = rects.get("left")!.w / rects.get("right")!.w
        expect(ratio).toBeGreaterThan(1.8)
        expect(ratio).toBeLessThan(2.2)
        // Nothing broken.
        expect(overlaps(rects, ["left", "right"])).toEqual([])
        expect(escapesParent(xml)).toEqual([])
        expect(outsidePage(xml)).toEqual([])
    })

    it("re-reading the canvas gives the same diagram back", () => {
        const again = restructureDiagram(r.xml as string, [])
        expect(again.errors).toEqual([])
        expect(page(again.xml as string)).toEqual(page(r.xml as string))
        const third = restructureDiagram(again.xml as string, [])
        expect(third.xml).toBe(again.xml)
    })
})
