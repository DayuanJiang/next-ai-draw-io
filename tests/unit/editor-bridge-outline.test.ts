import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    attachEditor,
    clearHighlights,
    detachEditor,
    highlightChangedCells,
    useFadedOutline,
} from "@/lib/drawio/editor-bridge"

// The outline of an AI change is drawn a moment after it is asked for
// (draw.io draws the cells first); ending it before then ends it for good

const drawn: string[] = []

class FakeHighlight {
    opacity = 100
    shape = null
    highlight(state: { cell: { id: string } }) {
        drawn.push(state.cell.id)
    }
    destroy() {}
}

function attachFakeEditor() {
    const cells: Record<string, { id: string }> = { a: { id: "a" } }
    const graph = {
        model: {
            getCell: (id: string) => cells[id],
            isEdge: () => false,
        },
        view: { getState: (cell: { id: string }) => ({ cell }) },
        getSelectionCells: () => [],
        isSelectionEmpty: () => true,
    }
    attachEditor({ editor: { graph } }, { mxCellHighlight: FakeHighlight })
}

describe("the outline of an AI change", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        drawn.length = 0
        attachFakeEditor()
    })
    afterEach(() => {
        detachEditor()
        vi.useRealTimers()
    })

    it("is drawn once draw.io has the cells", () => {
        highlightChangedCells(["a"])
        expect(drawn).toEqual([])
        vi.advanceTimersByTime(100)
        // A halo and an outline
        expect(drawn).toEqual(["a", "a"])
    })

    it("does not come after a click ended it", () => {
        highlightChangedCells(["a"])
        clearHighlights()
        vi.advanceTimersByTime(5000)
        expect(drawn).toEqual([])
    })

    it("does not come after the editor is gone", () => {
        highlightChangedCells(["a"])
        detachEditor()
        attachFakeEditor()
        vi.advanceTimersByTime(5000)
        expect(drawn).toEqual([])
    })
})

describe("the outline of an AI change in a document with pages", () => {
    const page = (id: string) => ({ getId: () => id })
    const pages = [page("p1"), page("p2")]
    let ui: any

    beforeEach(() => {
        vi.useFakeTimers()
        drawn.length = 0
        const cells: Record<string, { id: string }> = { a: { id: "a" } }
        ui = {
            editor: {
                graph: {
                    model: {
                        getCell: (id: string) => cells[id],
                        isEdge: () => false,
                    },
                    view: { getState: (cell: { id: string }) => ({ cell }) },
                    getSelectionCells: () => [],
                    isSelectionEmpty: () => true,
                },
            },
            pages,
            currentPage: pages[1],
            getPageById: (id: string) => pages.find((p) => p.getId() === id),
            selectPage: vi.fn((p: unknown) => {
                ui.currentPage = p
            }),
        }
        attachEditor(ui, { mxCellHighlight: FakeHighlight })
    })
    afterEach(() => {
        detachEditor()
        vi.useRealTimers()
    })

    it("after a change waits for its page and leaves the user's page alone", () => {
        highlightChangedCells(["a"], "p1", { navigate: false })
        vi.advanceTimersByTime(300)
        expect(ui.selectPage).not.toHaveBeenCalled()
        expect(drawn).toEqual([])
        // A full load brings the page of the change back
        ui.currentPage = pages[0]
        vi.advanceTimersByTime(200)
        expect(drawn).toEqual(["a", "a"])
    })

    it("is never drawn on another page the user went to", () => {
        highlightChangedCells(["a"], "p1", { navigate: false })
        vi.advanceTimersByTime(5000)
        expect(drawn).toEqual([])
    })

    it("Show changes goes to the change's page, the first one without an id", () => {
        highlightChangedCells(["a"], null)
        expect(ui.selectPage).toHaveBeenCalledWith(pages[0], true)
        vi.advanceTimersByTime(100)
        expect(drawn).toEqual(["a", "a"])
    })

    it("does not switch pages when nothing changed", () => {
        highlightChangedCells([], "p1")
        expect(ui.selectPage).not.toHaveBeenCalled()
    })

    it("once faded, offers to show it again on the page it was on", () => {
        highlightChangedCells(["a"], "p2", { navigate: false })
        vi.advanceTimersByTime(100)
        expect(drawn).toEqual(["a", "a"])
        // About 3 s on screen, then a short fade
        vi.advanceTimersByTime(4000)
        expect(useFadedOutline.getState()).toMatchObject({
            ids: ["a"],
            pageId: "p2",
        })
    })
})
