import {
    ChevronDown,
    Download,
    FilePlus,
    LayoutGrid,
    MessageSquareDashed,
    PanelRightClose,
    Settings,
} from "lucide-react"
import { useRef } from "react"
import { VersionStrip } from "@/components/canvas/version-strip"
import { DevXmlSimulator } from "@/components/dev-xml-simulator"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { BrandMark } from "@/components/workspace/brand-mark"
import { ButtonTooltip, IconButton } from "@/components/workspace/icon-button"
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
import { useVersionsStore } from "@/stores/versions-store"
import { useChatEngine } from "./chat-engine"
import { Composer } from "./composer"
import { MessageList } from "./message-list"
import { SessionMenu, useSessionTitle } from "./session-menu"

const DEBUG = process.env.NODE_ENV === "development"

/** A header button with its name next to the icon */
const headerButtonClass =
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2 text-[13px] text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring [&_svg]:size-4 [&_svg]:stroke-[1.75] [&_svg]:text-muted-foreground"

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

    // Versions with no card in the chat: saved by older app versions, from
    // a turn that was retried, or drawn by a call that then failed its
    // screenshot check (a call still running gets its card when done). The
    // strip shows them even when there is only one.
    const versions = useVersionsStore((s) => s.versions)
    const hasCardless = versions.some(
        (v) =>
            !v.toolCallId ||
            !engine.messages.some((m) =>
                m.parts.some((p) => {
                    const part = p as { toolCallId?: string; state?: string }
                    return (
                        part.toolCallId === v.toolCallId &&
                        part.state !== "output-error"
                    )
                }),
            ),
    )

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
            <header className="@container flex h-[52px] shrink-0 items-center gap-1 pr-2 pl-3">
                <BrandMark />
                {/* The title, framed with a grid icon so it reads as the way
                    to the saved diagrams (its menu) */}
                <Tooltip>
                    <SessionMenu onOpenFile={onOpenFile}>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                className={cn(
                                    headerButtonClass,
                                    "ml-1 min-w-0 shrink",
                                )}
                                data-testid="session-title"
                            >
                                <LayoutGrid />
                                <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                                    {title}
                                </span>
                                <ChevronDown className="shrink-0" />
                            </button>
                        </TooltipTrigger>
                    </SessionMenu>
                    <TooltipContent side="bottom">
                        {dict.nav.diagrams}
                    </TooltipContent>
                </Tooltip>
                <div className="ml-auto flex shrink-0 items-center">
                    {isDrawioReady && (
                        // The tooltip of the buttons next to it, also for
                        // a narrow panel, where only the icon shows
                        <ButtonTooltip label={dict.workspace.export}>
                            <button
                                type="button"
                                onClick={() => setSaveDialogOpen(true)}
                                aria-label={dict.workspace.export}
                                className={cn(headerButtonClass, "border-0")}
                                data-testid="export-button"
                            >
                                <Download />
                                {/* The name only in a wide panel: the title
                                    needs the room at the default width */}
                                <span className="hidden @[480px]:inline">
                                    {dict.workspace.export}
                                </span>
                            </button>
                        </ButtonTooltip>
                    )}
                    <IconButton
                        label={dict.nav.newChat}
                        onClick={engine.newChat}
                        disabled={engine.isBusy}
                        data-testid="new-chat-button"
                    >
                        <FilePlus />
                    </IconButton>
                    <IconButton
                        label={dict.nav.settings}
                        onClick={() => openSettings()}
                        data-testid="settings-button"
                    >
                        <Settings />
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

            <VersionStrip minVersions={hasCardless ? 1 : 2} />

            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                {engine.messages.length > 0 ? <MessageList /> : <EmptyThread />}
            </div>

            {DEBUG && (
                <DevXmlSimulator
                    setMessages={engine.setMessages as any}
                    onDisplayChart={(xml) => loadDiagram(xml, true)}
                />
            )}

            <div className="shrink-0 px-4 pt-1 pb-3">
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
