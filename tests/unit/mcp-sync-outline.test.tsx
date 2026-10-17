import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import en from "@/lib/i18n/dictionaries/en.json"
import type {
    LoadDecision,
    SyncCanvas,
} from "@/packages/mcp-server/shell/mcp-sync-core"
import { readShellConfig } from "@/packages/mcp-server/shell/runtime-config"

// A server write on another page loads the document in full; the shell
// outlines what it changed on that page once draw.io has loaded it, as it
// does for the writes that go on the canvas as one undo step

const mocks = vi.hoisted(() => ({
    canvas: null as SyncCanvas | null,
    chartXML: { current: "" },
    pendingLoads: 0,
    highlightChangedCells: vi.fn(),
}))

vi.mock("@/contexts/diagram-context", () => ({
    useDiagram: () => ({
        loadDiagram: vi.fn((xml: string, _skip: boolean, mode: string) => {
            mocks.chartXML.current = xml
            if (mode === "load") mocks.pendingLoads++
            return null
        }),
        showTransient: vi.fn(() => {
            mocks.pendingLoads++
        }),
        chartXMLRef: mocks.chartXML,
        hasPendingLoad: () => mocks.pendingLoads > 0,
        setCommitHandler: vi.fn(),
        isDrawioReady: true,
    }),
}))
vi.mock("@/hooks/use-dictionary", () => ({ useDictionary: () => en }))
vi.mock("@/lib/drawio/editor-bridge", () => ({
    highlightChangedCells: mocks.highlightChangedCells,
    readSelectionDetails: () => null,
}))
vi.mock("@/packages/mcp-server/shell/mcp-sync-core", () => ({
    createMcpSync: (options: { canvas: SyncCanvas }) => {
        mocks.canvas = options.canvas
        return {
            setReady: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            onAutoSave: vi.fn(),
            onDrawioLoad: vi.fn(),
        }
    },
}))

import { useMcpSync } from "@/packages/mcp-server/shell/use-mcp-sync"

afterEach(cleanup)

const cell = (id: string, x = 40) =>
    `<mxCell id="${id}" value="${id}" vertex="1" parent="1"><mxGeometry x="${x}" y="40" width="120" height="60" as="geometry"/></mxCell>`
const page = (id: string, cells: string) =>
    `<diagram id="${id}" name="${id}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram>`
const file = (...pages: string[]) => `<mxfile>${pages.join("")}</mxfile>`

const BEFORE = file(page("p1", cell("a")), page("p2", cell("b")))
const EDITED = file(
    page("p1", cell("a")),
    page("p2", cell("b", 300) + cell("c")),
)

const DRAWIO = "https://drawio.test"
const config = readShellConfig({
    sessionId: "s1",
    token: "t",
    drawioBaseUrl: `${DRAWIO}/index.html`,
})

/** draw.io reports a load done: the canvas's handler counts it first */
async function drawioLoaded() {
    mocks.pendingLoads = Math.max(0, mocks.pendingLoads - 1)
    await act(async () => {
        window.dispatchEvent(
            new MessageEvent("message", {
                data: JSON.stringify({ event: "load" }),
                origin: DRAWIO,
            }),
        )
        await new Promise((resolve) => setTimeout(resolve, 5))
    })
}

function load(xml: string, decision: LoadDecision) {
    act(() => mocks.canvas?.load(xml, decision))
}

describe("a server write that loads in full on another page", () => {
    beforeEach(() => {
        mocks.highlightChangedCells.mockClear()
        mocks.chartXML.current = BEFORE
        mocks.pendingLoads = 0
        renderHook(() => useMcpSync(config))
    })

    it("is outlined on its page once draw.io has loaded it", async () => {
        load(EDITED, { mode: "load", pageId: "p2" })
        expect(mocks.highlightChangedCells).not.toHaveBeenCalled()
        await drawioLoaded()
        expect(mocks.highlightChangedCells).toHaveBeenCalledWith(
            ["b", "c"],
            "p2",
            { navigate: false },
        )
    })

    it("is not outlined when a new page or a projection for an export follows", async () => {
        // A new page: drawn from nothing
        load(file(page("p1", cell("a")), page("p3", cell("x"))), {
            mode: "load",
            pageId: "p3",
        })
        await drawioLoaded()
        expect(mocks.highlightChangedCells).not.toHaveBeenCalled()
        mocks.chartXML.current = BEFORE
        // The export's projection replaces the write before draw.io has it
        load(EDITED, { mode: "load", pageId: "p2" })
        act(() => mocks.canvas?.showTransient(file(page("p2", cell("c")))))
        await drawioLoaded()
        await drawioLoaded()
        expect(mocks.highlightChangedCells).not.toHaveBeenCalled()
    })

    it("is not outlined by the restore that follows a projection", async () => {
        load(EDITED, { mode: "load" })
        await drawioLoaded()
        expect(mocks.highlightChangedCells).not.toHaveBeenCalled()
    })
})
