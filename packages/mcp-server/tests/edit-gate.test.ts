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

import { describe, expect, it } from "vitest"
import {
    checkEditGate,
    contentFingerprint,
    countChanges,
    describeChanges,
    markPageSeen,
} from "../src/edit-gate.ts"

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

    it("treats coordinates of 0 like left-out ones, as draw.io writes them", () => {
        const withEdge = (point: string) =>
            XML_A.replace(
                "</root>",
                `<mxCell id="e1" edge="1" parent="1" source="box1" target="box1"><mxGeometry relative="1" as="geometry">${point}</mxGeometry></mxCell></root>`,
            )
        const written = withEdge('<mxPoint x="0" y="-18" as="offset"/>')
        expect(contentFingerprint(written)).toBe(
            contentFingerprint(withEdge('<mxPoint y="-18" as="offset"/>')),
        )
        expect(contentFingerprint(written)).not.toBe(
            contentFingerprint(
                withEdge('<mxPoint x="5" y="-18" as="offset"/>'),
            ),
        )
        const atOrigin = XML_A.replace('x="40" y="40"', 'x="0" y="0"')
        expect(contentFingerprint(atOrigin)).toBe(
            contentFingerprint(XML_A.replace('x="40" y="40" ', "")),
        )
        // Other attributes of 0 are kept: a label "0" is not an empty label
        expect(
            contentFingerprint(XML_A.replace('value="Hello"', 'value="0"')),
        ).not.toBe(contentFingerprint(XML_A.replace('value="Hello" ', "")))
    })

    it("reads draw.io's order of the cells, each container followed by its children, as the same diagram", () => {
        const page = (cells: string) =>
            `<mxfile><diagram id="p" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`
        const group = (id: string) =>
            `<mxCell id="${id}" value="${id}" style="swimlane;" vertex="1" parent="1"/>`
        const child = (id: string, parent: string) =>
            `<mxCell id="${id}" value="${id}" vertex="1" parent="${parent}"/>`
        const wrapped = (id: string, parent: string) =>
            `<object id="${id}" label="${id}"><mxCell vertex="1" parent="${parent}"/></object>`
        // As a model writes it: both containers, then their children
        const written = page(
            group("g1") +
                group("g2") +
                child("a", "g1") +
                wrapped("b", "g2") +
                child("c", "g1"),
        )
        // As draw.io writes it back
        const drawio = page(
            group("g1") +
                child("a", "g1") +
                child("c", "g1") +
                group("g2") +
                wrapped("b", "g2"),
        )
        expect(contentFingerprint(written)).toBe(contentFingerprint(drawio))
        // Siblings that swap places are still a change (front and back)
        const swapped = page(
            group("g1") +
                child("c", "g1") +
                child("a", "g1") +
                group("g2") +
                wrapped("b", "g2"),
        )
        expect(contentFingerprint(swapped)).not.toBe(contentFingerprint(drawio))
    })

    it("falls back to the raw string for unparseable input", () => {
        expect(contentFingerprint("not xml at all")).toBe("not xml at all")
    })
})

describe("markPageSeen", () => {
    const page = (id: string, label: string) =>
        `<diagram id="${id}" name="${id}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="c" value="${label}" vertex="1" parent="1"/></root></mxGraphModel></diagram>`
    const doc = (a: string, b: string) =>
        `<mxfile>${page("A", a)}${page("B", b)}</mxfile>`

    it("counts the whole document as seen when the other pages are unchanged", () => {
        const seen = doc("a1", "b1")
        const live = doc("a2", "b1")
        expect(markPageSeen(seen, live, { page_id: "A" })).toBe(live)
    })

    it("does not count a changed page the model was not shown", () => {
        // The user edited page B; the model looked at page A only
        const seen = doc("a1", "b1")
        const live = doc("a1", "b2")
        const marked = markPageSeen(seen, live, { page_id: "A" })
        expect(marked).toBe(seen)
        expect(checkEditGate(marked, live).ok).toBe(false)
    })

    it("does not count other pages when the record of what was seen is empty", () => {
        // Empty also after load_diagram or a page tool on unseen changes,
        // when the model may still remember an older copy of the pages
        const live = doc("a1", "b1")
        expect(markPageSeen("", live, { page_id: "A" })).toBe("")
    })

    it("counts a one-page document as seen from its only page", () => {
        const live = `<mxfile>${page("A", "a1")}</mxfile>`
        expect(markPageSeen("", live, { page_id: "A" })).toBe(live)
    })
})

describe("describeChanges", () => {
    const BOX2 = `<mxCell id="box2" value="World" vertex="1" parent="1"><mxGeometry x="200" y="40" width="120" height="60" as="geometry"/></mxCell>`
    const XML_A_PLUS_BOX2 = XML_A.replace("</root>", `${BOX2}</root>`)
    const PAGE_2 = `<diagram id="p2" name="Page-2"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram>`
    const XML_A_TWO_PAGES = XML_A.replace("</mxfile>", `${PAGE_2}</mxfile>`)

    it("names a moved cell with its label", () => {
        const summary = describeChanges(XML_A, XML_B)
        expect(summary).toBe(
            'Since you last saw it, the user changed the diagram: modified box1 ("Hello").',
        )
        expect(summary).toContain("modified box1")
    })

    it("names a deleted cell", () => {
        expect(describeChanges(XML_A_PLUS_BOX2, XML_A)).toContain(
            'removed box2 ("World")',
        )
    })

    it("names an added cell", () => {
        expect(describeChanges(XML_A, XML_A_PLUS_BOX2)).toContain(
            'added box2 ("World")',
        )
    })

    it("is empty for draw.io's re-serialisation of the same content", () => {
        expect(describeChanges(XML_A, XML_A_RESERIALIZED)).toBe("")
    })

    it("is empty when the model has seen nothing yet", () => {
        expect(describeChanges("", XML_B)).toBe("")
    })

    it("is empty when one side does not parse", () => {
        expect(describeChanges(XML_A, "not xml at all")).toBe("")
    })

    it("reports a renamed page", () => {
        const renamed = XML_A.replace('name="Page-1"', 'name="Renamed"')
        expect(describeChanges(XML_A, renamed)).toBe(
            'Since you last saw it, the user changed the diagram. Page 1 renamed to "Renamed".',
        )
    })

    // A bare <mxGraphModel> push carries no page name, so the invented
    // "Page-1" must not read as a rename
    it("never reports a rename against a bare mxGraphModel", () => {
        const seenRenamed = XML_A.replace('name="Page-1"', 'name="Arch"')
        expect(describeChanges(seenRenamed, XML_A_BARE)).toBe("")
        const bareMoved = XML_A_BARE.replace('x="40" y="40"', 'x="300" y="200"')
        const summary = describeChanges(seenRenamed, bareMoved)
        expect(summary).toContain("modified box1")
        expect(summary).not.toContain("renamed")
    })

    it("strips HTML from labels and reads UserObject labels", () => {
        const html = XML_A.replace(
            'value="Hello"',
            'value="&lt;b&gt;Hello&lt;/b&gt;"',
        )
        expect(describeChanges(XML_A, html)).toContain(
            'modified box1 ("Hello")',
        )
        const userObject = XML_A.replace(
            "</root>",
            `<UserObject id="u1" label="&lt;i&gt;Link&lt;/i&gt;" link="https://x.y"><mxCell style="rounded=1;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell></UserObject></root>`,
        )
        expect(describeChanges(XML_A, userObject)).toContain(
            'added u1 ("Link")',
        )
    })

    it("keeps the words of an HTML label apart and decodes its spaces", () => {
        const lines = XML_A.replace(
            'value="Hello"',
            'value="Line1&lt;br&gt;Line2&amp;nbsp;end &amp;amp; more"',
        )
        expect(describeChanges(XML_A, lines)).toContain(
            'modified box1 ("Line1 Line2 end & more")',
        )
    })

    it("cuts long labels at 30 characters", () => {
        const long = "a".repeat(40)
        const summary = describeChanges(
            XML_A,
            XML_A.replace('value="Hello"', `value="${long}"`),
        )
        expect(summary).toContain(`("${"a".repeat(30)}...")`)
    })

    it("lists at most 20 cells and counts the rest", () => {
        const many = Array.from(
            { length: 25 },
            (_, i) => `<mxCell id="n${i}" vertex="1" parent="1"/>`,
        ).join("")
        const summary = describeChanges(
            XML_A,
            XML_A.replace("</root>", `${many}</root>`),
        )
        expect(summary).toContain("added n0, n1,")
        expect(summary).toContain("n19 and 5 more.")
        expect(summary).not.toContain("n20")
    })

    it("reports added and removed pages", () => {
        expect(describeChanges(XML_A, XML_A_TWO_PAGES)).toBe(
            "Since you last saw it, the user changed the diagram: page 2 added.",
        )
        expect(describeChanges(XML_A_TWO_PAGES, XML_A)).toBe(
            "Since you last saw it, the user changed the diagram: page 2 removed.",
        )
    })

    it("names the page of a cell change in a multi-page document", () => {
        const movedOnPage1 = XML_A_TWO_PAGES.replace(
            'x="40" y="40"',
            'x="300" y="200"',
        )
        expect(describeChanges(XML_A_TWO_PAGES, movedOnPage1)).toContain(
            'page 1 modified box1 ("Hello")',
        )
    })

    it("falls back to a generic clause when only the cell order changed", () => {
        const reordered = XML_A_PLUS_BOX2.replace(BOX2, "").replace(
            '<mxCell id="box1"',
            `${BOX2}<mxCell id="box1"`,
        )
        expect(describeChanges(XML_A_PLUS_BOX2, reordered)).toBe(
            "Since you last saw it, the user changed the diagram: the order of the cells changed.",
        )
    })
})

describe("countChanges", () => {
    const EDGE =
        '<mxCell id="e1" edge="1" parent="1" source="box1" target="box2"><mxGeometry relative="1" as="geometry"/></mxCell>'
    const BOX2 =
        '<mxCell id="box2" value="World" vertex="1" parent="1"><mxGeometry x="200" y="40" width="120" height="60" as="geometry"/></mxCell>'
    const PAGE_2 =
        '<diagram id="p2" name="Page-2"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram>'

    it("counts shapes and connectors added, changed and removed", () => {
        const after = XML_B.replace("</root>", `${BOX2}${EDGE}</root>`)
        expect(countChanges(XML_A, after)).toBe(
            "added 1 shape, added 1 connector, changed 1 shape",
        )
        expect(countChanges(after, XML_A)).toBe(
            "changed 1 shape, removed 1 shape, removed 1 connector",
        )
    })

    it("counts pages, and nothing for the same content written another way", () => {
        const twoPages = XML_A.replace("</mxfile>", `${PAGE_2}</mxfile>`)
        expect(countChanges(XML_A, twoPages)).toBe("added 1 page")
        expect(countChanges(XML_A, XML_A_RESERIALIZED)).toBe("")
    })
})
