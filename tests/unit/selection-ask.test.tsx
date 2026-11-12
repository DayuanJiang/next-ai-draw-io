// Where the buttons next to a selection go, on a canvas 1000 px wide
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SelectionAsk } from "@/components/canvas/selection-ask"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DictionaryProvider } from "@/hooks/use-dictionary"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import en from "@/lib/i18n/dictionaries/en.json"
import { useCanvasStore } from "@/stores/canvas-store"
import { useUiStore } from "@/stores/ui-store"

vi.mock("@/lib/drawio/editor-bridge", () => ({ openFormatPanel: vi.fn() }))

afterEach(cleanup)

/** The bar's left and top for a 200 x 100 shape at x, y */
function barFor(x: number, y: number) {
    useCanvasStore.getState().set({
        selectionRect: { x, y, width: 200, height: 100 },
        selection: [{ id: "a", label: "A", isEdge: false }],
    })
    // With the chat panel hidden the bar has both buttons: 68 px wide
    useUiStore.setState({ panelOpen: false })
    const { getByTestId } = render(
        <DictionaryProvider dictionary={en as unknown as Dictionary}>
            <TooltipProvider>
                <SelectionAsk width={1000} height={800} />
            </TooltipProvider>
        </DictionaryProvider>,
    )
    const bar = getByTestId("selection-ask").parentElement as HTMLElement
    return {
        left: Number.parseFloat(bar.style.left),
        top: Number.parseFloat(bar.style.top),
    }
}

describe("the buttons next to a selection", () => {
    it("sit above the selection, past draw.io's rotation handle", () => {
        // The handle is outside the top right corner, within 34 px of it
        expect(barFor(300, 200)).toEqual({ left: 300 + 200 + 34, top: 158 })
    })

    it("go below the selection when the canvas ends before that place", () => {
        // Above, they would be moved left, onto the handle
        expect(barFor(760, 200)).toEqual({ left: 924, top: 200 + 100 + 10 })
    })

    it("go below a selection near the top of the canvas", () => {
        expect(barFor(300, 60)).toEqual({ left: 534, top: 170 })
    })

    it("go above a selection in the bottom right corner, up to its right edge", () => {
        // No room past the handle, and below they would be moved up, onto
        // the shape (y 650 to 750): they end where the shape does, at 960
        expect(barFor(760, 650)).toEqual({ left: 960 - 68, top: 608 })
    })
})
