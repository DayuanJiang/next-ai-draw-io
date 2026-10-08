"use client"

import type React from "react"
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react"
import { toast } from "sonner"
import type {
    DrawioExportEvent,
    DrawioFrameHandle,
} from "@/components/canvas/drawio-frame"
import type { ExportFormat } from "@/components/save-dialog"
import { getApiEndpoint } from "@/lib/base-path"
import { withPageDefaults } from "@/lib/drawio/drawio-config"
import {
    canReplaceDiagram,
    commitDiagram,
    previewDiagram,
    resetPreview,
    revertPreview,
} from "@/lib/drawio/editor-bridge"
import {
    BLANK_MXFILE,
    normalizeToMxfile,
} from "@/packages/mcp-server/src/pages.ts"
import { validateAndFixXml } from "@/packages/mcp-server/src/xml-validation.ts"
import { extractDiagramXML, isRealDiagram } from "../lib/utils"

/**
 * How a diagram reaches the canvas:
 * - load: replace the whole document and reset undo (sessions, new chat)
 * - preview: streaming AI output, not recorded in undo history
 * - commit: final AI result, one undo step; reported to commit listeners
 * - revert: drop the streaming preview and go back to the given diagram
 *
 * preview/commit/revert go through the draw.io editor when it is reachable
 * (same origin); otherwise they fall back to a full load.
 */
export type LoadMode = "load" | "preview" | "commit" | "revert"

/** The document without where its view was scrolled to (dx, dy) */
function withoutView(xml: string): string {
    return xml.replace(/<mxGraphModel\b[^>]*>/g, (tag) =>
        tag.replace(/\s(?:dx|dy)="[^"]*"/g, ""),
    )
}

export interface DiagramCommit {
    beforeXml: string
    afterXml: string
    toolCallId?: string
}

interface DiagramContextType {
    chartXML: string
    // chartXML right away, before the re-render (loadDiagram sets both)
    chartXMLRef: React.MutableRefObject<string>
    latestSvg: string
    loadDiagram: (
        chart: string,
        skipValidation?: boolean,
        mode?: LoadMode,
        meta?: { toolCallId?: string },
    ) => string | null
    // Returns the export's tag (empty when draw.io is not there yet)
    handleExport: () => string
    // Pending exports by tag; a plain export's resolver gets the first
    // page's XML
    exportResolversRef: React.MutableRefObject<
        Record<string, (data: string, xml?: string) => void>
    >
    drawioRef: React.MutableRefObject<DrawioFrameHandle | null>
    handleDiagramExport: (data: DrawioExportEvent) => void
    handleDiagramAutoSave: (data: { xml?: string }) => void
    clearDiagram: () => void
    saveDiagramToFile: (
        filename: string,
        format: ExportFormat,
        sessionId?: string,
        successMessage?: string,
    ) => void
    getThumbnailSvg: () => Promise<string | null>
    getVersionSvg: () => Promise<string | null>
    captureValidationPng: () => Promise<string | null>
    isDrawioReady: boolean
    onDrawioLoad: () => void
    resetDrawioReady: () => void
    /** Register the handler told about every committed AI change */
    setCommitHandler: (
        handler: ((commit: DiagramCommit) => void) | null,
    ) => void
    /** A new user turn starts: forget the streaming base */
    startTurn: () => void
}

const DiagramContext = createContext<DiagramContextType | undefined>(undefined)

// Every export carries a tag in the request's `message` field. draw.io
// echoes the request back in the export event, so each result reaches its
// own caller. Tags end in a request number, so a late result never answers
// a newer request.
type ExportTag = "thumbnail" | "validation" | "version"

export function DiagramProvider({ children }: { children: React.ReactNode }) {
    const [chartXML, setChartXML] = useState<string>("")
    const [latestSvg, setLatestSvg] = useState<string>("")
    const [isDrawioReady, setIsDrawioReady] = useState(false)
    const hasCalledOnLoadRef = useRef(false)
    const mountedRef = useRef(true)
    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
        }
    }, [])
    const drawioRef = useRef<DrawioFrameHandle | null>(null)
    // Pending exports, keyed by their export tag
    const exportResolversRef = useRef<
        Record<string, (data: string, xml?: string) => void>
    >({})
    const exportSeqRef = useRef(0)
    // Track latest chartXML for restoration after remount
    const chartXMLRef = useRef<string>("")
    // Diagram before the current AI change started streaming
    const turnBaseRef = useRef<string | null>(null)
    // Full loads sent that draw.io has not reported done yet
    const pendingLoadsRef = useRef(0)
    const commitHandlerRef = useRef<((commit: DiagramCommit) => void) | null>(
        null,
    )

    // Sends a full load. draw.io runs it when its message arrives, and then
    // reports "load": until then the editor shows the diagram from before,
    // so later changes go the same way and keep their order
    const fullLoad = (xml: string) => {
        if (!drawioRef.current) return
        pendingLoadsRef.current++
        drawioRef.current.load({ xml })
    }

    const onDrawioLoad = () => {
        pendingLoadsRef.current = Math.max(0, pendingLoadsRef.current - 1)
        // Only set ready state once to prevent infinite loops
        if (hasCalledOnLoadRef.current) return
        hasCalledOnLoadRef.current = true
        setIsDrawioReady(true)
        // draw.io's first load: loads sent before it went nowhere
        pendingLoadsRef.current = 0
        // Restore diagram after remount (e.g., theme/UI change), or a file
        // opened while draw.io loaded (its page settings count too)
        if (chartXMLRef.current) fullLoad(chartXMLRef.current)
    }

    const resetDrawioReady = () => {
        hasCalledOnLoadRef.current = false
        pendingLoadsRef.current = 0
        setIsDrawioReady(false)
    }

    // Update chartXML and its ref together, so callbacks that read the ref
    // (export handler, autosave) see the new value right away
    const updateChartXML = (xml: string) => {
        chartXMLRef.current = xml
        setChartXML(xml)
    }

    const handleExport = () => {
        if (!drawioRef.current) return ""
        // Export of the current state (for the chat and edit_diagram)
        const tag = `fetch-${++exportSeqRef.current}`
        drawioRef.current.exportDiagram({
            format: "xmlsvg",
            message: tag,
        })
        return tag
    }

    // Export with a tag in `message` (draw.io echoes it back in the export
    // event) and wait for that result. Resolves to null on timeout, which is
    // expected occasionally.
    // (Reads refs only, so it keeps one identity)
    const requestTaggedExport = useCallback(
        (tag: ExportTag, format: "xmlsvg" | "svg" | "png", timeoutMs: number) =>
            new Promise<string | null>((resolve) => {
                const id = `${tag}-${++exportSeqRef.current}`
                const finish = (value: string | null) => {
                    clearTimeout(timer)
                    delete exportResolversRef.current[id]
                    resolve(value)
                }
                const timer = setTimeout(() => finish(null), timeoutMs)
                exportResolversRef.current[id] = finish
                drawioRef.current?.exportDiagram({ format, message: id })
            }),
        [],
    )

    // Get current diagram as SVG for thumbnail (used by session storage).
    // One identity: the chat's auto-save depends on it, and each thumbnail
    // renders this provider again (latestSvg), which would otherwise start
    // the next save
    const getThumbnailSvg = useCallback(async (): Promise<string | null> => {
        if (!drawioRef.current) return null
        // Don't export if diagram is empty
        if (!isRealDiagram(chartXMLRef.current)) return null

        // xmlsvg exports return an SVG data URL
        const svgData = await requestTaggedExport("thumbnail", "xmlsvg", 3000)
        if (svgData?.startsWith("data:image/svg")) {
            // Update latestSvg so it's available for future saves
            setLatestSvg(svgData)
            return svgData
        }
        return null
    }, [requestTaggedExport])

    // Plain SVG (no embedded diagram data) for version cards
    const getVersionSvg = async (): Promise<string | null> => {
        if (!drawioRef.current) return null
        const svgData = await requestTaggedExport("version", "svg", 4000)
        return svgData?.startsWith("data:image/svg") ? svgData : null
    }

    // Capture current diagram as PNG for VLM validation
    const captureValidationPng = async (): Promise<string | null> => {
        if (!drawioRef.current) return null
        // Don't export if diagram is empty
        if (!isRealDiagram(chartXMLRef.current)) return null

        const pngData = await requestTaggedExport("validation", "png", 5000)
        // PNG data should be a base64 data URL
        return pngData?.startsWith("data:image/png") ? pngData : null
    }

    const loadDiagram = (
        chart: string,
        skipValidation?: boolean,
        mode: LoadMode = "load",
        meta?: { toolCallId?: string },
    ): string | null => {
        // The editor bridge is shared: a page that is gone (another language
        // mounted a new one) must not change the new page's canvas
        if (!mountedRef.current) return null
        let xmlToLoad = chart

        // Validate XML structure before loading (unless skipped for internal
        // use). Not strict: the XML may hold the user's own diagram, and the
        // tool handlers check model XML strictly before it gets here.
        if (!skipValidation) {
            const validation = validateAndFixXml(chart, { strict: false })
            if (!validation.valid) {
                console.warn(
                    "[loadDiagram] Validation error:",
                    validation.error,
                )
                return validation.error
            }
            // Use fixed XML if auto-fix was applied
            if (validation.fixed) {
                console.log(
                    "[loadDiagram] Auto-fixed XML issues:",
                    validation.fixes,
                )
                xmlToLoad = validation.fixed
            }
        }

        xmlToLoad = withPageDefaults(xmlToLoad)

        const previousXml = chartXMLRef.current
        if (mode === "preview" && turnBaseRef.current === null) {
            turnBaseRef.current = previousXml
        }
        const beforeXml = turnBaseRef.current ?? previousXml
        if (mode !== "preview") turnBaseRef.current = null

        // Keep chartXML in sync even when diagrams are injected (e.g., display_diagram tool)
        updateChartXML(xmlToLoad)

        let applied = false
        if (
            mode !== "load" &&
            pendingLoadsRef.current === 0 &&
            canReplaceDiagram(xmlToLoad)
        ) {
            try {
                if (mode === "preview") previewDiagram(xmlToLoad)
                else if (mode === "commit") commitDiagram(xmlToLoad)
                else revertPreview(xmlToLoad)
                applied = true
            } catch (error) {
                console.warn("[loadDiagram] Editor update failed:", error)
            }
        }
        if (!applied) {
            // A full load replaces any preview, and its base is stale now
            resetPreview()
            fullLoad(xmlToLoad)
        }

        if (mode === "commit") {
            commitHandlerRef.current?.({
                beforeXml,
                afterXml: xmlToLoad,
                toolCallId: meta?.toolCallId,
            })
        }

        return null
    }

    const startTurn = () => {
        turnBaseRef.current = null
        resetPreview()
    }

    const handleDiagramExport = (data: DrawioExportEvent) => {
        // Thumbnail, version, validation PNG and file save exports go only
        // to their own caller
        const tag = data.message?.message
        if (/^(thumbnail|validation|version|save)-/.test(tag ?? "")) {
            exportResolversRef.current[tag as string]?.(data.data, data.xml)
            return
        }

        // Don't write chartXML here: exports don't change the diagram, and
        // data.xml from xmlsvg exports has compressed <diagram> payloads that
        // would break edit_diagram/display_diagram. Autosave keeps chartXML
        // up to date with the full uncompressed multi-page document (#879).
        const extractedXML = extractDiagramXML(data.data)
        setLatestSvg(data.data)

        // The chat's own export (onFetchChart), not another one in flight
        const resolve =
            tag !== undefined ? exportResolversRef.current[tag] : undefined
        if (resolve) {
            delete exportResolversRef.current[tag as string]
            resolve(extractedXML)
        }
    }

    // The frame registers this callback once per iframe mount, so it must
    // read refs: state captured in its closure would stay stale after a remount
    const handleDiagramAutoSave = (data: { xml?: string }) => {
        if (!data?.xml) return
        // Don't overwrite a pending restore - if we have a diagram but
        // DrawIO hasn't loaded yet, it means we're waiting to restore
        if (!hasCalledOnLoadRef.current && chartXMLRef.current) return
        // Only the view moved, or draw.io saved what it just loaded: nothing
        // changed, and a save would put a chat that was only opened first
        // in the list
        if (withoutView(data.xml) === withoutView(chartXMLRef.current)) return
        updateChartXML(data.xml)
    }

    const clearDiagram = () => {
        const emptyDiagram = BLANK_MXFILE
        // Skip validation for trusted internal template (loadDiagram also sets chartXML)
        loadDiagram(emptyDiagram, true)
        setLatestSvg("")
    }

    const saveDiagramToFile = (
        filename: string,
        format: ExportFormat,
        sessionId?: string,
        successMessage?: string,
    ) => {
        if (!drawioRef.current) {
            console.warn("Draw.io editor not ready")
            return
        }

        // Map format to draw.io export format
        const drawioFormat =
            format === "drawio" || format === "xmlsvg" ? "xmlsvg" : format

        // Each save has its own tag, so two at once never swap results
        const tag = `save-${++exportSeqRef.current}`
        exportResolversRef.current[tag] = (
            exportData: string,
            fullDiagramXML?: string,
        ) => {
            delete exportResolversRef.current[tag]
            let fileContent: string | Blob
            let mimeType: string
            let extension: string

            if (format === "drawio") {
                // Prefer the complete document from the export event so all pages are saved.
                const xml = fullDiagramXML?.trim()
                    ? fullDiagramXML
                    : extractDiagramXML(exportData)
                fileContent =
                    normalizeToMxfile(xml, {
                        pageId: "page-1",
                        pageName: "Page-1",
                    }) ?? xml
                mimeType = "application/xml"
                extension = ".drawio"
            } else if (format === "png") {
                // PNG data comes as base64 data URL
                fileContent = exportData
                mimeType = "image/png"
                extension = ".png"
            } else if (format === "xmlsvg") {
                // Editable SVG: pass data URL directly (like PNG)
                fileContent = exportData
                mimeType = "image/svg+xml"
                extension = ".drawio.svg"
            } else {
                // SVG format (view-only)
                fileContent = exportData
                mimeType = "image/svg+xml"
                extension = ".svg"
            }

            // Log save event to Langfuse (flags the trace)
            logSaveToLangfuse(filename, format, sessionId)

            // Handle download
            let url: string
            if (
                typeof fileContent === "string" &&
                fileContent.startsWith("data:")
            ) {
                // Already a data URL (PNG)
                url = fileContent
            } else {
                const blob = new Blob([fileContent], { type: mimeType })
                url = URL.createObjectURL(blob)
            }

            const a = document.createElement("a")
            a.href = url
            a.download = `${filename}${extension}`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)

            // Show success toast after download is initiated
            if (successMessage) {
                toast.success(successMessage, { duration: 2500 })
            }

            // Delay URL revocation to ensure download completes
            if (!url.startsWith("data:")) {
                setTimeout(() => URL.revokeObjectURL(url), 100)
            }
        }

        // Export diagram - callback will be handled in handleDiagramExport
        drawioRef.current.exportDiagram({
            format: drawioFormat,
            message: tag,
        })
    }

    // Log save event to Langfuse (just flags the trace, doesn't send content)
    const logSaveToLangfuse = async (
        filename: string,
        format: string,
        sessionId?: string,
    ) => {
        try {
            await fetch(getApiEndpoint("/api/log-save"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename, format, sessionId }),
            })
        } catch (error) {
            console.warn("Failed to log save to Langfuse:", error)
        }
    }

    const setCommitHandler = (
        handler: ((commit: DiagramCommit) => void) | null,
    ) => {
        commitHandlerRef.current = handler
    }

    return (
        <DiagramContext.Provider
            value={{
                chartXML,
                chartXMLRef,
                latestSvg,
                loadDiagram,
                handleExport,
                exportResolversRef,
                drawioRef,
                handleDiagramExport,
                handleDiagramAutoSave,
                clearDiagram,
                saveDiagramToFile,
                getThumbnailSvg,
                getVersionSvg,
                captureValidationPng,
                isDrawioReady,
                onDrawioLoad,
                resetDrawioReady,
                setCommitHandler,
                startTurn,
            }}
        >
            {children}
        </DiagramContext.Provider>
    )
}

export function useDiagram() {
    const context = useContext(DiagramContext)
    if (context === undefined) {
        throw new Error("useDiagram must be used within a DiagramProvider")
    }
    return context
}
