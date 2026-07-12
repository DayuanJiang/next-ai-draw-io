/**
 * Unit tests for the edit_diagram workflow gate (edit-gate.ts).
 *
 * The gate replaced the old 30-second wall-clock rule (#885): an edit is
 * allowed when the model has seen the exact current browser state, no matter
 * how long ago — and rejected when the browser state moved since.
 */

import { describe, expect, it } from "vitest"
import { checkEditGate } from "../src/edit-gate.js"

const XML_A = `<mxfile host="app.diagrams.net"><diagram id="p1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
const XML_B = XML_A.replace('name="Page-1"', 'name="Renamed"')

describe("checkEditGate", () => {
    it("rejects when no diagram context was ever established", () => {
        expect(checkEditGate("", XML_A)).toEqual({
            ok: false,
            reason: "no-context",
        })
    })

    it("allows when the browser state is exactly what the model saw", () => {
        expect(checkEditGate(XML_A, XML_A)).toEqual({ ok: true })
    })

    it("rejects when the browser state moved since the model looked", () => {
        expect(checkEditGate(XML_A, XML_B)).toEqual({
            ok: false,
            reason: "stale",
        })
    })

    it("allows when the store has no live entry to compare against", () => {
        expect(checkEditGate(XML_A, "")).toEqual({ ok: true })
    })
})
