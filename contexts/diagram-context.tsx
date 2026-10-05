"use client"

import type React from "react"
import { createContext, useCallback, useContext, useRef, useState } from "react"
import type { DrawIoEmbedRef, EventExport } from "react-drawio"
import { toast } from "sonner"
import type { ExportFormat } from "@/components/save-dialog"
import { getApiEndpoint } from "@/lib/base-path"
import {
    BLANK_MXFILE,
    normalizeToMxfile,
} from "@/packages/mcp-server/src/pages.ts"
import { validateAndFixXml } from "@/packages/mcp-server/src/xml-validation.ts"
import { extractDiagramXML, isRealDiagram } from "../lib/utils"

interface DiagramContextType {
    chartXML: string
    // chartXML right away, before the re-render (loadDiagram sets both)
    chartXMLRef: React.MutableRefObject<string>
    latestSvg: string
    diagramHistory: { svg: string; xml: string }[]
    setDiagramHistory: (history: { svg: string; xml: string }[]) => void
    loadDiagram: (chart: string, skipValidation?: boolean) => string | null
    // Both return the export's tag (empty when draw.io is not there yet)
    handleExport: () => string
    handleExportWithoutHistory: () => string
    // Pending exports by tag; a history or plain export's resolver gets the
    // first page's XML
    exportResolversRef: React.MutableRefObject<
        Record<string, (data: string, xml?: string) => void>
    >
    drawioRef: React.MutableRefObject<DrawIoEmbedRef | null>
    handleDiagramExport: (data: EventExport) => void
    handleDiagramAutoSave: (data: { xml?: string }) => void
    clearDiagram: () => void
    saveDiagramToFile: (
        filename: string,
        format: ExportFormat,
        sessionId?: string,
        successMessage?: string,
    ) => void
    getThumbnailSvg: () => Promise<string | null>
    captureValidationPng: () => Promise<string | null>
    isDrawioReady: boolean
    onDrawioLoad: () => void
    resetDrawioReady: () => void
    showSaveDialog: boolean
    setShowSaveDialog: (show: boolean) => void
}

const DiagramContext = createContext<DiagramContextType | undefined>(undefined)

// Every export carries a tag in the request's `message` field. draw.io
// echoes the request back in the export event, so each result reaches its
// own caller. Tags end in a request number, so a late result never answers
// a newer request.
type ExportTag = "thumbnail" | "validation"

export function DiagramProvider({ children }: { children: React.ReactNode }) {
    const [chartXML, setChartXML] = useState<string>("")
    const [latestSvg, setLatestSvg] = useState<string>("")
    const [diagramHistory, setDiagramHistory] = useState<
        { svg: string; xml: string }[]
    >([])
    const [isDrawioReady, setIsDrawioReady] = useState(false)
    const [showSaveDialog, setShowSaveDialog] = useState(false)
    const hasCalledOnLoadRef = useRef(false)
    const drawioRef = useRef<DrawIoEmbedRef | null>(null)
    // Pending exports, keyed by their export tag
    const exportResolversRef = useRef<
        Record<string, (data: string, xml?: string) => void>
    >({})
    // Pending history exports: the document each one was asked for
    const historyXmlRef = useRef(new Map<string, string>())
    const exportSeqRef = useRef(0)
    // Track latest chartXML for restoration after remount
    const chartXMLRef = useRef<string>("")

    const onDrawioLoad = () => {
        // Only set ready state once to prevent infinite loops
        if (hasCalledOnLoadRef.current) return
        hasCalledOnLoadRef.current = true
        setIsDrawioReady(true)
        // Restore diagram after remount (e.g., theme/UI change)
        if (drawioRef.current && isRealDiagram(chartXMLRef.current)) {
            drawioRef.current.load({ xml: chartXMLRef.current })
        }
    }

    const resetDrawioReady = () => {
        hasCalledOnLoadRef.current = false
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
        // Save this export to history, with the document shown now:
        // chartXML can change before the result comes back
        const tag = `history-${++exportSeqRef.current}`
        historyXmlRef.current.set(tag, chartXMLRef.current)
        drawioRef.current.exportDiagram({
            format: "xmlsvg",
            message: tag,
        })
        return tag
    }

    const handleExportWithoutHistory = () => {
        if (!drawioRef.current) return ""
        // Export without saving to history (for edit_diagram fetching current state)
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
        (tag: ExportTag, format: "xmlsvg" | "png", timeoutMs: number) =>
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
    ): string | null => {
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

        // Keep chartXML in sync even when diagrams are injected (e.g., display_diagram tool)
        updateChartXML(xmlToLoad)

        if (drawioRef.current) {
            drawioRef.current.load({
                xml: xmlToLoad,
            })
        }

        return null
    }

    const handleDiagramExport = (data: EventExport) => {
        // Thumbnail, validation PNG and file save exports go only to their
        // own caller
        const tag = data.message?.message
        if (/^(thumbnail|validation|save)-/.test(tag ?? "")) {
            exportResolversRef.current[tag as string]?.(data.data, data.xml)
            return
        }

        // Don't write chartXML here: exports don't change the diagram, and
        // data.xml from xmlsvg exports has compressed <diagram> payloads that
        // would break edit_diagram/display_diagram. Autosave keeps chartXML
        // up to date with the full uncompressed multi-page document (#879).
        const extractedXML = extractDiagramXML(data.data)
        setLatestSvg(data.data)

        // Only add to history if this was a user-initiated export
        // Limit to 20 entries to prevent memory leaks during long sessions
        const MAX_HISTORY_SIZE = 20
        const askedXml =
            tag !== undefined ? historyXmlRef.current.get(tag) : undefined
        if (askedXml !== undefined) {
            historyXmlRef.current.delete(tag as string)
            // Store the full multi-page document (extractedXML is only the
            // first page), so restoring a version keeps every page
            const historyXml = askedXml || extractedXML
            setDiagramHistory((prev) => {
                const newHistory = [
                    ...prev,
                    {
                        svg: data.data,
                        xml: historyXml,
                    },
                ]
                // Keep only the last MAX_HISTORY_SIZE entries (circular buffer)
                return newHistory.slice(-MAX_HISTORY_SIZE)
            })
        }

        // The chat's own export (onFetchChart), not another one in flight
        const resolve =
            tag !== undefined ? exportResolversRef.current[tag] : undefined
        if (resolve) {
            delete exportResolversRef.current[tag as string]
            resolve(extractedXML)
        }
    }

    // react-drawio registers this callback once per iframe mount, so it must
    // read refs: state captured in its closure would stay stale after a remount
    const handleDiagramAutoSave = (data: { xml?: string }) => {
        if (!data?.xml) return
        // Don't overwrite a pending restore - if we have a real diagram but
        // DrawIO hasn't loaded yet, it means we're waiting to restore
        if (!hasCalledOnLoadRef.current && isRealDiagram(chartXMLRef.current)) {
            return
        }
        updateChartXML(data.xml)
    }

    const clearDiagram = () => {
        const emptyDiagram = BLANK_MXFILE
        // Skip validation for trusted internal template (loadDiagram also sets chartXML)
        loadDiagram(emptyDiagram, true)
        setLatestSvg("")
        setDiagramHistory([])
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
                toast.success(successMessage, {
                    position: "bottom-left",
                    duration: 2500,
                })
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

    return (
        <DiagramContext.Provider
            value={{
                chartXML,
                chartXMLRef,
                latestSvg,
                diagramHistory,
                setDiagramHistory,
                loadDiagram,
                handleExport,
                handleExportWithoutHistory,
                exportResolversRef,
                drawioRef,
                handleDiagramExport,
                handleDiagramAutoSave,
                clearDiagram,
                saveDiagramToFile,
                getThumbnailSvg,
                captureValidationPng,
                isDrawioReady,
                onDrawioLoad,
                resetDrawioReady,
                showSaveDialog,
                setShowSaveDialog,
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
