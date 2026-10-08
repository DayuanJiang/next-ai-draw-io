import { Sparkles } from "lucide-react"
import { useDictionary } from "@/hooks/use-dictionary"
import { modKey } from "@/lib/platform"
import { useCanvasStore } from "@/stores/canvas-store"
import { useUiStore } from "@/stores/ui-store"

const BUTTON_HEIGHT = 32
const GAP = 10

/**
 * "Ask AI to change this" next to the selected shapes. Clicking it moves
 * focus to the chat input, where the selection already shows as a chip.
 */
export function SelectionAsk({
    width,
    height,
    hidden,
}: {
    /** Size of the canvas area, for keeping the button inside it */
    width: number
    height: number
    hidden: boolean
}) {
    const dict = useDictionary()
    const rect = useCanvasStore((s) => s.selectionRect)
    const selection = useCanvasStore((s) => s.selection)
    const isFreehand = useCanvasStore((s) => s.isFreehand)
    const popupOpen = useCanvasStore((s) => s.isDrawioPopupOpen)
    const focusComposer = useUiStore((s) => s.focusComposer)

    if (hidden || popupOpen || !rect || selection.length === 0 || isFreehand) {
        return null
    }
    // Selection scrolled out of view
    if (
        rect.x + rect.width < 0 ||
        rect.y + rect.height < 0 ||
        rect.x > width ||
        rect.y > height
    ) {
        return null
    }

    // Above the selection's top-right corner, kept inside the canvas
    const approxWidth = 168
    const left = Math.min(
        Math.max(8, rect.x + rect.width - approxWidth / 2),
        width - approxWidth - 8,
    )
    const above = rect.y - BUTTON_HEIGHT - GAP
    const top =
        above > 64
            ? above
            : Math.min(rect.y + rect.height + GAP, height - BUTTON_HEIGHT - 72)

    return (
        <button
            type="button"
            onClick={focusComposer}
            className="pointer-events-auto absolute z-10 flex h-8 items-center gap-1.5 rounded-xl bg-card pr-2.5 pl-2 text-[13px] font-medium text-foreground shadow-pop transition-transform animate-fade-in hover:-translate-y-px"
            style={{ left, top }}
            data-testid="selection-ask"
        >
            <Sparkles className="size-4 text-marker-ink" />
            {dict.workspace.askAi}
            <kbd className="ml-1 font-sans text-[11px] text-muted-foreground">
                {modKey}/
            </kbd>
        </button>
    )
}
