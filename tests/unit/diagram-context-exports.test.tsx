import { act, renderHook } from "@testing-library/react"
import type React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DiagramProvider, useDiagram } from "@/contexts/diagram-context"
import { useCanvasStore } from "@/stores/canvas-store"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
// No editor to drive: every load is a full load, and the page to show after
// it is recorded
const selectPage = vi.fn((_id: string) => true)
vi.mock("@/lib/drawio/editor-bridge", () => ({
    canReplaceDiagram: () => false,
    commitDiagram: vi.fn(),
    previewDiagram: vi.fn(),
    resetPreview: vi.fn(),
    revertPreview: vi.fn(),
    selectPage: (id: string) => selectPage(id),
}))

const doc = (pages: string) => `<mxfile>${pages}</mxfile>`
const page = (id: string, label: string) =>
    `<diagram id="${id}" name="${id}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="c-${id}" value="${label}" vertex="1" parent="1"><mxGeometry as="geometry"/></mxCell></root></mxGraphModel></diagram>`

// The provider with a stand-in draw.io that records loads and exports
function setup() {
    const { result } = renderHook(() => useDiagram(), {
        wrapper: ({ children }: { children: React.ReactNode }) => (
            <DiagramProvider>{children}</DiagramProvider>
        ),
    })
    const requests: { format: string; message: string; pageId?: string }[] = []
    const loads: string[] = []
    result.current.drawioRef.current = {
        exportDiagram: (r: any) => requests.push(r),
        load: ({ xml }: { xml: string }) => loads.push(xml),
    } as any
    const reply = (
        request: { message: string },
        data: string | undefined,
        xml?: string,
    ) =>
        act(() =>
            result.current.handleDiagramExport({
                event: "export",
                data,
                xml,
                format: "png",
                message: request,
            } as any),
        )
    return { result, requests, loads, reply }
}

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    useCanvasStore.setState({ currentPageId: null })
})

describe("requestExport", () => {
    it("passes the request on and resolves with its own answer", async () => {
        const { result, requests, reply } = setup()
        const png = result.current.requestExport({
            format: "png",
            pageId: "p2",
            width: 700,
        })
        const xml = result.current.requestExport({ format: "xml" })
        expect(requests).toMatchObject([
            { format: "png", pageId: "p2", width: 700 },
            { format: "xml" },
        ])
        // The XML export answers first, with the document instead of data
        reply(requests[1], undefined, "<mxfile>doc</mxfile>")
        expect(await xml).toEqual({
            data: undefined,
            xml: "<mxfile>doc</mxfile>",
        })
        reply(requests[0], "data:image/png;base64,AAAA")
        expect(await png).toEqual({
            data: "data:image/png;base64,AAAA",
            xml: undefined,
        })
    })

    it("resolves to null when draw.io does not answer in time", async () => {
        vi.useFakeTimers()
        const { result, requests } = setup()
        const pending = result.current.requestExport({ format: "svg" }, 1000)
        await vi.advanceTimersByTimeAsync(1000)
        expect(await pending).toBeNull()
        // A late answer goes nowhere
        expect(
            result.current.exportResolversRef.current[requests[0].message],
        ).toBeUndefined()
    })

    it("resolves to null without draw.io", async () => {
        const { result } = setup()
        result.current.drawioRef.current = null
        expect(await result.current.requestExport({ format: "svg" })).toBeNull()
    })
})

describe("showTransient", () => {
    it("shows the document without recording it, and ignores its autosaves until the next load", () => {
        const { result, loads } = setup()
        act(() => {
            result.current.loadDiagram(doc(page("p1", "real")), true)
            result.current.onDrawioLoad()
        })
        expect(result.current.chartXML).toContain('value="real"')

        act(() => {
            result.current.showTransient(doc(page("p2", "projection")))
        })
        expect(loads.at(-1)).toContain('value="projection"')
        expect(result.current.chartXML).toContain('value="real"')
        act(() => {
            result.current.handleDiagramAutoSave({
                xml: doc(page("p2", "projection edited")),
            })
        })
        expect(result.current.chartXML).toContain('value="real"')

        // The real document comes back: recorded, and saves count again
        act(() => {
            result.current.loadDiagram(doc(page("p1", "real again")), true)
        })
        expect(result.current.chartXML).toContain('value="real again"')
        act(() => {
            result.current.handleDiagramAutoSave({
                xml: doc(page("p1", "real edited")),
            })
        })
        expect(result.current.chartXML).toContain('value="real edited"')
    })

    it("goes back to the page the user was on before the projection", () => {
        const { result } = setup()
        const twoPages = doc(page("p1", "one") + page("p2", "two"))
        act(() => {
            result.current.loadDiagram(twoPages, true)
            result.current.onDrawioLoad()
        })
        // The user is on page two; the projection shows page one
        useCanvasStore.setState({ currentPageId: "p2" })
        act(() => {
            result.current.showTransient(doc(page("p1", "one")))
        })
        useCanvasStore.setState({ currentPageId: "p1" })
        selectPage.mockClear()
        act(() => {
            result.current.loadDiagram(twoPages, true)
            result.current.onDrawioLoad()
        })
        expect(selectPage).toHaveBeenCalledWith("p2")
    })
})
