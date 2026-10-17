/**
 * Custom data (issue #822): the drawing guide's example of a cell inside an
 * <object> wrapper keeps its properties through drawing, the compact XML
 * shown to the model, and edit_diagram.
 */

import { describe, expect, it } from "vitest"
import { foldCells } from "../src/compact-cells.ts"
import { editDiagram } from "../src/edit-diagram.ts"
import { prepareNewDiagram } from "../src/new-diagram.ts"
import { CUSTOM_DATA_EXAMPLE } from "../src/xml-examples.ts"

describe("custom data on an <object> wrapper", () => {
    it("the example draws with its properties on the wrapper", () => {
        const result = prepareNewDiagram(CUSTOM_DATA_EXAMPLE)
        expect(result.ok, result.ok ? "" : result.error).toBe(true)
        if (!result.ok) return
        expect(result.fixes).toEqual([])
        expect(result.xml).toContain(
            '<object id="2" label="Web server" ip="10.0.0.5" owner="Ops"><mxCell style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></object>',
        )
        // The model sees the properties again in the compact form
        expect(foldCells(result.xml)).toContain(
            '<object id="2" label="Web server" ip="10.0.0.5" owner="Ops"><mxCell style="rounded=1;whiteSpace=wrap;html=1;" x="40" y="40" w="120" h="60"/></object>',
        )
    })

    it("edit_diagram updates the properties and adds a wrapped edge", () => {
        const drawn = prepareNewDiagram(
            `${CUSTOM_DATA_EXAMPLE}<mxCell id="3" value="DB" x="240" y="40" w="120" h="60"/>`,
        )
        if (!drawn.ok) throw new Error(drawn.error)
        const out = editDiagram(
            drawn.xml,
            [
                {
                    operation: "update",
                    cell_id: "2",
                    new_xml:
                        '<object id="2" label="Web server" ip="10.0.0.6" owner="Ops"><mxCell style="rounded=1;" x="40" y="40" w="120" h="60"/></object>',
                },
                {
                    operation: "add",
                    cell_id: "4",
                    new_xml:
                        '<object id="4" label="SQL" port="5432"><mxCell style="edgeStyle=orthogonalEdgeStyle;" source="2" target="3"/></object>',
                },
            ],
            {},
        )
        expect(out.ok).toBe(true)
        if (!out.ok) return
        expect(out.xml).toContain(
            '<object id="2" label="Web server" ip="10.0.0.6" owner="Ops"><mxCell style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></object>',
        )
        expect(out.xml).toContain(
            '<object id="4" label="SQL" port="5432"><mxCell style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="2" target="3"><mxGeometry relative="1" as="geometry"/></mxCell></object>',
        )
    })
})
