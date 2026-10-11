import { act, cleanup, renderHook } from "@testing-library/react"
import type React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
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
    useNodeVersions,
} from "@/packages/mcp-server/shell/node-versions-source"
import { versionLabel } from "@/packages/mcp-server/shell/versions-panel"
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
        time: 1000 + id,
        pages: 1,
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
            new Map(),
            new Map(),
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
            new Map(),
            new Map(),
        )
        expect(versions.map((v) => [v.id, v.number])).toEqual([
            ["1", 1],
            ["2", 2],
        ])
        expect(versions[0].fromScratch).toBe(true)
        expect(onCanvasId).toBe("2")
        // Blank on the canvas: no version is
        expect(
            buildVersions(list([entry(0, blank)], 0), new Map(), new Map()),
        ).toEqual({ versions: [], onCanvasId: "0" })
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
            new Map(),
            new Map(),
        )
        expect(versions.map((v) => v.id)).toEqual(["0", "1"])
        // The copy's picture stands in for the first copy's missing one
        expect(versions[0].svg).toBe("data:A")
        expect(onCanvasId).toBe("0")
    })

    it("keeps the numbers once given, and gives new versions the next", () => {
        const numbers = new Map<number, number>()
        const changes = new Map()
        buildVersions(list([entry(0, A), entry(1, AB)], 1), numbers, changes)
        // The oldest entry dropped out of the server's buffer
        const { versions } = buildVersions(
            list([entry(1, AB), entry(2, ABC)], 2),
            numbers,
            changes,
        )
        expect(versions.map((v) => v.number)).toEqual([2, 3])
    })

    it("lets the newest version on the canvas wait for its picture, older ones show none", () => {
        const { versions } = buildVersions(
            list([entry(0, A), entry(1, AB)], 1),
            new Map(),
            new Map(),
        )
        expect(versions[0].svg).toBe("")
        expect(versions[1].svg).toBeUndefined()
        const edited = buildVersions(
            list([entry(0, A), entry(1, AB)], null),
            new Map(),
            new Map(),
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
            new Map(),
            new Map(),
        )
        expect(versions.map((v) => versionLabel(v, dict))).toEqual([
            "Drew the diagram",
            "Changed by hand",
            "Changed the diagram",
        ])
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
        act(() => {
            result.current.restore("0")
        })
        await flush()
        expect(result.current.isBusy).toBe(true)
        act(() => {
            result.current.restore("0")
            result.current.restore("missing")
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
