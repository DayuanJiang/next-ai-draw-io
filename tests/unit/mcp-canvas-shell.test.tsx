import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DiagramProvider } from "@/contexts/diagram-context"
import { DictionaryProvider } from "@/hooks/use-dictionary"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import en from "@/lib/i18n/dictionaries/en.json"
import { CanvasShell } from "@/packages/mcp-server/shell/canvas-shell"
import type { HistoryList } from "@/packages/mcp-server/shell/mcp-sync-core"
import { readShellConfig } from "@/packages/mcp-server/shell/runtime-config"

// The MCP shell's own page around the canvas: the header's texts, the tab's
// title, the versions panel's switch and the export dialog. The canvas and
// the sync with the server are stand-ins

// What the server would answer: the file it names and its History
const server = vi.hoisted(() => ({
    file: null as string | null,
    history: null as unknown,
}))

vi.mock("@/components/canvas/canvas-stage", () => ({
    CanvasStage: () => null,
}))
vi.mock("@/packages/mcp-server/shell/use-mcp-sync", () => {
    const sync = {
        read: () => ({ file: server.file, fileChanged: false }),
        onServerChange: () => () => {},
        fetchHistory: async () => server.history,
    }
    return {
        useMcpSync: (config: { sessionId: string }) =>
            config.sessionId
                ? { status: "connected", sync }
                : { status: "waiting", sync: null },
    }
})

// jsdom has no scrolling; the panel scrolls to its newest version
Element.prototype.scrollTo = vi.fn()

beforeEach(() => {
    server.file = null
    server.history = null
    localStorage.clear()
    // The export dialog asks whether the pointer is fine, and the toaster's
    // settings listen for a change of the system's colour scheme
    vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: false, addEventListener: vi.fn() })),
    )
})

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

async function open(sessionId = "mcp-abc123-x1y2z3") {
    const view = render(
        <DictionaryProvider dictionary={en as unknown as Dictionary}>
            <DiagramProvider>
                <CanvasShell config={readShellConfig({ sessionId })} />
            </DiagramProvider>
        </DictionaryProvider>,
    )
    // The History read answers
    await act(() => Promise.resolve())
    return view
}

const doc = (cells: string) =>
    `<mxfile><diagram id="p1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`
const cell = (id: string) =>
    `<mxCell id="${id}" value="${id}" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell>`
const twoVersions: HistoryList = {
    entries: [doc(cell("a")), doc(cell("a") + cell("b"))].map((xml, id) => ({
        id,
        index: id,
        svg: "",
        xml,
        source: null,
        firstId: id,
    })),
    stateId: "S1",
    currentId: 1,
}

describe("the MCP shell's page", () => {
    it("says that there is no session, where it would wait for the server forever", async () => {
        // /shell/ opened before any session exists: nothing is synced
        await open("")
        expect(screen.getByTestId("shell-status").textContent).toBe(
            en.shell.noSession,
        )
        expect(document.title).toBe("Next AI Draw.io")
    })

    it("names the tab after the session, and after the file once the diagram is in one", async () => {
        const { unmount } = await open()
        expect(screen.getByTestId("shell-status").textContent).toBe(
            en.shell.connected,
        )
        expect(document.title).toBe("x1y2z3 | Next AI Draw.io")
        unmount()
        server.file = "/home/me/docs/my-architecture.drawio"
        await open()
        expect(document.title).toBe("my-architecture.drawio | Next AI Draw.io")
    })

    it("offers the file's name in the export dialog, and the date for a diagram in no file", async () => {
        const offered = async (file: string | null) => {
            server.file = file
            const { unmount } = await open()
            fireEvent.click(screen.getByTestId("download"))
            const name = screen.getByRole<HTMLInputElement>("textbox", {
                name: en.save.filename,
            }).value
            unmount()
            return name
        }
        expect(await offered(null)).toMatch(/^diagram-\d{4}-\d{2}-\d{2}$/)
        expect(await offered("/home/me/docs/my-architecture.drawio")).toBe(
            "my-architecture",
        )
        expect(await offered("C:\\docs\\plan.v2.drawio.svg")).toBe("plan.v2")
    })

    it("keeps the versions panel hidden for the next visit", async () => {
        server.history = twoVersions
        const { unmount } = await open()
        expect(screen.getByTestId("versions-panel")).toBeTruthy()
        fireEvent.click(screen.getByTestId("versions-toggle"))
        expect(screen.queryByTestId("versions-panel")).toBeNull()
        unmount()

        // The page is loaded again
        await open()
        expect(screen.queryByTestId("versions-panel")).toBeNull()
        const toggle = screen.getByTestId("versions-toggle")
        expect(toggle.getAttribute("aria-pressed")).toBe("false")
        fireEvent.click(toggle)
        expect(screen.getByTestId("versions-panel")).toBeTruthy()
        cleanup()
        await open()
        expect(screen.getByTestId("versions-panel")).toBeTruthy()
    })
})
