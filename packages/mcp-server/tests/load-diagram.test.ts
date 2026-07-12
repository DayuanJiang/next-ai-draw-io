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
import { beforeAll, describe, expect, it } from "vitest"

// Install the DOM polyfills exactly as index.ts does at runtime.
beforeAll(() => {
    ;(globalThis as any).DOMParser = DOMParser
    class XMLSerializerPolyfill {
        serializeToString(node: any): string {
            if (node.outerHTML !== undefined) return node.outerHTML
            if (node.documentElement) return node.documentElement.outerHTML
            return ""
        }
    }
    ;(globalThis as any).XMLSerializer = XMLSerializerPolyfill
})

import {
    decompressPageContent,
    parseDrawioFileContent,
} from "../src/load-diagram.js"

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
        expect(r).toEqual({ ok: true, xml: PLAIN_MXFILE })
    })

    it("wraps a bare mxGraphModel into a one-page mxfile", () => {
        const r = parseDrawioFileContent(MODEL_XML)
        expect(r.ok).toBe(true)
        if (r.ok) {
            expect(r.xml).toContain("<mxfile")
            expect(r.xml).toContain('value="Hello"')
        }
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
        expect(r).toEqual({ ok: true, xml: withEmpty })
    })

    it("rejects empty files", () => {
        const r = parseDrawioFileContent("   ")
        expect(r.ok).toBe(false)
    })

    it("rejects non-drawio content", () => {
        const r = parseDrawioFileContent("<svg><rect/></svg>")
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error).toContain("Not a draw.io file")
    })

    it("rejects a page whose content is neither XML nor compressed", () => {
        const bad = `<mxfile><diagram id="a" name="Broken">!!! not a diagram !!!</diagram></mxfile>`
        const r = parseDrawioFileContent(bad)
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.error).toContain('"Broken"')
    })
})
