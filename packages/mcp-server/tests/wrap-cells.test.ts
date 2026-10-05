/**
 * Tests for wrapCellsInModel: the model may send only the mxCell elements of
 * a page, like in the web app, and the server adds the wrapper and root cells.
 */

import { beforeAll, describe, expect, it } from "vitest"
import { installDomPolyfill } from "../src/dom.ts"

beforeAll(() => {
    installDomPolyfill()
})

import { prepareNewDiagram, reservedIdError } from "../src/new-diagram.ts"
import { hasCells, wrapCellsInModel } from "../src/pages.ts"
import { validateAndFixXml } from "../src/xml-validation.ts"

const A = `<mxCell id="2" value="A" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>`
const B = `<mxCell id="3" value="B" vertex="1" parent="1"><mxGeometry x="200" y="0" width="80" height="40" as="geometry"/></mxCell>`
const ROOTS = `<mxCell id="0"/><mxCell id="1" parent="0"/>`

describe("wrapCellsInModel", () => {
    it("wraps sibling cells so they pass validation", () => {
        expect(validateAndFixXml(A + B).valid).toBe(false)
        const wrapped = wrapCellsInModel(A + B)
        expect(wrapped).toBe(
            `<mxGraphModel><root>${ROOTS}${A}${B}</root></mxGraphModel>`,
        )
        expect(validateAndFixXml(wrapped).valid).toBe(true)
    })

    it("replaces root cells the model wrote itself", () => {
        const wrapped = wrapCellsInModel(
            `<mxCell id="0"></mxCell><mxCell id="1" parent="0"/>${A}`,
        )
        expect(wrapped.match(/id="0"/g)).toHaveLength(1)
        expect(wrapped.match(/id="1"/g)).toHaveLength(1)
        expect(wrapped).toContain(A)
    })

    it("unwraps a <root> and drops trailing provider tags", () => {
        const wrapped = wrapCellsInModel(
            `<root>${A}</root></invoke></function_calls>`,
        )
        expect(wrapped).toBe(
            `<mxGraphModel><root>${ROOTS}${A}</root></mxGraphModel>`,
        )
    })

    it("drops comments and text before the first cell", () => {
        const expected = `<mxGraphModel><root>${ROOTS}${A}</root></mxGraphModel>`
        expect(wrapCellsInModel(`Here is the diagram: ${A}`)).toBe(expected)
        expect(wrapCellsInModel(`<!-- boxes -->\n${A}`)).toBe(expected)
    })

    it("leaves <mxGraphModel> and <mxfile> input unchanged", () => {
        const model = `<mxGraphModel><root>${ROOTS}${A}</root></mxGraphModel>`
        const file = `<mxfile><diagram id="p" name="P">${model}</diagram></mxfile>`
        expect(wrapCellsInModel(model)).toBe(model)
        expect(wrapCellsInModel(file)).toBe(file)
    })

    it("replaces root cells written over two lines", () => {
        const wrapped = wrapCellsInModel(
            `<mxCell id="0">\n</mxCell>\n<mxCell id="1" parent="0">\n</mxCell>\n${A}`,
        )
        expect(wrapped).toBe(
            `<mxGraphModel><root>${ROOTS}${A}</root></mxGraphModel>`,
        )
    })

    it("keeps a UserObject cell at the end", () => {
        const wrapped = `<UserObject id="u" label="U"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></UserObject>`
        expect(wrapCellsInModel(A + wrapped)).toContain(wrapped)
        expect(wrapCellsInModel(`${wrapped}</invoke>`)).toBe(
            `<mxGraphModel><root>${ROOTS}${wrapped}</root></mxGraphModel>`,
        )
    })
})

describe("hasCells", () => {
    it("counts cells written with single quotes", () => {
        expect(hasCells(`<mxCell id='2' vertex='1' parent='1'/>`)).toBe(true)
        expect(hasCells(`<mxCell id='0'/><mxCell id='1' parent='0'/>`)).toBe(
            false,
        )
    })

    it("counts a compressed page as having cells", () => {
        // draw.io's compressed format: the page's model is text
        expect(
            hasCells(
                `<mxfile><diagram id="p" name="P">dZHBDoIwDIafhjtsGPWM6MkTB8/LVmBxrGQMQZ/eLRuIUS/bv/VfmybF</diagram></mxfile>`,
            ),
        ).toBe(true)
    })

    it("counts cells with spaces around the =", () => {
        expect(hasCells(`<mxCell id = "a" vertex="1" parent="1"/>`)).toBe(true)
        expect(
            hasCells(`<mxCell id = "0"/><mxCell id = "1" parent="0"/>`),
        ).toBe(false)
    })
})

describe("reservedIdError", () => {
    it("finds a shape that uses a root cell id", () => {
        expect(reservedIdError(A)).toBeNull()
        expect(reservedIdError(ROOTS + A)).toBeNull()
        expect(
            reservedIdError(`<mxCell id = "1" vertex="1" parent="1"/>`),
        ).toMatch(/"0" and "1"/)
        // A linked or labelled shape has its id on the wrapper
        expect(
            reservedIdError(
                `<UserObject id="1" label="Docs"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></UserObject>`,
            ),
        ).toMatch(/"0" and "1"/)
        // Other attributes ending in id, and id text inside a label
        expect(
            reservedIdError(
                `<UserObject label="Server" rack-id="1" id="7"><mxCell vertex="1" parent="1"/></UserObject>`,
            ),
        ).toBeNull()
        expect(
            reservedIdError(
                `<UserObject id="u" label="Example: id='1'"><mxCell vertex="1" parent="1"/></UserObject>`,
            ),
        ).toBeNull()
        expect(
            reservedIdError(
                `<mxCell id="5" data-id="0" vertex="1" parent="1"/>`,
            ),
        ).toBeNull()
        expect(
            reservedIdError(
                `<mxCell id="5" value="id=&quot;1&quot; vertex=&quot;1&quot;" vertex="1" parent="1"/>`,
            ),
        ).toBeNull()
        // A whole model has its own root cells
        expect(
            reservedIdError(
                `<mxGraphModel><root>${ROOTS}</root></mxGraphModel>`,
            ),
        ).toBeNull()
    })
})

describe("prepareNewDiagram", () => {
    it("rejects a shape that uses a root cell id", () => {
        // It would clash with the added root cell "1" and be renamed,
        // which breaks the edges that point to it
        const cells =
            `<mxCell id="1" value="Start" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>` +
            `<mxCell id="3" edge="1" parent="1" source="1" target="2"><mxGeometry relative="1" as="geometry"/></mxCell>`
        const out = prepareNewDiagram(cells)
        expect(out.ok).toBe(false)
        if (out.ok) return
        expect(out.error).toMatch(/"0" and "1"/)
    })

    it("still accepts the root cells sent along with the shapes", () => {
        const out = prepareNewDiagram(
            `<mxCell id="0"/><mxCell id="1" parent="0"/>${A}`,
        )
        expect(out.ok).toBe(true)
    })
})

describe("labels that look like attributes", () => {
    const layer = `<mxCell id="5" value="Move to id='1'" vertex="1" parent="1"/>`

    it("keep their cell when the root cells are stripped", () => {
        const wrapped = wrapCellsInModel(ROOTS + layer)
        expect(wrapped).toBe(
            `<mxGraphModel><root>${ROOTS}${layer}</root></mxGraphModel>`,
        )
    })

    it("are not taken for a reserved id", () => {
        expect(reservedIdError(layer)).toBeNull()
    })
})
