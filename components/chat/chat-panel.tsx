import {
    ChevronDown,
    Download,
    MessageSquareDashed,
    PanelRightClose,
    Settings2,
    SquarePen,
} from "lucide-react"
import { useRef } from "react"
import { DevXmlSimulator } from "@/components/dev-xml-simulator"
import { BrandMark } from "@/components/workspace/brand-mark"
import { IconButton } from "@/components/workspace/icon-button"
import { useDiagram } from "@/contexts/diagram-context"
import { useDictionary } from "@/hooks/use-dictionary"
import { usePanelWidth } from "@/hooks/use-panel-width"
import { modKey } from "@/lib/platform"
import { cn } from "@/lib/utils"
import {
    PANEL_MAX_WIDTH,
    PANEL_MIN_WIDTH,
    useSettingsStore,
} from "@/stores/settings-store"
import { useUiStore } from "@/stores/ui-store"
import { useChatEngine } from "./chat-engine"
import { Composer } from "./composer"
import { MessageList } from "./message-list"
import { SessionMenu, useSessionTitle } from "./session-menu"
import { VersionStrip } from "./version-strip"

const DEBUG = process.env.NODE_ENV === "development"

/** Drag handle on the panel's left edge (the panel sits on the right) */
function ResizeHandle() {
    const panelWidth = usePanelWidth()
    const setPanelWidth = useSettingsStore((s) => s.setPanelWidth)
    const startRef = useRef<{ x: number; width: number } | null>(null)

    return (
        // biome-ignore lint/a11y/useSemanticElements: a draggable handle, not a divider line
        <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={panelWidth}
            aria-valuemin={PANEL_MIN_WIDTH}
            aria-valuemax={PANEL_MAX_WIDTH}
            tabIndex={-1}
            className="absolute top-4 -left-1.5 bottom-4 z-10 w-3 cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-foreground/0 after:transition-colors hover:after:bg-foreground/15"
            onPointerDown={(e) => {
                e.preventDefault()
                const panel = e.currentTarget.parentElement
                startRef.current = {
                    x: e.clientX,
                    width: panel?.getBoundingClientRect().width ?? 384,
                }
                e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
                const start = startRef.current
                if (!start) return
                // Dragging left widens the panel
                setPanelWidth(start.width - (e.clientX - start.x))
            }}
            onPointerUp={(e) => {
                startRef.current = null
                e.currentTarget.releasePointerCapture(e.pointerId)
            }}
        />
    )
}

function EmptyThread() {
    const dict = useDictionary()
    return (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <MessageSquareDashed className="size-5 text-faint" />
            <p className="max-w-60 text-[13px] text-muted-foreground">
                {dict.chat.emptyThread}
            </p>
        </div>
    )
}

/** The floating chat panel: header, versions, conversation, message box */
export function ChatPanel({
    mobile = false,
    onOpenFile,
}: {
    mobile?: boolean
    onOpenFile: () => void
}) {
    const dict = useDictionary()
    const engine = useChatEngine()
    const { loadDiagram, isDrawioReady } = useDiagram()
    const setSaveDialogOpen = useUiStore((s) => s.setSaveDialogOpen)
    const title = useSessionTitle()
    const panelWidth = usePanelWidth()
    const openSettings = useUiStore((s) => s.openSettings)
    const setPanelOpen = useUiStore((s) => s.setPanelOpen)

    return (
        <aside
            className={cn(
                "flex flex-col bg-card",
                mobile
                    ? "absolute inset-0"
                    : "absolute top-3 right-3 bottom-3 z-20 rounded-2xl shadow-float animate-panel-in",
            )}
            style={mobile ? undefined : { width: panelWidth }}
            aria-label={dict.nav.aiChat}
            data-testid="chat-panel"
        >
            <header className="flex h-[52px] shrink-0 items-center gap-1 pr-2 pl-3">
                <BrandMark />
                <SessionMenu onOpenFile={onOpenFile}>
                    <button
                        type="button"
                        className="ml-1 flex min-w-0 items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-accent"
                        data-testid="session-title"
                    >
                        <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                            {title}
                        </span>
                        <ChevronDown className="size-4 shrink-0 text-faint" />
                    </button>
                </SessionMenu>
                <div className="ml-auto flex items-center">
                    {isDrawioReady && (
                        <IconButton
                            label={dict.workspace.export}
                            onClick={() => setSaveDialogOpen(true)}
                            data-testid="export-button"
                        >
                            <Download />
                        </IconButton>
                    )}
                    <IconButton
                        label={dict.nav.newChat}
                        onClick={engine.newChat}
                        disabled={engine.isBusy}
                        data-testid="new-chat-button"
                    >
                        <SquarePen />
                    </IconButton>
                    <IconButton
                        label={dict.nav.settings}
                        onClick={() => openSettings()}
                        data-testid="settings-button"
                    >
                        <Settings2 />
                    </IconButton>
                    {!mobile && (
                        <IconButton
                            label={dict.nav.hidePanel}
                            shortcut={`${modKey}B`}
                            onClick={() => setPanelOpen(false)}
                        >
                            <PanelRightClose />
                        </IconButton>
                    )}
                </div>
            </header>

            <VersionStrip />

            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                {engine.messages.length > 0 ? <MessageList /> : <EmptyThread />}
            </div>

            {DEBUG && (
                <DevXmlSimulator
                    setMessages={engine.setMessages as any}
                    onDisplayChart={(xml) => loadDiagram(xml, true)}
                />
            )}

            <div className="shrink-0 p-2.5 pt-1">
                <Composer
                    placeholder={
                        engine.messages.length > 0 &&
                        engine.chatSelection.length === 0
                            ? dict.chat.placeholderFollowUp
                            : undefined
                    }
                />
            </div>

            {!mobile && <ResizeHandle />}
        </aside>
    )
}
