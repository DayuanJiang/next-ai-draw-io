import {
    AlertCircle,
    Check,
    ChevronDown,
    Code2,
    Copy,
    Library,
    PenTool,
    Redo2,
    RotateCcw,
    Undo2,
} from "lucide-react"
import { useState } from "react"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { CodeBlock } from "@/components/code-block"
import { useDictionary } from "@/hooks/use-dictionary"
import { useCopy } from "@/lib/clipboard"
import { formatMessage } from "@/lib/i18n/utils"
import { cn, isMxCellXmlComplete } from "@/lib/utils"
import { describeChanges, describeTotals } from "@/lib/version-text"
import { useUiStore } from "@/stores/ui-store"
import { type DiagramVersion, useVersionsStore } from "@/stores/versions-store"
import { useChatEngine } from "./chat-engine"
import type { DiagramOperation, ToolPartLike } from "./types"

export function ToolInputDetails({ part }: { part: ToolPartLike }) {
    const { input, state } = part
    if (!input || typeof input !== "object") return null
    if (typeof input.xml === "string" && input.xml) {
        // Plain text while streaming; highlighting re-runs on every chunk
        return state === "input-streaming" || state === "input-available" ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-muted-foreground scrollbar-thin">
                {input.xml}
            </pre>
        ) : (
            <CodeBlock code={input.xml} language="xml" />
        )
    }
    if (Array.isArray(input.operations)) {
        // Streamed or invalid input can hold anything: show only what React
        // can render (an object in place of a string would crash the chat)
        const shown = (input.operations as DiagramOperation[]).filter(
            (op) =>
                typeof (op as { operation?: unknown })?.operation === "string",
        )
        const text = (value: unknown) =>
            typeof value === "string" ? value : ""
        return (
            <div className="space-y-2">
                {shown.map((op, index) => (
                    <div
                        key={`${op.operation}-${text(op.cell_id)}-${index}`}
                        className="overflow-hidden rounded-lg border border-border bg-card"
                    >
                        <div className="flex items-center gap-2 border-b border-border px-2.5 py-1 text-[11px]">
                            <span className="font-medium text-foreground">
                                {op.operation}
                            </span>
                            <span className="text-muted-foreground">
                                {text(op.cell_id)}
                            </span>
                        </div>
                        {text(op.new_xml) && (
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
                                {text(op.new_xml)}
                            </pre>
                        )}
                    </div>
                ))}
            </div>
        )
    }
    if (Object.keys(input).length === 0) return null
    return <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
}

function toolText(part: ToolPartLike): string {
    const { input } = part
    if (!input || typeof input !== "object") return ""
    if (typeof input.xml === "string" && input.xml) return input.xml
    if (Array.isArray(input.operations)) {
        return JSON.stringify(input.operations, null, 2)
    }
    return JSON.stringify(input, null, 2)
}

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

/**
 * Card for one diagram version produced by a tool call. The latest shows
 * its picture; older ones fold into one row (the picture opens Compare).
 */
function VersionCard({
    part,
    version,
    isLatest,
}: {
    part: ToolPartLike
    version: DiagramVersion
    isLatest: boolean
}) {
    const dict = useDictionary()
    const t = dict.versions
    const engine = useChatEngine()
    const undoneVersionId = useVersionsStore((s) => s.undoneVersionId)
    const onCanvasVersionId = useVersionsStore((s) => s.onCanvasVersionId)
    const openCompare = useUiStore((s) => s.openCompare)
    const [showCode, setShowCode] = useState(false)
    const { copied, copy } = useCopy()

    const isUndone = undoneVersionId === version.id
    const isOnCanvas = onCanvasVersionId === version.id
    const isEdit = part.type === "tool-edit_diagram"
    // Undo/redo belongs to the newest change while it is (or was) on the
    // canvas; after an older version was restored, this one is restored too
    const canUndo =
        isLatest && version.beforeXml !== undefined && (isOnCanvas || isUndone)
    const title = isUndone ? t.undone : isEdit ? t.edited : t.created
    const summary = version.fromScratch
        ? describeTotals(version.summary, t)
        : describeChanges(version.summary, t)
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
            disabled={engine.isBusy || isOnCanvas}
            onClick={() => engine.restoreVersion(version.id)}
            className={actionClass}
            data-testid="version-restore"
        >
            <RotateCcw className="size-3.5" />
            {formatMessage(t.restoreVersion, { n: version.number })}
        </button>
    )

    // What the AI wrote, on every card (main showed it on every tool call)
    const codeButton = (
        <button
            type="button"
            onClick={() => setShowCode((v) => !v)}
            aria-label={showCode ? t.hideCode : t.showCode}
            title={showCode ? t.hideCode : t.showCode}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        >
            <Code2 className="size-4" />
        </button>
    )
    const codePanel = showCode && (
        <div className="relative border-t border-border bg-surface-1 px-3 py-2.5">
            <button
                type="button"
                onClick={() => copy(toolText(part))}
                className="absolute top-2 right-2 z-10 inline-flex size-7 items-center justify-center rounded-lg bg-card text-muted-foreground shadow-float hover:text-foreground"
                aria-label={dict.chat.copyResponse}
            >
                {copied ? (
                    <Check className="size-3.5" />
                ) : (
                    <Copy className="size-3.5" />
                )}
            </button>
            <ToolInputDetails part={part} />
        </div>
    )

    if (!isLatest) {
        return (
            <div
                className="overflow-hidden rounded-xl border border-border bg-card"
                data-testid="version-card"
                data-tool-state={part.state}
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
                    <div className="min-w-0 flex-1" title={summary}>
                        <div className="truncate text-[13px] text-foreground">
                            {title}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                            {summary}
                        </div>
                    </div>
                    {codeButton}
                    {restoreButton}
                </div>
                {codePanel}
            </div>
        )
    }

    return (
        <div
            className={cn(
                "overflow-hidden rounded-xl border border-border bg-card",
                isOnCanvas && "border-foreground/15",
            )}
            data-testid="version-card"
            data-tool-state={part.state}
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
            <div className="flex items-center gap-2.5 px-3 py-2.5">
                {badge}
                <div className="min-w-0 flex-1" title={summary}>
                    <div className="truncate text-[13px] font-medium text-foreground">
                        {title}
                    </div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">
                        {summary}
                    </div>
                </div>
                {codeButton}
                {canUndo ? (
                    <button
                        type="button"
                        disabled={engine.isBusy}
                        onClick={() => engine.undoVersion(version.id)}
                        className={actionClass}
                        data-testid="version-undo"
                    >
                        {isUndone ? (
                            <Redo2 className="size-3.5" />
                        ) : (
                            <Undo2 className="size-3.5" />
                        )}
                        {isUndone ? t.redo : t.undo}
                    </button>
                ) : (
                    restoreButton
                )}
            </div>
            {codePanel}
        </div>
    )
}

/** Compact row for tool calls that are running, failed or produced no version */
function ToolRow({
    part,
    icon,
    label,
    tone = "default",
    detail,
}: {
    part: ToolPartLike
    icon: React.ReactNode
    label: React.ReactNode
    tone?: "default" | "error" | "warning"
    detail?: string
}) {
    const dict = useDictionary()
    const [open, setOpen] = useState(false)
    const { copied, copy } = useCopy()
    const hasInput = !!part.input && Object.keys(part.input).length > 0
    return (
        <div
            className={cn(
                "overflow-hidden rounded-xl border border-border bg-card",
                tone === "error" && "border-destructive/25",
            )}
            data-testid="tool-row"
            data-tool-name={part.type?.replace("tool-", "")}
            data-tool-state={part.state}
        >
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                disabled={!hasInput && !detail}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
            >
                <span
                    className={cn(
                        "inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4",
                        tone === "error" &&
                            "bg-destructive/10 text-destructive",
                        tone === "warning" && "bg-marker-soft text-marker-ink",
                    )}
                >
                    {icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                    {label}
                </span>
                {(hasInput || detail) && (
                    <ChevronDown
                        className={cn(
                            "size-4 shrink-0 text-muted-foreground transition-transform",
                            open && "rotate-180",
                        )}
                    />
                )}
            </button>
            {open && (
                <div
                    className={cn(
                        "relative space-y-2 border-t border-border bg-surface-1 px-3 py-2.5",
                        hasInput && "pr-11",
                    )}
                >
                    {hasInput && (
                        <button
                            type="button"
                            onClick={() => copy(toolText(part))}
                            className="absolute top-2 right-2 z-10 inline-flex size-7 items-center justify-center rounded-lg bg-card text-muted-foreground shadow-float hover:text-foreground"
                            aria-label={dict.chat.copyResponse}
                        >
                            {copied ? (
                                <Check className="size-3.5" />
                            ) : (
                                <Copy className="size-3.5" />
                            )}
                        </button>
                    )}
                    {detail && (
                        <p
                            className={cn(
                                "whitespace-pre-wrap break-words text-xs",
                                tone === "error"
                                    ? "text-destructive"
                                    : "text-muted-foreground",
                            )}
                        >
                            {detail}
                        </p>
                    )}
                    {hasInput && <ToolInputDetails part={part} />}
                </div>
            )}
        </div>
    )
}

export function ToolActivity({
    part,
    isLastMessage,
}: {
    part: ToolPartLike
    isLastMessage: boolean
}) {
    const dict = useDictionary()
    const t = dict.versions
    const engine = useChatEngine()
    const versions = useVersionsStore((s) => s.versions)
    const toolName = part.type?.replace("tool-", "")
    const { state, errorText, output } = part

    const versionIndex = versions.findIndex(
        (v) => v.toolCallId === part.toolCallId,
    )
    if (state === "output-available" && versionIndex >= 0) {
        return (
            <VersionCard
                part={part}
                version={versions[versionIndex]}
                isLatest={versionIndex === versions.length - 1}
            />
        )
    }

    // The answer ended before the call did (stopped, network error)
    const running = isLastMessage && engine.isBusy

    if (toolName === "get_shape_library" && state !== "output-error") {
        const isDone = state === "output-available"
        return (
            <ToolRow
                part={part}
                icon={<Library />}
                label={
                    isDone ? (
                        t.libraryLoaded
                    ) : running ? (
                        <Shimmer as="span">{t.loadingLibrary}</Shimmer>
                    ) : (
                        t.stopped
                    )
                }
                detail={
                    isDone && typeof output === "string"
                        ? `${output.slice(0, 600)}${output.length > 600 ? "…" : ""}`
                        : undefined
                }
            />
        )
    }

    // Stop turns a call still streaming into "Stopped by user" (right
    // away, or when the answer has ended for one not on screen yet): one
    // left like this was cut off (a closed connection, an error, a closed
    // tab)
    if (state === "input-streaming" || state === "input-available") {
        const failed = !running && !(isLastMessage && engine.stoppedRef.current)
        return (
            <ToolRow
                part={part}
                icon={running ? <PenTool /> : <AlertCircle />}
                tone={failed ? "error" : "default"}
                label={
                    running ? (
                        <Shimmer as="span">
                            {toolName === "edit_diagram"
                                ? t.editing
                                : t.drawing}
                        </Shimmer>
                    ) : failed ? (
                        t.failed
                    ) : (
                        t.stopped
                    )
                }
            />
        )
    }

    if (state === "output-error") {
        const stopped = errorText === "Stopped by user"
        // Incomplete XML means the output hit the length limit. Without an
        // input the JSON was broken (the server repairs JSON cut short by
        // the limit).
        const truncated =
            !stopped &&
            (toolName === "display_diagram" || toolName === "append_diagram") &&
            typeof part.input?.xml === "string" &&
            !isMxCellXmlComplete(part.input.xml)
        return (
            <ToolRow
                part={part}
                icon={<AlertCircle />}
                tone={stopped ? "default" : truncated ? "warning" : "error"}
                label={
                    stopped
                        ? t.stopped
                        : truncated
                          ? dict.tools.truncated
                          : isLastMessage && engine.isBusy
                            ? t.failedRetrying
                            : t.failed
                }
                detail={
                    stopped
                        ? undefined
                        : truncated
                          ? t.truncatedHint
                          : (errorText ??
                            (typeof output === "string" ? output : ""))
                }
            />
        )
    }

    // Finished without a version (sessions saved before versions existed)
    return (
        <ToolRow
            part={part}
            icon={<PenTool />}
            label={toolName === "edit_diagram" ? t.edited : t.created}
        />
    )
}
