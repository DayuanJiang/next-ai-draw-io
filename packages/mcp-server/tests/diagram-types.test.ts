/**
 * The drawing guides of diagram types (get_diagram_guide in the web app,
 * get_drawing_guide with a topic on the MCP server). A guide's example is
 * what the model copies, so it has to pass the server's own checks and
 * follow the rules the guide states.
 */

import { describe, expect, it } from "vitest"
import {
    DIAGRAM_TYPE_LIST,
    DIAGRAM_TYPE_NAMES,
    DIAGRAM_TYPES,
    getDiagramGuide,
} from "../src/diagram-types/index.ts"
import { SEQUENCE_EXAMPLE } from "../src/diagram-types/sequence.ts"
import { prepareNewDiagram } from "../src/new-diagram.ts"

/** The cells of the drawn page, as elements */
function cellsOf(xml: string): Element[] {
    const doc = new DOMParser().parseFromString(xml, "text/xml")
    return Array.from(doc.querySelectorAll("mxCell"))
}

/** A style's value for a key, as a number */
const styleNumber = (cell: Element, key: string) =>
    Number(
        (cell.getAttribute("style") ?? "")
            .split(";")
            .find((token) => token.startsWith(`${key}=`))
            ?.slice(key.length + 1),
    )

describe("the list of diagram types", () => {
    it("has one line per type, with what the diagram shows", () => {
        expect(DIAGRAM_TYPE_LIST.split("\n")).toHaveLength(DIAGRAM_TYPES.length)
        for (const type of DIAGRAM_TYPES) {
            expect(DIAGRAM_TYPE_LIST).toContain(`- ${type.name}: ${type.when}`)
        }
    })

    it("uses lower case names without spaces, which the lookup compares", () => {
        for (const name of DIAGRAM_TYPE_NAMES) {
            expect(name).toMatch(/^[a-z][a-z0-9_-]*$/)
        }
    })
})

describe("getDiagramGuide", () => {
    it("writes the guide with the caller's tool names", () => {
        const web = getDiagramGuide(
            "sequence",
            "display_diagram",
            "edit_diagram",
        )
        const mcp = getDiagramGuide(
            "sequence",
            "create_new_diagram",
            "edit_diagram",
        )
        expect(web.ok && web.text).toContain("Now call display_diagram.")
        expect(mcp.ok && mcp.text).toContain("Now call create_new_diagram.")
        expect(mcp.ok && mcp.text).not.toContain("display_diagram")
    })

    it("finds a type whatever its case and the spaces around it", () => {
        expect(getDiagramGuide(" Sequence ", "draw", "edit").ok).toBe(true)
    })

    it("answers an unknown type with the types that have a guide", () => {
        const result = getDiagramGuide("flowchart", "draw", "edit")
        expect(result.ok).toBe(false)
        expect(!result.ok && result.error).toContain("sequence")
    })
})

describe("the sequence guide's example", () => {
    const prepared = prepareNewDiagram(SEQUENCE_EXAMPLE)
    const cells = prepared.ok ? cellsOf(prepared.xml) : []
    const lifelines = cells.filter((c) =>
        c.getAttribute("style")?.includes("shape=umlLifeline"),
    )
    const messages = cells.filter((c) => c.getAttribute("edge") === "1")

    it("is drawn as written, with nothing repaired or noted", () => {
        expect(prepared.ok).toBe(true)
        expect(prepared.ok && prepared.fixes).toEqual([])
        expect(prepared.ok && prepared.notes).toEqual([])
    })

    it("has one lifeline per participant, all at one y and of one height", () => {
        expect(lifelines).toHaveLength(3)
        const geometry = lifelines.map((c) => c.querySelector("mxGeometry"))
        expect(new Set(geometry.map((g) => g?.getAttribute("y"))).size).toBe(1)
        expect(
            new Set(geometry.map((g) => g?.getAttribute("height"))).size,
        ).toBe(1)
    })

    it("gives every message a row of its own, 40 px apart from row 80 on", () => {
        expect(messages.map((m) => styleNumber(m, "exitDy"))).toEqual([
            80, 120, 160, 200,
        ])
        // A message between two participants is level; one to itself comes
        // back 20 px lower
        for (const m of messages) {
            const self = m.getAttribute("source") === m.getAttribute("target")
            expect(styleNumber(m, "entryDy") - styleNumber(m, "exitDy")).toBe(
                self ? 20 : 0,
            )
        }
    })

    it("makes the lifelines 80 + 40 per row tall, as the guide says", () => {
        const height = Number(
            lifelines[0].querySelector("mxGeometry")?.getAttribute("height"),
        )
        expect(height).toBe(80 + 40 * messages.length)
    })

    it("turns the message to itself beside its lifeline, at its two rows", () => {
        const self = messages.find(
            (m) => m.getAttribute("source") === m.getAttribute("target"),
        )
        const lifeline = lifelines.find(
            (c) => c.getAttribute("id") === self?.getAttribute("source"),
        )
        const g = lifeline?.querySelector("mxGeometry")
        const middle =
            Number(g?.getAttribute("x")) + Number(g?.getAttribute("width")) / 2
        const top = Number(g?.getAttribute("y"))
        const points = Array.from(self?.querySelectorAll("mxPoint") ?? []).map(
            (p) => [Number(p.getAttribute("x")), Number(p.getAttribute("y"))],
        )
        expect(points).toEqual([
            [middle + 30, top + 160],
            [middle + 30, top + 180],
        ])
    })
})
