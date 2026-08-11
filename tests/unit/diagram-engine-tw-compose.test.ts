import { describe, expect, it } from "vitest"
import type { Operation } from "@/lib/diagram-engine"
import { restructureDiagram } from "@/lib/diagram-engine"
import { absoluteRects, escapesParent, outsidePage } from "./fixtures/geometry"

/**
 * The text and border classes used together on a realistic diagram.
 *
 * Every class is unit-tested in isolation above; this checks they compose — that an explicit
 * alignment survives alongside a role, that a dashed frame does not leak onto its sibling,
 * and that none of it disturbs the geometry or the round-trip.
 */
describe("text classes on a real diagram", () => {
    it("a comparison sheet using type, alignment and dashed borders", () => {
        const r = restructureDiagram("", [
            { op: "set_page", aspect: 1.3 },
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
                label: "Deployment options",
                role: "banner",
                class: "self-stretch text-center text-2xl font-bold",
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
                id: "now",
                parent: "cols",
                label: "Today",
                dir: "col",
                class: "grow-1 min-w-0 gap-2 p-3 items-stretch",
                group: "now",
            },
            {
                op: "add_container",
                id: "plan",
                parent: "cols",
                label: "Planned",
                dir: "col",
                class: "grow-1 min-w-0 gap-2 p-3 items-stretch border-2 border-dashed",
                group: "plan",
            },
            {
                op: "add_box",
                id: "n1",
                parent: "now",
                label: "Single region",
                class: "text-left",
                group: "now",
            },
            {
                op: "add_box",
                id: "n2",
                parent: "now",
                label: "99.9% uptime",
                class: "font-bold text-lg",
                group: "now",
            },
            {
                op: "add_box",
                id: "p1",
                parent: "plan",
                label: "Multi region",
                class: "text-left italic",
                group: "plan",
            },
            {
                op: "add_box",
                id: "p2",
                parent: "plan",
                label: "99.99% uptime",
                class: "font-bold text-lg",
                group: "plan",
            },
        ] as Operation[])

        expect(r.errors).toEqual([])
        expect(r.warnings).toEqual([])
        const xml = r.xml as string
        const st = (id: string) =>
            xml.match(new RegExp(`id="${id}"[^>]*style="([^"]*)"`))![1]
        const k = (s: string, key: string) => {
            const all = [
                ...s.matchAll(new RegExp(`(?:^|;)${key}=([^;]*)`, "g")),
            ]
            return all.length ? all[all.length - 1][1] : undefined
        }

        // The masthead: centred 24px bold, and it spans the page.
        expect(k(st("mast"), "align")).toBe("center")
        expect(k(st("mast"), "fontSize")).toBe("24")
        expect(k(st("mast"), "fontStyle")).toBe("1")

        // The "planned" column is dashed; "today" is not.
        expect(k(st("plan"), "dashed")).toBe("1")
        expect(k(st("plan"), "strokeWidth")).toBe("2")
        expect(k(st("now"), "dashed")).toBeUndefined()

        // Type overrides land on the leaves too.
        expect(k(st("n2"), "fontSize")).toBe("18")
        expect(k(st("p1"), "fontStyle")).toBe("2") // italic only
        expect(k(st("p1"), "align")).toBe("left")

        // Nothing broken by any of it.
        const rects = absoluteRects(xml)
        expect(escapesParent(xml)).toEqual([])
        expect(outsidePage(xml)).toEqual([])
        expect(rects.get("mast")!.w).toBe(rects.get("cols")!.w)

        // And it settles.
        const again = restructureDiagram(xml, [])
        expect(again.errors).toEqual([])
        const third = restructureDiagram(again.xml as string, [])
        expect(third.xml).toBe(again.xml)
    })

    it("radius, shadow and borderless compose with roles, groups and shapes", () => {
        const r = restructureDiagram("", [
            { op: "set_page", aspect: 1.2 },
            {
                op: "add_container",
                id: "page",
                label: "",
                dir: "col",
                class: "gap-4",
            },
            // A shape that ALREADY owns rounded/arcSize, with a radius class on top. The
            // class is meant to win: a terminator is a rounded rectangle either way, and
            // changing how round it is does not change what it is.
            {
                op: "add_box",
                id: "start",
                parent: "page",
                label: "Start",
                shape: "terminator",
                class: "rounded-lg self-stretch",
            },
            {
                op: "add_container",
                id: "cards",
                parent: "page",
                label: "",
                dir: "row",
                class: "gap-4",
            },
            // A raised card: radius and shadow together, on top of a role and a group.
            {
                op: "add_box",
                id: "card",
                parent: "cards",
                label: "Raised card",
                role: "body",
                group: "one",
                class: "grow-1 min-w-0 rounded-xl shadow-md",
            },
            // A plain colour field: no outline at all, which nothing else could express.
            {
                op: "add_box",
                id: "field",
                parent: "cards",
                label: "Colour field",
                role: "callout",
                class: "grow-1 min-w-0 border-none rounded-2xl",
            },
            // Struck-through beside bold, to prove the bits add rather than replace.
            {
                op: "add_box",
                id: "gone",
                parent: "page",
                label: "Superseded step",
                class: "line-through font-bold self-stretch",
            },
        ] as Operation[])

        expect(r.errors).toEqual([])
        expect(r.warnings).toEqual([])
        const xml = r.xml as string
        const st = (id: string) =>
            xml.match(new RegExp(`id="${id}"[^>]*style="([^"]*)"`))![1]
        const k = (s: string, key: string) => {
            const all = [
                ...s.matchAll(new RegExp(`(?:^|;)${key}=([^;]*)`, "g")),
            ]
            return all.length ? all[all.length - 1][1] : undefined
        }

        // The class wins over the shape's own proportional corner, and brings the flag that
        // reinterprets the number as pixels. Without absoluteArcSize, 16 would mean 16% of
        // the box — a different radius on every node.
        expect(k(st("start"), "shape")).toBeUndefined() // terminator is rounded=1, not shape=
        expect(k(st("start"), "rounded")).toBe("1")
        expect(k(st("start"), "absoluteArcSize")).toBe("1")
        expect(k(st("start"), "arcSize")).toBe("16")

        // The card keeps its role's fill while taking the class's radius and shadow.
        expect(k(st("card"), "arcSize")).toBe("24")
        expect(k(st("card"), "shadow")).toBe("1")
        expect(k(st("card"), "shadowBlur")).toBe("6")
        expect(k(st("card"), "fillColor")).not.toBe("none")

        // borderless beats the role's own stroke; the role's fill survives, which is the
        // point of a colour field.
        expect(k(st("field"), "strokeColor")).toBe("none")
        expect(k(st("field"), "fillColor")).not.toBe("none")
        expect(k(st("field"), "arcSize")).toBe("32")

        // Bold (1) plus strikethrough (8) in one key.
        expect(k(st("gone"), "fontStyle")).toBe("9")

        // None of it disturbs the layout.
        expect(escapesParent(xml)).toEqual([])
        expect(outsidePage(xml)).toEqual([])
        const rects = absoluteRects(xml)
        expect(rects.get("card")!.w).toBeCloseTo(rects.get("field")!.w, 0)

        // And it settles.
        const again = restructureDiagram(xml, [])
        expect(again.errors).toEqual([])
        const third = restructureDiagram(again.xml as string, [])
        expect(third.xml).toBe(again.xml)
    })
})
