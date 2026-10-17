/**
 * Unit tests for load_diagram's file parsing (load-diagram.ts).
 *
 * A .drawio file stores each page's <mxGraphModel> either as plain XML or
 * as draw.io's compressed default (encodeURIComponent → raw deflate →
 * base64 text content). The loader must produce the canonical session
 * shape: an <mxfile> whose every page is plain XML.
 */

import { deflateRawSync } from "node:zlib"
import { DOMParser } from "linkedom"
import { describe, expect, it } from "vitest"

import {
    decompressPageContent,
    extractSvgEmbeddedXml,
    parseDrawioFileContent,
} from "../src/load-diagram.ts"

const MODEL_XML = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="box1" value="Hello" style="rounded=0;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel>`

/** Compress a page body exactly the way draw.io does when saving. */
function drawioCompress(xml: string): string {
    return deflateRawSync(
        Buffer.from(encodeURIComponent(xml), "utf-8"),
    ).toString("base64")
}

const PLAIN_MXFILE = `<mxfile host="app.diagrams.net"><diagram id="p1" name="Page-1">${MODEL_XML}</diagram></mxfile>`
const COMPRESSED_MXFILE = `<mxfile host="app.diagrams.net" compressed="true"><diagram id="p1" name="Page-1">${drawioCompress(MODEL_XML)}</diagram></mxfile>`

describe("decompressPageContent", () => {
    it("round-trips draw.io's compressed format", () => {
        expect(decompressPageContent(drawioCompress(MODEL_XML))).toBe(MODEL_XML)
    })

    it("handles non-URI-encoded legacy payloads", () => {
        const legacy = deflateRawSync(Buffer.from(MODEL_XML, "utf-8")).toString(
            "base64",
        )
        expect(decompressPageContent(legacy)).toBe(MODEL_XML)
    })

    it("returns null for garbage", () => {
        expect(decompressPageContent("not base64 deflate")).toBeNull()
    })
})

describe("parseDrawioFileContent", () => {
    it("passes a plain-XML mxfile through unchanged", () => {
        const r = parseDrawioFileContent(PLAIN_MXFILE)
        expect(r).toEqual({
            ok: true,
            xml: PLAIN_MXFILE,
            hadCompressedPages: false,
        })
    })

    it("wraps a bare mxGraphModel into a one-page mxfile", () => {
        const r = parseDrawioFileContent(MODEL_XML)
        expect(r.ok).toBe(true)
        if (r.ok) {
            expect(r.xml).toContain("<mxfile")
            expect(r.xml).toContain('value="Hello"')
        }
    })

    it("rejects a bare mxGraphModel that is not closed", () => {
        const r = parseDrawioFileContent(
            MODEL_XML.replace("</root></mxGraphModel>", ""),
        )
        expect(r.ok).toBe(false)
    })

    it("decompresses a compressed mxfile into plain XML pages", () => {
        const r = parseDrawioFileContent(COMPRESSED_MXFILE)
        expect(r.ok).toBe(true)
        if (r.ok) {
            expect(r.xml).toContain("<mxGraphModel")
            expect(r.xml).toContain('value="Hello"')
            // The compressed blob must be gone.
            expect(r.xml).not.toContain(drawioCompress(MODEL_XML))
        }
    })

    it("decompresses only the compressed pages of a mixed file", () => {
        const mixed = `<mxfile><diagram id="a" name="Plain">${MODEL_XML}</diagram><diagram id="b" name="Squeezed">${drawioCompress(MODEL_XML)}</diagram></mxfile>`
        const r = parseDrawioFileContent(mixed)
        expect(r.ok).toBe(true)
        if (r.ok) {
            const doc = new DOMParser().parseFromString(r.xml, "text/xml")
            const diagrams = Array.from(
                doc.querySelectorAll("diagram"),
            ) as Element[]
            expect(diagrams).toHaveLength(2)
            for (const d of diagrams) {
                expect(d.querySelector("mxGraphModel")).not.toBeNull()
            }
        }
    })

    it("keeps empty pages as-is", () => {
        const withEmpty = `<mxfile><diagram id="a" name="Page-1">${MODEL_XML}</diagram><diagram id="b" name="Empty"></diagram></mxfile>`
        const r = parseDrawioFileContent(withEmpty)
        expect(r).toEqual({
            ok: true,
            xml: withEmpty,
            hadCompressedPages: false,
        })
    })

    it("rejects empty files", () => {
        const r = parseDrawioFileContent("   ")
        expect(r.ok).toBe(false)
    })

    it("rejects non-drawio content", () => {
        const r = parseDrawioFileContent("<html><body/></html>")
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error).toContain("Not a draw.io file")
    })

    it("rejects an SVG without an embedded diagram", () => {
        const r = parseDrawioFileContent("<svg><rect/></svg>")
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error).toContain("embedded diagram")
    })

    it("rejects a page whose content is neither XML nor compressed", () => {
        const bad = `<mxfile><diagram id="a" name="Broken">!!! not a diagram !!!</diagram></mxfile>`
        const r = parseDrawioFileContent(bad)
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error).toContain('"Broken"')
    })
})

describe("hadCompressedPages", () => {
    it("is false for a bare mxGraphModel", () => {
        const r = parseDrawioFileContent(MODEL_XML)
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.hadCompressedPages).toBe(false)
    })

    it("is true for a fully compressed mxfile", () => {
        const r = parseDrawioFileContent(COMPRESSED_MXFILE)
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.hadCompressedPages).toBe(true)
    })

    it("is true for a mixed plain/compressed file", () => {
        const mixed = `<mxfile><diagram id="a" name="Plain">${MODEL_XML}</diagram><diagram id="b" name="Squeezed">${drawioCompress(MODEL_XML)}</diagram></mxfile>`
        const r = parseDrawioFileContent(mixed)
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.hadCompressedPages).toBe(true)
    })
})

/**
 * Escape text for an XML attribute the way draw.io/Chromium serialise the
 * diagram into the SVG root's content attribute.
 */
function escapeAttr(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/\n/g, "&#xa;")
}

/** Build a .drawio.svg (Editable SVG) with the given mxfile embedded. */
function drawioSvg(mxfileXml: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="200px" height="100px" viewBox="-0.5 -0.5 200 100" content="${escapeAttr(mxfileXml)}"><defs/><g><rect x="40" y="40" width="120" height="60" fill="#ffffff" stroke="#000000"/></g></svg>`
}

const SVG_PROLOG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Do not edit this file with editors other than draw.io -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
`

describe("parseDrawioFileContent with a prolog before the root", () => {
    it("accepts a declaration, a comment and a DOCTYPE before <mxfile>", () => {
        const prolog = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Architecture, v2 -->\n<!DOCTYPE mxfile>\n`
        expect(parseDrawioFileContent(prolog + PLAIN_MXFILE)).toEqual({
            ok: true,
            xml: PLAIN_MXFILE,
            hadCompressedPages: false,
        })
    })

    it("accepts a comment before a bare <mxGraphModel>", () => {
        const r = parseDrawioFileContent(`<!-- exported -->\n${MODEL_XML}`)
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.xml).toContain('value="Hello"')
    })

    it("treats a file with nothing after its prolog as empty", () => {
        expect(parseDrawioFileContent(`<?xml version="1.0"?>\n`)).toEqual({
            ok: false,
            error: "File is empty.",
        })
    })
})

describe("extractSvgEmbeddedXml", () => {
    it("returns undefined for non-SVG text", () => {
        expect(extractSvgEmbeddedXml(PLAIN_MXFILE)).toBeUndefined()
        expect(extractSvgEmbeddedXml("hello")).toBeUndefined()
    })

    it("accepts a root element with a namespace prefix", () => {
        const svg = `<svg:svg xmlns:svg="http://www.w3.org/2000/svg" content="${escapeAttr(PLAIN_MXFILE)}"></svg:svg>`
        expect(extractSvgEmbeddedXml(svg)).toBe(PLAIN_MXFILE)
        expect(parseDrawioFileContent(svg)).toEqual({
            ok: true,
            xml: PLAIN_MXFILE,
            hadCompressedPages: false,
        })
    })

    it("returns an empty string for an SVG without content", () => {
        expect(extractSvgEmbeddedXml("<svg><rect/></svg>")).toBe("")
    })

    it("returns the decoded content attribute", () => {
        expect(extractSvgEmbeddedXml(drawioSvg(PLAIN_MXFILE))).toBe(
            PLAIN_MXFILE,
        )
    })
})

describe("parseDrawioFileContent with .drawio.svg", () => {
    it("loads a compressed one-page mxfile embedded in an SVG", () => {
        const r = parseDrawioFileContent(drawioSvg(COMPRESSED_MXFILE))
        expect(r.ok).toBe(true)
        if (r.ok) {
            expect(r.xml).toContain("<mxfile")
            expect(r.xml).toContain("<mxGraphModel")
            expect(r.xml).toContain('value="Hello"')
            expect(r.xml).not.toContain("<svg")
        }
    })

    it("accepts draw.io's XML declaration, comment and DOCTYPE prolog", () => {
        const r = parseDrawioFileContent(
            SVG_PROLOG + drawioSvg(COMPRESSED_MXFILE),
        )
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.xml).toContain('value="Hello"')
    })

    it("round-trips &quot; and &#xa; in an uncompressed embedded label", () => {
        const model = MODEL_XML.replace(
            'value="Hello"',
            'value="say &quot;hi&quot;&#xa;next"',
        )
        // A pretty-printed file: the newline between tags becomes &#xa; in
        // the SVG attribute, the label's entities become &amp;quot; etc.
        const mxfile = `<mxfile host="app.diagrams.net">\n<diagram id="p1" name="Page-1">${model}</diagram>\n</mxfile>`
        const svg = drawioSvg(mxfile)
        expect(svg).toContain("&amp;quot;")
        expect(svg).toContain("&amp;#xa;")
        expect(svg).toContain("&gt;&#xa;&lt;diagram")

        const r = parseDrawioFileContent(svg)
        expect(r.ok).toBe(true)
        if (r.ok) {
            expect(r.xml).toContain('value="say &quot;hi&quot;&#xa;next"')
            const doc = new DOMParser().parseFromString(r.xml, "text/xml")
            const cell = doc.querySelector('mxCell[id="box1"]') as Element
            expect(cell.getAttributeNode("value")?.value).toBe('say "hi"\nnext')
        }
    })

    it("loads a two-page embedded mxfile as two pages", () => {
        const twoPages = `<mxfile compressed="true"><diagram id="a" name="First">${drawioCompress(MODEL_XML)}</diagram><diagram id="b" name="Second">${drawioCompress(MODEL_XML.replace("Hello", "World"))}</diagram></mxfile>`
        const r = parseDrawioFileContent(drawioSvg(twoPages))
        expect(r.ok).toBe(true)
        if (r.ok) {
            const doc = new DOMParser().parseFromString(r.xml, "text/xml")
            const diagrams = Array.from(
                doc.querySelectorAll("diagram"),
            ) as Element[]
            expect(diagrams).toHaveLength(2)
            for (const d of diagrams) {
                expect(d.querySelector("mxGraphModel")).not.toBeNull()
            }
            expect(r.xml).toContain('value="World"')
        }
    })

    it("rejects an SVG whose content is not draw.io XML", () => {
        const r = parseDrawioFileContent(
            '<svg xmlns="http://www.w3.org/2000/svg" content="hello"><rect/></svg>',
        )
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error).toContain("not draw.io XML")
    })
})
