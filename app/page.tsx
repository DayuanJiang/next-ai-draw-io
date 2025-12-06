"use client"
import { useEffect, useRef, useState } from "react"
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
import { useTheme } from "@/contexts/theme-context"

export default function Home() {
    const {
        drawioRef,
        handleDiagramExport,
        onDrawioLoad,
        chartXML,
        loadDiagram,
    } = useDiagram()
    const { theme } = useTheme()
    const [isMobile, setIsMobile] = useState(false)
    const [isChatVisible, setIsChatVisible] = useState(true)
    const [drawioUi, setDrawioUi] = useState<"min" | "sketch">("min")
    const [isThemeLoaded, setIsThemeLoaded] = useState(false)
    const [drawioKey, setDrawioKey] = useState(0)

    // Store the current diagram XML before theme change
    const savedDiagramRef = useRef<string>("")

    // Update saved diagram when chartXML changes
    useEffect(() => {
        if (chartXML) {
            savedDiagramRef.current = chartXML
        }
    }, [chartXML])

    // Restore diagram after DrawIO reloads due to theme change
    const [shouldRestoreDiagram, setShouldRestoreDiagram] = useState(false)

    useEffect(() => {
        if (shouldRestoreDiagram && savedDiagramRef.current) {
            // Wait a bit for DrawIO to be fully ready
            const timer = setTimeout(() => {
                console.log("[Home] Restoring diagram after theme change")
                loadDiagram(savedDiagramRef.current)
                setShouldRestoreDiagram(false)
            }, 500)
            return () => clearTimeout(timer)
        }
    }, [shouldRestoreDiagram, loadDiagram])

    // Watch for theme changes and trigger diagram restoration
    const prevThemeRef = useRef(theme)
    useEffect(() => {
        if (prevThemeRef.current !== theme && isThemeLoaded) {
            console.log("[Home] Theme changed, will restore diagram")
            setShouldRestoreDiagram(true)
            setDrawioKey((prev) => prev + 1)
        }
        prevThemeRef.current = theme
    }, [theme, isThemeLoaded])

    // Load theme from localStorage after mount to avoid hydration mismatch
    useEffect(() => {
        const saved = localStorage.getItem("drawio-theme")
        if (saved === "min" || saved === "sketch") {
            setDrawioUi(saved)
        }
        setIsThemeLoaded(true)
    }, [])
    const [closeProtection, setCloseProtection] = useState(false)

    // Load close protection setting from localStorage after mount
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_CLOSE_PROTECTION_KEY)
        // Default to false since auto-save handles persistence
        if (saved === "true") {
            setCloseProtection(true)
        }
    }, [])
    const chatPanelRef = useRef<ImperativePanelHandle>(null)

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }

        checkMobile()
        window.addEventListener("resize", checkMobile)
        return () => window.removeEventListener("resize", checkMobile)
    }, [])

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
    // This helps prevent accidental navigation from browser back gestures
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
                key={isMobile ? "mobile" : "desktop"}
                direction={isMobile ? "vertical" : "horizontal"}
                className="h-full"
            >
                {/* Draw.io Canvas */}
                <ResizablePanel defaultSize={isMobile ? 50 : 67} minSize={20}>
                    <div
                        className={`h-full relative ${
                            isMobile ? "p-1" : "p-2"
                        }`}
                    >
                        <div className="h-full rounded-xl overflow-hidden shadow-soft-lg border border-border/30">
                            {isThemeLoaded ? (
                                <DrawIoEmbed
                                    key={`${drawioUi}-${drawioKey}`}
                                    ref={drawioRef}
                                    onExport={handleDiagramExport}
                                    onLoad={() => {
                                        onDrawioLoad()
                                        // Trigger restoration after load if needed
                                        if (shouldRestoreDiagram) {
                                            setShouldRestoreDiagram(true)
                                        }
                                    }}
                                    urlParameters={{
                                        ui: drawioUi,
                                        spin: true,
                                        libraries: false,
                                        saveAndExit: false,
                                        noExitBtn: true,
                                        dark: theme === "dark",
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
                            onToggleDrawioUi={() => {
                                const newTheme =
                                    drawioUi === "min" ? "sketch" : "min"
                                localStorage.setItem("drawio-theme", newTheme)
                                setDrawioUi(newTheme)
                            }}
                            isMobile={isMobile}
                            onCloseProtectionChange={setCloseProtection}
                        />
                    </div>
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    )
}
