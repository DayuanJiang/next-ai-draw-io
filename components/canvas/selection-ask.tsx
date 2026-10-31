import { Paintbrush, Sparkles } from "lucide-react"
import { ButtonTooltip } from "@/components/workspace/icon-button"
import { useDictionary } from "@/hooks/use-dictionary"
import { openFormatPanel } from "@/lib/drawio/editor-bridge"
import { isMac, modKey } from "@/lib/platform"
import { useCanvasStore } from "@/stores/canvas-store"
import { useUiStore } from "@/stores/ui-store"

const BUTTON_HEIGHT = 32
const BUTTON_WIDTH = 32
const GAP = 10

const iconButton =
    "flex h-full w-8 items-center justify-center rounded-xl transition-colors hover:bg-interactive-hover"

/**
 * Buttons next to the selected shapes. "Edit style" opens draw.io's format
 * panel, for changing colors by hand; it hides while the panel is open.
 * "Ask AI to change this" shows only while the chat panel is hidden (with
 * the panel open, the selection already shows as a chip in its input): it
 * opens the panel and moves focus to the input. Hidden while an answer is
 * changing the canvas.
 */
export function SelectionAsk({
    width,
    height,
}: {
    /** Size of the canvas area, for keeping the buttons inside it */
    width: number
    height: number
}) {
    const dict = useDictionary()
    const rect = useCanvasStore((s) => s.selectionRect)
    const selection = useCanvasStore((s) => s.selection)
    const isFreehand = useCanvasStore((s) => s.isFreehand)
    const isFormatOpen = useCanvasStore((s) => s.isFormatOpen)
    const popupOpen = useCanvasStore((s) => s.isDrawioPopupOpen)
    const isBusy = useCanvasStore((s) => s.isBusy)
    const focusComposer = useUiStore((s) => s.focusComposer)
    const panelOpen = useUiStore((s) => s.panelOpen)

    const showAsk = !panelOpen
    const showStyle = !isFormatOpen
    if (isBusy || popupOpen || !rect || selection.length === 0 || isFreehand) {
        return null
    }
    if (!showAsk && !showStyle) return null
    // Selection scrolled out of view
    if (
        rect.x + rect.width < 0 ||
        rect.y + rect.height < 0 ||
        rect.x > width ||
        rect.y > height
    ) {
        return null
    }

    // Above the selection, starting past its right edge (connectors from
    // above end at the middle of its top), kept inside the canvas
    const barWidth = (showAsk && showStyle ? 2 : 1) * BUTTON_WIDTH + 4
    const left = Math.min(
        Math.max(8, rect.x + rect.width + GAP),
        width - barWidth - 8,
    )
    const above = rect.y - BUTTON_HEIGHT - GAP
    const top =
        above > 64
            ? above
            : Math.min(rect.y + rect.height + GAP, height - BUTTON_HEIGHT - 72)

    return (
        <div
            className="pointer-events-auto absolute z-10 flex h-8 items-center rounded-xl bg-card text-foreground shadow-pop animate-fade-in"
            style={{ left, top }}
        >
            {showAsk && (
                <ButtonTooltip
                    label={dict.workspace.askAi}
                    shortcut={`${modKey}/`}
                    side="top"
                >
                    <button
                        type="button"
                        onClick={focusComposer}
                        className={iconButton}
                        aria-label={dict.workspace.askAi}
                        data-testid="selection-ask"
                    >
                        <Sparkles className="size-4 text-marker-ink" />
                    </button>
                </ButtonTooltip>
            )}
            {showAsk && showStyle && (
                <span className="h-4 w-px bg-border" aria-hidden />
            )}
            {showStyle && (
                <ButtonTooltip
                    label={dict.workspace.editStyle}
                    shortcut={isMac ? "⌘⇧P" : "Ctrl+Shift+P"}
                    side="top"
                >
                    <button
                        type="button"
                        onClick={openFormatPanel}
                        className={iconButton}
                        aria-label={dict.workspace.editStyle}
                        data-testid="selection-style"
                    >
                        <Paintbrush className="size-4 text-muted-foreground" />
                    </button>
                </ButtonTooltip>
            )}
        </div>
    )
}
