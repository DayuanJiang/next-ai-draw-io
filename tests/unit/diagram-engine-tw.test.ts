import { describe, expect, it } from "vitest"
import type { Operation } from "@/lib/diagram-engine"
import { restructureDiagram } from "@/lib/diagram-engine"
import { parseDiagram } from "@/lib/diagram-engine/parse"
import { parseTw } from "@/lib/diagram-engine/tw"
import type { BoxNode } from "@/lib/diagram-engine/types"
import { absoluteRects, rectOf } from "./fixtures/geometry"

describe("parseTw", () => {
    it("reads direction, weights, alignment and distribution", () => {
        expect(
            parseTw("flex flex-col grow-3 items-stretch justify-between"),
        ).toEqual({
            dir: "col",
            grow: 3,
            alignItems: "stretch",
            justify: "between",
            ignored: [],
        })
    })

    it("puts spacing on Tailwind's 4px scale", () => {
        const r = parseTw("p-6 gap-4")
        expect(r.pad).toBe(24)
        expect(r.gap).toBe(16)
    })

    it("treats a width fraction as a share of the row", () => {
        // w-2/3 beside w-1/3 has to be the same layout as grow-2 beside grow-1.
        expect(parseTw("w-2/3").grow).toBe(2)
        expect(parseTw("w-1/3").grow).toBe(1)
    })

    it("reads both named and numeric max-width", () => {
        expect(parseTw("max-w-md").maxW).toBe(448)
        expect(parseTw("max-w-96").maxW).toBe(384)
    })

    it("later classes win, the way Tailwind's own conflicts resolve", () => {
        expect(parseTw("grow-1 grow-4").grow).toBe(4)
        expect(parseTw("justify-start justify-evenly").justify).toBe("evenly")
    })

    it("collects what it cannot honour instead of failing", () => {
        const r = parseTw(
            "grow-2 uppercase bg-blue-500 rounded-tl-xl hover:p-4",
        )
        expect(r.grow).toBe(2)
        expect(r.ignored).toEqual([
            "uppercase",
            "bg-blue-500",
            "rounded-tl-xl",
            "hover:p-4",
        ])
    })

    it("rejects arbitrary values, so the scale stays a scale", () => {
        // The point of a scale is that there is no p-7.5 and no w-[137px].
        expect(parseTw("p-[13px] w-[137px]").ignored).toEqual([
            "p-[13px]",
            "w-[137px]",
        ])
        expect(parseTw("p-[13px]").pad).toBeUndefined()
    })
})

describe("class on an operation", () => {
    it("drives real geometry: w-3/4 beside w-1/4 splits 3:1", () => {
        // min-w-0 on both, because a column will not otherwise shrink below its own text —
        // real flexbox behaviour, and what makes an exact ratio opt-in.
        const r = restructureDiagram("", [
            { op: "set_page", aspect: 1.3 },
            { op: "add_container", id: "row", label: "", dir: "row" },
            {
                op: "add_container",
                id: "main",
                parent: "row",
                label: "Main",
                dir: "col",
                class: "w-3/4 min-w-0",
            },
            {
                op: "add_container",
                id: "side",
                parent: "row",
                label: "Side",
                dir: "col",
                class: "w-1/4 min-w-0",
            },
            { op: "add_box", id: "a", parent: "main", label: "a" },
            { op: "add_box", id: "b", parent: "side", label: "b" },
        ] as Operation[])
        expect(r.errors).toEqual([])
        const rects = absoluteRects(r.xml as string)
        const ratio = rectOf(rects, "main").w / rectOf(rects, "side").w
        expect(ratio).toBeGreaterThan(2.7)
        expect(ratio).toBeLessThan(3.3)
    })

    it("a max-width class caps a box and its text wraps instead", () => {
        const long =
            "A deliberately long single line that would otherwise stretch its box right across the page"
        // max-w-48 is 192px — below the 260px a plain box already caps itself at, so this
        // is a cap that actually bites. max-w-xs (320) would be a no-op here.
        const capped = restructureDiagram("", [
            { op: "add_box", id: "x", label: long, class: "max-w-48" },
        ] as Operation[])
        const free = restructureDiagram("", [
            { op: "add_box", id: "x", label: long },
        ] as Operation[])
        const a = rectOf(absoluteRects(capped.xml as string), "x")
        const b = rectOf(absoluteRects(free.xml as string), "x")
        expect(a.w).toBeLessThanOrEqual(192)
        // Same text in a narrower box means more lines, so it must be taller.
        expect(a.h).toBeGreaterThan(b.h)
    })

    it("an explicit field outranks the class that says the same thing", () => {
        const r = restructureDiagram("", [
            { op: "set_page", aspect: 1.3 },
            { op: "add_container", id: "row", label: "", dir: "row" },
            {
                op: "add_container",
                id: "L",
                parent: "row",
                label: "L",
                dir: "col",
                class: "grow-1 min-w-0",
                grow: 3,
            },
            {
                op: "add_container",
                id: "R",
                parent: "row",
                label: "R",
                dir: "col",
                grow: 1,
                class: "min-w-0",
            },
            { op: "add_box", id: "a", parent: "L", label: "a" },
            { op: "add_box", id: "b", parent: "R", label: "b" },
        ] as Operation[])
        expect(r.errors).toEqual([])
        const rects = absoluteRects(r.xml as string)
        const ratio = rectOf(rects, "L").w / rectOf(rects, "R").w
        expect(ratio).toBeGreaterThan(2.7)
    })

    it("tells the model which classes it dropped, once each", () => {
        const r = restructureDiagram("", [
            { op: "add_container", id: "c", label: "C", dir: "col" },
            {
                op: "add_box",
                id: "a",
                parent: "c",
                label: "a",
                class: "tracking-wide p-4",
            },
            {
                op: "add_box",
                id: "b",
                parent: "c",
                label: "b",
                class: "tracking-wide grow-2",
            },
        ] as Operation[])
        expect(r.errors).toEqual([])
        const notes = r.warnings.join(" ")
        expect(notes).toContain("tracking-wide")
        // Reported once even though two cards carried it.
        expect(notes.match(/tracking-wide/g)).toHaveLength(1)
    })

    it("a class-driven layout survives a round-trip through the canvas", () => {
        const first = restructureDiagram("", [
            {
                op: "add_container",
                id: "c",
                label: "C",
                dir: "col",
                class: "gap-4 p-6 items-stretch justify-between max-w-lg",
            },
            { op: "add_box", id: "a", parent: "c", label: "a" },
            { op: "add_box", id: "b", parent: "c", label: "b" },
        ] as Operation[])
        expect(first.errors).toEqual([])
        const again = restructureDiagram(first.xml as string, [])
        expect(again.errors).toEqual([])

        // Every field the classes set has to come back, or the next edit would silently
        // drop it: re-reading the canvas is the ONLY place the structure comes from.
        for (const marker of [
            "dai_gap=16", // gap-4
            "dai_pad=24", // p-6
            "dai_aitems=stretch", // items-stretch
            "dai_justify=between", // justify-between
            "dai_maxw=512", // max-w-lg
        ])
            expect(again.xml).toContain(marker)

        // Geometry is the real test of a round-trip: same structure in, same boxes out.
        // (The style string itself is not compared — re-stamping appends a duplicate
        // container=1, which draw.io resolves last-value-wins. See markers.ts.)
        const a = absoluteRects(first.xml as string)
        const b = absoluteRects(again.xml as string)
        for (const id of ["c", "a", "b"])
            expect(rectOf(b, id)).toEqual(rectOf(a, id))

        // And it must reach a fixed point rather than drifting one step per pass.
        const third = restructureDiagram(again.xml as string, [])
        expect(third.xml).toBe(again.xml)
    })
})

/**
 * Text and border classes.
 *
 * The supported set was chosen by reading Tailwind's property index against draw.io's own
 * style reference. These tests pin both halves: that what IS accepted reaches the XML, and
 * that what was rejected stays rejected for the documented reason — the exclusions are the
 * interesting part, because each one is a property draw.io either cannot express at all or
 * can only express coarsely.
 */
describe("text and border classes", () => {
    const styleOf = (xml: string, id: string) =>
        xml.match(new RegExp(`id="${id}"[^>]*style="([^"]*)"`))![1]
    const key = (style: string, k: string) => {
        const all = [...style.matchAll(new RegExp(`(?:^|;)${k}=([^;]*)`, "g"))]
        return all.length ? all[all.length - 1][1] : undefined
    }
    const build = (cls: string) =>
        restructureDiagram("", [
            { op: "add_box", id: "x", label: "Hello", class: cls },
        ] as Operation[])

    it("packs bold, italic and underline into one fontStyle bitmask", () => {
        // draw.io adds the bits: 1 bold + 2 italic + 4 underline = 7. Three separate
        // fontStyle keys would leave only the last one in effect.
        const s = styleOf(
            build("font-bold italic underline").xml as string,
            "x",
        )
        expect(key(s, "fontStyle")).toBe("7")
        expect(s.match(/fontStyle=/g)).toHaveLength(1)

        expect(
            key(styleOf(build("font-bold").xml as string, "x"), "fontStyle"),
        ).toBe("1")
        expect(
            key(styleOf(build("italic").xml as string, "x"), "fontStyle"),
        ).toBe("2")
        expect(
            key(styleOf(build("underline").xml as string, "x"), "fontStyle"),
        ).toBe("4")
        expect(
            key(
                styleOf(build("font-bold italic").xml as string, "x"),
                "fontStyle",
            ),
        ).toBe("3")
    })

    it("maps the type scale to Tailwind's own pixel values", () => {
        for (const [cls, px] of [
            ["text-xs", "12"],
            ["text-base", "16"],
            ["text-2xl", "24"],
            ["text-4xl", "36"],
        ] as const)
            expect(
                key(styleOf(build(cls).xml as string, "x"), "fontSize"),
            ).toBe(px)
    })

    it("sets both text alignments", () => {
        const s = styleOf(build("text-right align-bottom").xml as string, "x")
        expect(key(s, "align")).toBe("right")
        expect(key(s, "verticalAlign")).toBe("bottom")
    })

    it("an explicit alignment beats the paragraph heuristic", () => {
        // A long label is set flush left automatically. Asking for centre has to win, or
        // the class would silently do nothing on exactly the labels it matters for.
        const long =
            "A label long enough that the engine sets it flush left by itself, well past sixty characters"
        const auto = restructureDiagram("", [
            { op: "add_box", id: "x", label: long },
        ] as Operation[])
        const forced = restructureDiagram("", [
            { op: "add_box", id: "x", label: long, class: "text-center" },
        ] as Operation[])
        expect(key(styleOf(auto.xml as string, "x"), "align")).toBe("left")
        expect(key(styleOf(forced.xml as string, "x"), "align")).toBe("center")
    })

    it("border width and dash style reach the stroke", () => {
        expect(
            key(styleOf(build("border-4").xml as string, "x"), "strokeWidth"),
        ).toBe("4")
        expect(
            key(styleOf(build("border").xml as string, "x"), "strokeWidth"),
        ).toBe("1")

        const dashed = styleOf(build("border-dashed").xml as string, "x")
        expect(key(dashed, "dashed")).toBe("1")
        expect(key(dashed, "dashPattern")).toBeUndefined()

        // Dotted needs the pattern too, or draw.io draws a dash and calls it dotted.
        const dotted = styleOf(build("border-dotted").xml as string, "x")
        expect(key(dotted, "dashed")).toBe("1")
        expect(key(dotted, "dashPattern")).toBe("1 3")
    })

    it("whitespace-nowrap keeps a label on one line", () => {
        expect(
            key(
                styleOf(build("whitespace-nowrap").xml as string, "x"),
                "whiteSpace",
            ),
        ).toBe("nowrap")
    })

    it("rejects the seven font weights draw.io cannot distinguish", () => {
        // draw.io's fontStyle has ONE bold bit, so five of Tailwind's nine weights would
        // collapse onto bold and four onto normal. Reporting them beats pretending.
        for (const w of [
            "font-thin",
            "font-extralight",
            "font-light",
            "font-medium",
            "font-semibold",
            "font-extrabold",
            "font-black",
        ])
            expect(parseTw(w).ignored).toEqual([w])
        // The two that do map are not reported.
        expect(parseTw("font-bold font-normal").ignored).toEqual([])
    })

    it("rejects opacity, because Tailwind's is a free number rather than a scale", () => {
        // draw.io's opacity is 0-100 and would map, but `opacity-<number>` accepts any
        // number — admitting it gives up the constraint that justifies this vocabulary.
        expect(parseTw("opacity-25 opacity-37").ignored).toEqual([
            "opacity-25",
            "opacity-37",
        ])
    })

    it("rejects truncate, which promises an ellipsis draw.io cannot draw", () => {
        // Tailwind's truncate is overflow:hidden + text-overflow:ellipsis + nowrap, and
        // draw.io's overflow has no ellipsis value — the text would just be cut.
        expect(parseTw("truncate").ignored).toEqual(["truncate"])
    })

    it("rejects every outline class, which draw.io has no concept of", () => {
        const outlines = [
            "outline-2",
            "outline-solid",
            "outline-dashed",
            "outline-offset-2",
        ]
        expect(parseTw(outlines.join(" ")).ignored).toEqual(outlines)
    })

    it("rejects per-side borders, which would cost the shape slot", () => {
        // draw.io draws these correctly via shape=partialRectangle, but that is a SHAPE
        // name — a node cannot be both a diamond and left-edge-only, and what a node IS
        // outranks how its border looks.
        const sides = ["border-t", "border-l-4", "border-x", "border-y-2"]
        expect(parseTw(sides.join(" ")).ignored).toEqual(sides)
    })

    it("rejects per-side padding, which draw.io only has for the label", () => {
        // spacingTop/Right/Bottom/Left look like an exact match and are not: they pad the
        // LABEL inside its cell, while this engine's `pad` is room for a container's
        // CHILDREN. Accepting `pt-8` would imply it pushes child nodes down.
        const pads = ["pt-8", "px-4", "pb-2", "ps-6"]
        expect(parseTw(pads.join(" ")).ignored).toEqual(pads)
    })

    it("rejects per-corner radius while accepting the whole-shape one", () => {
        // Per-corner lives only on the mxgraph.basic.rect template shape, which would take
        // the node's own shape — the same trade the per-side borders lose.
        expect(parseTw("rounded-tl-lg rounded-br-sm").ignored).toEqual([
            "rounded-tl-lg",
            "rounded-br-sm",
        ])
        expect(parseTw("rounded-lg").radius).toBe(8)
    })

    it("rejects text-shadow, whose draw.io key really is one flag", () => {
        // Unlike the box shadow family, `textShadow` has no offset or blur, so Tailwind's
        // six sizes would all draw the same picture.
        expect(parseTw("text-shadow-lg").ignored).toEqual(["text-shadow-lg"])
    })

    it("rejects letter-spacing, case and line-height — absent, not coarse", () => {
        const absent = ["tracking-wide", "uppercase", "capitalize", "leading-6"]
        expect(parseTw(absent.join(" ")).ignored).toEqual(absent)
    })

    it("accepts the radius scale in real pixels", () => {
        // Tailwind's own values. These are pixels only because absoluteArcSize switches
        // arcSize off its default percentage reading.
        expect(parseTw("rounded").radius).toBe(4)
        expect(parseTw("rounded-xs").radius).toBe(2)
        expect(parseTw("rounded-md").radius).toBe(6)
        expect(parseTw("rounded-xl").radius).toBe(12)
        expect(parseTw("rounded-2xl").radius).toBe(16)
        expect(parseTw("rounded-3xl").radius).toBe(24)
        expect(parseTw("rounded-4xl").radius).toBe(32)
        expect(parseTw("rounded-none").radius).toBe(0)
        // `rounded-full` is calc(infinity * 1px) in CSS. draw.io clamps to half the shorter
        // side, so the value only has to exceed half the tallest box a diagram ever has —
        // and it must stay readable, because the Arrange panel shows it in an editable field.
        const full = parseTw("rounded-full").radius as number
        expect(full).toBeGreaterThan(200 / 2)
        expect(full).toBeLessThan(1000)
    })

    it("accepts four shadow rungs and an explicit none", () => {
        expect(parseTw("shadow-sm").shadow).toBe(1)
        expect(parseTw("shadow-md").shadow).toBe(2)
        expect(parseTw("shadow-lg").shadow).toBe(3)
        expect(parseTw("shadow-xl").shadow).toBe(4)
        expect(parseTw("shadow-none").shadow).toBe(0)
        // The steps that would be indistinguishable at a diagram's scale, and the colour
        // form, stay out.
        expect(
            parseTw("shadow-2xs shadow-xs shadow-2xl shadow-blue-500").ignored,
        ).toEqual(["shadow-2xs", "shadow-xs", "shadow-2xl", "shadow-blue-500"])
    })

    it("distinguishes no border from a zero-width one", () => {
        // `border-0` must not read as "a 0px border": draw.io would still draw its default
        // hairline. Both forms mean strokeColor=none.
        expect(parseTw("border-none").borderless).toBe(true)
        expect(parseTw("border-0").borderless).toBe(true)
        expect(parseTw("border-0").borderWidth).toBeUndefined()
    })

    it("accepts line-through, and no-underline does not clear it", () => {
        expect(parseTw("line-through").strike).toBe(true)
        // Both are values of text-decoration-line in CSS, so "not underlined" is not
        // "undecorated".
        const r = parseTw("line-through no-underline")
        expect(r.strike).toBe(true)
        expect(r.underline).toBe(false)
    })

    it("does not mistake a colour class for a type size", () => {
        // `text-` is three Tailwind properties at once: size, alignment and colour.
        const r = parseTw("text-red-500 text-lg")
        expect(r.fontSize).toBe(18)
        expect(r.ignored).toEqual(["text-red-500"])
    })

    it("text and border survive a round-trip through the canvas", () => {
        const first = restructureDiagram("", [
            {
                op: "add_box",
                id: "x",
                label: "Note",
                class: "font-bold italic text-lg text-right align-top border-2 border-dashed",
            },
        ] as Operation[])
        expect(first.errors).toEqual([])
        const again = restructureDiagram(first.xml as string, [])
        expect(again.errors).toEqual([])

        const s = styleOf(again.xml as string, "x")
        expect(key(s, "fontStyle")).toBe("3")
        expect(key(s, "fontSize")).toBe("18")
        expect(key(s, "align")).toBe("right")
        expect(key(s, "verticalAlign")).toBe("top")
        expect(key(s, "strokeWidth")).toBe("2")
        expect(key(s, "dashed")).toBe("1")

        // And it settles rather than drifting a step per pass.
        const third = restructureDiagram(again.xml as string, [])
        expect(third.xml).toBe(again.xml)
    })

    it("radius, shadow, strike and borderless survive a round-trip", () => {
        const first = restructureDiagram("", [
            {
                op: "add_box",
                id: "card",
                label: "Card",
                class: "rounded-lg shadow-md",
            },
            {
                op: "add_box",
                id: "field",
                label: "Field",
                class: "border-none",
            },
            {
                op: "add_box",
                id: "old",
                label: "Superseded",
                class: "line-through",
            },
        ] as Operation[])
        expect(first.errors).toEqual([])
        const again = restructureDiagram(first.xml as string, [])
        expect(again.errors).toEqual([])

        const card = styleOf(again.xml as string, "card")
        // A radius needs all three keys: arcSize alone would be read as a percentage.
        expect(key(card, "rounded")).toBe("1")
        expect(key(card, "absoluteArcSize")).toBe("1")
        // Doubled on the way out because draw.io halves it on the way in.
        expect(key(card, "arcSize")).toBe("16")
        expect(key(card, "shadow")).toBe("1")
        expect(key(card, "shadowOffsetY")).toBe("4")
        expect(key(card, "shadowBlur")).toBe("6")

        expect(key(styleOf(again.xml as string, "field"), "strokeColor")).toBe(
            "none",
        )
        // Bit 8, on its own since nothing asked for bold or italic.
        expect(key(styleOf(again.xml as string, "old"), "fontStyle")).toBe("8")

        const third = restructureDiagram(again.xml as string, [])
        expect(third.xml).toBe(again.xml)
    })

    it("a theme's own borderless and square corners are not read as requests", () => {
        // A heading is ghost text — no fill, no stroke, square — because of what it IS, and
        // nearly every box carries `rounded=0` from the fallback style. Recording either as a
        // declared override would outlive a later role change, since `set_role` clears a
        // node's style but keeps its text overrides. Same trap `size` and `align` avoid by
        // comparing against the defaults for the node's kind.
        const first = restructureDiagram("", [
            { op: "add_box", id: "h", label: "Section", role: "heading" },
            { op: "add_box", id: "b", label: "Body", role: "body" },
        ] as Operation[])
        expect(first.errors).toEqual([])

        const t = parseDiagram(first.xml as string).tree
        const heading = t.roots.find((n) => n.id === "h") as BoxNode
        const body = t.roots.find((n) => n.id === "b") as BoxNode
        expect(heading.role).toBe("heading")
        expect(heading.text?.borderless).toBeUndefined()
        expect(heading.text?.radius).toBeUndefined()
        expect(body.text?.radius).toBeUndefined()

        // A class-declared one IS recorded, so the distinction is real rather than a blanket
        // refusal to read these keys.
        const asked = restructureDiagram("", [
            { op: "add_box", id: "x", label: "Field", class: "border-none" },
        ] as Operation[])
        const x = parseDiagram(asked.xml as string).tree.roots.find(
            (n) => n.id === "x",
        ) as BoxNode
        expect(x.text?.borderless).toBe(true)
    })
})
