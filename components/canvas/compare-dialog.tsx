import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { VersionThumb } from "@/components/canvas/version-card"
import { useVersionsContext } from "@/components/canvas/versions-context"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { useDiagram } from "@/contexts/diagram-context"
import { useDictionary } from "@/hooks/use-dictionary"
import { cellLabels, diffDiagrams, isSameDocument } from "@/lib/diagram-diff"
import { formatMessage } from "@/lib/i18n/utils"
import { describeChangeSummary } from "@/lib/version-text"
import { useUiStore } from "@/stores/ui-store"

// Changed shapes named under the summary; more are counted
const MAX_NAMES = 5

function Sheet({
    label,
    svg,
}: {
    label: string
    svg: string | null | undefined
}) {
    return (
        <figure className="flex min-w-0 flex-1 flex-col gap-2">
            <figcaption className="text-xs font-medium text-muted-foreground">
                {label}
            </figcaption>
            <div className="sheet-light flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl border border-border bg-white p-2">
                <VersionThumb svg={svg} className="max-h-full max-w-full" />
            </div>
        </figure>
    )
}

/** A saved version next to the current canvas, with restore */
export function CompareDialog() {
    const dict = useDictionary()
    const t = dict.versions
    const { versions, isBusy, restore } = useVersionsContext()
    const { getVersionSvg, chartXML } = useDiagram()
    const versionId = useUiStore((s) => s.compareVersionId)
    const openCompare = useUiStore((s) => s.openCompare)
    const closeCompare = useUiStore((s) => s.closeCompare)
    const [currentSvg, setCurrentSvg] = useState<string | null>(null)

    const index = versions.findIndex((v) => v.id === versionId)
    const version = index >= 0 ? versions[index] : null

    // Whether the canvas is this version, on every page
    const same = useMemo(
        () => !version || isSameDocument(version.xml, chartXML),
        [version, chartXML],
    )
    // What the canvas has changed since this version on the page it was
    // made on (null: nothing there), and the labels of the shapes and
    // connectors added or changed
    const changes = useMemo(() => {
        if (!version || same) return null
        const { summary, touchedIds } = diffDiagrams(
            version.xml,
            chartXML,
            version.pageId,
        )
        if (!Object.values(summary).some((n) => n > 0)) return null
        return {
            summary,
            names: cellLabels(chartXML, touchedIds, version.pageId),
        }
    }, [version, chartXML, same])
    const shownNames = changes?.names.slice(0, MAX_NAMES) ?? []
    const moreNames = (changes?.names.length ?? 0) - shownNames.length

    // The version went away (dropped as the oldest, another chat): the
    // dialog closes, and nothing waits for its Escape
    useEffect(() => {
        if (versionId && !version) closeCompare()
    }, [versionId, version, closeCompare])

    // Picture of the canvas as it is now, taken again once an answer that
    // was running is done ("" when none could be made)
    useEffect(() => {
        if (!versionId) return
        let cancelled = false
        setCurrentSvg(null)
        getVersionSvg().then((svg) => {
            if (!cancelled) setCurrentSvg(svg ?? "")
        })
        return () => {
            cancelled = true
        }
    }, [versionId, isBusy])

    return (
        <Dialog
            open={!!version}
            onOpenChange={(open) => !open && closeCompare()}
        >
            <DialogContent className="gap-5 sm:max-w-4xl xl:max-w-6xl">
                <DialogHeader>
                    <DialogTitle>{t.compareTitle}</DialogTitle>
                    <DialogDescription>
                        {!version
                            ? ""
                            : same
                              ? t.isOnCanvas
                              : changes
                                ? `${formatMessage(t.compareSince, { n: version.number })} ${describeChangeSummary(changes.summary, t)}`
                                : formatMessage(t.differsElsewhere, {
                                      n: version.number,
                                  })}
                    </DialogDescription>
                    {shownNames.length > 0 && (
                        <p
                            className="text-sm text-muted-foreground"
                            data-testid="compare-names"
                        >
                            {formatMessage(
                                moreNames > 0
                                    ? t.changedNamesMore
                                    : t.changedNames,
                                {
                                    names: shownNames.join(t.listSeparator),
                                    n: moreNames,
                                },
                            )}
                        </p>
                    )}
                </DialogHeader>
                {version && (
                    <div className="flex flex-col gap-4 sm:flex-row">
                        <Sheet
                            label={formatMessage(t.versionLabel, {
                                n: version.number,
                            })}
                            svg={version.svg}
                        />
                        <Sheet label={t.currentCanvas} svg={currentSvg} />
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={index <= 0}
                        onClick={() => openCompare(versions[index - 1].id)}
                        className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
                        aria-label={t.previous}
                    >
                        <ChevronLeft className="size-4" />
                    </button>
                    <button
                        type="button"
                        disabled={index < 0 || index >= versions.length - 1}
                        onClick={() => openCompare(versions[index + 1].id)}
                        className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
                        aria-label={t.next}
                    >
                        <ChevronRight className="size-4" />
                    </button>
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {index + 1} / {versions.length}
                    </span>
                    <button
                        type="button"
                        disabled={!version || same || isBusy}
                        onClick={() => {
                            if (!version) return
                            restore(version.id)
                            closeCompare()
                        }}
                        className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
                        data-testid="compare-restore"
                    >
                        <RotateCcw className="size-4" />
                        {formatMessage(t.restoreVersion, {
                            n: version?.number ?? 0,
                        })}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
