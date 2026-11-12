import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import en from "@/lib/i18n/dictionaries/en.json"
import type { SyncOptions } from "@/packages/mcp-server/shell/mcp-sync-core"
import { readShellConfig } from "@/packages/mcp-server/shell/runtime-config"

// What the hook does around the sync (mcp-sync-core.ts has the protocol):
// the notices it shows, the question before the page is left, and the
// selection it keeps across a write

const mocks = vi.hoisted(() => ({
    options: null as SyncOptions | null,
    unsavedEdit: false,
    toast: Object.assign(vi.fn(), { dismiss: vi.fn() }),
    selected: [] as string[],
    selectCells: vi.fn(),
    highlightChangedCells: vi.fn(),
    commitHandler: null as
        | ((commit: {
              beforeXml: string
              afterXml: string
              pageId?: string | null
          }) => void)
        | null,
}))

vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("@/contexts/diagram-context", () => ({
    useDiagram: () => ({
        loadDiagram: vi.fn(() => null),
        chartXMLRef: { current: "" },
        hasPendingLoad: () => false,
        setCommitHandler: (handler: typeof mocks.commitHandler) => {
            mocks.commitHandler = handler
        },
        isDrawioReady: true,
    }),
}))
vi.mock("@/hooks/use-dictionary", () => ({ useDictionary: () => en }))
vi.mock("@/lib/drawio/editor-bridge", () => ({
    finishTyping: () => false,
    highlightChangedCells: mocks.highlightChangedCells,
    isMidGesture: () => false,
    readSelectionDetails: () => ({
        pageId: "p1",
        pageName: "Page-1",
        cells: mocks.selected.map((id) => ({ id, label: "", edge: false })),
    }),
    selectCells: mocks.selectCells,
}))
vi.mock("@/packages/mcp-server/shell/mcp-sync-core", () => ({
    createMcpSync: (options: SyncOptions) => {
        mocks.options = options
        return {
            setReady: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            read: () => ({ unsavedEdit: mocks.unsavedEdit }),
        }
    },
}))

import { useMcpSync } from "@/packages/mcp-server/shell/use-mcp-sync"

const config = readShellConfig({
    sessionId: "s1",
    token: "t",
    drawioBaseUrl: "https://drawio.test/index.html",
})

beforeEach(() => {
    mocks.toast.mockClear()
    mocks.toast.dismiss.mockClear()
    mocks.selectCells.mockClear()
    mocks.highlightChangedCells.mockClear()
    mocks.unsavedEdit = false
    mocks.selected = []
    renderHook(() => useMcpSync(config))
})
afterEach(cleanup)

describe("the MCP sync hook while the server cannot be reached", () => {
    it("keeps the notice on screen until the server answers again", () => {
        act(() => mocks.options?.onNotice("unreachable"))
        expect(mocks.toast).toHaveBeenCalledWith(en.shell.unreachable, {
            id: "unreachable",
            duration: Number.POSITIVE_INFINITY,
        })
        act(() => mocks.options?.onStatus?.("offline"))
        expect(mocks.toast.dismiss).not.toHaveBeenCalled()
        act(() => mocks.options?.onStatus?.("connected"))
        expect(mocks.toast.dismiss).toHaveBeenCalledWith("unreachable")
    })

    it("shows the other notices for a few seconds", () => {
        act(() => mocks.options?.onNotice("aiChanged"))
        expect(mocks.toast).toHaveBeenCalledWith(en.shell.aiChanged, {
            duration: 8000,
        })
    })

    it("asks before the page is left with an edit the server does not have", () => {
        const leave = () => {
            const event = new Event("beforeunload", { cancelable: true })
            window.dispatchEvent(event)
            return event.defaultPrevented
        }
        expect(leave()).toBe(false)
        mocks.unsavedEdit = true
        expect(leave()).toBe(true)
        // Saved since: the page is left without a question
        mocks.unsavedEdit = false
        expect(leave()).toBe(false)
    })
})

describe("the MCP sync hook when a write goes on the page in place", () => {
    const cell = (id: string, label: string) =>
        `<mxCell id="${id}" value="${label}" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>`
    const file = (cells: string) =>
        `<mxfile><diagram id="p1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`

    it("selects the user's cells again, then outlines the change", () => {
        const before = file(cell("2", "A") + cell("3", "B"))
        const after = file(cell("2", "A") + cell("3", "B2"))
        mocks.selected = ["2", "3"]
        act(() =>
            mocks.options?.canvas.load(after, { mode: "commit", pageId: "p1" }),
        )
        // The editor replaced the page's cells: nothing is selected now
        mocks.selected = []
        act(() =>
            mocks.commitHandler?.({
                beforeXml: before,
                afterXml: after,
                pageId: "p1",
            }),
        )
        expect(mocks.selectCells).toHaveBeenCalledWith(["2", "3"])
        expect(mocks.highlightChangedCells).toHaveBeenCalledWith(["3"], "p1", {
            navigate: false,
        })
        // A selection ends an outline on screen: the outline comes after
        expect(mocks.selectCells.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.highlightChangedCells.mock.invocationCallOrder[0],
        )
    })
})
