import { useEffect, useRef } from "react"
import { useVersionsContext } from "@/components/canvas/versions-context"
import { useDictionary } from "@/hooks/use-dictionary"
import { cn } from "@/lib/utils"
import { useUiStore } from "@/stores/ui-store"

/** Row of version thumbnails under the panel header; click to compare */
export function VersionStrip({
    minVersions = 2,
}: {
    /** Hidden below this many versions: one version alone adds nothing to
     * its card, unless the caller knows there is no card for it */
    minVersions?: number
}) {
    const dict = useDictionary()
    const { versions, onCanvasId } = useVersionsContext()
    const openCompare = useUiStore((s) => s.openCompare)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Keep the newest version in view
    useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" })
    }, [versions.length])

    if (versions.length < minVersions) return null

    return (
        <div className="flex items-center gap-2 border-b border-border px-3.5 pt-1 pb-3">
            <span className="shrink-0 text-xs text-muted-foreground">
                {dict.versions.strip}
            </span>
            <div
                ref={scrollRef}
                className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto p-1 scrollbar-thin"
            >
                {versions.map((version) => {
                    const isCurrent = version.id === onCanvasId
                    return (
                        <button
                            key={version.id}
                            type="button"
                            onClick={() => openCompare(version.id)}
                            title={`v${version.number}${isCurrent ? ` · ${dict.versions.currentCanvas}` : ""}`}
                            className={cn(
                                "sheet-light relative flex h-12 w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white transition-colors hover:border-foreground/30",
                                // An outline with a gap reads on the white
                                // picture in both themes
                                isCurrent &&
                                    "outline-2 outline-offset-2 outline-foreground",
                            )}
                            data-testid="version-thumb"
                        >
                            {version.svg && (
                                // biome-ignore lint/performance/noImgElement: data URL thumbnail
                                <img
                                    src={version.svg}
                                    alt=""
                                    className="max-h-9 max-w-[62px] object-contain"
                                />
                            )}
                            <span
                                className={cn(
                                    "absolute bottom-0.5 left-1 text-[10px] font-medium tabular-nums text-neutral-500",
                                    isCurrent &&
                                        "font-semibold text-neutral-900",
                                )}
                            >
                                v{version.number}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
