/**
 * The web app runs the MCP server's diagram modules in the browser, where
 * DOMParser and XMLSerializer are the native ones (jsdom here), not the
 * linkedom polyfill the MCP tests use.
 */
import { deflateRaw } from "pako"
import { describe, expect, it } from "vitest"
import { applyDiagramOperations } from "@/packages/mcp-server/src/diagram-operations.ts"
import { editDiagram } from "@/packages/mcp-server/src/edit-diagram.ts"
import { decompressPageContent } from "@/packages/mcp-server/src/load-diagram.ts"
import {
    hasCells,
    normalizeToMxfile,
    wrapCellsInModel,
} from "@/packages/mcp-server/src/pages.ts"
import { getXmlSyntaxError } from "@/packages/mcp-server/src/xml-syntax.ts"
import { validateAndFixXml } from "@/packages/mcp-server/src/xml-validation.ts"

const box = (id: string, parent = "1") =>
    `<mxCell id="${id}" value="${id}" vertex="1" parent="${parent}"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>`
const edge = (id: string, source: string, target: string) =>
    `<mxCell id="${id}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`
const file = (cells: string) =>
    normalizeToMxfile(wrapCellsInModel(cells), {
        pageId: "p1",
        pageName: "Page-1",
    }) as string

describe("MCP diagram modules with a browser DOM", () => {
    it("wraps bare cells into a valid file", () => {
        const xml = file(box("a") + box("b"))
        expect(xml).toContain('<diagram id="p1" name="Page-1">')
        expect(validateAndFixXml(xml).valid).toBe(true)
        expect(hasCells(xml)).toBe(true)
        expect(hasCells(file(""))).toBe(false)
    })

    it("fixes the case of a misspelled tag in model XML", () => {
        const result = validateAndFixXml(
            file(box("a"))
                .replace('<mxCell id="a"', '<mxcell id="a"')
                .replace("</mxCell></root>", "</mxcell></root>"),
        )
        expect(result.valid).toBe(true)
        expect(result.fixes.join(" ")).toMatch(/tag case/)
    })

    it("reports syntax errors with line and column", () => {
        expect(getXmlSyntaxError("<mxfile><diagram></mxfile>")).toMatch(
            /^1:\d+/,
        )
        expect(getXmlSyntaxError(file(box("a")))).toBeNull()
    })

    it("deletes a cell with its edges", () => {
        const xml = file(box("a") + box("b") + edge("e", "a", "b"))
        const { result, errors } = applyDiagramOperations(xml, [
            { operation: "delete", cell_id: "a" },
        ])
        expect(errors).toEqual([])
        expect(result).not.toContain('id="a"')
        expect(result).not.toContain('id="e"')
        expect(result).toContain('id="b"')
    })

    it("runs a whole edit and serializes the target page", () => {
        const outcome = editDiagram(
            file(box("a")),
            [{ operation: "add", cell_id: "b", new_xml: box("b") }],
            {},
        )
        expect(outcome.ok).toBe(true)
        if (outcome.ok) expect(outcome.xml).toContain('id="b"')

        const failed = editDiagram(
            file(box("a")),
            [{ operation: "add", cell_id: "b", new_xml: box("b") + box("c") }],
            {},
        )
        expect(failed.ok).toBe(false)
    })

    it("decompresses a draw.io compressed page", () => {
        const model = wrapCellsInModel(box("a"))
        const deflated = deflateRaw(encodeURIComponent(model))
        const base64 = btoa(String.fromCharCode(...deflated))
        expect(decompressPageContent(base64)).toBe(model)
        expect(decompressPageContent("not compressed")).toBeNull()
    })
})
