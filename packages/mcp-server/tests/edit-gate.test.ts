/**
 * Unit tests for the edit_diagram workflow gate (edit-gate.ts).
 *
 * The gate replaced the old 30-second wall-clock rule (#885): an edit is
 * allowed when the model has seen the current browser state, no matter how
 * long ago — and rejected when the browser state moved since. "Seen" is
 * judged structurally, so draw.io's re-serialisation of the same content
 * (attribute order, whitespace, viewport attributes, wrapper shape) never
 * reads as a user edit.
 */

import { DOMParser } from "linkedom"
import { beforeAll, describe, expect, it } from "vitest"

beforeAll(() => {
    ;(globalThis as any).DOMParser = DOMParser
})

import { checkEditGate, contentFingerprint } from "../src/edit-gate.js"

const XML_A = `<mxfile host="app.diagrams.net"><diagram id="p1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="box1" value="Hello" style="rounded=0;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`

// The same document as draw.io re-serialises it on autosave: different host,
// regenerated diagram id, viewport attributes on mxGraphModel, re-ordered
// cell attributes, pretty-printed whitespace.
const XML_A_RESERIALIZED = `<mxfile host="embed.diagrams.net">
  <diagram id="regenerated-id" name="Page-1">
    <mxGraphModel dx="1596" dy="743" grid="1" pageWidth="827" pageHeight="1169">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="box1" parent="1" style="rounded=0;" value="Hello" vertex="1">
          <mxGeometry height="60" width="120" x="40" y="40" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`

// A real user edit: box1 moved to a different position.
const XML_B = XML_A.replace('x="40" y="40"', 'x="300" y="200"')

// Bare mxGraphModel with identical page content to XML_A.
const XML_A_BARE = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="box1" value="Hello" style="rounded=0;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel>`

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

    it("allows when the browser state is a re-serialisation of the same content", () => {
        expect(checkEditGate(XML_A, XML_A_RESERIALIZED)).toEqual({ ok: true })
    })

    it("rejects when a cell actually changed", () => {
        expect(checkEditGate(XML_A, XML_B)).toEqual({
            ok: false,
            reason: "stale",
        })
    })

    it("rejects a real edit even when wrapped in re-serialisation noise", () => {
        const movedAndReserialized = XML_A_RESERIALIZED.replace(
            'x="40" y="40"',
            'x="300" y="200"',
        )
        expect(checkEditGate(XML_A, movedAndReserialized)).toEqual({
            ok: false,
            reason: "stale",
        })
    })

    it("allows when the store has no live entry to compare against", () => {
        expect(checkEditGate(XML_A, "")).toEqual({ ok: true })
    })

    // A bare <mxGraphModel> push carries no page name, so the gate must not
    // compare the invented "Page-1" wrapper name against the real one.
    it("allows a bare mxGraphModel push when the page has a custom name", () => {
        const seenRenamed = XML_A.replace('name="Page-1"', 'name="Arch"')
        expect(checkEditGate(seenRenamed, XML_A_BARE)).toEqual({ ok: true })
    })

    it("still rejects a bare mxGraphModel push whose cells changed", () => {
        const seenRenamed = XML_A.replace('name="Page-1"', 'name="Arch"')
        const bareMoved = XML_A_BARE.replace('x="40" y="40"', 'x="300" y="200"')
        expect(checkEditGate(seenRenamed, bareMoved)).toEqual({
            ok: false,
            reason: "stale",
        })
    })
})

describe("contentFingerprint", () => {
    it("is invariant under draw.io re-serialisation", () => {
        expect(contentFingerprint(XML_A)).toBe(
            contentFingerprint(XML_A_RESERIALIZED),
        )
    })

    it("treats a bare mxGraphModel like its one-page mxfile wrapping", () => {
        expect(contentFingerprint(XML_A_BARE)).toBe(contentFingerprint(XML_A))
    })

    it("changes when a cell attribute changes", () => {
        expect(contentFingerprint(XML_A)).not.toBe(contentFingerprint(XML_B))
    })

    it("changes when a page is renamed", () => {
        const renamed = XML_A.replace('name="Page-1"', 'name="Renamed"')
        expect(contentFingerprint(XML_A)).not.toBe(contentFingerprint(renamed))
    })

    it("changes when a page is added", () => {
        const twoPages = XML_A.replace(
            "</mxfile>",
            `<diagram id="p2" name="Page-2"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`,
        )
        expect(contentFingerprint(XML_A)).not.toBe(contentFingerprint(twoPages))
    })

    it("falls back to the raw string for unparseable input", () => {
        expect(contentFingerprint("not xml at all")).toBe("not xml at all")
    })
})
