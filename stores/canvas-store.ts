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

interface CanvasState {
    /** The page can call the draw.io editor directly (same-origin iframe) */
    hasEditor: boolean
    currentPageId: string | null
    selection: SelectedCell[]
    selectionRect: CanvasRect | null
    /** Freehand drawing is on */
    isFreehand: boolean
    /** draw.io's format panel (fill, line, text) is open */
    isFormatOpen: boolean
    /** One of draw.io's menus or dialogs is open over the canvas */
    isDrawioPopupOpen: boolean
    /** Something is changing the canvas (an answer streams in, a sync
     * runs): version actions and "ask AI" wait */
    isBusy: boolean
    set: (partial: Partial<Omit<CanvasState, "set">>) => void
}

export const useCanvasStore = create<CanvasState>((set) => ({
    hasEditor: false,
    currentPageId: null,
    selection: [],
    selectionRect: null,
    isFreehand: false,
    isFormatOpen: false,
    isDrawioPopupOpen: false,
    isBusy: false,
    set: (partial) => set(partial),
}))
