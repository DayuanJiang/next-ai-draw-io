import { describe, expect, it } from "vitest"
import { type Operation, restructureDiagram } from "@/lib/diagram-engine"
import { parseDiagram } from "@/lib/diagram-engine/parse"
import type { SequenceNode } from "@/lib/diagram-engine/types"
import { findNode } from "@/lib/diagram-engine/types"
import {
    absoluteRects,
    escapesParent,
    outsidePage,
    rectOf,
} from "./fixtures/geometry"

const LOGIN: Operation[] = [
    { op: "add_sequence", id: "s", label: "Login flow" },
    { op: "add_box", id: "u", parent: "s", label: "User" },
    { op: "add_box", id: "web", parent: "s", label: "Web App" },
    { op: "add_box", id: "auth", parent: "s", label: "Auth Service" },
    { op: "add_box", id: "db", parent: "s", label: "Database" },
    { op: "link", source: "u", target: "web", label: "credentials", step: 1 },
    {
        op: "link",
        source: "web",
        target: "auth",
        label: "POST /login",
        step: 2,
    },
    { op: "link", source: "auth", target: "db", label: "find user", step: 3 },
    { op: "link", source: "db", target: "auth", label: "user record", step: 4 },
    {
        op: "link",
        source: "auth",
        target: "auth",
        label: "sign token",
        step: 5,
    },
    { op: "link", source: "auth", target: "web", label: "JWT", step: 6 },
    { op: "link", source: "web", target: "u", label: "redirect", step: 7 },
]

const PARTICIPANTS = ["u", "web", "auth", "db"]

/** Each message's y, in the order the cells were written. */
function messageYs(xml: string): { id: string; from: number; to: number }[] {
    return [
        ...xml.matchAll(
            /<mxCell id="(ed\d+)"[\s\S]*?<mxPoint x="-?[\d.]+" y="(-?[\d.]+)" as="sourcePoint"\/><mxPoint x="-?[\d.]+" y="(-?[\d.]+)" as="targetPoint"\/>/g,
        ),
    ].map((m) => ({ id: m[1], from: Number(m[2]), to: Number(m[3]) }))
}

describe("sequence diagram: layout", () => {
    const result = restructureDiagram("", LOGIN)
    const xml = result.xml as string
    const rects = absoluteRects(xml)

    it("builds without errors", () => {
        expect(result.errors).toEqual([])
    })

    it("puts the participants in a row, in declaration order", () => {
        const xs = PARTICIPANTS.map((id) => rectOf(rects, id).x)
        expect(xs).toEqual([...xs].sort((a, b) => a - b))
        // All the heads share a top edge.
        const ys = PARTICIPANTS.map((id) => rectOf(rects, id).y)
        expect(new Set(ys).size).toBe(1)
    })

    it("draws each participant as a lifeline, head and line in one cell", () => {
        // One cell so draw.io keeps them together when the user drags the participant.
        for (const id of PARTICIPANTS)
            expect(xml).toMatch(
                new RegExp(`id="${id}"[^>]*shape=umlLifeline[^>]*size=\\d+`),
            )
    })

    it("makes the lifelines long enough for every message", () => {
        const lowest = Math.max(...messageYs(xml).map((m) => m.to))
        for (const id of PARTICIPANTS) {
            const r = rects.get(id) as { y: number; h: number }
            expect(r.y + r.h).toBeGreaterThan(lowest)
        }
    })

    it("orders the messages down the page by step number", () => {
        const ys = messageYs(xml)
        expect(ys.length).toBe(7)
        const tops = ys.map((m) => Math.min(m.from, m.to))
        expect(tops).toEqual([...tops].sort((a, b) => a - b))
        // No two messages on the same line.
        expect(new Set(tops).size).toBe(7)
    })

    it("draws a message as a horizontal line between two lifelines", () => {
        const ys = messageYs(xml)
        // Every message except the self-call is level.
        const level = ys.filter((m) => m.from === m.to)
        expect(level.length).toBe(6)
    })

    it("steps a self-message out and back a row lower", () => {
        const self = messageYs(xml).find((m) => m.from !== m.to)
        expect(self).toBeDefined()
        expect((self as { to: number }).to).toBeGreaterThan(
            (self as { from: number }).from,
        )
        // Two waypoints take it out to the side and back.
        expect(xml).toMatch(
            /id="ed5"[\s\S]*?<Array as="points"><mxPoint[^>]*\/><mxPoint[^>]*\/><\/Array>/,
        )
    })

    it("keeps everything inside the page and inside its parent", () => {
        expect(outsidePage(xml, ["__title"])).toEqual([])
        expect(escapesParent(xml)).toEqual([])
    })

    it("numbers unnumbered messages in declaration order", () => {
        const r = restructureDiagram("", [
            { op: "add_sequence", id: "s", label: "" },
            { op: "add_box", id: "a", parent: "s", label: "A" },
            { op: "add_box", id: "b", parent: "s", label: "B" },
            { op: "link", source: "a", target: "b", label: "first" },
            { op: "link", source: "b", target: "a", label: "second" },
        ])
        expect(r.errors).toEqual([])
        const ys = messageYs(r.xml as string)
        expect(ys.length).toBe(2)
        expect(ys[0].from).toBeLessThan(ys[1].from)
    })

    it("allows several messages between the same two participants", () => {
        // A back-and-forth conversation is the norm here, so the duplicate-edge guard that
        // protects other diagram kinds must not apply.
        const r = restructureDiagram("", [
            { op: "add_sequence", id: "s", label: "" },
            { op: "add_box", id: "a", parent: "s", label: "A" },
            { op: "add_box", id: "b", parent: "s", label: "B" },
            { op: "link", source: "a", target: "b", label: "ask", step: 1 },
            {
                op: "link",
                source: "a",
                target: "b",
                label: "ask again",
                step: 2,
            },
        ])
        expect(r.errors).toEqual([])
        expect(messageYs(r.xml as string).length).toBe(2)
    })

    it("still rejects a duplicate edge outside a sequence diagram", () => {
        const r = restructureDiagram("", [
            { op: "add_box", id: "a", label: "A" },
            { op: "add_box", id: "b", label: "B" },
            { op: "link", source: "a", target: "b" },
            { op: "link", source: "a", target: "b" },
        ])
        expect(r.errors[0]).toContain("already exists")
    })

    it("removes one message by step, leaving the others", () => {
        const r = restructureDiagram("", [
            { op: "add_sequence", id: "s", label: "" },
            { op: "add_box", id: "a", parent: "s", label: "A" },
            { op: "add_box", id: "b", parent: "s", label: "B" },
            { op: "link", source: "a", target: "b", label: "one", step: 1 },
            { op: "link", source: "a", target: "b", label: "two", step: 2 },
            { op: "unlink", source: "a", target: "b", step: 1 },
        ])
        expect(r.errors).toEqual([])
        expect(r.outline).toContain("two")
        expect(r.outline).not.toContain("one")
    })

    it("keeps two sequence diagrams on one page independent", () => {
        // The fallback numbering has to restart per container, or the second diagram's
        // messages continue the first one's count and fall below its own lifelines.
        const r = restructureDiagram("", [
            { op: "add_sequence", id: "s1", label: "First" },
            { op: "add_box", id: "a", parent: "s1", label: "A" },
            { op: "add_box", id: "b", parent: "s1", label: "B" },
            { op: "link", source: "a", target: "b" },
            { op: "add_sequence", id: "s2", label: "Second" },
            { op: "add_box", id: "c", parent: "s2", label: "C" },
            { op: "add_box", id: "d", parent: "s2", label: "D" },
            { op: "link", source: "c", target: "d" },
        ])
        expect(r.errors).toEqual([])
        expect(escapesParent(r.xml as string)).toEqual([])
        expect(outsidePage(r.xml as string, ["__title"])).toEqual([])
    })
})

describe("sequence diagram: round-trip", () => {
    it("comes back as a sequence with the same participants", () => {
        const first = restructureDiagram("", LOGIN)
        const { tree, warnings } = parseDiagram(first.xml as string)
        expect(warnings).toEqual([])
        const seq = findNode(tree, "s") as SequenceNode
        expect(seq.kind).toBe("sequence")
        expect(seq.children.map((c) => c.id)).toEqual(PARTICIPANTS)
        expect(seq.label).toBe("Login flow")
    })

    it("keeps every message, including the repeat pair and the self-call", () => {
        const first = restructureDiagram("", LOGIN)
        const { tree } = parseDiagram(first.xml as string)
        expect(tree.links.length).toBe(7)
        expect(
            tree.links.some((l) => l.source === "auth" && l.target === "auth"),
        ).toBe(true)
    })

    it("does not move anything on a re-layout", () => {
        const first = restructureDiagram("", LOGIN)
        const second = restructureDiagram(first.xml as string, [])
        expect(second.errors).toEqual([])
        expect(second.warnings).toEqual([])
        const a = absoluteRects(first.xml as string)
        const b = absoluteRects(second.xml as string)
        for (const id of PARTICIPANTS) expect(b.get(id)).toEqual(a.get(id))
    })

    it("does not let the lifelines grow on every pass", () => {
        // A lifeline's cell covers the head AND the line, so reading its full height back as
        // the participant's own size would make it taller each time.
        const first = restructureDiagram("", LOGIN)
        const second = restructureDiagram(first.xml as string, [])
        const third = restructureDiagram(second.xml as string, [])
        const h = (xml: string) => rectOf(absoluteRects(xml), "u").h
        expect(h(second.xml as string)).toBe(h(first.xml as string))
        expect(h(third.xml as string)).toBe(h(first.xml as string))
    })

    it("adds a participant to an existing diagram without redrawing it", () => {
        const first = restructureDiagram("", LOGIN)
        const second = restructureDiagram(first.xml as string, [
            { op: "add_box", id: "cache", parent: "s", label: "Cache" },
            {
                op: "link",
                source: "auth",
                target: "cache",
                label: "check",
                step: 8,
            },
        ])
        expect(second.errors).toEqual([])
        const rects = absoluteRects(second.xml as string)
        expect(rects.has("cache")).toBe(true)
        // The new participant joins the row rather than landing on top of another.
        expect(rectOf(rects, "cache").x).toBeGreaterThan(rectOf(rects, "db").x)
        expect(escapesParent(second.xml as string)).toEqual([])
    })
})
