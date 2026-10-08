"use client"

import { MessageSquare, PanelRightOpen, Settings2, Shapes } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { CanvasStage } from "@/components/canvas/canvas-stage"
import {
    ChatEngineProvider,
    useChatEngine,
} from "@/components/chat/chat-engine"
import { ChatPanel } from "@/components/chat/chat-panel"
import { CompareDialog } from "@/components/chat/compare-dialog"
import { LobbyHero } from "@/components/chat/lobby-hero"
import { SaveDialog } from "@/components/save-dialog"
import { SettingsDialog } from "@/components/settings-dialog"
import { BrandMark } from "@/components/workspace/brand-mark"
import { IconButton } from "@/components/workspace/icon-button"
import { useDiagram } from "@/contexts/diagram-context"
import { useDictionary } from "@/hooks/use-dictionary"
import { usePanelWidth } from "@/hooks/use-panel-width"
import { setAppShortcutHandler } from "@/lib/drawio/editor-bridge"
import { i18n, type Locale } from "@/lib/i18n/config"
import { modKey } from "@/lib/platform"
import { STORAGE_KEYS } from "@/lib/storage"
import { cn, isRealDiagram } from "@/lib/utils"
import { useSettingsStore } from "@/stores/settings-store"
import { useUiStore } from "@/stores/ui-store"
import { useVersionsStore } from "@/stores/versions-store"

/** File types the "Open .drawio file" picker accepts */
const DIAGRAM_FILE_ACCEPT = ".drawio,.xml,.svg,application/xml,image/svg+xml"

const MOBILE_BREAKPOINT = 768
// Gap between the floating panel and the window edge
const PANEL_GAP = 12

function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false)
    useEffect(() => {
        const query = window.matchMedia(
            `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
        )
        const update = () => setIsMobile(query.matches)
        update()
        query.addEventListener("change", update)
        return () => query.removeEventListener("change", update)
    }, [])
    return isMobile
}

/** Restore the language picked last time (the URL may say otherwise) */
function useSavedLocale() {
    const router = useRouter()
    const pathname = usePathname()
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEYS.locale)
        if (!saved || !i18n.locales.includes(saved as Locale)) return
        const parts = pathname.split("/").filter(Boolean)
        if (parts[0] === saved) return
        parts[0] = saved
        const { search, hash } = window.location
        router.replace(`/${parts.join("/")}${search}${hash}`)
    }, [])
}

/** The diagram's title as a file name, or diagram-YYYY-MM-DD without one */
export function exportFilename(title: string | null): string {
    const name = (title && title !== "New Chat" ? title : "")
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80)
    // Local date (toISOString would give UTC)
    return name || `diagram-${new Date().toLocaleDateString("sv-SE")}`
}

/** App name and settings button above the start screen */
function StartBar({
    className,
    nameClassName,
}: {
    className: string
    nameClassName: string
}) {
    const dict = useDictionary()
    const openSettings = useUiStore((s) => s.openSettings)
    return (
        <div className={className}>
            <BrandMark className="size-6" />
            <span
                className={cn(
                    "text-[13px] font-semibold tracking-[-0.01em]",
                    nameClassName,
                )}
            >
                Next AI Draw.io
            </span>
            <IconButton
                label={dict.nav.settings}
                onClick={() => openSettings()}
                data-testid="settings-button"
            >
                <Settings2 />
            </IconButton>
        </div>
    )
}

/** The whole editor: canvas, chat panel, dialogs */
export function Workspace() {
    const hydrate = useSettingsStore((s) => s.hydrate)
    useEffect(() => {
        hydrate()
    }, [hydrate])
    useSavedLocale()

    return (
        <ChatEngineProvider>
            <WorkspaceLayout />
        </ChatEngineProvider>
    )
}

function WorkspaceLayout() {
    const dict = useDictionary()
    const engine = useChatEngine()
    const { chartXML, saveDiagramToFile } = useDiagram()
    const isMobile = useIsMobile()
    const panelWidth = usePanelWidth()
    const {
        panelOpen,
        togglePanel,
        setPanelOpen,
        mobileView,
        setMobileView,
        focusComposer,
        saveDialogOpen,
        setSaveDialogOpen,
    } = useUiStore()
    const heroDismissed = useUiStore((s) => s.heroDismissed)
    const setHeroDismissed = useUiStore((s) => s.setHeroDismissed)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Start screen: nothing said and nothing drawn yet. A new chat brings
    // it back, an opened file or saved chat puts it away (the chat engine).
    const showHero =
        engine.isRestored &&
        engine.messages.length === 0 &&
        !engine.isResending &&
        !isRealDiagram(chartXML) &&
        !heroDismissed

    // Phones: show the canvas while the AI draws and when a new version
    // lands, so the result is visible; the chat tab gets a dot meanwhile
    const isBusy = engine.isBusy
    const versionCount = useVersionsStore((s) => s.versions.length)
    const [chatUnread, setChatUnread] = useState(false)
    const lastVersionCountRef = useRef(versionCount)
    useEffect(() => {
        if (isMobile && isBusy) setMobileView("canvas")
    }, [isMobile, isBusy, setMobileView])
    useEffect(() => {
        const grew = versionCount > lastVersionCountRef.current
        lastVersionCountRef.current = versionCount
        if (isMobile && grew && engine.isRestored) {
            setMobileView("canvas")
            setChatUnread(true)
        }
    }, [versionCount, isMobile, engine.isRestored, setMobileView])
    useEffect(() => {
        if (mobileView === "chat") setChatUnread(false)
    }, [mobileView])

    // ⌘B toggles the panel; ⌘/ asks the AI about the selection
    useEffect(() => {
        const handle = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey)) return false
            // ⌘⇧B stays with the browser (Chrome's bookmarks bar)
            if (!event.shiftKey && (event.key === "b" || event.key === "B")) {
                if (isMobile) return false
                togglePanel()
                return true
            }
            if (event.key === "/") {
                setHeroDismissed(true)
                focusComposer()
                return true
            }
            return false
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (handle(event)) event.preventDefault()
        }
        // draw.io takes focus when it (re)loads, e.g. after a language
        // switch; Escape typed there must still close our dialogs.
        // ⌘B stays with draw.io in the canvas (bold, and ⇧ for to back).
        const handleInFrame = (event: KeyboardEvent) => {
            if (event.key === "b" || event.key === "B") return false
            if (event.key === "Escape") {
                const ui = useUiStore.getState()
                if (
                    ui.settingsOpen ||
                    ui.compareVersionId ||
                    ui.saveDialogOpen
                ) {
                    ui.setSettingsOpen(false)
                    ui.closeCompare()
                    ui.setSaveDialogOpen(false)
                    return true
                }
            }
            return handle(event)
        }
        window.addEventListener("keydown", onKeyDown)
        setAppShortcutHandler(handleInFrame)
        return () => {
            window.removeEventListener("keydown", onKeyDown)
            setAppShortcutHandler(null)
        }
    }, [isMobile, togglePanel, focusComposer])

    const openFile = () => fileInputRef.current?.click()
    const dismissHero = () => {
        setHeroDismissed(true)
        setPanelOpen(true)
    }

    const panelVisible = !isMobile && !showHero && panelOpen
    // The canvas edge slides with the panel as it opens or closes; a window
    // resize or a dragged panel edge moves it at once. Set in the render
    // that changes the edge, so the transition applies to that change.
    const [sliding, setSliding] = useState(false)
    const [lastPanelVisible, setLastPanelVisible] = useState(panelVisible)
    if (lastPanelVisible !== panelVisible) {
        setLastPanelVisible(panelVisible)
        setSliding(true)
    }
    useEffect(() => {
        if (!sliding) return
        const timer = setTimeout(() => setSliding(false), 400)
        return () => clearTimeout(timer)
    }, [sliding])
    // The panel floats on the right; the canvas ends where it begins
    const canvasRight = panelVisible ? panelWidth + PANEL_GAP * 2 : 0

    return (
        <div
            className="fixed inset-0 overflow-hidden bg-canvas"
            data-testid="workspace"
        >
            {/* One canvas for both layouts: a new one would reload draw.io
                and lose its undo history */}
            <div className="absolute inset-0 flex flex-col">
                <div className="relative min-h-0 flex-1">
                    <CanvasStage
                        className={
                            isMobile
                                ? cn(
                                      "inset-0",
                                      mobileView !== "canvas" && "invisible",
                                  )
                                : cn(
                                      "inset-y-0 left-0",
                                      sliding &&
                                          "transition-[right] duration-300 ease-[var(--ease-out)]",
                                  )
                        }
                        style={isMobile ? undefined : { right: canvasRight }}
                        hideOverlays={!isMobile && showHero}
                    />
                    {isMobile ? (
                        mobileView === "chat" &&
                        (showHero ? (
                            <div className="absolute inset-0 overflow-y-auto bg-canvas">
                                <StartBar
                                    className="flex items-center gap-2 px-4 pt-3"
                                    nameClassName="mr-auto"
                                />
                                <LobbyHero
                                    compact
                                    onOpenFile={openFile}
                                    onDrawYourself={() => {
                                        setHeroDismissed(true)
                                        setMobileView("canvas")
                                    }}
                                />
                            </div>
                        ) : (
                            <ChatPanel mobile onOpenFile={openFile} />
                        ))
                    ) : (
                        <>
                            {panelVisible && (
                                <ChatPanel onOpenFile={openFile} />
                            )}

                            {/* Below draw.io's toolbar (50 px), whose
                                right-hand buttons it would cover */}
                            {!showHero && !panelOpen && (
                                <div className="absolute top-[60px] right-3 z-20 flex items-center gap-1 rounded-xl bg-card p-1 shadow-float animate-fade-in">
                                    <BrandMark className="mx-0.5 size-6" />
                                    <IconButton
                                        label={dict.nav.showPanel}
                                        shortcut={`${modKey}B`}
                                        onClick={() => setPanelOpen(true)}
                                        data-testid="show-panel"
                                    >
                                        <PanelRightOpen />
                                    </IconButton>
                                </div>
                            )}

                            {showHero && (
                                <>
                                    <div className="absolute inset-0 z-10 overflow-y-auto bg-canvas">
                                        <div className="flex min-h-full items-center">
                                            <LobbyHero
                                                onOpenFile={openFile}
                                                onDrawYourself={dismissHero}
                                            />
                                        </div>
                                    </div>
                                    <StartBar
                                        className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-xl bg-card py-1 pr-1 pl-1.5 shadow-float"
                                        nameClassName="pr-1"
                                    />
                                </>
                            )}
                        </>
                    )}
                </div>
                {isMobile && (
                    <nav className="flex shrink-0 items-center justify-center gap-1 border-t border-border bg-card px-3 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))]">
                        {(
                            [
                                {
                                    view: "canvas",
                                    label: dict.workspace.mobileCanvas,
                                    icon: <Shapes />,
                                },
                                {
                                    view: "chat",
                                    label: dict.workspace.mobileChat,
                                    icon: <MessageSquare />,
                                },
                            ] as const
                        ).map((item) => (
                            <button
                                key={item.view}
                                type="button"
                                onClick={() => setMobileView(item.view)}
                                aria-pressed={mobileView === item.view}
                                className={cn(
                                    "flex h-10 flex-1 items-center justify-center gap-2 rounded-xl text-[13px] text-muted-foreground [&_svg]:size-4",
                                    mobileView === item.view &&
                                        "bg-accent font-medium text-foreground",
                                )}
                            >
                                {item.icon}
                                {item.label}
                                {item.view === "chat" &&
                                    (isBusy || chatUnread) &&
                                    mobileView !== "chat" && (
                                        <span className="size-1.5 rounded-full bg-marker" />
                                    )}
                            </button>
                        ))}
                    </nav>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept={DIAGRAM_FILE_ACCEPT}
                className="hidden"
                onChange={(event) => {
                    // The opened diagram hides the start screen; a file
                    // that is not one leaves it
                    const file = event.target.files?.[0]
                    if (file) engine.openDiagramFile(file)
                    event.target.value = ""
                }}
            />

            <SettingsDialog />
            <CompareDialog />
            <SaveDialog
                open={saveDialogOpen}
                onOpenChange={setSaveDialogOpen}
                onSave={(filename, format) =>
                    saveDiagramToFile(
                        filename,
                        format,
                        engine.langfuseSessionId,
                        dict.save.savedSuccessfully,
                    )
                }
                defaultFilename={exportFilename(engine.currentTitle)}
            />
        </div>
    )
}
