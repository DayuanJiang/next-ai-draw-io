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
import {
    type ExportFormat,
    prefersTransparentPng,
} from "@/components/save-dialog"
import { getApiEndpoint } from "@/lib/base-path"
import { withPageDefaults } from "@/lib/drawio/drawio-config"
import {
    canReplaceDiagram,
    commitDiagram,
    fitOpenedDiagram,
    previewDiagram,
    resetPreview,
    revertPreview,
    selectPage,
} from "@/lib/drawio/editor-bridge"
import { formatMessage } from "@/lib/i18n/utils"
import {
    BLANK_MXFILE,
    normalizeToMxfile,
} from "@/packages/mcp-server/src/pages.ts"
import { validateAndFixXml } from "@/packages/mcp-server/src/xml-validation.ts"
import { useCanvasStore } from "@/stores/canvas-store"
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

interface LoadMeta {
    toolCallId?: string
    pageId?: string | null
    keepView?: boolean
}

export interface DiagramCommit {
    beforeXml: string
    afterXml: string
    toolCallId?: string
    /** The page the change was made on; null or absent: the first page */
    pageId?: string | null
}

/** An export as draw.io's export action takes it: the format, and for PNG
 * its scale, width cap and the page to render (pageId) */
export interface ExportRequest {
    format: string
    [key: string]: unknown
}

/** What draw.io answered: the image (a data URL, or SVG text) in data; for
 * format "xml" the document in xml instead */
export interface ExportResult {
    data?: string
    xml?: string
}

interface DiagramContextType {
    chartXML: string
    // chartXML right away, before the re-render (loadDiagram sets both)
    chartXMLRef: React.MutableRefObject<string>
    // The diagram's latest SVG export, a fallback thumbnail for saves
    latestSvgRef: React.MutableRefObject<string>
    /** keepView: a load leaves the view as it is (it is fitted otherwise:
     * the web app's loads open a chat or a file) */
    loadDiagram: (
        chart: string,
        skipValidation?: boolean,
        mode?: LoadMode,
        meta?: LoadMeta,
    ) => string | null
    /** The XML of the page on screen, exported from draw.io */
    fetchDiagramXml: () => Promise<string>
    drawioRef: React.MutableRefObject<DrawioFrameHandle | null>
    handleDiagramExport: (data: DrawioExportEvent) => void
    handleDiagramAutoSave: (data: { xml?: string }) => void
    clearDiagram: () => void
    saveDiagramToFile: (
        filename: string,
        format: ExportFormat,
        sessionId?: string,
        successMessage?: string,
    ) => Promise<void>
    getThumbnailSvg: () => Promise<string | null>
    getVersionSvg: () => Promise<string | null>
    captureValidationPng: () => Promise<string | null>
    /** One export with its own result; null when draw.io does not answer
     * in time (the MCP shell answers the server's export requests with it) */
    requestExport: (
        request: ExportRequest,
        timeoutMs?: number,
    ) => Promise<ExportResult | null>
    /** Show a document for an export only (the MCP's one-page projection of
     * another page): not recorded as the diagram, its autosaves ignored,
     * until the next loadDiagram puts the real document back */
    showTransient: (xml: string) => void
    /** A full load was sent and draw.io has not reported it yet: the
     * editor still shows the previous document */
    hasPendingLoad: () => boolean
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
type ExportTag = "thumbnail" | "validation" | "version" | "fetch"

export function DiagramProvider({ children }: { children: React.ReactNode }) {
    const [chartXML, setChartXML] = useState<string>("")
    const latestSvgRef = useRef("")
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
        Record<string, (result: ExportResult) => void>
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

    // The page to show again once a full load is done: draw.io shows the
    // first page of a loaded document
    const pageAfterLoadRef = useRef<string | null>(null)
    // The last full load sent opens a diagram (a saved chat, a file): fit
    // it into view once it is done (draw.io keeps the scroll position)
    const fitAfterLoadRef = useRef(false)
    // A transient document (showTransient) is on the canvas, and the page
    // the user was on before it
    const transientRef = useRef(false)
    const pageBeforeTransientRef = useRef<string | null>(null)

    // Sends a full load. draw.io runs it when its message arrives, and then
    // reports "load": until then the editor shows the diagram from before,
    // so later changes go the same way and keep their order
    const fullLoad = (
        xml: string,
        pageId: string | null = useCanvasStore.getState().currentPageId,
        fit = false,
    ) => {
        if (!drawioRef.current) return
        pageAfterLoadRef.current =
            pageId && xml.includes(`id="${pageId}"`) ? pageId : null
        fitAfterLoadRef.current = fit
        pendingLoadsRef.current++
        drawioRef.current.load({ xml })
    }

    const onDrawioLoad = () => {
        pendingLoadsRef.current = Math.max(0, pendingLoadsRef.current - 1)
        // Back to the page the user was on, once the last load sent is on
        // the canvas: the page belongs to that load (an earlier one that
        // draw.io reports first is replaced right after)
        if (pendingLoadsRef.current === 0) {
            const pageId = pageAfterLoadRef.current
            pageAfterLoadRef.current = null
            if (pageId) selectPage(pageId)
        }
        // Only set ready state once to prevent infinite loops
        if (hasCalledOnLoadRef.current) {
            if (fitAfterLoadRef.current && pendingLoadsRef.current === 0) {
                fitAfterLoadRef.current = false
                fitOpenedDiagram()
            }
            return
        }
        hasCalledOnLoadRef.current = true
        setIsDrawioReady(true)
        // draw.io's first load: loads sent before it went nowhere
        pendingLoadsRef.current = 0
        // Restore diagram after remount (e.g., theme/UI change), or a file
        // opened while draw.io loaded (its page settings count too)
        if (chartXMLRef.current) fullLoad(chartXMLRef.current, undefined, true)
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

    // Export with a tag in `message` (draw.io echoes it back in the export
    // event) and wait for that result. Resolves to null on timeout, which is
    // expected occasionally.
    // (Reads refs only, so it keeps one identity)
    const requestTaggedExport = useCallback(
        (tag: ExportTag, format: "xmlsvg" | "svg" | "png", timeoutMs: number) =>
            new Promise<ExportResult | null>((resolve) => {
                const id = `${tag}-${++exportSeqRef.current}`
                const finish = (value: ExportResult | null) => {
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
    // One identity: the chat's auto-save effect depends on it
    const getThumbnailSvg = useCallback(async (): Promise<string | null> => {
        if (!drawioRef.current) return null
        // Don't export if diagram is empty
        if (!isRealDiagram(chartXMLRef.current)) return null

        // xmlsvg exports return an SVG data URL
        const result = await requestTaggedExport("thumbnail", "xmlsvg", 3000)
        if (result?.data?.startsWith("data:image/svg")) {
            // Kept for later saves that take no fresh thumbnail
            latestSvgRef.current = result.data
            return result.data
        }
        return null
    }, [requestTaggedExport])

    // Plain SVG (no embedded diagram data) for version cards
    const getVersionSvg = async (): Promise<string | null> => {
        if (!drawioRef.current) return null
        const result = await requestTaggedExport("version", "svg", 4000)
        return result?.data?.startsWith("data:image/svg") ? result.data : null
    }

    // Capture current diagram as PNG for VLM validation
    const captureValidationPng = async (): Promise<string | null> => {
        if (!drawioRef.current) return null
        // Don't export if diagram is empty
        if (!isRealDiagram(chartXMLRef.current)) return null

        const result = await requestTaggedExport("validation", "png", 5000)
        // PNG data should be a base64 data URL
        return result?.data?.startsWith("data:image/png") ? result.data : null
    }

    // The page the user is viewing (the first one with an external draw.io,
    // which cannot tell us), for the chat and edit_diagram.
    // Not written to chartXML: exports don't change the diagram, and the
    // export's xml has compressed <diagram> payloads that would break
    // edit_diagram/display_diagram. Autosave keeps chartXML up to date with
    // the full uncompressed multi-page document (#879).
    const fetchDiagramXml = async (): Promise<string> => {
        const result = await requestTaggedExport("fetch", "xmlsvg", 10000)
        if (!result?.data) {
            throw new Error("Chart export timed out after 10 seconds")
        }
        latestSvgRef.current = result.data
        return extractDiagramXML(
            result.data,
            useCanvasStore.getState().currentPageId,
        )
    }

    // Like requestTaggedExport, with the request's other parameters (a PNG's
    // page and width) and both parts of the answer
    const requestExport = useCallback(
        (request: ExportRequest, timeoutMs = 10000) =>
            new Promise<ExportResult | null>((resolve) => {
                if (!drawioRef.current) {
                    resolve(null)
                    return
                }
                const id = `export-${++exportSeqRef.current}`
                const finish = (value: ExportResult | null) => {
                    clearTimeout(timer)
                    delete exportResolversRef.current[id]
                    resolve(value)
                }
                const timer = setTimeout(() => finish(null), timeoutMs)
                exportResolversRef.current[id] = finish
                drawioRef.current.exportDiagram({ ...request, message: id })
            }),
        [],
    )

    const showTransient = (xml: string) => {
        if (!transientRef.current) {
            pageBeforeTransientRef.current =
                useCanvasStore.getState().currentPageId
        }
        transientRef.current = true
        fullLoad(xml)
    }

    const loadDiagram = (
        chart: string,
        skipValidation?: boolean,
        mode: LoadMode = "load",
        meta?: LoadMeta,
    ): string | null => {
        // The editor bridge is shared: a page that is gone (another language
        // mounted a new one) must not change the new page's canvas
        if (!mountedRef.current) return null
        // A real document ends a transient one; the user goes back to the
        // page they were on before it
        const pageBeforeTransient = transientRef.current
            ? pageBeforeTransientRef.current
            : undefined
        transientRef.current = false
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
            fullLoad(
                xmlToLoad,
                pageBeforeTransient ?? meta?.pageId ?? undefined,
                mode === "load" && !meta?.keepView,
            )
        }

        if (mode === "commit") {
            commitHandlerRef.current?.({
                beforeXml,
                afterXml: xmlToLoad,
                toolCallId: meta?.toolCallId,
                pageId: meta?.pageId,
            })
        }

        return null
    }

    const startTurn = () => {
        turnBaseRef.current = null
        resetPreview()
    }

    // Each export result goes to the caller that asked for it, by its tag
    const handleDiagramExport = (data: DrawioExportEvent) => {
        const tag = data.message?.message
        if (!tag) return
        exportResolversRef.current[tag]?.({ data: data.data, xml: data.xml })
    }

    // The frame registers this callback once per iframe mount, so it must
    // read refs: state captured in its closure would stay stale after a remount
    const handleDiagramAutoSave = (data: { xml?: string }) => {
        if (!data?.xml) return
        // An edit of a transient document is not the diagram's; nor is one
        // of the canvas a full load still on its way replaces (draw.io
        // reports each load, in order, so no autosave of the new document
        // comes before that)
        if (transientRef.current || pendingLoadsRef.current > 0) return
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
        latestSvgRef.current = ""
    }

    const saveDiagramToFile = async (
        filename: string,
        format: ExportFormat,
        sessionId?: string,
        successMessage?: string,
    ) => {
        // Map format to draw.io export format
        const drawioFormat =
            format === "drawio" || format === "xmlsvg" ? "xmlsvg" : format
        // Pictures get a margin; a PNG twice the size, of the page on
        // screen (draw.io renders the first page otherwise), on white
        // unless the user asked for a transparent background
        const imageOptions =
            format === "drawio"
                ? {}
                : format === "png"
                  ? {
                        border: 20,
                        scale: 2,
                        currentPage: true,
                        ...(prefersTransparentPng()
                            ? { transparent: true }
                            : { background: "#ffffff" }),
                    }
                  : { border: 20 }

        // Each save has its own request id, so two at once never swap
        // results. A large PNG takes a while to render.
        const result = await requestExport(
            { format: drawioFormat, ...imageOptions },
            30000,
        )
        if (!result?.data) {
            console.warn(
                "Diagram export for saving failed (editor not ready or timed out)",
            )
            return
        }
        const exportData = result.data
        const fullDiagramXML = result.xml
        let fileContent: string
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
        if (fileContent.startsWith("data:")) {
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
            toast.success(formatMessage(successMessage, { name: a.download }), {
                duration: 4000,
            })
        }

        // Delay URL revocation to ensure download completes
        if (!url.startsWith("data:")) {
            setTimeout(() => URL.revokeObjectURL(url), 100)
        }
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
                latestSvgRef,
                loadDiagram,
                fetchDiagramXml,
                drawioRef,
                handleDiagramExport,
                handleDiagramAutoSave,
                clearDiagram,
                saveDiagramToFile,
                getThumbnailSvg,
                getVersionSvg,
                captureValidationPng,
                requestExport,
                showTransient,
                hasPendingLoad: () => pendingLoadsRef.current > 0,
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
