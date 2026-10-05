/**
 * Tests for XML syntax checking, autoFixXml and the XML serializer.
 *
 * linkedom (the DOM used in Node) parses leniently and never reports syntax
 * errors, so validation relies on the strict check in dom.ts. autoFixXml
 * runs on the whole document whenever any check fails, so its steps must
 * leave valid parts of the document untouched.
 */

import { beforeAll, describe, expect, it } from "vitest"
import { installDomPolyfill } from "../src/dom.ts"
import { getXmlSyntaxError } from "../src/xml-syntax.ts"

beforeAll(() => {
    installDomPolyfill()
})

import { addPageToDoc, parseMxfile, serializeMxfile } from "../src/pages.ts"
import { validateAndFixXml } from "../src/xml-validation.ts"

/** Bare model with the root cells plus the given cells. */
const model = (cells: string) =>
    `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`

// A bare & makes the first validation fail, which triggers autoFixXml on
// the whole document.
const BROKEN_CELL = `<mxCell id="9" value="R&D" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>`

describe("getXmlSyntaxError", () => {
    it("rejects an attribute prefix that was never declared", () => {
        // The browser's DOMParser, and so draw.io, rejects it too
        expect(getXmlSyntaxError(`<mxCell id="2" xlink:href="x"/>`)).toMatch(
            /prefix/,
        )
        expect(
            getXmlSyntaxError(
                `<mxCell xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="x"/>`,
            ),
        ).toBeNull()
    })

    it("accepts well-formed XML", () => {
        expect(getXmlSyntaxError(model(""))).toBeNull()
    })

    it.each([
        ["duplicate attribute", `<a style="x" style="y"/>`],
        ["unquoted attribute", `<a id=2/>`],
        ["missing space between attributes", `<a id="2"vertex="1"/>`],
        ["bare ampersand", `<a v="R&D"/>`],
        ["unclosed tag", `<a><b></a>`],
        ["plain text", `hello`],
    ])("reports %s", (_name, xml) => {
        expect(getXmlSyntaxError(xml)).toMatch(/^\d+:\d+: /)
    })
})

describe("validateAndFixXml", () => {
    it("rejects a duplicate style attribute", () => {
        const r = validateAndFixXml(
            model(
                `<mxCell id="2" style="a=1;" style="b=1;" vertex="1" parent="1"/>`,
            ),
        )
        expect(r.valid).toBe(false)
        expect(r.error).toContain("duplicate attribute: style")
    })

    it("rejects an unquoted attribute value", () => {
        const r = validateAndFixXml(
            model(`<mxCell id=2 vertex="1" parent="1"/>`),
        )
        expect(r.valid).toBe(false)
    })

    it("keeps style values intact while fixing another cell", () => {
        const cells = `<mxCell id="2" style="shape=cylinder3;whiteSpace=wrap;" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell><mxCell id="3" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="1" source="2" target="2"><mxGeometry relative="1" as="geometry"/></mxCell>`
        const r = validateAndFixXml(model(cells + BROKEN_CELL))
        expect(r.valid).toBe(true)
        expect(r.fixed).toContain('style="shape=cylinder3;whiteSpace=wrap;"')
        expect(r.fixed).toContain('style="edgeStyle=orthogonalEdgeStyle;"')
        expect(r.fixed).toContain('value="R&amp;D"')
    })

    it("keeps &quot; inside rich-text labels", () => {
        const rich = `<mxCell id="4" value="&lt;font style=&quot;color: red;&quot;&gt;Hi&lt;/font&gt;" style="html=1;" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>`
        const r = validateAndFixXml(model(rich + BROKEN_CELL))
        expect(r.valid).toBe(true)
        expect(r.fixed).toContain(
            'value="&lt;font style=&quot;color: red;&quot;&gt;Hi&lt;/font&gt;"',
        )
        expect(getXmlSyntaxError(r.fixed ?? "")).toBeNull()
    })

    it("keeps UserObject and object wrappers", () => {
        const wrapped = `<UserObject id="u" label="L" link="https://example.com"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></UserObject><object id="o" label="O"><mxCell vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></object>`
        const r = validateAndFixXml(model(wrapped + BROKEN_CELL))
        expect(r.valid).toBe(true)
        expect(r.fixed).toContain('<UserObject id="u"')
        expect(r.fixed).toContain('<object id="o"')
    })

    it("leaves one-cell-per-line XML alone while fixing another cell", () => {
        const xml = [
            "<mxGraphModel>",
            "<root>",
            '<mxCell id="0"/>',
            '<mxCell id="1" parent="0"/>',
            BROKEN_CELL,
            '<mxCell id="3" value="B" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>',
            "</root>",
            "</mxGraphModel>",
        ].join("\n")
        const r = validateAndFixXml(xml)
        expect(r.valid).toBe(true)
        expect(r.fixes).toEqual(["Escaped unescaped & characters"])
    })

    it("leaves cells split over two lines alone while fixing another cell", () => {
        const xml = [
            "<mxGraphModel><root>",
            '<mxCell id="0"/><mxCell id="1" parent="0"/>',
            '<mxCell id="2" value="A" vertex="1" parent="1">',
            '  <mxGeometry as="geometry"/></mxCell>',
            '<mxCell id="3" value="B" vertex="1" parent="1">',
            '  <mxGeometry as="geometry"/></mxCell>',
            BROKEN_CELL,
            "</root></mxGraphModel>",
        ].join("\n")
        const r = validateAndFixXml(xml)
        expect(r.valid).toBe(true)
        expect(r.fixes).toEqual(["Escaped unescaped & characters"])
    })

    it("renames duplicate short ids without touching the attribute name", () => {
        const r = validateAndFixXml(
            model(
                `<mxCell id="d" vertex="1" parent="1"/><mxCell id="d" vertex="1" parent="1"/><mxCell id="i" vertex="1" parent="1"/><mxCell id="i" vertex="1" parent="1"/>`,
            ),
        )
        expect(r.valid).toBe(true)
        expect(r.fixed).toContain('id="d_dup1"')
        expect(r.fixed).toContain('id="i_dup1"')
    })

    it("adds a missing space between attributes", () => {
        const r = validateAndFixXml(
            model(
                `<mxCell id="2"value="a" style="x=1;" vertex="1" parent="1"/>`,
            ),
        )
        expect(r.valid).toBe(true)
        expect(r.fixed).toContain('<mxCell id="2" value="a" style="x=1;"')
    })

    it("fixes attribute values quoted with &quot;", () => {
        const r = validateAndFixXml(
            model(
                `<mxCell id="2" value=&quot;Hello&quot; vertex="1" parent="1"/>`,
            ),
        )
        expect(r.valid).toBe(true)
        expect(r.fixed).toContain('value="Hello"')
    })
})

describe("XML serializer and strict parsing in page helpers", () => {
    it("keeps line breaks and tabs in attribute values", () => {
        const xml = `<mxfile><diagram id="p" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="2" value="Multi-Head&#xa;Attention&#9;x" vertex="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
        const out = serializeMxfile(parseMxfile(xml) as Document)
        expect(out).toContain('value="Multi-Head&#xa;Attention&#9;x"')
        expect(out).not.toMatch(/value="[^"]*\n/)
    })

    it("escapes special characters in attributes and text", () => {
        const xml = `<mxfile><diagram id="p" name="R&amp;D">a &lt; b<mxGraphModel><root><mxCell id="0" value="&lt;b&gt; &amp; &quot;"/></root></mxGraphModel></diagram></mxfile>`
        const out = serializeMxfile(parseMxfile(xml) as Document)
        expect(out).toBe(xml)
    })

    it("parseMxfile returns null for malformed XML", () => {
        expect(
            parseMxfile(
                `<mxfile><diagram id="p" name="a" name="b"></diagram></mxfile>`,
            ),
        ).toBeNull()
    })

    it("addPageToDoc rejects malformed page XML", () => {
        const doc = parseMxfile(
            `<mxfile><diagram id="p" name="Page-1">${model("")}</diagram></mxfile>`,
        ) as Document
        expect(() =>
            addPageToDoc(doc, {
                xml: model(`<mxCell id=2 vertex="1" parent="1"/>`),
            }),
        ).toThrow()
    })
})

describe("autoFixXml keeps valid tags", () => {
    it("removes a stray <mxGraph/> without touching <mxGraphModel>", () => {
        const r = validateAndFixXml(
            model(`<mxGraph/><mxCell id="2" vertex="1" parent="1"/>`),
        )
        expect(r.valid).toBe(true)
        expect(r.fixed).toContain("<mxGraphModel>")
        expect(r.fixed).toContain("</mxGraphModel>")
        expect(r.fixed).not.toContain("<mxGraph/>")
        expect(r.fixed).toContain('id="2"')
    })

    it("removes a stray <a> without touching <Array> waypoints", () => {
        const edge = `<mxCell id="e" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="1" y="2"/></Array></mxGeometry></mxCell>`
        const r = validateAndFixXml(model(`<a></a>${edge}`))
        expect(r.valid).toBe(true)
        expect(r.fixed).toContain('<Array as="points">')
        expect(r.fixed).toContain('<mxPoint x="1" y="2"/>')
        expect(r.fixed).not.toContain("<a>")
    })

    it("fixes a lowercase <mxcell> instead of deleting every cell", () => {
        const r = validateAndFixXml(
            model(
                `<mxcell id="3" vertex="1" parent="1"></mxcell>${BROKEN_CELL}`,
            ),
        )
        expect(r.valid).toBe(true)
        expect(r.fixed).toContain('<mxCell id="3"')
        expect(r.fixed).toContain('<mxCell id="0"/>')
        expect(r.fixed).toContain('value="R&amp;D"')
    })

    it("keeps label text when removing a foreign tag", () => {
        const cell = `<mxCell id="4" value="&lt;b&gt;Bold&lt;/b&gt;" vertex="1" parent="1"/>`
        const r = validateAndFixXml(model(`<foo/>${cell}`))
        expect(r.valid).toBe(true)
        expect(r.fixed).toContain('value="&lt;b&gt;Bold&lt;/b&gt;"')
        expect(r.fixed).not.toContain("<foo/>")
    })
})

describe("validateAndFixXml strict checks", () => {
    it("fixes the case of an unknown element name", () => {
        const r = validateAndFixXml(
            model(`<mxcell id="3" vertex="1" parent="1"/>`),
        )
        expect(r.valid).toBe(true)
        expect(r.fixes).toContain("Fixed tag case of <mxCell>")
        expect(r.fixed).toContain('<mxCell id="3"')
    })

    it("removes an orphan mxPoint but keeps waypoints and named points", () => {
        const cell = `<mxCell id="e" edge="1" parent="1"><mxGeometry relative="1" as="geometry"><mxPoint x="5" y="5"/><mxPoint x="0" y="0" as="sourcePoint"/><Array as="points"><mxPoint x="1" y="2"/></Array></mxGeometry></mxCell>`
        const r = validateAndFixXml(model(cell))
        expect(r.valid).toBe(true)
        expect(r.fixed).not.toContain('<mxPoint x="5" y="5"/>')
        expect(r.fixed).toContain('as="sourcePoint"')
        expect(r.fixed).toContain('<mxPoint x="1" y="2"/>')
    })

    it("finds an orphan mxPoint after an empty <Array/>", () => {
        const edge = (id: string, points: string) =>
            `<mxCell id="${id}" edge="1" parent="1"><mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`
        const r = validateAndFixXml(
            model(
                edge("e1", `<Array as="points"/>`) +
                    `<mxCell id="v" vertex="1" parent="1"><mxGeometry x="1" y="1" width="9" height="9" as="geometry"><mxPoint x="5" y="5"/></mxGeometry></mxCell>` +
                    edge(
                        "e2",
                        `<Array as="points"><mxPoint x="1" y="2"/></Array>`,
                    ),
            ),
        )
        expect(r.valid).toBe(true)
        expect(r.fixed).not.toContain('<mxPoint x="5" y="5"/>')
        expect(r.fixed).toContain('<mxPoint x="1" y="2"/>')
    })
})

describe("text between tags", () => {
    // draw.io reads any text inside a page as compressed data, so the whole
    // page fails to open with an atob error
    it("turns a literal \\n between tags into a line break", () => {
        const cell = `<mxCell id="3" value="Reset password" vertex="1" parent="1">\\n  <mxGeometry x="0" y="0" width="80" height="40" as="geometry"/>\\n</mxCell>`
        const r = validateAndFixXml(cell)
        expect(r.valid).toBe(true)
        expect(r.fixed).toBe(
            `<mxCell id="3" value="Reset password" vertex="1" parent="1">\n  <mxGeometry x="0" y="0" width="80" height="40" as="geometry"/>\n</mxCell>`,
        )
    })

    it("rejects other text between tags", () => {
        const r = validateAndFixXml(
            model(
                `<mxCell id="3" vertex="1" parent="1">Reset password<mxGeometry as="geometry"/></mxCell>`,
            ),
        )
        expect(r.valid).toBe(false)
        expect(r.error).toMatch(/Reset password/)
    })

    it("accepts a compressed page", () => {
        expect(
            validateAndFixXml(
                `<mxfile><diagram id="p" name="P">dZHBDoIwDIafhjtsGPWM6MkTB8/LVmBxrGQMQZ/eLRuIUS/bv/VfmybF</diagram></mxfile>`,
            ).valid,
        ).toBe(true)
    })
})

describe("text directly under a page", () => {
    it("fixes a literal \\n before the model of a page", () => {
        const r = validateAndFixXml(
            `<mxfile><diagram id="p" name="P">\\n${model(`<mxCell id="2" vertex="1" parent="1"/>`)}</diagram></mxfile>`,
        )
        expect(r.valid).toBe(true)
        expect(r.fixed).not.toContain("\\n")
    })

    it("rejects CDATA text before the model of a page", () => {
        const r = validateAndFixXml(
            `<mxfile><diagram id="p" name="P"><![CDATA[not-base64!]]>${model(`<mxCell id="2" vertex="1" parent="1"/>`)}</diagram></mxfile>`,
        )
        expect(r.valid).toBe(false)
        expect(r.error).toMatch(/not-base64/)
    })
})

describe("attributes inside quoted values", () => {
    const labelled = `<mxCell id="2" value="Use parent='1'" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>`

    it("are not duplicates of the real ones", () => {
        const r = validateAndFixXml(model(labelled))
        expect(r.valid).toBe(true)
        expect(r.fixed ?? model(labelled)).toContain(labelled)
    })

    it("are kept when a real duplicate is removed", () => {
        // The bare & makes the repair run on the whole document
        const cell = `<mxCell id="3" value="Use parent='1'" vertex="1" parent="1" parent="1"><mxGeometry as="geometry"/></mxCell>`
        const r = validateAndFixXml(model(cell + BROKEN_CELL))
        expect(r.valid).toBe(true)
        expect(r.fixed).toContain(
            `<mxCell id="3" value="Use parent='1'" vertex="1" parent="1">`,
        )
    })

    it("leave two cells with an unbalanced quote their ids and parents", () => {
        const broken = `<mxCell id="4" style="rounded=1;fillColor="#dae8fc" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell><mxCell id="5" value="B" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell>`
        const r = validateAndFixXml(model(broken))
        expect(r.fixed).toContain(`id="5" value="B" vertex="1" parent="1"`)
        expect(r.fixed).toMatch(/id="4"[^>]*vertex="1" parent="1"/)
    })
})
