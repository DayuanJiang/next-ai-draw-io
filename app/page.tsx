"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { DrawIoEmbed } from "react-drawio"
import type { ImperativePanelHandle } from "react-resizable-panels"
import ChatPanel from "@/components/chat-panel"
import { STORAGE_CLOSE_PROTECTION_KEY } from "@/components/settings-dialog"
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useDiagram } from "@/contexts/diagram-context"

const drawioBaseUrl =
    process.env.NEXT_PUBLIC_DRAWIO_BASE_URL || "https://embed.diagrams.net"

export default function Home() {
    const {
        drawioRef,
        handleDiagramExport,
        onDrawioLoad,
        resetDrawioReady,
        saveDiagramToStorage,
        showSaveDialog,
        setShowSaveDialog,
    } = useDiagram()
    const [isMobile, setIsMobile] = useState(false)
    const [isChatVisible, setIsChatVisible] = useState(true)
    const [drawioUi, setDrawioUi] = useState<"min" | "sketch">("min")
    const [darkMode, setDarkMode] = useState(false)
    const [isLoaded, setIsLoaded] = useState(false)
    const [closeProtection, setCloseProtection] = useState(false)

    const chatPanelRef = useRef<ImperativePanelHandle>(null)
    const isSavingRef = useRef(false)
    const mouseOverDrawioRef = useRef(false)
    const isMobileRef = useRef(false)

    // Reset saving flag when dialog closes (with delay to ignore lingering save events from draw.io)
    useEffect(() => {
        if (!showSaveDialog) {
            const timeout = setTimeout(() => {
                isSavingRef.current = false
            }, 1000)
            return () => clearTimeout(timeout)
        }
    }, [showSaveDialog])

    // Handle save from draw.io's built-in save button
    // Note: draw.io sends save events for various reasons (focus changes, etc.)
    // We use mouse position to determine if the user is interacting with draw.io
    const handleDrawioSave = useCallback(() => {
        if (!mouseOverDrawioRef.current) return
        if (isSavingRef.current) return
        isSavingRef.current = true
        setShowSaveDialog(true)
    }, [setShowSaveDialog])

    // Load preferences from localStorage after mount
    useEffect(() => {
        const savedUi = localStorage.getItem("drawio-theme")
        if (savedUi === "min" || savedUi === "sketch") {
            setDrawioUi(savedUi)
        }

        const savedDarkMode = localStorage.getItem("next-ai-draw-io-dark-mode")
        if (savedDarkMode !== null) {
            const isDark = savedDarkMode === "true"
            setDarkMode(isDark)
            document.documentElement.classList.toggle("dark", isDark)
        } else {
            const prefersDark = window.matchMedia(
                "(prefers-color-scheme: dark)",
            ).matches
            setDarkMode(prefersDark)
            document.documentElement.classList.toggle("dark", prefersDark)
        }

        const savedCloseProtection = localStorage.getItem(
            STORAGE_CLOSE_PROTECTION_KEY,
        )
        if (savedCloseProtection === "true") {
            setCloseProtection(true)
        }

        setIsLoaded(true)
    }, [])

    const handleDarkModeChange = async () => {
        await saveDiagramToStorage()
        const newValue = !darkMode
        setDarkMode(newValue)
        localStorage.setItem("next-ai-draw-io-dark-mode", String(newValue))
        document.documentElement.classList.toggle("dark", newValue)
        resetDrawioReady()
    }

    const handleDrawioUiChange = async () => {
        await saveDiagramToStorage()
        const newUi = drawioUi === "min" ? "sketch" : "min"
        localStorage.setItem("drawio-theme", newUi)
        setDrawioUi(newUi)
        resetDrawioReady()
    }

    // Check mobile - save diagram and reset draw.io before crossing breakpoint
    const isInitialRenderRef = useRef(true)
    useEffect(() => {
        const checkMobile = () => {
            const newIsMobile = window.innerWidth < 768
            // If crossing the breakpoint (not initial render), save diagram and reset draw.io
            if (
                !isInitialRenderRef.current &&
                newIsMobile !== isMobileRef.current
            ) {
                // Save diagram before remounting (fire and forget)
                saveDiagramToStorage().catch(() => {
                    // Ignore timeout errors during resize
                })
                // Reset draw.io ready state so onLoad triggers again after remount
                resetDrawioReady()
            }
            isMobileRef.current = newIsMobile
            isInitialRenderRef.current = false
            setIsMobile(newIsMobile)
        }

        checkMobile()
        window.addEventListener("resize", checkMobile)
        return () => window.removeEventListener("resize", checkMobile)
    }, [saveDiagramToStorage, resetDrawioReady])

    const toggleChatPanel = () => {
        const panel = chatPanelRef.current
        if (panel) {
            if (panel.isCollapsed()) {
                panel.expand()
                setIsChatVisible(true)
            } else {
                panel.collapse()
                setIsChatVisible(false)
            }
        }
    }

    // Keyboard shortcut for toggling chat panel
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "b") {
                event.preventDefault()
                toggleChatPanel()
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [])

    // Show confirmation dialog when user tries to leave the page
    useEffect(() => {
        if (!closeProtection) return

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            return ""
        }

        window.addEventListener("beforeunload", handleBeforeUnload)
        return () =>
            window.removeEventListener("beforeunload", handleBeforeUnload)
    }, [closeProtection])

    return (
        <div className="h-screen bg-background relative overflow-hidden">
            <ResizablePanelGroup
                id="main-panel-group"
                direction={isMobile ? "vertical" : "horizontal"}
                className="h-full"
            >
                {/* Draw.io Canvas */}
                <ResizablePanel
                    id="drawio-panel"
                    defaultSize={isMobile ? 50 : 67}
                    minSize={20}
                >
                    <div
                        className={`h-full relative ${
                            isMobile ? "p-1" : "p-2"
                        }`}
                        onMouseEnter={() => {
                            mouseOverDrawioRef.current = true
                        }}
                        onMouseLeave={() => {
                            mouseOverDrawioRef.current = false
                        }}
                    >
                        <div className="h-full rounded-xl overflow-hidden shadow-soft-lg border border-border/30">
                            {isLoaded ? (
                                <DrawIoEmbed
                                    key={`${drawioUi}-${darkMode}`}
                                    ref={drawioRef}
                                    onExport={handleDiagramExport}
                                    onLoad={onDrawioLoad}
                                    onSave={handleDrawioSave}
                                    baseUrl={drawioBaseUrl}
                                    urlParameters={{
                                        ui: drawioUi,
                                        spin: true,
                                        libraries: false,
                                        saveAndExit: false,
                                        noExitBtn: true,
                                        dark: darkMode,
                                    }}
                                />
                            ) : (
                                <div className="h-full w-full flex items-center justify-center bg-background">
                                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                                </div>
                            )}
                        </div>
                    </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Chat Panel */}
                <ResizablePanel
                    key={isMobile ? "mobile" : "desktop"}
                    id="chat-panel"
                    ref={chatPanelRef}
                    defaultSize={isMobile ? 50 : 33}
                    minSize={isMobile ? 20 : 15}
                    maxSize={isMobile ? 80 : 50}
                    collapsible={!isMobile}
                    collapsedSize={isMobile ? 0 : 3}
                    onCollapse={() => setIsChatVisible(false)}
                    onExpand={() => setIsChatVisible(true)}
                >
                    <div className={`h-full ${isMobile ? "p-1" : "py-2 pr-2"}`}>
                        <ChatPanel
                            isVisible={isChatVisible}
                            onToggleVisibility={toggleChatPanel}
                            drawioUi={drawioUi}
                            onToggleDrawioUi={handleDrawioUiChange}
                            darkMode={darkMode}
                            onToggleDarkMode={handleDarkModeChange}
                            isMobile={isMobile}
                            onCloseProtectionChange={setCloseProtection}
                        />
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    )
}
