/**
 * Unit tests for multi-page (mxfile) support.
 *
 * Pinned to the user-visible contract described in
 * multi-page-mcp-support-plan.md §5 (acceptance criteria):
 *
 *   AC1. create_new_diagram accepts both bare <mxGraphModel> and full <mxfile>.
 *   AC2. get_diagram returns the full <mxfile> regardless of page count.
 *   AC3. edit_diagram accepts an optional page selector.
 *   AC6. Two tool calls reproduce the Transformer/CNN scenario.
 *   AC9. The wrapper-injection hack at http-server.ts:845 is unnecessary.
 *
 * These tests pin the helpers (pages.ts), the validator update
 * (xml-validation.ts), and the page-targeted edit logic
 * (diagram-operations.ts) — i.e. the layers underneath the MCP tool surface.
 */

import { DOMParser } from "linkedom"
import { beforeAll, describe, expect, it } from "vitest"

// Install the DOM polyfill exactly as index.ts does at runtime — the
// helpers under test rely on it.
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

import { applyDiagramOperations } from "../src/diagram-operations.js"
import {
    addPageToDoc,
    deletePageFromDoc,
    findPageElement,
    generatePageId,
    hasPageSelector,
    isMxFile,
    isMxGraphModel,
    listPagesFromDoc,
    normalizeToMxfile,
    parseMxfile,
    projectPage,
    renamePageInDoc,
    serializeMxfile,
} from "../src/pages.js"
import { validateAndFixXml } from "../src/xml-validation.js"

const BARE_MODEL_ONE_CELL = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" vertex="1" parent="1" value="Hello"><mxGeometry x="40" y="40" width="100" height="40" as="geometry"/></mxCell></root></mxGraphModel>`

const TWO_PAGE_MXFILE = `<mxfile host="app.diagrams.net"><diagram id="page-transformer" name="Transformer"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" vertex="1" parent="1" value="Encoder"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram><diagram id="page-cnn" name="CNN"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" vertex="1" parent="1" value="Conv1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`

describe("pages.ts — shape detection", () => {
    it("isMxFile detects a multi-page mxfile", () => {
        expect(isMxFile(TWO_PAGE_MXFILE)).toBe(true)
    })

    it("isMxFile rejects a bare mxGraphModel", () => {
        expect(isMxFile(BARE_MODEL_ONE_CELL)).toBe(false)
    })

    it("isMxGraphModel detects a bare model", () => {
        expect(isMxGraphModel(BARE_MODEL_ONE_CELL)).toBe(true)
        expect(isMxGraphModel(TWO_PAGE_MXFILE)).toBe(false)
    })

    it("isMxFile tolerates an XML declaration prefix", () => {
        expect(
            isMxFile(
                `<?xml version="1.0" encoding="UTF-8"?>${TWO_PAGE_MXFILE}`,
            ),
        ).toBe(true)
    })
})

describe("pages.ts — normalizeToMxfile (backward compatibility, AC1)", () => {
    it("wraps a bare mxGraphModel into a single-page mxfile", () => {
        const out = normalizeToMxfile(BARE_MODEL_ONE_CELL, {
            pageId: "p1",
            pageName: "Page-1",
        })
        expect(out).not.toBeNull()
        expect(out).toMatch(/^<mxfile/)
        expect(out).toContain(`<diagram id="p1" name="Page-1">`)
        expect(out).toContain("<mxGraphModel>")
    })

    it("returns mxfile inputs unchanged", () => {
        const out = normalizeToMxfile(TWO_PAGE_MXFILE)
        expect(out).toBe(TWO_PAGE_MXFILE)
    })

    it("returns null for neither shape", () => {
        expect(normalizeToMxfile("<random/>")).toBeNull()
        expect(normalizeToMxfile("")).toBeNull()
    })

    it("generated page ids look reasonable", () => {
        for (let i = 0; i < 50; i++) {
            const id = generatePageId()
            expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/)
        }
    })

    it("strips a leading <?xml ?> declaration when wrapping a bare model", () => {
        // Regression for the bug Copilot caught: isMxGraphModel tolerates a
        // declaration prefix, but the wrapper used to embed it inside
        // <diagram>, producing invalid XML (<?xml ?> is only valid at the
        // document start). The result must round-trip through parseMxfile
        // and the declaration must be gone from inside <diagram>.
        const withDecl = `<?xml version="1.0" encoding="UTF-8"?>${BARE_MODEL_ONE_CELL}`
        const out = normalizeToMxfile(withDecl, {
            pageId: "p1",
            pageName: "Page-1",
        })
        expect(out).not.toBeNull()
        expect(out).toMatch(/^<mxfile/)
        // No <?xml inside the body of the wrapped document.
        expect(out!.indexOf("<?xml")).toBe(-1)
        // And it must still parse cleanly.
        const doc = parseMxfile(out!)
        expect(doc).not.toBeNull()
        expect(listPagesFromDoc(doc!)).toHaveLength(1)
    })
})

describe("pages.ts — addPageToDoc input validation", () => {
    it("rejects opts.xml shaped as a full <mxfile>", () => {
        // Regression for the Copilot-flagged bug: an mxfile passed as
        // starting page xml would end up nested inside <diagram>, corrupting
        // the document. Must throw with a clear message.
        const doc = parseMxfile(TWO_PAGE_MXFILE)!
        expect(() =>
            addPageToDoc(doc, { name: "Bad", xml: TWO_PAGE_MXFILE }),
        ).toThrowError(/bare <mxGraphModel>/i)
    })

    it("rejects opts.xml that is neither mxGraphModel nor mxfile", () => {
        const doc = parseMxfile(TWO_PAGE_MXFILE)!
        expect(() =>
            addPageToDoc(doc, { name: "Junk", xml: "<root><x/></root>" }),
        ).toThrowError(/bare <mxGraphModel>/i)
    })

    it("strips a <?xml ?> declaration prefix on opts.xml", () => {
        const doc = parseMxfile(TWO_PAGE_MXFILE)!
        const withDecl = `<?xml version="1.0"?>${BARE_MODEL_ONE_CELL}`
        const info = addPageToDoc(doc, { name: "Sequence", xml: withDecl })
        expect(info.cellCount).toBeGreaterThanOrEqual(3)
        // Serialised document must not have <?xml ?> inside <diagram>.
        const out = serializeMxfile(doc)
        // The mxfile may have one <?xml ?> at the very start (the doc decl),
        // but no further occurrence inside <diagram>.
        const matches = out.match(/<\?xml/g) || []
        expect(matches.length).toBeLessThanOrEqual(1)
    })
})

describe("pages.ts — listPagesFromDoc / findPageElement", () => {
    it("lists both pages in a two-page mxfile", () => {
        const doc = parseMxfile(TWO_PAGE_MXFILE)!
        const pages = listPagesFromDoc(doc)
        expect(pages).toHaveLength(2)
        expect(pages[0]).toMatchObject({
            id: "page-transformer",
            name: "Transformer",
            index: 0,
        })
        expect(pages[1]).toMatchObject({
            id: "page-cnn",
            name: "CNN",
            index: 1,
        })
        // Cell count is per-page (3 cells per page including the two root sentinels).
        expect(pages[0].cellCount).toBe(3)
        expect(pages[1].cellCount).toBe(3)
    })

    it("findPageElement defaults to the first page when selector is empty", () => {
        const doc = parseMxfile(TWO_PAGE_MXFILE)!
        const found = findPageElement(doc)
        expect(found?.index).toBe(0)
        expect(found?.element.getAttribute("id")).toBe("page-transformer")
    })

    it("findPageElement matches by id, name, and index — id wins when several are set", () => {
        const doc = parseMxfile(TWO_PAGE_MXFILE)!
        expect(findPageElement(doc, { page_id: "page-cnn" })?.index).toBe(1)
        expect(findPageElement(doc, { page_name: "CNN" })?.index).toBe(1)
        expect(findPageElement(doc, { page_index: 1 })?.index).toBe(1)
        // id beats name beats index
        const winner = findPageElement(doc, {
            page_id: "page-cnn",
            page_name: "Transformer",
            page_index: 0,
        })
        expect(winner?.index).toBe(1)
    })

    it("findPageElement returns null for an unknown selector", () => {
        const doc = parseMxfile(TWO_PAGE_MXFILE)!
        expect(findPageElement(doc, { page_id: "ghost" })).toBeNull()
        expect(findPageElement(doc, { page_name: "ghost" })).toBeNull()
        expect(findPageElement(doc, { page_index: 99 })).toBeNull()
        expect(findPageElement(doc, { page_index: -1 })).toBeNull()
    })

    it("hasPageSelector correctly detects empty vs populated selectors", () => {
        expect(hasPageSelector()).toBe(false)
        expect(hasPageSelector({})).toBe(false)
        expect(hasPageSelector({ page_id: "x" })).toBe(true)
        expect(hasPageSelector({ page_index: 0 })).toBe(true)
    })
})

describe("pages.ts — addPageToDoc", () => {
    it("appends a third page and returns its info", () => {
        const doc = parseMxfile(TWO_PAGE_MXFILE)!
        const info = addPageToDoc(doc, { name: "Sequence" })
        expect(info.name).toBe("Sequence")
        expect(info.index).toBe(2)
        expect(info.id).toMatch(/.+/)
        const pages = listPagesFromDoc(doc)
        expect(pages).toHaveLength(3)
        expect(pages[2].name).toBe("Sequence")
    })

    it("rejects a duplicate explicit id", () => {
        const doc = parseMxfile(TWO_PAGE_MXFILE)!
        expect(() =>
            addPageToDoc(doc, { id: "page-transformer", name: "X" }),
        ).toThrowError(/already exists/)
    })

    it("uses a sensible default name when none is supplied", () => {
        const doc = parseMxfile(TWO_PAGE_MXFILE)!
        const info = addPageToDoc(doc, {})
        expect(info.name).toBe("Page-3")
    })

    it("accepts an inline starting mxGraphModel", () => {
        const doc = parseMxfile(TWO_PAGE_MXFILE)!
        const inner = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" vertex="1" parent="1" value="A"><mxGeometry x="10" y="10" width="20" height="20" as="geometry"/></mxCell></root></mxGraphModel>`
        const info = addPageToDoc(doc, { name: "Custom", xml: inner })
        expect(info.cellCount).toBeGreaterThanOrEqual(3)
    })
})

describe("pages.ts — renamePageInDoc / deletePageFromDoc", () => {
    it("renames an existing page by name", () => {
        const doc = parseMxfile(TWO_PAGE_MXFILE)!
        const ok = renamePageInDoc(doc, { page_name: "CNN" }, "CNN-v2")
        expect(ok).toBe(true)
        const pages = listPagesFromDoc(doc)
        expect(pages[1].name).toBe("CNN-v2")
    })

    it("rename returns false when target page is missing", () => {
        const doc = parseMxfile(TWO_PAGE_MXFILE)!
        expect(renamePageInDoc(doc, { page_id: "ghost" }, "Z")).toBe(false)
    })

    it("deletes a page and removes the <diagram> element from the doc", () => {
        const doc = parseMxfile(TWO_PAGE_MXFILE)!
        const outcome = deletePageFromDoc(doc, { page_id: "page-cnn" })
        expect(outcome.ok).toBe(true)
        expect(outcome.deletedId).toBe("page-cnn")
        expect(listPagesFromDoc(doc)).toHaveLength(1)
    })

    it("refuses to delete the only remaining page", () => {
        // Build a single-page doc to test the guard.
        const single = normalizeToMxfile(BARE_MODEL_ONE_CELL)!
        const doc = parseMxfile(single)!
        const outcome = deletePageFromDoc(doc, { page_index: 0 })
        expect(outcome.ok).toBe(false)
        expect(outcome.reason).toMatch(/only remaining page/)
    })
})

describe("xml-validation.ts — multi-page support", () => {
    it("accepts a valid two-page mxfile (the exact payload that used to fail)", () => {
        const result = validateAndFixXml(TWO_PAGE_MXFILE)
        expect(result.valid).toBe(true)
        expect(result.error).toBeNull()
    })

    it("does NOT flag root sentinel ids 0 and 1 repeating across pages", () => {
        // This is the regression the planning doc explicitly called out:
        // before this work, the legacy regex-based duplicate-id check rejected
        // any multi-page document because cells "0" and "1" appear in every page.
        const result = validateAndFixXml(TWO_PAGE_MXFILE)
        expect(result.valid).toBe(true)
    })

    it("rejects duplicate cell ids WITHIN a single page", () => {
        const bad = `<mxfile host="app.diagrams.net"><diagram id="p1" name="P1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="dup" vertex="1" parent="1"/><mxCell id="dup" vertex="1" parent="1"/></root></mxGraphModel></diagram></mxfile>`
        const result = validateAndFixXml(bad)
        expect(result.valid).toBe(false)
        expect(result.error).toMatch(/duplicate cell ID/i)
    })

    it("rejects duplicate <diagram> ids across the file", () => {
        const bad = `<mxfile host="app.diagrams.net"><diagram id="p1" name="A"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram><diagram id="p1" name="B"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
        const result = validateAndFixXml(bad)
        expect(result.valid).toBe(false)
        expect(result.error).toMatch(/duplicate <diagram> id/i)
    })

    it("still validates a bare <mxGraphModel> (legacy callers)", () => {
        const result = validateAndFixXml(BARE_MODEL_ONE_CELL)
        expect(result.valid).toBe(true)
    })

    it("auto-fix does NOT rename mxfile root cells 0/1 (would break drawio refs)", () => {
        // Build a doc that triggers some other auto-fix (so autoFixXml runs)
        // but contains valid multi-page 0/1 cells that must NOT be renamed.
        const malformedButMultiPage = `<mxfile host="app.diagrams.net"><diagram id="p1" name="A"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" vertex="1" parent="1" value="Q & A"><mxGeometry x="0" y="0" width="10" height="10" as="geometry"/></mxCell></root></mxGraphModel></diagram><diagram id="p2" name="B"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
        const result = validateAndFixXml(malformedButMultiPage)
        // The doc has an unescaped & — autoFix will repair that. After repair
        // it should be valid AND must not have renamed the 0/1 cells.
        const finalXml = result.fixed || malformedButMultiPage
        expect(finalXml).not.toMatch(/id="0_dup/)
        expect(finalXml).not.toMatch(/id="1_dup/)
    })
})

describe("diagram-operations.ts — page-targeted edits (AC3)", () => {
    it("adds a cell to the targeted page by id, leaving the other page untouched", () => {
        const { result, errors } = applyDiagramOperations(
            TWO_PAGE_MXFILE,
            [
                {
                    operation: "add",
                    cell_id: "conv-2",
                    new_xml: `<mxCell id="conv-2" vertex="1" parent="1" value="Conv2"><mxGeometry x="200" y="40" width="120" height="60" as="geometry"/></mxCell>`,
                },
            ],
            { page_id: "page-cnn" },
        )
        expect(errors).toHaveLength(0)
        const doc = parseMxfile(result)!
        const pages = listPagesFromDoc(doc)
        // Transformer untouched (still 3 cells), CNN gained one cell.
        expect(pages[0].cellCount).toBe(3)
        expect(pages[1].cellCount).toBe(4)
        expect(result).toContain(`id="conv-2"`)
    })

    it("defaults to the first page when no selector is given", () => {
        const { result, errors } = applyDiagramOperations(TWO_PAGE_MXFILE, [
            {
                operation: "add",
                cell_id: "shape-x",
                new_xml: `<mxCell id="shape-x" vertex="1" parent="1"><mxGeometry x="0" y="0" width="10" height="10" as="geometry"/></mxCell>`,
            },
        ])
        expect(errors).toHaveLength(0)
        const doc = parseMxfile(result)!
        const pages = listPagesFromDoc(doc)
        expect(pages[0].cellCount).toBe(4) // Transformer (first page) grew
        expect(pages[1].cellCount).toBe(3) // CNN untouched
    })

    it("errors clearly when the page is not found", () => {
        const { errors } = applyDiagramOperations(
            TWO_PAGE_MXFILE,
            [
                {
                    operation: "delete",
                    cell_id: "2",
                },
            ],
            { page_id: "does-not-exist" },
        )
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toMatch(/Page.*not found/i)
        // Page-level errors carry an empty cellId — edit_diagram relies on
        // this to distinguish "nothing applied" from per-cell warnings and
        // return a hard error instead of a false success.
        expect(errors[0].cellId).toBe("")
    })

    it("delete on page 2 does NOT touch page 1's mxCell with the same id", () => {
        // Both pages have a cell with id="2". A delete on CNN's "2" must not
        // remove Transformer's "2".
        const { result, errors } = applyDiagramOperations(
            TWO_PAGE_MXFILE,
            [{ operation: "delete", cell_id: "2" }],
            { page_id: "page-cnn" },
        )
        expect(errors).toHaveLength(0)
        const doc = parseMxfile(result)!
        const pages = listPagesFromDoc(doc)
        // CNN lost its only non-sentinel cell, Transformer keeps its three.
        expect(pages[1].cellCount).toBe(2)
        expect(pages[0].cellCount).toBe(3)
    })

    it("legacy bare-mxGraphModel input still works when no selector is given", () => {
        const { result, errors } = applyDiagramOperations(BARE_MODEL_ONE_CELL, [
            {
                operation: "add",
                cell_id: "new",
                new_xml: `<mxCell id="new" vertex="1" parent="1"><mxGeometry x="100" y="100" width="50" height="50" as="geometry"/></mxCell>`,
            },
        ])
        expect(errors).toHaveLength(0)
        expect(result).toContain(`id="new"`)
    })

    it("page selector on a bare mxGraphModel returns a clear error", () => {
        const { errors } = applyDiagramOperations(
            BARE_MODEL_ONE_CELL,
            [{ operation: "delete", cell_id: "2" }],
            { page_id: "page-1" },
        )
        expect(errors).toHaveLength(1)
        expect(errors[0].message).toMatch(/not multi-page/i)
    })
})

describe("export_diagram — single-page projection (regression for selectPage bug)", () => {
    // The previous implementation tried to drive drawio's iframe with an
    // `action: 'selectPage'` postMessage, which the embed protocol silently
    // ignores. The result was that PNG/SVG exports targeted the currently
    // active tab regardless of the page selector — two visually different
    // pages would yield byte-identical PNGs.
    //
    // The current implementation builds a single-page <mxfile> projection via
    // the shared pages.ts:projectPage helper and hands it to the browser
    // bridge to load BEFORE triggering export. These tests pin that helper so
    // a future refactor can't silently re-introduce the multi-page drift.
    function projectSinglePage(fullMxfile: string, sel: any): string {
        const result = projectPage(fullMxfile, sel)
        if (!result.ok) throw new Error(`projection failed: ${result.reason}`)
        return result.xml
    }

    it("returns a parse error for a non-mxfile source", () => {
        const result = projectPage(BARE_MODEL_ONE_CELL, { page_id: "x" })
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.reason).toBe("parse")
    })

    it("returns a notfound error for an unknown page", () => {
        const result = projectPage(TWO_PAGE_MXFILE, { page_id: "ghost" })
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.reason).toBe("notfound")
    })

    it("projects only the requested page when targeted by id", () => {
        const projected = projectSinglePage(TWO_PAGE_MXFILE, {
            page_id: "page-cnn",
        })
        const pages = listPagesFromDoc(parseMxfile(projected)!)
        expect(pages).toHaveLength(1)
        expect(pages[0].id).toBe("page-cnn")
        expect(pages[0].name).toBe("CNN")
        // The projection must NOT contain the Transformer page anywhere.
        expect(projected).not.toContain('id="page-transformer"')
        expect(projected).not.toContain('name="Transformer"')
    })

    it("projects only the requested page when targeted by name", () => {
        const projected = projectSinglePage(TWO_PAGE_MXFILE, {
            page_name: "Transformer",
        })
        const pages = listPagesFromDoc(parseMxfile(projected)!)
        expect(pages).toHaveLength(1)
        expect(pages[0].name).toBe("Transformer")
        expect(projected).not.toContain('id="page-cnn"')
    })

    it("projects only the requested page when targeted by index", () => {
        const projected = projectSinglePage(TWO_PAGE_MXFILE, {
            page_index: 1,
        })
        const pages = listPagesFromDoc(parseMxfile(projected)!)
        expect(pages).toHaveLength(1)
        expect(pages[0].index).toBe(0) // re-indexed: it's the only page in the projection
        expect(pages[0].id).toBe("page-cnn")
    })

    it("two different page selectors produce visually distinct projections", () => {
        // The regression: under the old selectPage bug, two exports would
        // return the same active tab. With the projection approach, the
        // payload that drawio renders is provably different.
        const a = projectSinglePage(TWO_PAGE_MXFILE, {
            page_id: "page-transformer",
        })
        const b = projectSinglePage(TWO_PAGE_MXFILE, { page_id: "page-cnn" })
        expect(a).not.toBe(b)
        expect(a).toContain('"Encoder"')
        expect(a).not.toContain('"Conv1"')
        expect(b).toContain('"Conv1"')
        expect(b).not.toContain('"Encoder"')
    })

    it("the projection parses to a valid one-page mxfile", () => {
        const projected = projectSinglePage(TWO_PAGE_MXFILE, {
            page_id: "page-cnn",
        })
        // Validator accepts it.
        expect(validateAndFixXml(projected).valid).toBe(true)
        // And it has a real <root> with the cells from the source page.
        const doc = parseMxfile(projected)!
        const root = doc.querySelector("root")
        expect(root).not.toBeNull()
        const conv1 = doc.querySelector('mxCell[value="Conv1"]')
        expect(conv1).not.toBeNull()
    })
})

describe("end-to-end — Transformer + CNN scenario (AC6)", () => {
    it("two tool-equivalent steps reproduce the motivating user scenario", () => {
        // Step 1 — caller passes a single-page mxfile.
        const step1 = normalizeToMxfile(BARE_MODEL_ONE_CELL, {
            pageId: "page-transformer",
            pageName: "Transformer",
        })
        expect(step1).not.toBeNull()
        let xml = step1 as string
        const validate1 = validateAndFixXml(xml)
        expect(validate1.valid).toBe(true)

        // Step 2 — equivalent of add_page("CNN") with a starting model.
        const doc = parseMxfile(xml)!
        addPageToDoc(doc, {
            id: "page-cnn",
            name: "CNN",
            xml: `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" vertex="1" parent="1" value="Conv1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel>`,
        })
        xml = serializeMxfile(doc)

        // Now: two pages, both valid, with the right names.
        const pages = listPagesFromDoc(parseMxfile(xml)!)
        expect(pages.map((p) => p.name)).toEqual(["Transformer", "CNN"])
        expect(validateAndFixXml(xml).valid).toBe(true)
    })
})
