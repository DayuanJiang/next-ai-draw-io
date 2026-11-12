import { act, cleanup, render, renderHook } from "@testing-library/react"
import type React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { VersionsProvider } from "@/components/canvas/versions-context"
import { DictionaryProvider } from "@/hooks/use-dictionary"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import en from "@/lib/i18n/dictionaries/en.json"
import type {
    HistoryEntryInfo,
    HistoryList,
    McpSync,
} from "@/packages/mcp-server/shell/mcp-sync-core"
import {
    buildVersions,
    newVersionCache as cache,
    useNodeVersions,
} from "@/packages/mcp-server/shell/node-versions-source"
import {
    VersionsPanel,
    versionLabel,
} from "@/packages/mcp-server/shell/versions-panel"
import { useCanvasStore } from "@/stores/canvas-store"

// The shell's version cards come from the MCP server's History (GET
// /api/history), read through the sync; restores go back through it

afterEach(cleanup)

const toasts = vi.hoisted(() => ({ success: vi.fn() }))
vi.mock("sonner", () => ({ toast: toasts }))

const cell = (id: string, label: string) =>
    `<mxCell id="${id}" value="${label}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>`
const doc = (cells: string, pageId = "p1") =>
    `<mxfile><diagram id="${pageId}" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`
const A = doc(cell("a", "A"))
const AB = doc(cell("a", "A") + cell("b", "B"))
const ABC = doc(cell("a", "A") + cell("b", "B") + cell("c", "C"))

function entry(
    id: number,
    xml: string,
    extra: Partial<HistoryEntryInfo> = {},
): HistoryEntryInfo {
    return {
        id,
        index: id,
        svg: "",
        xml,
        source: null,
        firstId: id,
        ...extra,
    }
}

const list = (
    entries: HistoryEntryInfo[],
    currentId: number | null,
): HistoryList => ({ entries, stateId: "S1", currentId })

describe("buildVersions", () => {
    it("makes one numbered version per History entry, with what changed since the one before", () => {
        const { versions, onCanvasId } = buildVersions(
            list([entry(0, A), entry(1, AB, { svg: "data:AB" })], 1),
            cache(),
        )
        expect(versions.map((v) => [v.id, v.number])).toEqual([
            ["0", 1],
            ["1", 2],
        ])
        expect(versions[0].fromScratch).toBe(true)
        expect(versions[0].summary.shapesAdded).toBe(1)
        expect(versions[1].fromScratch).toBe(false)
        expect(versions[1].summary.shapesAdded).toBe(1)
        expect(versions[1].pageId).toBe("p1")
        expect(versions[1].beforeXml).toBe(A)
        expect(versions[1].svg).toBe("data:AB")
        expect(onCanvasId).toBe("1")
    })

    it("leaves the blank page out, and counts the first drawing from it", () => {
        // The server keeps the blank page the tab showed when the first
        // write replaces it; a page the user named is a version
        const blank = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
        const named = blank.replace('name="Page-1"', 'name="Plan"')
        const { versions, onCanvasId } = buildVersions(
            list([entry(0, blank), entry(1, A), entry(2, named)], 2),
            cache(),
        )
        expect(versions.map((v) => [v.id, v.number])).toEqual([
            ["1", 1],
            ["2", 2],
        ])
        expect(versions[0].fromScratch).toBe(true)
        expect(onCanvasId).toBe("2")
        // Blank on the canvas: no version is
        expect(buildVersions(list([entry(0, blank)], 0), cache())).toEqual({
            versions: [],
            onCanvasId: "0",
        })
    })

    it("folds a restore's copy into the version it copies, where that one is", () => {
        // History: A, AB, A again (restored); the canvas shows A
        const { versions, onCanvasId } = buildVersions(
            list(
                [
                    entry(0, A),
                    entry(1, AB),
                    entry(2, A, {
                        firstId: 0,
                        svg: "data:A",
                        source: "restore",
                    }),
                ],
                2,
            ),
            cache(),
        )
        expect(versions.map((v) => v.id)).toEqual(["0", "1"])
        // The copy's picture stands in for the first copy's missing one
        expect(versions[0].svg).toBe("data:A")
        expect(onCanvasId).toBe("0")
    })

    it("keeps the numbers once given, and gives new versions the next", () => {
        const kept = cache()
        buildVersions(list([entry(0, A), entry(1, AB)], 1), kept)
        // The oldest entry dropped out of the server's buffer
        const { versions } = buildVersions(
            list([entry(1, AB), entry(2, ABC)], 2),
            kept,
        )
        expect(versions.map((v) => v.number)).toEqual([2, 3])
    })

    it("keeps in its cache only the content the list still has, and never hands out a number twice", () => {
        // 25 writes, the server's buffer holding the last 20: what dropped
        // out (its full documents) goes, the numbering runs on
        const kept = cache()
        const docs = Array.from({ length: 25 }, (_, i) =>
            doc(
                Array.from({ length: i + 1 }, (_, j) =>
                    cell(`c${j}`, `C${j}`),
                ).join(""),
            ),
        )
        const entries = docs.map((xml, i) => entry(i, xml))
        let versions: ReturnType<typeof buildVersions>["versions"] = []
        for (let n = 1; n <= 25; n++) {
            const window = entries.slice(Math.max(0, n - 20), n)
            versions = buildVersions(list(window, n - 1), kept).versions
        }
        expect(versions).toHaveLength(20)
        expect(versions.at(-1)?.number).toBe(25)
        expect(kept.numbers.size).toBe(20)
        expect(kept.changes.size).toBe(20)
        // Only the ones before the drawing restored: a restore of the
        // newest content gives it no new number
        const back = buildVersions(
            list(
                [
                    ...entries.slice(6),
                    entry(25, docs[24], { firstId: 24, source: "restore" }),
                ],
                25,
            ),
            kept,
        ).versions
        expect(back.map((v) => v.number)).not.toContain(26)
        const AD = doc(cell("a", "A") + cell("d", "D"))
        const next = buildVersions(
            list([...entries.slice(7), entry(26, AD)], 26),
            kept,
        ).versions
        expect(next.at(-1)?.number).toBe(26)
    })

    it("keeps showing a clear once the drawing before it dropped out of the server's buffer", () => {
        const blank = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
        const kept = cache()
        const later = Array.from({ length: 19 }, (_, i) =>
            entry(
                i + 3,
                doc(
                    Array.from({ length: i + 1 }, (_, j) =>
                        cell(`c${j}`, `C${j}`),
                    ).join(""),
                ),
            ),
        )
        // The blank page, A, the user cleared the canvas, 19 writes
        const first = buildVersions(
            list(
                [
                    entry(0, blank),
                    entry(1, A),
                    entry(2, blank, { firstId: 0, source: "user" }),
                    ...later.slice(0, 17),
                ],
                19,
            ),
            kept,
        )
        expect(first.versions[1]).toMatchObject({ id: "2", number: 2 })
        // The buffer moved on: the clear is now the oldest entry, and a
        // restore of it after that folds into it
        const scrolled = buildVersions(
            list(
                [
                    entry(2, blank, { firstId: 2, source: "user" }),
                    ...later,
                    entry(22, blank, { firstId: 2, source: "restore" }),
                ],
                22,
            ),
            kept,
        )
        expect(scrolled.versions[0]).toMatchObject({ id: "2", number: 2 })
        expect(scrolled.versions[1].beforeId).toBe("2")
        expect(scrolled.onCanvasId).toBe("2")
        // A tab opened now never showed it: the blank is the one it starts with
        const fresh = buildVersions(
            list([entry(2, blank, { firstId: 2 }), ...later], 21),
            cache(),
        )
        expect(fresh.versions[0].id).toBe("3")
    })

    it("counts a write from the state it replaced, not from the card before, after a restore", () => {
        // History: A, AB, ABC, A again (restored), AD: the AI drew D on A
        const AD = doc(cell("a", "A") + cell("d", "D"))
        const { versions } = buildVersions(
            list(
                [
                    entry(0, A),
                    entry(1, AB),
                    entry(2, ABC),
                    entry(3, A, { firstId: 0, source: "restore" }),
                    entry(4, AD),
                ],
                4,
            ),
            cache(),
        )
        expect(versions.map((v) => v.id)).toEqual(["0", "1", "2", "4"])
        const latest = versions[3]
        expect(latest.beforeXml).toBe(A)
        expect(latest.summary.shapesAdded).toBe(1)
        expect(latest.summary.shapesRemoved).toBe(0)
        expect(latest.beforeId).toBe("0")
        // The first drawing replaced nothing a card shows
        expect(versions[0].beforeId).toBeNull()
        expect(versions[1].beforeId).toBe("0")
    })

    it("restores the newest copy of a version: a later copy may carry the user's page settings", () => {
        // The user set a background on A (kept as a "user" entry, the same
        // content to the server), then the AI added B
        const yellow = A.replace(
            "<mxGraphModel>",
            '<mxGraphModel background="#ffcc00">',
        )
        const { versions } = buildVersions(
            list(
                [
                    entry(0, A),
                    entry(1, yellow, { firstId: 0, source: "user" }),
                    entry(2, AB),
                ],
                2,
            ),
            cache(),
        )
        expect(versions).toHaveLength(2)
        expect(versions[0].id).toBe("0")
        expect(versions[0].entryId).toBe(1)
        expect(versions[0].xml).toBe(yellow)
        expect(versions[0].source).toBeNull()
    })

    it("pictures a version as its newest copy looks", () => {
        // The thumbnail shows the background: the yellow copy's picture
        // goes with the yellow document the card restores, not the white
        // one's, and no picture at all when the yellow copy has none
        const yellow = A.replace(
            "<mxGraphModel>",
            '<mxGraphModel background="#ffcc00">',
        )
        const pictured = buildVersions(
            list(
                [
                    entry(0, A, { svg: "data:white" }),
                    entry(1, yellow, {
                        firstId: 0,
                        source: "user",
                        svg: "data:yellow",
                    }),
                    entry(2, AB, { svg: "data:AB" }),
                ],
                2,
            ),
            cache(),
        )
        expect(pictured.versions[0].svg).toBe("data:yellow")
        const unpictured = buildVersions(
            list(
                [
                    entry(0, A, { svg: "data:white" }),
                    entry(1, yellow, { firstId: 0, source: "user" }),
                    entry(2, AB, { svg: "data:AB" }),
                ],
                2,
            ),
            cache(),
        )
        expect(unpictured.versions[0].svg).toBe("")
    })

    it("shows a clear of the canvas as a version, hiding only the blank page before any drawing", () => {
        const blank = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
        // The server folds the cleared page into the first blank (same
        // content); then AB is restored
        const entries = [
            entry(0, blank),
            entry(1, A),
            entry(2, AB),
            entry(3, blank, { firstId: 0 }),
            entry(4, AB, { firstId: 2, source: "restore" }),
        ]
        const cleared = buildVersions(list(entries.slice(0, 4), 3), cache())
        expect(cleared.versions.map((v) => v.id)).toEqual(["1", "2", "3"])
        expect(cleared.onCanvasId).toBe("3")
        expect(cleared.versions[2].beforeId).toBe("2")
        expect(cleared.versions[2].summary.shapesRemoved).toBe(2)
        const back = buildVersions(list(entries, 4), cache())
        expect(back.versions.map((v) => v.id)).toEqual(["1", "2", "3"])
        expect(back.onCanvasId).toBe("2")
        // A second clear is a version of its own; a restore of a clear is
        // a copy of the newest one
        const twice = buildVersions(
            list(
                [
                    ...entries,
                    entry(5, blank, { firstId: 0 }),
                    entry(6, blank, { firstId: 0, source: "restore" }),
                ],
                6,
            ),
            cache(),
        )
        expect(twice.versions.map((v) => [v.id, v.number])).toEqual([
            ["1", 1],
            ["2", 2],
            ["3", 3],
            ["5", 4],
        ])
        expect(twice.onCanvasId).toBe("5")
    })

    it("keeps a version's number and change when its first copy drops out of the server's buffer", () => {
        const kept = cache()
        const docs = Array.from({ length: 20 }, (_, i) =>
            doc(
                Array.from({ length: i + 1 }, (_, j) =>
                    cell(`c${j}`, `C${j}`),
                ).join(""),
            ),
        )
        const full = docs.map((xml, i) => entry(i, xml))
        buildVersions(list(full, 19), kept)
        // v1 restored: its copy is added and the original, the oldest
        // entry, drops out; the copy is now the first with that content
        const after = [
            ...full.slice(1),
            entry(20, docs[0], { firstId: 20, source: "restore" }),
        ]
        const { versions, onCanvasId } = buildVersions(list(after, 20), kept)
        const v1 = versions.find((v) => v.id === "20")
        expect(v1?.number).toBe(1)
        expect(v1?.fromScratch).toBe(true)
        expect(v1?.summary.shapesAdded).toBe(1)
        expect(v1?.beforeXml).toBe("")
        expect(versions.map((v) => v.number)).not.toContain(21)
        expect(onCanvasId).toBe("20")
    })

    it("lets the newest version on the canvas wait for its picture, older ones show none", () => {
        const { versions } = buildVersions(
            list([entry(0, A), entry(1, AB)], 1),
            cache(),
        )
        expect(versions[0].svg).toBe("")
        expect(versions[1].svg).toBeUndefined()
        const edited = buildVersions(
            list([entry(0, A), entry(1, AB)], null),
            cache(),
        )
        expect(edited.versions[1].svg).toBe("")
    })

    it("labels a version by who made it and what it did", () => {
        const dict = en as unknown as Dictionary
        const { versions } = buildVersions(
            list(
                [entry(0, A), entry(1, AB, { source: "user" }), entry(2, ABC)],
                2,
            ),
            cache(),
        )
        expect(versions.map((v) => versionLabel(v, dict))).toEqual([
            "Drew the diagram",
            "Changed by hand",
            "Changed the diagram",
        ])
        const opened = buildVersions(
            list(
                [
                    entry(0, A, { source: "load" }),
                    entry(1, AB, { source: "add_page" }),
                ],
                1,
            ),
            cache(),
        )
        expect(opened.versions.map((v) => versionLabel(v, dict))).toEqual([
            "Opened the file",
            "Added a page",
        ])
        // A rename changes no cell: the card says what it was, and names
        // the page that was renamed (here the second one)
        const second = (name: string) =>
            A.replace(
                "</mxfile>",
                `<diagram id="p2" name="${name}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`,
            )
        const renamed = buildVersions(
            list(
                [
                    entry(0, second("Page-2")),
                    entry(1, second("Schema"), { source: "rename_page" }),
                ],
                1,
            ),
            cache(),
        )
        expect(versionLabel(renamed.versions[1], dict)).toBe("Renamed a page")
        expect(renamed.versions[1].pageId).toBe("p2")
    })

    it("keeps the cells each change touched, to outline them again", () => {
        const { versions } = buildVersions(
            list([entry(0, A), entry(1, ABC)], 1),
            cache(),
        )
        expect(versions[1].touchedIds).toEqual(["b", "c"])
    })

    it("counts a hand edit that lost to a write from the entry it was made on", () => {
        // The user renamed A while the AI added B: the server keeps the
        // edit after the AI's write, and names the entry it was made on
        const byHand = doc(cell("a", "A by hand"))
        const { versions } = buildVersions(
            list(
                [
                    entry(0, A),
                    entry(1, AB),
                    entry(2, byHand, { source: "user", basedOn: 0 }),
                ],
                1,
            ),
            cache(),
        )
        // From the AI's write it would be two changes: A renamed, B removed
        expect(versions[2].summary).toMatchObject({
            shapesChanged: 1,
            shapesRemoved: 0,
        })
        expect(versions[2].beforeXml).toBe(A)
        // Undo of the edit, once restored, still goes to the canvas it
        // replaced: the AI's write
        expect(versions[2].beforeId).toBe("1")
    })

    it("counts the pages a version added or removed", () => {
        const pages = (...names: string[]) =>
            `<mxfile>${names.map((name) => `<diagram id="${name}" name="${name}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cell("a", "A")}</root></mxGraphModel></diagram>`).join("")}</mxfile>`
        const { versions } = buildVersions(
            list(
                [
                    entry(0, pages("One")),
                    entry(1, pages("One", "Two", "Three"), { source: "user" }),
                    entry(2, pages("One", "Three")),
                ],
                2,
            ),
            cache(),
        )
        expect(versions.map((v) => v.pagesAdded)).toEqual([0, 2, -1])
    })

    it("counts no shape as drawn or changed when a page is only added or removed", () => {
        const page = (name: string, cells: string) =>
            `<diagram id="${name}" name="${name}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram>`
        const file = (...pages: string[]) =>
            `<mxfile>${pages.join("")}</mxfile>`
        const blank = page("Blank", "")
        const one = page("One", cell("2", "A") + cell("3", "B"))
        const two = page("Two", cell("2", "A") + cell("4", "C"))
        // What the card of the last entry tells, after the entry before it
        const last = (before: string, after: string) => {
            const { versions } = buildVersions(
                list([entry(0, A), entry(1, before), entry(2, after)], 2),
                cache(),
            )
            const { summary, fromScratch, touchedIds, pagesAdded } =
                versions.at(-1) as (typeof versions)[number]
            return {
                cells: Object.values(summary).reduce((a, b) => a + b),
                fromScratch,
                touchedIds,
                pagesAdded,
            }
        }
        const removed = {
            cells: 0,
            fromScratch: false,
            touchedIds: [],
            pagesAdded: -1,
        }
        // The first page deleted: the page left is not compared with it,
        // whether the deleted page was blank or had shapes with the same ids
        expect(last(file(blank, one), file(one))).toEqual(removed)
        expect(last(file(one, two), file(two))).toEqual(removed)
        // A blank first page: the page count is still told
        expect(last(file(blank, one), file(blank))).toEqual(removed)
        expect(last(file(blank), file(blank, page("New", "")))).toEqual({
            ...removed,
            pagesAdded: 1,
        })
    })

    it("pictures a version that changed no shape as the one it was made on, until it has a picture of its own", () => {
        // A page renamed, and replaced by the next write before the tab
        // showed it: the tab took no picture of it
        const renamed = A.replace('name="Page-1"', 'name="Overview"')
        const entries = [
            entry(0, A, { svg: "data:A" }),
            entry(1, renamed, { source: "rename_page" }),
            entry(
                2,
                doc(cell("a", "A") + cell("b", "B")).replace(
                    'name="Page-1"',
                    'name="Overview"',
                ),
            ),
        ]
        const { versions } = buildVersions(list(entries, 2), cache())
        expect(versions[1].svg).toBe("data:A")
        // A version whose shapes changed has no such stand-in
        expect(
            buildVersions(
                list(
                    [
                        entry(0, A, { svg: "data:A" }),
                        entry(1, AB),
                        entry(2, ABC),
                    ],
                    2,
                ),
                cache(),
            ).versions[1].svg,
        ).toBe("")
        entries[1] = { ...entries[1], svg: "data:renamed" }
        expect(buildVersions(list(entries, 2), cache()).versions[1].svg).toBe(
            "data:renamed",
        )
    })
})

/** A stand-in for the sync: History as the server would answer, restores
 * recorded */
function fakeSync(initial: HistoryList) {
    let current = initial
    const listeners = new Set<() => void>()
    const restores: { id: number; stateId: string | null }[] = []
    let restoreResult: "ok" | "stale" | "failed" = "ok"
    const sync = {
        fetchHistory: vi.fn(async () => current),
        restoreEntry: vi.fn(async (id: number, stateId: string | null) => {
            restores.push({ id, stateId })
            return restoreResult
        }),
        onServerChange: (listener: () => void) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
    } as unknown as McpSync
    return {
        sync,
        restores,
        /** The server changed: the list it would answer now */
        serve(next: HistoryList) {
            current = next
            for (const listener of listeners) listener()
        },
        failRestores(result: "stale" | "failed") {
            restoreResult = result
        },
    }
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <DictionaryProvider dictionary={en as unknown as Dictionary}>
        {children}
    </DictionaryProvider>
)

const flush = () => act(() => Promise.resolve())

describe("useNodeVersions", () => {
    it("reads History when the sync starts and whenever the server changed", async () => {
        const server = fakeSync(list([entry(0, A)], 0))
        const { result } = renderHook(() => useNodeVersions(server.sync), {
            wrapper,
        })
        await flush()
        expect(result.current.versions.map((v) => v.number)).toEqual([1])
        expect(result.current.onCanvasId).toBe("0")
        expect(result.current.canUndo).toBe(false)

        await act(async () =>
            server.serve(list([entry(0, A), entry(1, AB)], 1)),
        )
        expect(result.current.versions.map((v) => v.number)).toEqual([1, 2])
        expect(result.current.onCanvasId).toBe("1")
        expect(result.current.canUndo).toBe(true)
        expect(result.current.canRedo).toBe(false)
    })

    it("numbers the History of another server state anew", async () => {
        // The process restarted: entry ids start over and name other content
        const server = fakeSync(list([entry(0, A), entry(1, AB)], 1))
        const { result } = renderHook(() => useNodeVersions(server.sync), {
            wrapper,
        })
        await flush()
        expect(result.current.versions.map((v) => v.number)).toEqual([1, 2])
        const AB2 = doc(cell("a", "A") + cell("b", "B"), "p2")
        const ABC2 = doc(cell("a", "A") + cell("b", "B") + cell("c", "C"), "p2")
        await act(async () =>
            server.serve({
                entries: [entry(0, AB2), entry(1, ABC2)],
                stateId: "S2",
                currentId: 1,
            }),
        )
        expect(result.current.versions.map((v) => v.number)).toEqual([1, 2])
        const [first, second] = result.current.versions
        expect(first.fromScratch).toBe(true)
        expect(first.summary.shapesAdded).toBe(2)
        expect(second.pageId).toBe("p2")
    })

    it("undoes to the version the newest one replaced, after a restore in between", async () => {
        // History: A, AB, ABC, A again (restored), AD; undo from AD goes to
        // A (its newest copy), as restore_version does, not to ABC
        const AD = doc(cell("a", "A") + cell("d", "D"))
        const server = fakeSync(
            list(
                [
                    entry(0, A),
                    entry(1, AB),
                    entry(2, ABC),
                    entry(3, A, { firstId: 0, source: "restore" }),
                    entry(4, AD),
                ],
                4,
            ),
        )
        const { result } = renderHook(() => useNodeVersions(server.sync), {
            wrapper,
        })
        await flush()
        expect(result.current.canUndo).toBe(true)
        await act(async () => {
            result.current.undo()
        })
        expect(server.restores).toEqual([{ id: 3, stateId: "S1" }])
        // Back at A: AD is the undone one
        await act(async () =>
            server.serve(
                list(
                    [
                        entry(0, A),
                        entry(1, AB),
                        entry(2, ABC),
                        entry(3, A, { firstId: 0, source: "restore" }),
                        entry(4, AD),
                        entry(5, A, { firstId: 0, source: "restore" }),
                    ],
                    5,
                ),
            ),
        )
        expect(result.current.onCanvasId).toBe("0")
        expect(result.current.undoneId).toBe("4")
        expect(result.current.canRedo).toBe(true)
    })

    it("has no versions without a sync", () => {
        const { result } = renderHook(() => useNodeVersions(null), { wrapper })
        expect(result.current.versions).toEqual([])
        expect(result.current.onCanvasId).toBeNull()
    })

    it("restores through the sync with the list's state, and says so", async () => {
        const server = fakeSync(list([entry(0, A), entry(1, AB)], 1))
        const { result } = renderHook(() => useNodeVersions(server.sync), {
            wrapper,
        })
        await flush()
        await act(async () => {
            result.current.restore("0")
        })
        expect(server.restores).toEqual([{ id: 0, stateId: "S1" }])
        expect(toasts.success).toHaveBeenCalledWith("Restored v1", {
            duration: 4000,
        })
        // The canvas was busy for the restore, and is free again
        expect(useCanvasStore.getState().isBusy).toBe(false)
    })

    it("undoes the newest version by restoring the one before, and redoes it", async () => {
        // The server keeps the state it left as a copy of the entry
        const server = fakeSync(list([entry(0, A), entry(1, AB)], 1))
        const { result } = renderHook(() => useNodeVersions(server.sync), {
            wrapper,
        })
        await flush()
        await act(async () => {
            result.current.undo()
        })
        expect(server.restores).toEqual([{ id: 0, stateId: "S1" }])
        await act(async () =>
            server.serve(
                list(
                    [entry(0, A), entry(1, AB), entry(2, A, { firstId: 0 })],
                    2,
                ),
            ),
        )
        expect(result.current.versions).toHaveLength(2)
        expect(result.current.onCanvasId).toBe("0")
        expect(result.current.undoneId).toBe("1")
        expect(result.current.canUndo).toBe(false)
        expect(result.current.canRedo).toBe(true)

        await act(async () => {
            result.current.redo()
        })
        expect(server.restores.at(-1)).toEqual({ id: 1, stateId: "S1" })
        await act(async () =>
            server.serve(
                list(
                    [
                        entry(0, A),
                        entry(1, AB),
                        entry(2, A, { firstId: 0 }),
                        entry(3, AB, { firstId: 1 }),
                    ],
                    3,
                ),
            ),
        )
        expect(result.current.onCanvasId).toBe("1")
        expect(result.current.undoneId).toBeNull()
        expect(result.current.canUndo).toBe(true)
    })

    it("offers neither undo nor redo after a hand edit, and keeps that edit as a version once a write follows", async () => {
        const server = fakeSync(list([entry(0, A), entry(1, AB)], null))
        const { result } = renderHook(() => useNodeVersions(server.sync), {
            wrapper,
        })
        await flush()
        expect(result.current.canUndo).toBe(false)
        expect(result.current.canRedo).toBe(false)
        expect(result.current.undoneId).toBeNull()
        // The card of the version the edit was made on says so
        expect(result.current.editedSinceId).toBe("1")
        // The AI writes: the server kept the hand edit first
        const manual = doc(cell("a", "A") + cell("b", "B") + cell("m", "M"))
        await act(async () =>
            server.serve(
                list(
                    [
                        entry(0, A),
                        entry(1, AB),
                        entry(2, manual, { source: "user" }),
                        entry(3, ABC),
                    ],
                    3,
                ),
            ),
        )
        expect(result.current.versions.map((v) => v.source)).toEqual([
            null,
            null,
            "user",
            null,
        ])
    })

    it("does not call a hand edit undone that lost to the AI's write", async () => {
        // The AI wrote AB while the user was editing A: the server keeps
        // the AI's write on the canvas and the user's edit after it
        const manual = doc(cell("a", "A") + cell("m", "M"))
        const server = fakeSync(
            list(
                [
                    entry(0, A),
                    entry(1, AB),
                    entry(2, manual, { source: "user" }),
                ],
                1,
            ),
        )
        const { result } = renderHook(() => useNodeVersions(server.sync), {
            wrapper,
        })
        await flush()
        expect(result.current.onCanvasId).toBe("1")
        expect(result.current.undoneId).toBeNull()
        expect(result.current.canRedo).toBe(false)
        expect(result.current.canUndo).toBe(false)
        // The same for what a tab showed when the session came back from
        // its file
        await act(async () =>
            server.serve(
                list(
                    [entry(0, AB), entry(1, manual, { source: "recover" })],
                    0,
                ),
            ),
        )
        expect(result.current.undoneId).toBeNull()
        // A hand edit taken back with a restore is undone: the canvas
        // shows the restore's copy, newer than the edit
        await act(async () =>
            server.serve(
                list(
                    [
                        entry(0, AB),
                        entry(1, manual, { source: "user" }),
                        entry(2, AB, { firstId: 0, source: "restore" }),
                    ],
                    2,
                ),
            ),
        )
        expect(result.current.undoneId).toBe("1")
        expect(result.current.canRedo).toBe(true)
    })

    it("calls a hand edit undone when Ctrl+Z in the editor took back its restore", async () => {
        // The user edited AB by hand, went back to AB with its card and
        // brought the edit back with its own: History has a copy of each
        const manual = doc(cell("a", "A") + cell("b", "B") + cell("m", "M"))
        const entries = [
            entry(0, AB),
            entry(1, manual, { source: "user" }),
            entry(2, AB, { firstId: 0, source: "restore" }),
            entry(3, manual, { firstId: 1, source: "restore" }),
        ]
        const server = fakeSync(list(entries, 3))
        const { result } = renderHook(() => useNodeVersions(server.sync), {
            wrapper,
        })
        await flush()
        expect(result.current.onCanvasId).toBe("1")
        expect(result.current.canUndo).toBe(true)
        // Ctrl+Z in the editor: the tab pushes AB, which adds no entry, so
        // the canvas shows the copy of AB from before the edit's own copy
        await act(async () => server.serve(list(entries, 2)))
        expect(result.current.onCanvasId).toBe("0")
        expect(result.current.undoneId).toBe("1")
        expect(result.current.canRedo).toBe(true)
    })

    it("names the version a hand edit was made on: the one on the canvas last", async () => {
        const server = fakeSync(list([entry(0, A), entry(1, AB)], 0))
        const { result } = renderHook(() => useNodeVersions(server.sync), {
            wrapper,
        })
        await flush()
        expect(result.current.editedSinceId).toBeNull()
        await act(async () =>
            server.serve(list([entry(0, A), entry(1, AB)], null)),
        )
        expect(result.current.editedSinceId).toBe("0")
    })

    it("does not restore twice at once, nor what is not a version", async () => {
        const server = fakeSync(list([entry(0, A), entry(1, AB)], 1))
        let resolveRestore: (r: "ok") => void = () => {}
        server.sync.restoreEntry = vi.fn(
            () =>
                new Promise<"ok">((resolve) => {
                    resolveRestore = resolve
                }),
        ) as unknown as McpSync["restoreEntry"]
        const { result } = renderHook(() => useNodeVersions(server.sync), {
            wrapper,
        })
        await flush()
        await act(async () => {
            await result.current.restore("missing")
        })
        expect(server.sync.restoreEntry).not.toHaveBeenCalled()
        expect(result.current.isBusy).toBe(false)
        act(() => {
            result.current.restore("0")
        })
        await flush()
        expect(result.current.isBusy).toBe(true)
        act(() => {
            result.current.restore("0")
        })
        expect(server.sync.restoreEntry).toHaveBeenCalledTimes(1)
        await act(async () => resolveRestore("ok"))
        expect(result.current.isBusy).toBe(false)
    })

    it("stays quiet when a restore was refused, and reads the list again", async () => {
        const server = fakeSync(list([entry(0, A), entry(1, AB)], 1))
        server.failRestores("stale")
        const { result } = renderHook(() => useNodeVersions(server.sync), {
            wrapper,
        })
        await flush()
        toasts.success.mockClear()
        const reads = (server.sync.fetchHistory as ReturnType<typeof vi.fn>)
            .mock.calls.length
        await act(async () => {
            result.current.restore("0")
        })
        expect(toasts.success).not.toHaveBeenCalled()
        expect(
            (server.sync.fetchHistory as ReturnType<typeof vi.fn>).mock.calls
                .length,
        ).toBe(reads + 1)
    })
})

describe("VersionsPanel", () => {
    it("scrolls to the newest card, also once the server's buffer is full and the count stays the same", () => {
        // jsdom has no scrolling
        const scrollTo = vi.fn()
        Element.prototype.scrollTo = scrollTo
        const source = (versions: ReturnType<typeof buildVersions>) => ({
            versions: versions.versions,
            onCanvasId: versions.onCanvasId,
            undoneId: null,
            isBusy: false,
            canUndo: false,
            canRedo: false,
            restore: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
        })
        const panel = (versions: ReturnType<typeof buildVersions>) => (
            <DictionaryProvider dictionary={en as unknown as Dictionary}>
                <VersionsProvider value={source(versions)}>
                    <VersionsPanel versions={versions.versions} />
                </VersionsProvider>
            </DictionaryProvider>
        )
        const kept = cache()
        const first = buildVersions(list([entry(0, A), entry(1, AB)], 1), kept)
        const { rerender } = render(panel(first))
        expect(scrollTo).toHaveBeenCalledTimes(1)
        // The oldest entry dropped out as the new one came: two cards still
        const next = buildVersions(list([entry(1, AB), entry(2, ABC)], 2), kept)
        rerender(panel(next))
        expect(scrollTo).toHaveBeenCalledTimes(2)
        // The same list again: nothing to scroll to
        rerender(panel(next))
        expect(scrollTo).toHaveBeenCalledTimes(2)
    })
})
