import {
    Download,
    History,
    MessageSquareWarning,
    Moon,
    Sun,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { CanvasStage } from "@/components/canvas/canvas-stage"
import { CompareDialog } from "@/components/canvas/compare-dialog"
import { VersionsProvider } from "@/components/canvas/versions-context"
import { type ExportFormat, SaveDialog } from "@/components/save-dialog"
import { AppToaster } from "@/components/workspace/app-toaster"
import { useDiagram } from "@/contexts/diagram-context"
import { useDictionary } from "@/hooks/use-dictionary"
import type { DrawioSource } from "@/lib/drawio/drawio-config"
import { cn } from "@/lib/utils"
import { useSettingsStore } from "@/stores/settings-store"
import { feedbackIssueUrl } from "./feedback"
import { useNodeVersions } from "./node-versions-source"
import type { ShellConfig } from "./runtime-config"
import { setDark } from "./theme"
import { useMcpSync } from "./use-mcp-sync"
import { VersionsPanel } from "./versions-panel"

const iconButton =
    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4"

// localStorage key of the versions panel: "false" once the user hid it,
// kept for the next visit as the theme is (its prefix, see theme.ts)
const PANEL_STORAGE_KEY = "mcp:versions-panel"

function readPanelOpen(): boolean {
    try {
        return localStorage.getItem(PANEL_STORAGE_KEY) !== "false"
    } catch {
        return true
    }
}

/**
 * The MCP preview: the web app's canvas without the chat. A slim bar names
 * the session and the sync state; the version cards (from the server's
 * History), Compare and the export dialog come from the shared canvas
 * components. The cards sit in a side panel, so the web app's versions strip
 * above the canvas is left out: it would show the same list twice.
 */
export function CanvasShell({ config }: { config: ShellConfig }) {
    const dict = useDictionary()
    const isDark = useSettingsStore((s) => s.isDark)
    const { saveDiagramToFile, hasPendingLoad } = useDiagram()
    const { status, sync } = useMcpSync(config)
    const versions = useNodeVersions(sync)
    const [panelOpen, setPanelOpen] = useState(readPanelOpen)
    const togglePanel = () => {
        setPanelOpen(!panelOpen)
        try {
            localStorage.setItem(PANEL_STORAGE_KEY, String(!panelOpen))
        } catch {
            // Storage can be unavailable (private mode, quota)
        }
    }
    const [saveOpen, setSaveOpen] = useState(false)
    // The file the diagram was opened from or saved to (load_diagram,
    // export_diagram), named instead of the session id, and whether the
    // diagram changed since: the file changes only on export_diagram
    const [file, setFile] = useState<string | null>(null)
    const [fileChanged, setFileChanged] = useState(false)
    useEffect(() => {
        if (!sync) return
        const readFile = () => {
            setFile(sync.read().file)
            setFileChanged(sync.read().fileChanged)
        }
        readFile()
        return sync.onServerChange(readFile)
    }, [sync])
    const unsaved = !!file && fileChanged
    const fileName = file?.split(/[\\/]/).pop()
    const sessionCode = config.sessionId.split("-").pop() || config.sessionId
    // The tab is named after the file or the session, so the tabs of
    // several sessions can be told apart
    const tabName = fileName || sessionCode
    useEffect(() => {
        document.title = tabName
            ? `${tabName} | Next AI Draw.io`
            : "Next AI Draw.io"
    }, [tabName])
    const drawioSource = useMemo<DrawioSource>(
        () => ({
            editorUrl: config.drawioBaseUrl,
            ui: config.drawioUi || undefined,
            lang: config.drawioLang || undefined,
            // As the classic preview page: the user's own shape libraries
            libraries: true,
        }),
        [config],
    )
    const hasVersions = versions.versions.length > 0
    const showPanel = panelOpen && hasVersions

    // draw.io exports what it shows: while a page export's one-page
    // projection is on the canvas, or a full load has yet to reach the
    // editor, that is not the document. Both end within seconds (the
    // export's deadline is 15 s); the save waits for them, up to 20 s
    const save = (filename: string, format: ExportFormat, tries = 0) => {
        const canvasBusy = sync?.read().projectionActive || hasPendingLoad()
        if (canvasBusy && tries < 66) {
            setTimeout(() => save(filename, format, tries + 1), 300)
            return
        }
        saveDiagramToFile(
            filename,
            format,
            undefined,
            dict.save.savedSuccessfully,
            dict.save.exportFailed,
        )
    }

    return (
        <VersionsProvider value={versions}>
            <div className="flex h-dvh flex-col bg-background text-foreground">
                <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface-0 px-3.5">
                    <span className="text-[13px] font-semibold tracking-[-0.01em]">
                        Next AI Draw.io
                    </span>
                    {config.sessionId && (
                        <span
                            className={cn(
                                "flex min-w-0 max-w-[40%] gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground",
                                !file && "font-mono tabular-nums",
                            )}
                            title={
                                file
                                    ? `${file}\n${unsaved ? `${dict.shell.fileChangedHint}\n` : ""}${config.sessionId}`
                                    : config.sessionId
                            }
                            data-testid="shell-session"
                        >
                            <span className="truncate">
                                {fileName || sessionCode}
                            </span>
                            {unsaved && (
                                <span
                                    className="shrink-0"
                                    data-testid="shell-file-changed"
                                >
                                    · {dict.shell.fileChanged}
                                </span>
                            )}
                        </span>
                    )}
                    <span
                        className="truncate text-xs text-muted-foreground"
                        data-testid="shell-status"
                        data-status={status}
                    >
                        {/* Without a session nothing is synced, and waiting
                            longer brings none */}
                        {config.sessionId
                            ? dict.shell[status]
                            : dict.shell.noSession}
                    </span>
                    {hasVersions && (
                        <button
                            type="button"
                            onClick={togglePanel}
                            aria-label={
                                panelOpen
                                    ? dict.shell.hideVersions
                                    : dict.shell.showVersions
                            }
                            title={
                                panelOpen
                                    ? dict.shell.hideVersions
                                    : dict.shell.showVersions
                            }
                            aria-pressed={panelOpen}
                            className={cn(
                                iconButton,
                                "ml-auto",
                                panelOpen && "bg-accent text-foreground",
                            )}
                            data-testid="versions-toggle"
                        >
                            <History />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setSaveOpen(true)}
                        aria-label={dict.workspace.export}
                        title={dict.workspace.export}
                        className={cn(iconButton, !hasVersions && "ml-auto")}
                        data-testid="download"
                    >
                        <Download />
                    </button>
                    <a
                        href={feedbackIssueUrl(config, navigator.userAgent)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={dict.shell.feedback}
                        title={dict.shell.feedback}
                        className={iconButton}
                        data-testid="feedback"
                    >
                        <MessageSquareWarning />
                    </a>
                    <button
                        type="button"
                        onClick={() => setDark(!isDark)}
                        aria-label={dict.shell.toggleTheme}
                        title={dict.shell.toggleTheme}
                        className={iconButton}
                        data-testid="theme-toggle"
                    >
                        {isDark ? <Sun /> : <Moon />}
                    </button>
                </header>
                <div className="flex min-h-0 flex-1">
                    <div className="relative min-w-0 flex-1">
                        <CanvasStage
                            className="inset-0"
                            drawioSource={drawioSource}
                        />
                    </div>
                    {showPanel && (
                        <VersionsPanel versions={versions.versions} />
                    )}
                </div>
                <CompareDialog />
                <SaveDialog
                    open={saveOpen}
                    onOpenChange={setSaveOpen}
                    onSave={save}
                    // The file the header names, without its extension
                    // (.drawio, .drawio.svg); a diagram in no file is named
                    // by the date
                    defaultFilename={
                        fileName?.replace(/(\.drawio)?\.\w+$/, "") ||
                        `diagram-${new Date().toLocaleDateString("sv-SE")}`
                    }
                />
                <AppToaster />
            </div>
        </VersionsProvider>
    )
}
