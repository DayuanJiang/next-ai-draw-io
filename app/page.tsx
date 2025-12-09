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
import { useTheme } from "@/contexts/theme-context"

// Minimum XML length to consider valid (avoid saving empty/partial diagrams)
const MIN_XML_LENGTH = 300

const drawioBaseUrl =
    process.env.NEXT_PUBLIC_DRAWIO_BASE_URL || "https://embed.diagrams.net"

export default function Home() {
    const {
        drawioRef,
        handleDiagramExport,
        onDrawioLoad,
        chartXML,
        loadDiagram,
        isDrawioReady,
        resetDrawioReady,
        handleExportWithoutHistory,
        resolverRef,
    } = useDiagram()
    const { theme } = useTheme()
    const [isMobile, setIsMobile] = useState(false)
    const [isChatVisible, setIsChatVisible] = useState(true)
    const [drawioUi, setDrawioUi] = useState<"min" | "sketch">("min")
    const [isThemeLoaded, setIsThemeLoaded] = useState(false)
    const [drawioKey, setDrawioKey] = useState(0)

    // Use a separate state for DrawIO's theme to prevent premature updates
    // Initialize with correct theme immediately to avoid white flash
    const [drawioTheme, setDrawioTheme] = useState<"light" | "dark">(() => {
        // Check if we're in the browser
        if (typeof window === "undefined") return "light"

        // Check localStorage first
        const savedTheme = localStorage.getItem("theme-preference")
        if (savedTheme === "dark" || savedTheme === "light") {
            return savedTheme
        }

        // Check system preference
        const prefersDark = window.matchMedia(
            "(prefers-color-scheme: dark)",
        ).matches
        return prefersDark ? "dark" : "light"
    })

    // Store the current diagram XML before theme/UI change
    const savedDiagramRef = useRef<string>("")
    const isRestoringRef = useRef(false)
    const isSwitchingRef = useRef(false)

    // Update saved diagram when chartXML changes (only update in-memory cache, no auto-save)
    useEffect(() => {
        if (
            chartXML &&
            !isRestoringRef.current &&
            chartXML.length > MIN_XML_LENGTH
        ) {
            savedDiagramRef.current = chartXML
        }
    }, [chartXML])

    // Function to export current diagram before theme/UI change
    const exportBeforeSwitch = useCallback(() => {
        return new Promise<string>((resolve) => {
            // If DrawIO not ready, use cached XML from localStorage
            const cached = localStorage.getItem("next-ai-draw-io-diagram-xml")
            if (!drawioRef || !("current" in drawioRef) || !drawioRef.current) {
                resolve(cached || savedDiagramRef.current)
                return
            }

            // Set up resolver - save to localStorage when exporting before theme/UI switch
            if (resolverRef && "current" in resolverRef) {
                resolverRef.current = (xml: string) => {
                    // Ensure XML has complete structure before saving
                    if (xml && xml.length > MIN_XML_LENGTH) {
                        let xmlContent = xml
                        // Add mxfile wrapper if missing
                        if (!xml.includes("<mxfile")) {
                            xmlContent = `<mxfile><diagram name="Page-1" id="page-1">${xml}</diagram></mxfile>`
                        }
                        localStorage.setItem(
                            "next-ai-draw-io-diagram-xml",
                            xmlContent,
                        )
                        savedDiagramRef.current = xmlContent
                        resolve(xmlContent)
                    } else {
                        resolve(xml)
                    }
                }
            }

            // Trigger export (without adding to history)
            handleExportWithoutHistory()

            // Timeout after 5 seconds (increased from 2 seconds)
            setTimeout(() => {
                const latestCached = localStorage.getItem(
                    "next-ai-draw-io-diagram-xml",
                )
                resolve(latestCached || savedDiagramRef.current)
            }, 5000)
        })
    }, [drawioRef, resolverRef, handleExportWithoutHistory])

    // Watch for theme or UI changes and trigger reload with restoration
    const prevDrawioUiRef = useRef(drawioUi)

    useEffect(() => {
        // Only reload if theme is out of sync with drawioTheme (user changed theme)
        // Don't reload on initial theme load from ThemeProvider
        const themeChanged = theme !== drawioTheme
        const uiChanged = prevDrawioUiRef.current !== drawioUi

        if (
            (themeChanged || uiChanged) &&
            isThemeLoaded &&
            !isSwitchingRef.current
        ) {
            isSwitchingRef.current = true

            // Export current diagram first
            exportBeforeSwitch()
                .then((xml: string) => {
                    if (xml && xml.length > MIN_XML_LENGTH) {
                        savedDiagramRef.current = xml
                        localStorage.setItem("next-ai-draw-io-diagram-xml", xml)
                    } else {
                        console.warn(
                            "[Home] Export returned empty or short XML, using cache",
                        )
                    }

                    // Now trigger reload by updating drawioTheme and key
                    isRestoringRef.current = true
                    resetDrawioReady()
                    setDrawioTheme(theme) // Update DrawIO's theme state
                    setDrawioKey((prev) => prev + 1)
                })
                .finally(() => {
                    isSwitchingRef.current = false
                })
        }
        prevDrawioUiRef.current = drawioUi
    }, [
        theme,
        drawioTheme,
        drawioUi,
        isThemeLoaded,
        resetDrawioReady,
        exportBeforeSwitch,
    ])

    // Validate XML before loading
    const isValidDiagramXML = useCallback((xml: string): boolean => {
        if (!xml || xml.length < 100) {
            console.warn("[Home] XML too short or empty")
            return false
        }

        // Check for essential DrawIO structure
        const hasMxfile = xml.includes("<mxfile")
        const hasDiagram = xml.includes("<diagram")
        const hasModel =
            xml.includes("<mxGraphModel") || xml.includes("mxGraphModel")
        const hasRoot = xml.includes("<root>")

        // Must have at least mxfile structure
        if (!hasMxfile) {
            console.warn("[Home] XML missing <mxfile> tag")
            return false
        }

        // Check if it's a complete diagram (not just a fragment)
        const isComplete = hasDiagram && hasModel && hasRoot

        if (!isComplete) {
            console.warn(
                "[Home] XML incomplete - diagram:",
                hasDiagram,
                "model:",
                hasModel,
                "root:",
                hasRoot,
            )
        }

        return isComplete
    }, [])

    // Restore diagram after DrawIO becomes ready after theme/UI reload
    // ONLY restore when drawioKey > 0 (after a theme/UI switch)
    // Initial diagram load is handled by chat-panel.tsx to avoid double restoration
    useEffect(() => {
        if (
            isRestoringRef.current &&
            isDrawioReady &&
            savedDiagramRef.current &&
            drawioKey > 0
        ) {
            const timer = setTimeout(() => {
                const xmlToRestore = savedDiagramRef.current
                if (isValidDiagramXML(xmlToRestore)) {
                    loadDiagram(xmlToRestore)
                } else {
                    console.warn(
                        "[Home] Invalid XML detected, loading empty diagram",
                    )
                    console.warn(
                        "[Home] Failed XML first 500 chars:",
                        xmlToRestore.substring(0, 500),
                    )
                    // Load empty diagram instead of invalid XML
                    const emptyDiagram = `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
                    loadDiagram(emptyDiagram)
                }

                isRestoringRef.current = false
            }, 1000)
            return () => clearTimeout(timer)
        }
    }, [isDrawioReady, loadDiagram, drawioKey, isValidDiagramXML])

    // Load DrawIO UI preference from localStorage after mount
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

    // Save current diagram before browser closes/refreshes
    useEffect(() => {
        const handleBeforeUnload = () => {
            // Save current chartXML to localStorage before closing
            if (chartXML && chartXML.length > MIN_XML_LENGTH) {
                localStorage.setItem("next-ai-draw-io-diagram-xml", chartXML)
            }
        }

        window.addEventListener("beforeunload", handleBeforeUnload)
        return () =>
            window.removeEventListener("beforeunload", handleBeforeUnload)
    }, [chartXML])

    // Show confirmation dialog when user tries to leave the page
    // This helps prevent accidental navigation from browser back gestures
    // BUT don't trigger on internal state changes (theme/UI switches)
    useEffect(() => {
        if (!closeProtection) return

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            // Skip confirmation during internal restoration process
            if (isRestoringRef.current) {
                return
            }
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
                                    key={drawioKey}
                                    ref={drawioRef}
                                    onExport={handleDiagramExport}
                                    onLoad={onDrawioLoad}
                                    baseUrl={drawioBaseUrl}
                                    urlParameters={{
                                        ui: drawioUi,
                                        spin: true,
                                        libraries: false,
                                        saveAndExit: false,
                                        noExitBtn: true,
                                        dark: drawioTheme === "dark",
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
