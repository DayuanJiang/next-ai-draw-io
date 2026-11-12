import { afterEach, describe, expect, it } from "vitest"
import { attachEditor, detachEditor } from "@/lib/drawio/editor-bridge"
import { useCanvasStore } from "@/stores/canvas-store"

// The selection in the canvas store is read again on every change to the
// diagram; the chat subscribes to it

interface FakeCell {
    id: string
    value: string
}

// A stand-in editor that keeps each listener, to fire it
function attachFakeEditor() {
    let selected: FakeCell[] = []
    const listeners = new Map<string, () => void>()
    const source = (owner: string) => ({
        addListener: (name: string, handler: () => void) =>
            listeners.set(`${owner}:${name}`, handler),
        removeListener: () => {},
    })
    const graph = {
        ...source("graph"),
        model: { ...source("model"), isEdge: () => false },
        view: { ...source("view"), getBounds: () => null },
        getSelectionModel: () => source("selection"),
        getSelectionCells: () => selected,
        isSelectionEmpty: () => selected.length === 0,
        convertValueToString: (cell: FakeCell) => cell.value,
    }
    attachEditor(
        { ...source("ui"), editor: { ...source("editor"), graph } },
        {
            mxEvent: {
                CHANGE: "change",
                SCALE: "scale",
                TRANSLATE: "translate",
                SCALE_AND_TRANSLATE: "scaleAndTranslate",
            },
        },
    )
    return {
        select: (cells: FakeCell[]) => {
            selected = cells
        },
        /** draw.io reports a change to the diagram */
        changeDiagram: () => listeners.get("model:change")?.(),
    }
}

describe("the selection in the canvas store", () => {
    afterEach(() => detachEditor())

    it("stays the same array while the diagram changes around it", () => {
        const editor = attachFakeEditor()
        const nothing = useCanvasStore.getState().selection
        editor.changeDiagram()
        expect(useCanvasStore.getState().selection).toBe(nothing)

        editor.select([{ id: "a", value: "Service" }])
        editor.changeDiagram()
        const selection = useCanvasStore.getState().selection
        expect(selection).toEqual([
            { id: "a", label: "Service", isEdge: false },
        ])
        // A hand edit elsewhere, or a frame of a streaming preview
        editor.changeDiagram()
        expect(useCanvasStore.getState().selection).toBe(selection)
    })

    it("is a new array when the selected shape or its label changed", () => {
        const editor = attachFakeEditor()
        editor.select([{ id: "a", value: "Service" }])
        editor.changeDiagram()
        const selection = useCanvasStore.getState().selection

        editor.select([{ id: "a", value: "Gateway" }])
        editor.changeDiagram()
        const renamed = useCanvasStore.getState().selection
        expect(renamed).not.toBe(selection)
        expect(renamed[0].label).toBe("Gateway")

        editor.select([{ id: "b", value: "Gateway" }])
        editor.changeDiagram()
        expect(useCanvasStore.getState().selection[0].id).toBe("b")
    })
})
