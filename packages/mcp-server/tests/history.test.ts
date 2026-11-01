/**
 * Tests for the diagram history: the versions restore_version can go to.
 */

import { describe, expect, it } from "vitest"
import {
    addHistory,
    clearHistory,
    currentEntryId,
    firstCopyIds,
    getHistory,
    isInHistory,
    otherVersions,
} from "../src/history.ts"

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

    it("counts draw.io's copy without coordinates of 0 as the same version", () => {
        const id = "history-zero"
        const withOffset = (point: string) =>
            B.replace(
                "</root>",
                `<mxCell id="e" edge="1" parent="1" source="b" target="b"><mxGeometry relative="1" as="geometry">${point}</mxGeometry></mxCell></root>`,
            )
        // The model wrote x="0"; the canvas holds draw.io's copy without it,
        // and one step back is the version before the model's write
        fill(id, [A, withOffset('<mxPoint x="0" y="-18" as="offset"/>')])
        const canvas = withOffset('<mxPoint y="-18" as="offset"/>')
        expect(otherVersions(id, canvas).map((e) => e.xml)).toEqual([A])
        expect(isInHistory(id, canvas)).toBe(true)
    })

    it("counts draw.io's copy with each container's children after it as the same version", () => {
        const id = "history-order"
        const cells = (order: string[]) =>
            `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${order
                .map(
                    (c) =>
                        `<mxCell id="${c}" vertex="1" parent="${c.startsWith("g") ? "1" : `g${c.slice(1)}`}"/>`,
                )
                .join("")}</root></mxGraphModel></diagram></mxfile>`
        // The model listed both groups first; draw.io puts k1 under g1
        fill(id, [A, cells(["g1", "g2", "k1", "k2"])])
        const canvas = cells(["g1", "k1", "g2", "k2"])
        expect(otherVersions(id, canvas).map((e) => e.xml)).toEqual([A])
        expect(isInHistory(id, canvas)).toBe(true)
    })

    it("keeps the newest copy of a repeated version", () => {
        const id = "history-newest"
        fill(id, [A, B, A])
        const [newestA] = otherVersions(id, B)
        expect(newestA.id).toBe(getHistory(id)[2].id)
        expect(otherVersions(id, B)).toHaveLength(1)
    })

    it("matches a bare model from the browser with its named page", () => {
        const id = "history-bare"
        const named = (xml: string) => xml.replace('name="P"', 'name="Arch"')
        fill(id, [named(A), named(B)])
        // The browser's sync sent page B without its <mxfile> wrapper
        const bareB = B.replace(/^.*?(<mxGraphModel>)/, "$1").replace(
            "</diagram></mxfile>",
            "",
        )
        expect(otherVersions(id, bareB).map((e) => e.xml)).toEqual([named(A)])
        expect(isInHistory(id, bareB)).toBe(true)
        expect(isInHistory(id, C)).toBe(false)
    })

    it("still counts a rename when an unrelated bare model is in History", () => {
        const id = "history-mixed"
        const bareX = page("x")
            .replace(/^.*?(<mxGraphModel>)/, "$1")
            .replace("</diagram></mxfile>", "")
        const arch = B.replace('name="P"', 'name="Arch"')
        const overview = B.replace('name="P"', 'name="Overview"')
        fill(id, [bareX, arch])
        expect(otherVersions(id, overview).map((e) => e.xml)).toEqual([
            arch,
            bareX,
        ])
        expect(isInHistory(id, overview)).toBe(false)
    })

    it("returns nothing for an empty history", () => {
        const id = "history-empty"
        clearHistory(id)
        expect(otherVersions(id, A)).toEqual([])
    })
})

describe("entries", () => {
    it("record who made them", () => {
        const id = "history-fields"
        clearHistory(id)
        addHistory(id, A)
        addHistory(id, B, "<svg/>", "user")
        addHistory(id, C, "", "restore")
        const [first, second, third] = getHistory(id)
        expect(first.source).toBeUndefined()
        expect(second.source).toBe("user")
        expect(second.svg).toBe("<svg/>")
        expect(third.source).toBe("restore")
    })
})

// The shell's version cards: which entry the canvas shows, and which
// entries are copies of an earlier one (a restore adds one)
describe("currentEntryId and firstCopyIds", () => {
    it("name the newest entry with the canvas's content, by the rule of otherVersions", () => {
        const id = "history-current"
        fill(id, [A, B, C, A])
        const [a, b, c, aCopy] = getHistory(id)
        expect(currentEntryId(id, A)).toBe(aCopy.id)
        expect(currentEntryId(id, B_COPY)).toBe(b.id)
        expect(currentEntryId(id, page("manual"))).toBeNull()
        // A restore's copy belongs with its first entry; the others are
        // their own
        expect([...firstCopyIds(id).entries()]).toEqual([
            [a.id, a.id],
            [b.id, b.id],
            [c.id, c.id],
            [aCopy.id, a.id],
        ])
    })

    it("group a bare model with the first named page it matches, never a later one", () => {
        // A bare model (the browser's sync can send one) has no page name:
        // it is the same as "Arch" and as "Overview", which differ from each
        // other. Each entry names a first copy with its own content, so a
        // card never shows one document and restores another
        const id = "history-bare-groups"
        const named = (name: string) => A.replace('name="P"', `name="${name}"`)
        const bare = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" vertex="1" parent="1"/></root></mxGraphModel>`
        fill(id, [named("Arch"), bare, named("Overview")])
        const [arch, model, overview] = getHistory(id)
        const firsts = firstCopyIds(id)
        expect([...firsts.entries()]).toEqual([
            [arch.id, arch.id],
            [model.id, arch.id],
            [overview.id, overview.id],
        ])
        // The entry named as first has the content of every entry in its
        // group (otherVersions of that content never lists it)
        for (const entry of getHistory(id)) {
            expect(otherVersions(id, entry.xml).map((e) => e.id)).not.toContain(
                firsts.get(entry.id),
            )
        }
    })

    it("agree with otherVersions on a page setting that only the canvas shows", () => {
        // The same cells with another background: one version to the MCP
        // core (the model's edits stay valid when the user changes a page
        // setting), so the canvas still shows that entry and restore_version
        // offers no other copy of it
        const id = "history-background"
        const withBackground = A.replace(
            "<mxGraphModel>",
            '<mxGraphModel background="#ffcc00" shadow="1">',
        )
        fill(id, [A, B])
        const [a] = getHistory(id)
        expect(currentEntryId(id, withBackground)).toBe(a.id)
        expect(otherVersions(id, withBackground).map((e) => e.xml)).toEqual([B])
        expect(isInHistory(id, withBackground)).toBe(true)
    })

    it("return nothing for an empty history", () => {
        const id = "history-current-empty"
        clearHistory(id)
        expect(currentEntryId(id, A)).toBeNull()
        expect(firstCopyIds(id).size).toBe(0)
    })
})
