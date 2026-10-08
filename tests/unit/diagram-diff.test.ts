import pako from "pako"
import { describe, expect, it } from "vitest"
import { diffDiagrams, EMPTY_SUMMARY, isSameDocument } from "@/lib/diagram-diff"

const doc = (cells: string) =>
    `<mxfile><diagram name="Page-1" id="p1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`

const box = (id: string, value = id) =>
    `<mxCell id="${id}" value="${value}" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>`
const edge = (id: string, source: string, target: string) =>
    `<mxCell id="${id}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`

const pageOf = (name: string, cells: string, attrs = "") =>
    `<diagram name="${name}" id="${name}"><mxGraphModel${attrs}><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram>`
const file = (...pages: string[]) => `<mxfile>${pages.join("")}</mxfile>`
const packedPage = (name: string, cells: string) => {
    const model = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`
    const packed = Buffer.from(
        pako.deflateRaw(encodeURIComponent(model)),
    ).toString("base64")
    return `<diagram name="${name}" id="${name}">${packed}</diagram>`
}

describe("diffDiagrams", () => {
    it("counts added shapes and connectors on an empty canvas", () => {
        const { summary, touchedIds } = diffDiagrams(
            "",
            doc(box("a") + box("b") + edge("e", "a", "b")),
        )
        expect(summary.shapesAdded).toBe(2)
        expect(summary.edgesAdded).toBe(1)
        expect(touchedIds.sort()).toEqual(["a", "b", "e"])
    })

    it("separates added, changed and removed cells", () => {
        const before = doc(box("a") + box("b") + edge("e", "a", "b"))
        const after = doc(box("a", "renamed") + box("c") + edge("e", "a", "c"))
        const { summary, touchedIds } = diffDiagrams(before, after)
        expect(summary).toEqual({
            shapesAdded: 1,
            shapesRemoved: 1,
            shapesChanged: 1,
            edgesAdded: 0,
            edgesRemoved: 0,
            edgesChanged: 1,
        })
        expect(touchedIds.sort()).toEqual(["a", "c", "e"])
    })

    it("ignores how the same cell is written", () => {
        // As the model writes it, and as draw.io saves it (the style as is)
        const model = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="A" style="rounded=1;html=1;" vertex="1" parent="1"><mxGeometry x="10" y="20" width="80" height="40" as="geometry"/></mxCell></root></mxGraphModel>`
        const saved = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" parent="1" style="rounded=1;html=1;" value="A" vertex="1"><mxGeometry as="geometry" height="40" width="80" x="10" y="20"/></mxCell></root></mxGraphModel>`
        expect(diffDiagrams(model, saved).summary).toEqual(EMPTY_SUMMARY)
    })

    it("reports nothing for identical diagrams", () => {
        const xml = doc(box("a"))
        const { summary, touchedIds } = diffDiagrams(xml, xml)
        expect(summary).toEqual(EMPTY_SUMMARY)
        expect(touchedIds).toEqual([])
    })

    it("ignores values draw.io drops when it saves", () => {
        // The model writes defaults and long numbers; draw.io leaves them out
        const model = doc(
            `<mxCell id="a" value="A" style="" vertex="1" connectable="1" parent="1"><mxGeometry x="0" y="0.0" width="80.0" height="40" relative="0" as="geometry"/></mxCell><mxCell id="e" edge="1" parent="1" source="a" target="a"><mxGeometry relative="1" as="geometry"><mxPoint x="0" y="0" as="offset"/></mxGeometry></mxCell>`,
        )
        const saved = doc(
            `<mxCell id="a" value="A" vertex="1" parent="1"><mxGeometry width="80" height="40" as="geometry"/></mxCell><mxCell id="e" edge="1" parent="1" source="a" target="a"><mxGeometry relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>`,
        )
        expect(diffDiagrams(model, saved).summary).toEqual(EMPTY_SUMMARY)
        expect(isSameDocument(model, saved)).toBe(true)
    })

    it("sees any change to a style, its order included", () => {
        const styled = (style: string) =>
            doc(
                `<mxCell id="a" style="${style}" vertex="1" parent="1"><mxGeometry width="80" height="40" as="geometry"/></mxCell>`,
            )
        const same = (a: string, b: string) =>
            isSameDocument(styled(a), styled(b))
        expect(
            same("fillColor=#f00;rounded=1", "fillColor=#f00;rounded=1"),
        ).toBe(true)
        // draw.io applies named styles and keys in order
        expect(
            same(
                "fillColor=#f00;defaultVertex",
                "defaultVertex;fillColor=#f00",
            ),
        ).toBe(false)
        // A leading ";" leaves the default style out
        expect(same("fillColor=#f00", ";fillColor=#f00")).toBe(false)
        expect(
            diffDiagrams(styled("fillColor=#f00"), styled(";fillColor=#f00"))
                .summary.shapesChanged,
        ).toBe(1)
    })

    it("tells a label with = in it from a separate attribute", () => {
        const wrapped = (attrs: string) =>
            doc(
                `<UserObject id="2" ${attrs}><mxCell vertex="1" parent="1"><mxGeometry width="80" height="40" as="geometry"/></mxCell></UserObject>`,
            )
        const a = wrapped('label="server region=us-east-1"')
        const b = wrapped('label="server" region="us-east-1"')
        expect(isSameDocument(a, b)).toBe(false)
        expect(diffDiagrams(a, b).summary.shapesChanged).toBe(1)
    })

    it("reads only a cell's style as a style, not data named style", () => {
        const wrapped = (style: string) =>
            doc(
                `<UserObject id="2" label="%style%" placeholders="1" style="${style}"><mxCell vertex="1" parent="1"><mxGeometry width="80" height="40" as="geometry"/></mxCell></UserObject>`,
            )
        expect(isSameDocument(wrapped("alpha;"), wrapped("alpha"))).toBe(false)
    })

    it("does not count layers as shapes", () => {
        const before = doc('<mxCell id="L2" parent="0"/>')
        const after = doc(box("r"))
        expect(diffDiagrams(before, after)).toEqual({
            summary: { ...EMPTY_SUMMARY, shapesAdded: 1 },
            touchedIds: ["r"],
            fromScratch: true,
        })
    })

    it("ignores empty style entries, as draw.io does", () => {
        const styled = (style: string) =>
            doc(
                `<mxCell id="a" style="${style}" vertex="1" parent="1"><mxGeometry width="80" height="40" as="geometry"/></mxCell>`,
            )
        const same = (a: string, b: string) =>
            isSameDocument(styled(a), styled(b))
        expect(same("rounded=1;html=1;", "rounded=1;html=1")).toBe(true)
        expect(same("rounded=1;;html=1", "rounded=1;html=1")).toBe(true)
        expect(
            diffDiagrams(
                styled("rounded=1;html=1;"),
                styled("rounded=1;html=1"),
            ).summary,
        ).toEqual(EMPTY_SUMMARY)
        // A leading ";" still leaves the default style out
        expect(same(";fillColor=#f00", "fillColor=#f00")).toBe(false)
    })

    it("reads the id from <UserObject> wrappers", () => {
        const wrapped = `<UserObject label="Linked" link="https://example.com" id="u1"><mxCell vertex="1" parent="1"><mxGeometry width="80" height="40" as="geometry"/></mxCell></UserObject>`
        const { summary, touchedIds } = diffDiagrams(doc(""), doc(wrapped))
        expect(summary.shapesAdded).toBe(1)
        expect(touchedIds).toEqual(["u1"])
    })

    it("only looks at the first page", () => {
        const twoPages = file(pageOf("p1", box("a")), pageOf("p2", box("z")))
        expect(diffDiagrams("", twoPages).summary.shapesAdded).toBe(1)
    })

    it("reads compressed pages", () => {
        const xml = file(packedPage("p1", box("a") + box("b")))
        expect(diffDiagrams("", xml).summary.shapesAdded).toBe(2)
        expect(diffDiagrams(xml, xml).fromScratch).toBe(false)
    })

    it("treats unparsable XML as empty", () => {
        expect(
            diffDiagrams("<mxfile><diagram>", doc(box("a"))).fromScratch,
        ).toBe(true)
    })
})

describe("isSameDocument", () => {
    const a = file(pageOf("One", box("a")), pageOf("Two", box("b")))

    it("is true for the same pages written differently", () => {
        const b = file(
            pageOf("One", box("a"), ' dx="300" dy="120" grid="1"'),
            packedPage("Two", box("b")),
        )
        expect(isSameDocument(a, b)).toBe(true)
    })

    it("sees a change on the second page", () => {
        const b = file(pageOf("One", box("a")), pageOf("Two", box("b", "x")))
        expect(diffDiagrams(a, b).summary).toEqual(diffDiagrams(a, a).summary)
        expect(isSameDocument(a, b)).toBe(false)
    })

    it("sees added pages, renamed pages and changed page settings", () => {
        expect(isSameDocument(a, file(pageOf("One", box("a"))))).toBe(false)
        expect(
            isSameDocument(
                a,
                file(pageOf("One", box("a")), pageOf("Renamed", box("b"))),
            ),
        ).toBe(false)
        expect(
            isSameDocument(
                file(pageOf("One", box("a"), ' background="#ffffff"')),
                file(pageOf("One", box("a"), ' background="#000000"')),
            ),
        ).toBe(false)
    })

    it("compares a setting written on one side with draw.io's default", () => {
        const withAttrs = (attrs: string) =>
            file(pageOf("One", box("a"), attrs))
        const plain = withAttrs("")
        // Defaults, as draw.io fills them in
        expect(isSameDocument(plain, withAttrs(' math="0" grid="1"'))).toBe(
            true,
        )
        // A page without a paper size keeps the canvas's, whatever it is
        expect(
            isSameDocument(
                plain,
                withAttrs(' pageWidth="1654" pageHeight="2339"'),
            ),
        ).toBe(true)
        // Real changes
        expect(isSameDocument(plain, withAttrs(' math="1"'))).toBe(false)
        expect(isSameDocument(plain, withAttrs(' shadow="1"'))).toBe(false)
        expect(
            isSameDocument(
                withAttrs(' pageWidth="850" pageHeight="1100"'),
                withAttrs(' pageWidth="1654" pageHeight="2339"'),
            ),
        ).toBe(false)
        expect(
            isSameDocument(
                plain,
                withAttrs(
                    ' backgroundImage="{&quot;src&quot;:&quot;x.png&quot;}"',
                ),
            ),
        ).toBe(false)
    })

    it("sees a background set on one side", () => {
        expect(
            isSameDocument(
                file(pageOf("One", box("a"))),
                file(pageOf("One", box("a"), ' background="#000000"')),
            ),
        ).toBe(false)
    })

    it("sees shapes brought to front or sent back", () => {
        expect(
            isSameDocument(
                file(pageOf("One", box("a") + box("b"))),
                file(pageOf("One", box("b") + box("a"))),
            ),
        ).toBe(false)
    })

    it("sees a hidden layer", () => {
        const hidden = file(pageOf("One", box("a"))).replace(
            '<mxCell id="1" parent="0"/>',
            '<mxCell id="1" parent="0" visible="0"/>',
        )
        expect(isSameDocument(file(pageOf("One", box("a"))), hidden)).toBe(
            false,
        )
    })

    it("does not care where children of other parents are written", () => {
        const group = (inner: string) =>
            `<mxCell id="g" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>${inner}`
        const child = `<mxCell id="c" vertex="1" parent="g"><mxGeometry as="geometry"/></mxCell>`
        expect(
            isSameDocument(
                file(pageOf("One", group(child) + box("a"))),
                file(pageOf("One", group("") + box("a") + child)),
            ),
        ).toBe(true)
    })

    it("compares file variables, in any order; none is the same as {}", () => {
        const withVars = (vars: string | null) =>
            `<mxfile${vars === null ? "" : ` vars="${vars}"`}>${pageOf("One", box("a"))}</mxfile>`
        const team = (value: string) =>
            `{&quot;team&quot;:&quot;${value}&quot;,&quot;x&quot;:&quot;1&quot;}`
        expect(
            isSameDocument(withVars(team("Old")), withVars(team("New"))),
        ).toBe(false)
        expect(
            isSameDocument(
                withVars(team("Old")),
                withVars(
                    "{&quot;x&quot;:&quot;1&quot;,&quot;team&quot;:&quot;Old&quot;}",
                ),
            ),
        ).toBe(true)
        expect(isSameDocument(withVars(null), withVars(team("Old")))).toBe(
            false,
        )
        expect(isSameDocument(withVars(null), withVars("{}"))).toBe(true)
    })

    it("compares a wrapper's own data as written, geometry as numbers", () => {
        const wrapped = (x: string, geometryX: string) =>
            file(
                pageOf(
                    "One",
                    `<UserObject id="v" label="%x%" placeholders="1" x="${x}"><mxCell vertex="1" parent="1"><mxGeometry x="${geometryX}" y="0" width="80" height="40" as="geometry"/></mxCell></UserObject>`,
                ),
            )
        expect(isSameDocument(wrapped("01", "40"), wrapped("1", "40"))).toBe(
            false,
        )
        expect(isSameDocument(wrapped("1", "40.0"), wrapped("1", "40"))).toBe(
            true,
        )
    })

    it("reads numeric page settings as numbers", () => {
        const page = (attrs: string) => file(pageOf("One", box("a"), attrs))
        expect(
            isSameDocument(
                page(' gridSize="10.0" pageScale="1.0"'),
                page(' gridSize="10" pageScale="1"'),
            ),
        ).toBe(true)
        // Written on one side only: the default, also as 10.0
        expect(isSameDocument(page(' gridSize="10.0"'), page(""))).toBe(true)
        expect(
            isSameDocument(page(' gridSize="20"'), page(' gridSize="10"')),
        ).toBe(false)
    })
})
