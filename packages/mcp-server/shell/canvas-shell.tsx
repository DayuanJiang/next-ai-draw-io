import { Download, History, Moon, Sun } from "lucide-react"
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
import { useNodeVersions } from "./node-versions-source"
import type { ShellConfig } from "./runtime-config"
import { setDark } from "./theme"
import { useMcpSync } from "./use-mcp-sync"
import { VersionsPanel } from "./versions-panel"

const iconButton =
    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4"

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
    const [panelOpen, setPanelOpen] = useState(true)
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
                                {file
                                    ? file.split(/[\\/]/).pop()
                                    : config.sessionId.split("-").pop() ||
                                      config.sessionId}
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
                        {dict.shell[status]}
                    </span>
                    {hasVersions && (
                        <button
                            type="button"
                            onClick={() => setPanelOpen((open) => !open)}
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
                    defaultFilename={`diagram-${new Date().toLocaleDateString("sv-SE")}`}
                />
                <AppToaster />
            </div>
        </VersionsProvider>
    )
}
