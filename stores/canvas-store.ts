import { create } from "zustand"

export interface SelectedCell {
    id: string
    label: string
    isEdge: boolean
}

/** Rectangle relative to the draw.io iframe's top-left corner */
interface CanvasRect {
    x: number
    y: number
    width: number
    height: number
}

interface CanvasPage {
    id: string
    name: string
}

interface CanvasState {
    /** The page can call the draw.io editor directly (same-origin iframe) */
    hasEditor: boolean
    pages: CanvasPage[]
    currentPageId: string | null
    selection: SelectedCell[]
    selectionRect: CanvasRect | null
    /** Freehand drawing is on */
    isFreehand: boolean
    /** One of draw.io's menus or dialogs is open over the canvas */
    isDrawioPopupOpen: boolean
    set: (partial: Partial<Omit<CanvasState, "set">>) => void
}

export const useCanvasStore = create<CanvasState>((set) => ({
    hasEditor: false,
    pages: [],
    currentPageId: null,
    selection: [],
    selectionRect: null,
    isFreehand: false,
    isDrawioPopupOpen: false,
    set: (partial) => set(partial),
}))
