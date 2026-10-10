/**
 * Tests for the diagram history: the versions restore_version can go to.
 */

import { beforeAll, describe, expect, it } from "vitest"
import { installDomPolyfill } from "../src/dom.ts"
import {
    addHistory,
    clearHistory,
    getHistory,
    otherVersions,
} from "../src/history.ts"

beforeAll(() => {
    // XML parsing for the content fingerprints
    installDomPolyfill()
})

const page = (cellId: string) =>
    `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="${cellId}" vertex="1" parent="1"/></root></mxGraphModel></diagram></mxfile>`

const A = page("a")
const B = page("b")
const C = page("c")

// draw.io's copy of B: other attribute order, whitespace and viewport
// attributes, same diagram
const B_COPY = `<mxfile host="app.diagrams.net">
  <diagram name="P" id="p">
    <mxGraphModel dx="100" dy="200" pageWidth="850">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="b" parent="1" vertex="1" />
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`

const fill = (id: string, versions: string[]) => {
    clearHistory(id)
    for (const xml of versions) addHistory(id, xml)
}

describe("otherVersions", () => {
    it("lists the versions before the canvas, newest first", () => {
        const id = "history-abc"
        fill(id, [A, B, C])
        expect(otherVersions(id, C).map((e) => e.xml)).toEqual([B, A])
    })

    it("lists each version once after an undo, the left one first", () => {
        const id = "history-abcb"
        fill(id, [A, B, C, B])
        expect(otherVersions(id, B).map((e) => e.xml)).toEqual([C, A])
    })

    it("lists every version when the canvas is in none of them", () => {
        const id = "history-manual"
        fill(id, [A, B, C])
        expect(otherVersions(id, page("manual")).map((e) => e.xml)).toEqual([
            C,
            B,
            A,
        ])
    })

    it("counts a re-serialised copy as the same version", () => {
        const id = "history-copy"
        fill(id, [A, B, B_COPY])
        expect(otherVersions(id, B).map((e) => e.xml)).toEqual([A])
        expect(otherVersions(id, B_COPY).map((e) => e.xml)).toEqual([A])
    })

    it("keeps the newest copy of a repeated version", () => {
        const id = "history-newest"
        fill(id, [A, B, A])
        const [newestA] = otherVersions(id, B)
        expect(newestA.id).toBe(getHistory(id)[2].id)
        expect(otherVersions(id, B)).toHaveLength(1)
    })

    it("returns nothing for an empty history", () => {
        const id = "history-empty"
        clearHistory(id)
        expect(otherVersions(id, A)).toEqual([])
    })
})
