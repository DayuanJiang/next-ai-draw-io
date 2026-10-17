import { useDictionary } from "@/hooks/use-dictionary"
import {
    highlightChangedCells,
    useFadedOutline,
} from "@/lib/drawio/editor-bridge"

/**
 * After the outline of an AI change faded, a note at the top of the canvas
 * says it was there, with a button to show it again. The editor bridge ends
 * it after a few seconds, or on a click on the canvas.
 */
export function OutlineOffer() {
    const t = useDictionary().versions
    const { ids, pageId, top, middle } = useFadedOutline()
    return (
        // A status region that stays in place, so screen readers announce
        // the note when it appears; it lets clicks through to the canvas
        <div role="status" className="pointer-events-none absolute inset-0">
            {ids && (
                // At the top of draw.io's drawing area, below its toolbars
                <div
                    className="pointer-events-auto absolute left-1/2 z-10 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 rounded-2xl bg-card py-1 pr-1 pl-3.5 text-xs text-muted-foreground shadow-pop animate-fade-in"
                    style={{ top: top + 8, left: middle ?? undefined }}
                    data-testid="outline-offer"
                >
                    <span>{t.outlineFaded}</span>
                    <button
                        type="button"
                        // The page it was on is still on screen (another
                        // page ends this offer)
                        onClick={() =>
                            highlightChangedCells(ids, pageId, {
                                navigate: false,
                            })
                        }
                        className="h-6 shrink-0 rounded-full bg-muted px-2.5 font-medium text-foreground hover:bg-accent"
                    >
                        {t.showAgain}
                    </button>
                </div>
            )}
        </div>
    )
}
