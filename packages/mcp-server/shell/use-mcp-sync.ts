import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useDiagram } from "@/contexts/diagram-context"
import { useDictionary } from "@/hooks/use-dictionary"
import { diffDiagrams } from "@/lib/diagram-diff"
import {
    highlightChangedCells,
    readSelectionDetails,
} from "@/lib/drawio/editor-bridge"
import { useCanvasStore } from "@/stores/canvas-store"
import { createMcpSync, type McpSync, type SyncStatus } from "./mcp-sync-core"
import type { ShellConfig } from "./runtime-config"

/**
 * Keeps the canvas in step with the MCP server (mcp-sync-core.ts has the
 * protocol): mounted once inside DiagramProvider. Server writes go on the
 * canvas through loadDiagram, as one undo step when they can; the user's
 * edits are pushed; the server's export and sync requests are answered.
 * Returns the connection state for the status bar, and the sync itself for
 * the version cards (History and restores go through it).
 */
export function useMcpSync(config: ShellConfig): {
    status: SyncStatus
    sync: McpSync | null
} {
    const dict = useDictionary()
    const diagram = useDiagram()
    const [status, setStatus] = useState<SyncStatus>("waiting")
    const [sync, setSync] = useState<McpSync | null>(null)
    const syncRef = useRef<McpSync | null>(null)
    // The provider's functions are new on every render; the sync (created
    // once) reads the latest through refs
    const diagramRef = useRef(diagram)
    diagramRef.current = diagram
    const dictRef = useRef(dict)
    dictRef.current = dict

    useEffect(() => {
        if (!config.sessionId) return
        // A write on another page loads in full (no commit to outline): what
        // it changed on that page, outlined once draw.io has loaded it
        let loadOutline: { ids: string[]; pageId: string } | null = null
        const outlineLoaded = () => {
            if (!loadOutline || diagramRef.current.hasPendingLoad()) return
            // The load already shows that page
            highlightChangedCells(loadOutline.ids, loadOutline.pageId, {
                navigate: false,
            })
            loadOutline = null
        }
        const sync = createMcpSync({
            sessionId: config.sessionId,
            apiBase: config.apiBase,
            token: config.token,
            canvas: {
                // A server write that loads in full keeps the user's view
                load: (xml, decision) => {
                    const before = diagramRef.current.chartXMLRef.current
                    diagramRef.current.loadDiagram(
                        xml,
                        true,
                        decision.mode,
                        decision.mode === "commit"
                            ? { pageId: decision.pageId }
                            : { keepView: true, pageId: decision.pageId },
                    )
                    // Full loads without a page (the document back after an
                    // export's projection, a recovered session) are not
                    // outlined; nor is a write a later load replaced
                    loadOutline = null
                    if (decision.mode === "load" && decision.pageId) {
                        const { touchedIds, fromScratch } = diffDiagrams(
                            before,
                            xml,
                            decision.pageId,
                        )
                        if (!fromScratch && touchedIds.length > 0) {
                            loadOutline = {
                                ids: touchedIds,
                                pageId: decision.pageId,
                            }
                        }
                    }
                },
                showTransient: (xml) => {
                    loadOutline = null
                    diagramRef.current.showTransient(xml)
                },
                export: (request, timeoutMs) =>
                    diagramRef.current.requestExport(request, timeoutMs),
                currentXml: () => diagramRef.current.chartXMLRef.current,
                currentPageId: () => useCanvasStore.getState().currentPageId,
                loadPending: () => diagramRef.current.hasPendingLoad(),
                // The bridge reads the editor directly; without it (an
                // external draw.io) the selection cannot be read
                readSelection: () =>
                    readSelectionDetails() ?? {
                        pageId: null,
                        pageName: null,
                        cells: [],
                        unavailable: true,
                    },
            },
            onNotice: (notice) =>
                toast(dictRef.current.shell[notice], { duration: 8000 }),
            onStatus: setStatus,
            isHidden: () => document.visibilityState === "hidden",
        })
        syncRef.current = sync
        setSync(sync)
        sync.setReady(diagramRef.current.isDrawioReady)
        sync.start()

        // draw.io's autosave and load events, as the classic page reads
        // them: the frame component handles them for the canvas, the sync
        // needs them for the protocol (an edit to push, a load done)
        const drawioOrigin = new URL(config.drawioBaseUrl, location.href).origin
        const onMessage = (event: MessageEvent) => {
            if (event.source === window || event.origin !== drawioOrigin) {
                return
            }
            if (typeof event.data !== "string") return
            let message: { event?: string; xml?: unknown }
            try {
                message = JSON.parse(event.data)
            } catch {
                return
            }
            if (
                message.event === "autosave" &&
                typeof message.xml === "string"
            ) {
                sync.onAutoSave(message.xml)
            } else if (message.event === "load") {
                sync.onDrawioLoad()
                // After the canvas's own load handler (it counts the load
                // done and shows the page)
                setTimeout(outlineLoaded, 0)
            }
        }
        window.addEventListener("message", onMessage)
        return () => {
            loadOutline = null
            window.removeEventListener("message", onMessage)
            sync.stop()
            syncRef.current = null
            setSync(null)
        }
    }, [config])

    useEffect(() => {
        syncRef.current?.setReady(diagram.isDrawioReady)
    }, [diagram.isDrawioReady])

    // Mark what a server write changed on the page for a few seconds, as
    // the web app does for its versions (use-versions.ts); any action on
    // the canvas clears it
    useEffect(() => {
        diagram.setCommitHandler(({ beforeXml, afterXml, pageId }) => {
            const { touchedIds, fromScratch } = diffDiagrams(
                beforeXml,
                afterXml,
                pageId,
            )
            if (!fromScratch) {
                highlightChangedCells(touchedIds, pageId, { navigate: false })
            }
        })
        return () => diagram.setCommitHandler(null)
    }, [])

    return { status, sync }
}
