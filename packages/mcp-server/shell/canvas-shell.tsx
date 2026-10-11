import { Moon, Sun } from "lucide-react"
import { useMemo } from "react"
import { CanvasStage } from "@/components/canvas/canvas-stage"
import { CompareDialog } from "@/components/canvas/compare-dialog"
import { VersionStrip } from "@/components/canvas/version-strip"
import {
    VersionsProvider,
    type VersionsSource,
} from "@/components/canvas/versions-context"
import { AppToaster } from "@/components/workspace/app-toaster"
import { useDictionary } from "@/hooks/use-dictionary"
import type { DrawioSource } from "@/lib/drawio/drawio-config"
import { useSettingsStore } from "@/stores/settings-store"
import type { ShellConfig } from "./runtime-config"
import { setDark } from "./theme"
import { useMcpSync } from "./use-mcp-sync"

// No versions until the shell reads the server's History (a later step)
const NO_VERSIONS: VersionsSource = {
    versions: [],
    onCanvasId: null,
    undoneId: null,
    isBusy: false,
    canUndo: false,
    canRedo: false,
    restore: () => {},
    undo: () => {},
    redo: () => {},
}

/**
 * The MCP preview: the web app's canvas without the chat. A slim bar names
 * the session and the sync state; the versions strip and Compare come from
 * the shared canvas components.
 */
export function CanvasShell({ config }: { config: ShellConfig }) {
    const dict = useDictionary()
    const isDark = useSettingsStore((s) => s.isDark)
    const status = useMcpSync(config)
    const drawioSource = useMemo<DrawioSource>(
        () => ({
            editorUrl: config.drawioBaseUrl,
            ui: config.drawioUi || undefined,
            lang: config.drawioLang || undefined,
        }),
        [config],
    )

    return (
        <VersionsProvider value={NO_VERSIONS}>
            <div className="flex h-dvh flex-col bg-background text-foreground">
                <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface-0 px-3.5">
                    <span className="text-[13px] font-semibold tracking-[-0.01em]">
                        Next AI Draw.io
                    </span>
                    {config.sessionId && (
                        <span
                            className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground tabular-nums"
                            title={config.sessionId}
                            data-testid="shell-session"
                        >
                            {config.sessionId.slice(-8)}
                        </span>
                    )}
                    <span
                        className="truncate text-xs text-muted-foreground"
                        data-testid="shell-status"
                        data-status={status}
                    >
                        {dict.shell[status]}
                    </span>
                    <button
                        type="button"
                        onClick={() => setDark(!isDark)}
                        aria-label={dict.shell.toggleTheme}
                        title={dict.shell.toggleTheme}
                        className="ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4"
                        data-testid="theme-toggle"
                    >
                        {isDark ? <Sun /> : <Moon />}
                    </button>
                </header>
                <VersionStrip minVersions={1} />
                <div className="relative flex-1">
                    <CanvasStage
                        className="inset-0"
                        drawioSource={drawioSource}
                    />
                </div>
                <CompareDialog />
                <AppToaster />
            </div>
        </VersionsProvider>
    )
}
