import { beforeEach, describe, expect, it } from "vitest"
import { formatSelectionContext } from "@/lib/chat-helpers"
import { EMPTY_SUMMARY } from "@/lib/diagram-diff"
import { withPageDefaults } from "@/lib/drawio/drawio-config"
import enDict from "@/lib/i18n/dictionaries/en.json"
import jaDict from "@/lib/i18n/dictionaries/ja.json"
import zhDict from "@/lib/i18n/dictionaries/zh.json"
import zhHantDict from "@/lib/i18n/dictionaries/zh-Hant.json"
import { describeChanges, describeTotals } from "@/lib/version-text"
import {
    MAX_VERSIONS,
    useVersionsStore,
    versionsFromLegacyHistory,
} from "@/stores/versions-store"

describe("withPageDefaults", () => {
    it("adds page and grid when the model has none", () => {
        expect(withPageDefaults("<mxGraphModel><root/></mxGraphModel>")).toBe(
            '<mxGraphModel page="1" grid="1" gridSize="10"><root/></mxGraphModel>',
        )
    })

    it("keeps values the diagram already sets", () => {
        const xml = '<mxGraphModel dx="10" page="0" grid="0" gridSize="5">'
        expect(withPageDefaults(xml)).toBe(xml)
    })

    it("reads attributes written with spaces around =", () => {
        const xml = '<mxGraphModel page = "0" grid ="0" gridSize= "5">'
        expect(withPageDefaults(xml)).toBe(xml)
    })

    it("handles self-closing models and several pages", () => {
        const xml =
            '<mxfile><diagram><mxGraphModel/></diagram><diagram><mxGraphModel page="0"></mxGraphModel></diagram></mxfile>'
        expect(withPageDefaults(xml)).toBe(
            '<mxfile><diagram><mxGraphModel page="1" grid="1" gridSize="10"/></diagram><diagram><mxGraphModel page="0" grid="1" gridSize="10"></mxGraphModel></diagram></mxfile>',
        )
    })
})

describe("describeChanges", () => {
    const en = {
        shapesAddedOne: "added 1 shape",
        shapesAddedOther: "added {count} shapes",
        edgesChangedOne: "changed 1 connector",
        edgesChangedOther: "changed {count} connectors",
        noChanges: "No visible changes",
        listSeparator: ", ",
    }

    it("uses singular and plural forms and sentence case", () => {
        expect(
            describeChanges(
                { ...EMPTY_SUMMARY, shapesAdded: 2, edgesChanged: 1 },
                en,
            ),
        ).toBe("Added 2 shapes, changed 1 connector")
    })

    it("says so when nothing changed", () => {
        expect(describeChanges({ ...EMPTY_SUMMARY }, en)).toBe(
            "No visible changes",
        )
    })

    it("uses the language's list separator", () => {
        const zh = {
            shapesAddedOther: "新增 {count} 个图形",
            edgesChangedOne: "改了 1 条连线",
            listSeparator: "，",
        }
        expect(
            describeChanges(
                { ...EMPTY_SUMMARY, shapesAdded: 3, edgesChanged: 1 },
                zh,
            ),
        ).toBe("新增 3 个图形，改了 1 条连线")
    })
})

describe("formatSelectionContext", () => {
    it("lists selected ids with their labels", () => {
        const text = formatSelectionContext([
            { id: "4", label: "EC2" },
            { id: "cf", label: "" },
        ])
        expect(text).toContain('- id="4" (EC2)')
        expect(text).toContain('- id="cf"')
        expect(text).not.toContain('id="cf" (')
    })

    it("returns nothing for missing or malformed input", () => {
        expect(formatSelectionContext(undefined)).toBe("")
        expect(formatSelectionContext("4")).toBe("")
        expect(formatSelectionContext([{ label: "no id" }])).toBe("")
    })

    it("strips quotes and newlines and limits length and count", () => {
        const many = Array.from({ length: 80 }, (_, i) => ({
            id: `c${i}`,
            label: `line\n"quoted"${"x".repeat(200)}`,
        }))
        const text = formatSelectionContext(many)
        const lines = text.split("\n").filter((l) => l.startsWith("- id="))
        expect(lines).toHaveLength(50)
        // The model is told the list is cut short
        expect(text).toContain("- and 30 more selected shapes not listed")
        expect(text).not.toContain('"quoted"')
        expect(lines[0].length).toBeLessThan(130)
    })
})

describe("describeTotals", () => {
    it("uses singular and plural forms from the dictionaries", () => {
        const dicts = [enDict, zhDict, jaDict, zhHantDict].map(
            (d) => d.versions as Record<string, string>,
        )
        const one = { ...EMPTY_SUMMARY, shapesAdded: 1, edgesAdded: 0 }
        const many = { ...EMPTY_SUMMARY, shapesAdded: 3, edgesAdded: 1 }
        expect(dicts.map((t) => describeTotals(one, t))).toEqual([
            "1 shape, 0 connectors",
            "共 1 个图形、0 条连线",
            "図形 1 個、コネクタ 0 本",
            "共 1 個圖形、0 條連線",
        ])
        expect(describeTotals(many, dicts[0])).toBe("3 shapes, 1 connector")
    })
})

describe("versions store", () => {
    beforeEach(() => useVersionsStore.getState().clear())

    const add = (n: number) =>
        useVersionsStore.getState().addVersion({
            xml: `<x n="${n}"/>`,
            beforeXml: `<before n="${n}"/>`,
            turnIndex: n,
            summary: { ...EMPTY_SUMMARY },
        })

    it("keeps the before-XML only on the newest version", () => {
        add(0)
        add(2)
        const [first, second] = useVersionsStore.getState().versions
        expect(first.beforeXml).toBeUndefined()
        expect(second.beforeXml).toBe('<before n="2"/>')
    })

    it("keeps at most MAX_VERSIONS versions, each with its number", () => {
        for (let i = 0; i < MAX_VERSIONS + 5; i++) add(i)
        const { versions } = useVersionsStore.getState()
        expect(versions).toHaveLength(MAX_VERSIONS)
        expect(versions[0].turnIndex).toBe(5)
        // v6 stays v6 when v1 to v5 are dropped
        expect(versions[0].number).toBe(6)
        expect(versions.at(-1)?.number).toBe(MAX_VERSIONS + 5)
    })

    it("numbers on from the last version kept, and numbers saved ones", () => {
        add(0)
        add(2)
        add(4)
        useVersionsStore.getState().removeFromTurn(4)
        add(4)
        expect(
            useVersionsStore.getState().versions.map((v) => v.number),
        ).toEqual([1, 2, 3])
        const { versions } = useVersionsStore.getState()
        // Saved before versions had numbers
        useVersionsStore
            .getState()
            .setVersions(versions.map(({ number, ...v }) => v as any))
        expect(
            useVersionsStore.getState().versions.map((v) => v.number),
        ).toEqual([1, 2, 3])
    })

    it("drops versions from a turn that is re-run, none left on the canvas", () => {
        add(0)
        add(2)
        add(4)
        useVersionsStore.getState().removeFromTurn(2)
        const state = useVersionsStore.getState()
        expect(state.versions.map((v) => v.turnIndex)).toEqual([0])
        expect(state.onCanvasVersionId).toBeNull()
    })

    it("hand edits clear both version flags", () => {
        const id = add(0)
        expect(useVersionsStore.getState().onCanvasVersionId).toBe(id)
        useVersionsStore.getState().clearCanvasFlags()
        let state = useVersionsStore.getState()
        expect(state.onCanvasVersionId).toBeNull()
        expect(state.versions[0].onCanvas).toBeUndefined()
        useVersionsStore.getState().setUndone(id)
        useVersionsStore.getState().clearCanvasFlags()
        state = useVersionsStore.getState()
        expect(state.undoneVersionId).toBeNull()
        expect(state.versions[0].undone).toBeUndefined()
    })

    it("converts the old history list", () => {
        const versions = versionsFromLegacyHistory([
            { svg: "data:image/svg+xml;base64,AA", xml: "<a/>" },
        ])
        expect(versions).toHaveLength(1)
        expect(versions[0]).toMatchObject({ xml: "<a/>", turnIndex: -1 })
        expect(versionsFromLegacyHistory(undefined)).toEqual([])
    })
})
