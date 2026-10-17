import { act, renderHook } from "@testing-library/react"
import type React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DiagramProvider, useDiagram } from "@/contexts/diagram-context"
import { useCanvasStore } from "@/stores/canvas-store"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
// No editor to drive: every load is a full load, and the page to show after
// it is recorded
const selectPage = vi.fn((_id: string) => true)
const fitOpenedDiagram = vi.fn()
vi.mock("@/lib/drawio/editor-bridge", () => ({
    canReplaceDiagram: () => false,
    commitDiagram: vi.fn(),
    fitOpenedDiagram: () => fitOpenedDiagram(),
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
        const { result, requests, reply } = setup()
        const pending = result.current.requestExport({ format: "svg" }, 1000)
        await vi.advanceTimersByTimeAsync(1000)
        expect(await pending).toBeNull()
        // A late answer is ignored without throwing
        reply(requests[0], "data:image/svg+xml;base64,AAAA")
    })

    it("resolves to null without draw.io", async () => {
        const { result } = setup()
        result.current.drawioRef.current = null
        expect(await result.current.requestExport({ format: "svg" })).toBeNull()
    })
})

describe("showTransient", () => {
    type Result = ReturnType<typeof setup>["result"]
    // Load the document, with draw.io's "load" reports: its first one makes
    // the provider send the document once more, which draw.io reports too
    const start = (result: Result, xml: string) =>
        act(() => {
            result.current.loadDiagram(xml, true)
            result.current.onDrawioLoad()
            result.current.onDrawioLoad()
        })
    const loaded = (result: Result) => act(() => result.current.onDrawioLoad())
    const autosave = (result: Result, xml: string) =>
        act(() => result.current.handleDiagramAutoSave({ xml }))

    it("shows the document without recording it, and ignores its autosaves until the next load", () => {
        const { result, loads } = setup()
        start(result, doc(page("p1", "real")))
        expect(result.current.chartXML).toContain('value="real"')

        act(() => {
            result.current.showTransient(doc(page("p2", "projection")))
        })
        loaded(result)
        expect(loads.at(-1)).toContain('value="projection"')
        expect(result.current.chartXML).toContain('value="real"')
        autosave(result, doc(page("p2", "projection edited")))
        expect(result.current.chartXML).toContain('value="real"')

        // The real document comes back: recorded, and once draw.io reports
        // the load, saves count again
        act(() => {
            result.current.loadDiagram(doc(page("p1", "real again")), true)
        })
        loaded(result)
        expect(result.current.chartXML).toContain('value="real again"')
        autosave(result, doc(page("p1", "real edited")))
        expect(result.current.chartXML).toContain('value="real edited"')
    })

    it("keeps the document over a projection autosave that comes before draw.io reports the load back", () => {
        const { result, loads } = setup()
        const twoPages = doc(page("p1", "one") + page("p2", "two"))
        start(result, twoPages)
        act(() => {
            result.current.showTransient(doc(page("p2", "two")))
        })
        loaded(result)
        // The restore load is sent; the user's last drag on the projection
        // is autosaved before draw.io gets to the load
        act(() => {
            result.current.loadDiagram(twoPages, true, "load")
        })
        autosave(result, doc(page("p2", "two moved")))
        const isDocument = (xml: string | undefined) =>
            !!xml && xml.includes('id="p1"') && !xml.includes("two moved")
        expect(isDocument(result.current.chartXMLRef.current)).toBe(true)
        loaded(result)
        expect(isDocument(result.current.chartXMLRef.current)).toBe(true)
        // The frame starts over (an external draw.io on a theme switch) and
        // gets the document, not the projection
        act(() => {
            result.current.resetDrawioReady()
        })
        loaded(result)
        expect(isDocument(loads.at(-1))).toBe(true)
    })

    it("ignores an autosave of the document a full load replaces", () => {
        const { result } = setup()
        start(result, doc(page("p1", "first")))
        act(() => {
            result.current.loadDiagram(doc(page("p1", "second")), true, "load")
        })
        // draw.io autosaved the user's last change of the first document
        // before it got to the load
        autosave(result, doc(page("p1", "first moved")))
        expect(result.current.chartXML).toContain('value="second"')
        loaded(result)
        autosave(result, doc(page("p1", "second moved")))
        expect(result.current.chartXML).toContain('value="second moved"')
    })

    it("goes back to the page the user was on before the projection", () => {
        const { result } = setup()
        const twoPages = doc(page("p1", "one") + page("p2", "two"))
        start(result, twoPages)
        // The user is on page two; the projection shows page one
        useCanvasStore.setState({ currentPageId: "p2" })
        act(() => {
            result.current.showTransient(doc(page("p1", "one")))
        })
        loaded(result)
        useCanvasStore.setState({ currentPageId: "p1" })
        selectPage.mockClear()
        act(() => {
            result.current.loadDiagram(twoPages, true)
            result.current.onDrawioLoad()
        })
        expect(selectPage).toHaveBeenCalledWith("p2")
    })

    it("goes back to that page also when draw.io reports the projection after the restore was sent", () => {
        const { result } = setup()
        const twoPages = doc(page("p1", "one") + page("p2", "two"))
        start(result, twoPages)
        useCanvasStore.setState({ currentPageId: "p2" })
        act(() => {
            result.current.showTransient(doc(page("p1", "one")))
        })
        useCanvasStore.setState({ currentPageId: "p1" })
        selectPage.mockClear()
        act(() => {
            result.current.loadDiagram(twoPages, true)
        })
        // The projection's report: the restore is still on its way
        loaded(result)
        expect(selectPage).not.toHaveBeenCalled()
        loaded(result)
        expect(selectPage).toHaveBeenCalledExactlyOnceWith("p2")
    })
})

describe("full loads", () => {
    it("show the page of the last load sent when two loads overlap", () => {
        const { result } = setup()
        const threePages = (label: string) =>
            doc(
                page("p1", `one ${label}`) +
                    page("p2", `two ${label}`) +
                    page("p3", `three ${label}`),
            )
        act(() => {
            result.current.loadDiagram(threePages("a"), true)
            result.current.onDrawioLoad()
            result.current.onDrawioLoad()
        })
        selectPage.mockClear()
        // A change on page two, then one on page three, before draw.io
        // reports either load
        act(() => {
            result.current.loadDiagram(threePages("b"), true, "load", {
                pageId: "p2",
                keepView: true,
            })
            result.current.loadDiagram(threePages("c"), true, "load", {
                pageId: "p3",
                keepView: true,
            })
        })
        act(() => result.current.onDrawioLoad())
        expect(selectPage).not.toHaveBeenCalled()
        act(() => result.current.onDrawioLoad())
        expect(selectPage).toHaveBeenCalledExactlyOnceWith("p3")
    })

    it("fit a diagram opened into view once the last load is done; a load that keeps the view does not", () => {
        const { result } = setup()
        act(() => {
            result.current.loadDiagram(doc(page("p1", "first")), true)
            // draw.io's first load: the provider sends the document again
            result.current.onDrawioLoad()
        })
        fitOpenedDiagram.mockClear()
        // Two chats opened one after the other: fitted once, after the last
        act(() => {
            result.current.loadDiagram(doc(page("p1", "a")), true)
            result.current.loadDiagram(doc(page("p1", "b")), true)
            result.current.onDrawioLoad()
            result.current.onDrawioLoad()
        })
        expect(fitOpenedDiagram).not.toHaveBeenCalled()
        act(() => result.current.onDrawioLoad())
        expect(fitOpenedDiagram).toHaveBeenCalledTimes(1)
        // The MCP preview's server writes keep the user's view
        act(() => {
            result.current.loadDiagram(doc(page("p1", "c")), true, "load", {
                keepView: true,
            })
            result.current.onDrawioLoad()
        })
        expect(fitOpenedDiagram).toHaveBeenCalledTimes(1)
    })
})
