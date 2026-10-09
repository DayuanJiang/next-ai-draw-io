/**
 * Tests for edit_diagram operations on cells that draw.io wraps in
 * <UserObject> or <object> (cells with links, tooltips or custom data).
 * The id sits on the wrapper; the inner mxCell has none.
 */

import { deflateRawSync } from "node:zlib"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { installDomPolyfill } from "../src/dom.ts"

beforeAll(() => {
    installDomPolyfill()
})

import { applyDiagramOperations } from "../src/diagram-operations.ts"

const DOC = `<mxfile><diagram id="p" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><UserObject id="a" label="A" link="https://example.com"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></UserObject><mxCell id="b" value="B" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell><object id="e1" label="" tooltip="t"><mxCell edge="1" source="b" target="a" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell></object><mxCell id="child" value="C" vertex="1" parent="a"><mxGeometry as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`

describe("wrapped cells", () => {
    it("deletes a UserObject cell with its edges and children", () => {
        const { result, errors } = applyDiagramOperations(DOC, [
            { operation: "delete", cell_id: "a" },
        ])
        expect(errors).toEqual([])
        expect(result).not.toContain('id="a"')
        expect(result).not.toContain('id="e1"')
        expect(result).not.toContain('id="child"')
        expect(result).toContain('id="b"')
    })

    it("cascades to a wrapped edge when deleting a plain cell", () => {
        const { result, errors } = applyDiagramOperations(DOC, [
            { operation: "delete", cell_id: "b" },
            { operation: "delete", cell_id: "e1" },
        ])
        // e1 was already removed by the cascade, so no warning for it
        expect(errors).toEqual([])
        expect(result).not.toContain('id="e1"')
        expect(result).toContain('id="a"')
    })

    it("warns when deleting a cell that does not exist", () => {
        const { errors } = applyDiagramOperations(DOC, [
            { operation: "delete", cell_id: "missing" },
        ])
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatchObject({ type: "delete", cellId: "missing" })
    })

    it("updates a UserObject cell", () => {
        const { result, errors } = applyDiagramOperations(DOC, [
            {
                operation: "update",
                cell_id: "a",
                new_xml: `<UserObject id="a" label="A2" link="https://example.com"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></UserObject>`,
            },
        ])
        expect(errors).toEqual([])
        expect(result).toContain('label="A2"')
        expect(result.match(/id="a"/g)).toHaveLength(1)
    })

    it("refuses to add a cell whose id a UserObject already uses", () => {
        const { errors } = applyDiagramOperations(DOC, [
            {
                operation: "add",
                cell_id: "a",
                new_xml: `<mxCell id="a" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>`,
            },
        ])
        expect(errors[0]?.message).toContain("already exists")
    })
})

describe("cascade delete logging", () => {
    it("does not write cascade logs to stdout (the JSON-RPC channel)", () => {
        const plain = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="x" vertex="1" parent="1"/><mxCell id="y" vertex="1" parent="1"/><mxCell id="e" edge="1" source="x" target="y" parent="1"/></root></mxGraphModel>`
        const spy = vi.spyOn(console, "log").mockImplementation(() => {})
        const { result } = applyDiagramOperations(plain, [
            { operation: "delete", cell_id: "x" },
        ])
        expect(result).not.toContain('id="e"')
        expect(spy).not.toHaveBeenCalled()
        spy.mockRestore()
    })
})

describe("pages without a <root>", () => {
    const ADD_A = {
        operation: "add" as const,
        cell_id: "a",
        new_xml: `<mxCell id="a" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>`,
    }

    it("treats an empty page as a blank page", () => {
        const doc = `<mxfile><diagram id="p" name="Page-1"></diagram></mxfile>`
        const { result, errors } = applyDiagramOperations(doc, [ADD_A])
        expect(errors).toEqual([])
        expect(result).toContain('<mxCell id="0"/>')
        expect(result).toContain('<mxCell id="1" parent="0"/>')
        expect(result).toContain('<mxCell id="a"')
    })

    it("decompresses a compressed page before editing it", () => {
        const model = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="b" vertex="1" parent="1"/></root></mxGraphModel>`
        const compressed = deflateRawSync(
            Buffer.from(encodeURIComponent(model)),
        ).toString("base64")
        const doc = `<mxfile><diagram id="p" name="Page-1">${compressed}</diagram></mxfile>`
        const { result, errors } = applyDiagramOperations(doc, [ADD_A])
        expect(errors).toEqual([])
        expect(result).not.toContain(compressed)
        expect(result).toContain('<mxCell id="b"')
        expect(result).toContain('<mxCell id="a"')
        // Only one model and one set of root cells
        expect(result.match(/<mxGraphModel/g)).toHaveLength(1)
        expect(result.match(/<mxCell id="0"/g)).toHaveLength(1)
    })

    it("reports a page whose text is not compressed XML", () => {
        const doc = `<mxfile><diagram id="p" name="Page-1">not base64 !!</diagram></mxfile>`
        const { errors } = applyDiagramOperations(doc, [ADD_A])
        expect(errors[0]?.cellId).toBe("")
        expect(errors[0]?.message).toContain("could not be decompressed")
    })
})

describe("a wrapped mxCell with its wrapper's id", () => {
    const doc = `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><UserObject id="u" label="A" link="https://example.com"><mxCell id="u" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></UserObject></root></mxGraphModel></diagram></mxfile>`

    it("deletes the whole wrapper", () => {
        const { result, errors } = applyDiagramOperations(doc, [
            { operation: "delete", cell_id: "u" },
        ])
        expect(errors).toEqual([])
        expect(result).not.toContain("UserObject")
    })

    it("replaces the wrapper on update", () => {
        const { result, errors } = applyDiagramOperations(doc, [
            {
                operation: "update",
                cell_id: "u",
                new_xml: `<UserObject id="u" label="B" link="https://example.com"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></UserObject>`,
            },
        ])
        expect(errors).toEqual([])
        expect(result.match(/<UserObject/g)).toHaveLength(1)
        expect(result).toContain('label="B"')
    })
})

describe("cut-off new_xml", () => {
    // While edit_diagram streams, the last operation's XML is often
    // incomplete. Chrome's DOMParser keeps the partial cell, so it must be
    // refused before it reaches the diagram.
    const CUT = `<mxCell id="b" value="B2" style="rounded=1;" vertex="1" parent="1">`

    it("refuses an update whose XML is cut off", () => {
        const { result, errors } = applyDiagramOperations(DOC, [
            { operation: "update", cell_id: "b", new_xml: CUT },
        ])
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatchObject({ type: "update", cellId: "b" })
        expect(errors[0].message).toContain("not well-formed")
        expect(result).toContain('value="B"')
        expect(result).not.toContain("B2")
    })

    it("refuses an add whose XML is cut off", () => {
        const { result, errors } = applyDiagramOperations(DOC, [
            {
                operation: "add",
                cell_id: "n",
                new_xml: `<mxCell id="n" value="N" vertex="1" parent="1"><mxGeometry x="1" y="2" width="3"`,
            },
        ])
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatchObject({ type: "add", cellId: "n" })
        expect(result).not.toContain('id="n"')
    })

    it("applies the complete operations before a cut-off one", () => {
        const { result, errors } = applyDiagramOperations(DOC, [
            {
                operation: "update",
                cell_id: "b",
                new_xml: `<mxCell id="b" value="B3" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>`,
            },
            {
                operation: "add",
                cell_id: "n",
                new_xml: `<mxCell id="n" value="N" vertex="1" parent="1">`,
            },
        ])
        expect(errors).toHaveLength(1)
        expect(result).toContain('value="B3"')
        expect(result).not.toContain('id="n"')
    })
})
