import { Redo2, RotateCcw, Undo2 } from "lucide-react"
import { Shimmer } from "@/components/ai-elements/shimmer"
import {
    useVersionsContext,
    type VersionItem,
} from "@/components/canvas/versions-context"
import { useDictionary } from "@/hooks/use-dictionary"
import { formatMessage } from "@/lib/i18n/utils"
import { cn } from "@/lib/utils"
import { describeChangeSummary, describeTotals } from "@/lib/version-text"
import { useUiStore } from "@/stores/ui-store"

/** Picture of a version (SVG data URL), or what stands in for it */
export function VersionThumb({
    svg,
    dimmed,
    className,
}: {
    /** undefined or null: still being made; "": none could be made */
    svg: string | null | undefined
    dimmed?: boolean
    className?: string
}) {
    const t = useDictionary().versions
    if (svg) {
        return (
            // biome-ignore lint/performance/noImgElement: data URL thumbnail
            <img
                src={svg}
                alt=""
                className={cn(
                    "object-contain transition-opacity",
                    dimmed && "opacity-40",
                    className,
                )}
            />
        )
    }
    if (svg === "") {
        return <span className="text-xs text-faint">{t.noPreview}</span>
    }
    return (
        <Shimmer as="span" className="text-xs">
            {t.rendering}
        </Shimmer>
    )
}

interface VersionCardProps extends React.ComponentProps<"div"> {
    version: VersionItem
    /** The newest version shows its picture; older ones fold into one row */
    isLatest: boolean
    /** What happened ("Drew the diagram"); an undone change says so instead */
    label: string
    /** Goes after the summary text (the chat adds its "Show XML" link) */
    afterSummary?: React.ReactNode
    /** Panel below the card (the chat shows the AI's XML there) */
    children?: React.ReactNode
}

/**
 * Card for one diagram version: picture, number, label, what changed, and
 * the action (undo or redo on the latest, restore on older ones). The
 * picture opens Compare. Other attributes go on the card's element.
 */
export function VersionCard({
    version,
    isLatest,
    label,
    afterSummary,
    children,
    className,
    ...rest
}: VersionCardProps) {
    const t = useDictionary().versions
    const source = useVersionsContext()
    const openCompare = useUiStore((s) => s.openCompare)

    const isUndone = source.undoneId === version.id
    const isOnCanvas = source.onCanvasId === version.id
    const title = isUndone ? t.undone : label
    const summary = version.fromScratch
        ? describeTotals(version.summary, t)
        : describeChangeSummary(version.summary, t)
    const badge = (
        <span
            className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                isOnCanvas
                    ? "bg-marker-soft text-marker-ink"
                    : "bg-muted text-muted-foreground",
            )}
        >
            v{version.number}
        </span>
    )
    const actionClass =
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
    const restoreButton = (
        <button
            type="button"
            disabled={source.isBusy || isOnCanvas}
            onClick={() => source.restore(version.id)}
            className={actionClass}
            data-testid="version-restore"
        >
            <RotateCcw className="size-3.5" />
            {formatMessage(t.restoreVersion, { n: version.number })}
        </button>
    )
    const summaryLine = (
        <div className="text-xs text-muted-foreground">
            {summary}
            {afterSummary}
        </div>
    )

    if (!isLatest) {
        return (
            <div
                className={cn(
                    "overflow-hidden rounded-xl border border-border bg-card",
                    className,
                )}
                data-testid="version-card"
                {...rest}
            >
                <div className="flex items-center gap-2.5 p-1.5 pr-2">
                    <button
                        type="button"
                        onClick={() => openCompare(version.id)}
                        className="sheet-light flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white hover:border-foreground/30"
                        aria-label={t.compare}
                        title={t.compare}
                    >
                        <VersionThumb
                            svg={version.svg}
                            className="max-h-8 max-w-[52px]"
                        />
                    </button>
                    {badge}
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] text-foreground">
                            {title}
                        </div>
                        {summaryLine}
                    </div>
                    {restoreButton}
                </div>
                {children}
            </div>
        )
    }

    // Undo and redo belong to the newest change while it is (or was) on
    // the canvas; after an older version was restored, this one is
    // restored too
    const canUndo = source.canUndo || source.canRedo
    return (
        <div
            className={cn(
                "overflow-hidden rounded-xl border border-border bg-card",
                isOnCanvas && "border-foreground/15",
                className,
            )}
            data-testid="version-card"
            {...rest}
        >
            <button
                type="button"
                onClick={() => openCompare(version.id)}
                className="group/thumb sheet-light relative flex h-24 w-full items-center justify-center border-b border-border bg-white"
                aria-label={t.compare}
            >
                <VersionThumb
                    svg={version.svg}
                    dimmed={isUndone}
                    className="max-h-20 max-w-[88%]"
                />
                <span className="absolute right-2 bottom-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white opacity-0 transition-opacity group-hover/thumb:opacity-100">
                    {t.compare}
                </span>
            </button>
            {/* Title row with the action; the summary runs under both */}
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3 py-2.5">
                {badge}
                <div className="truncate text-[13px] font-medium text-foreground">
                    {title}
                </div>
                {canUndo ? (
                    <button
                        type="button"
                        disabled={source.isBusy}
                        onClick={() =>
                            source.canRedo ? source.redo() : source.undo()
                        }
                        className={actionClass}
                        data-testid="version-undo"
                    >
                        {source.canRedo ? (
                            <Redo2 className="size-3.5" />
                        ) : (
                            <Undo2 className="size-3.5" />
                        )}
                        {source.canRedo ? t.redo : t.undo}
                    </button>
                ) : (
                    restoreButton
                )}
                <div className="col-span-2 col-start-2 mt-0.5">
                    {summaryLine}
                </div>
            </div>
            {children}
        </div>
    )
}
