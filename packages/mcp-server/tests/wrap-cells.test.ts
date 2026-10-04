/**
 * Tests for wrapCellsInModel: the model may send only the mxCell elements of
 * a page, like in the web app, and the server adds the wrapper and root cells.
 */

import { beforeAll, describe, expect, it } from "vitest"
import { installDomPolyfill } from "../src/dom.ts"

beforeAll(() => {
    installDomPolyfill()
})

import { wrapCellsInModel } from "../src/pages.ts"
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

    it("keeps a UserObject cell at the end", () => {
        const wrapped = `<UserObject id="u" label="U"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></UserObject>`
        expect(wrapCellsInModel(A + wrapped)).toContain(wrapped)
        expect(wrapCellsInModel(`${wrapped}</invoke>`)).toBe(
            `<mxGraphModel><root>${ROOTS}${wrapped}</root></mxGraphModel>`,
        )
    })
})
