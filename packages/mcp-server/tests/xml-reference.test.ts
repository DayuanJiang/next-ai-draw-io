/**
 * The XML references returned by get_drawing_guide with a topic. Each
 * snippet must be accepted by create_new_diagram as bare mxCell elements;
 * whether draw.io renders it as intended is checked by hand.
 */

import { beforeAll, describe, expect, it } from "vitest"
import { installDomPolyfill } from "../src/dom.ts"

beforeAll(() => {
    installDomPolyfill()
})

import { prepareNewDiagram } from "../src/new-diagram.ts"
import { hasCells } from "../src/pages.ts"
import { XML_REFERENCE } from "../src/xml-reference.ts"

/** The code block of a reference: the lines indented by four spaces. */
function snippet(topic: keyof typeof XML_REFERENCE): string {
    return XML_REFERENCE[topic]
        .split("\n")
        .filter((line) => line.startsWith("    "))
        .map((line) => line.slice(4))
        .join("\n")
}

describe("XML_REFERENCE", () => {
    it.each(["tables", "layers", "groups"] as const)(
        "%s snippet passes prepareNewDiagram",
        (topic) => {
            const xml = snippet(topic)
            expect(xml).toContain("<mxCell")
            const result = prepareNewDiagram(xml)
            expect(result.ok, result.ok ? "" : result.error).toBe(true)
            if (result.ok) expect(result.fixes).toEqual([])
        },
    )

    it("tables use draw.io's table shapes", () => {
        const xml = snippet("tables")
        expect(xml).toContain("shape=table;")
        expect(xml).toContain("shape=tableRow;")
        expect(xml).toContain("shape=partialRectangle;")
    })

    it('layers keep the layer cell with parent="0"', () => {
        const result = prepareNewDiagram(snippet("layers"))
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(hasCells(result.xml)).toBe(true)
        expect(result.xml).toContain('id="L2"')
        expect(result.xml).toContain('parent="L2"')
    })

    it("groups use a group container", () => {
        expect(snippet("groups")).toContain('style="group"')
    })
})
