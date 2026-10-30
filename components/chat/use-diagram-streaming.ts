"use client"

import type { UIMessage } from "ai"
import type { RefObject } from "react"
import { useCallback, useEffect, useRef } from "react"
import type { DiagramOperation, ToolPartLike } from "@/components/chat/types"
import { useDiagram } from "@/contexts/diagram-context"
import { pageSelectorFor, replacePageModel } from "@/lib/diagram-pages"
import { extractCompleteMxCells } from "@/lib/utils"
import {
    defaultLayerOf,
    expandCompactCells,
} from "@/packages/mcp-server/src/compact-cells.ts"
import { applyDiagramOperations } from "@/packages/mcp-server/src/diagram-operations.ts"
import { targetPageXml } from "@/packages/mcp-server/src/edit-diagram.ts"
import { restoreImageData } from "@/packages/mcp-server/src/embedded-images.ts"
import {
    BLANK_MXFILE,
    wrapCellsInModel,
} from "@/packages/mcp-server/src/pages.ts"
import {
    addDefaultStyles,
    applyStyleClasses,
    edgeIdsOf,
    readStyleClasses,
} from "@/packages/mcp-server/src/style-classes.ts"
import { autoFixXml } from "@/packages/mcp-server/src/xml-validation.ts"

// Helper to extract complete operations from streaming input
function getCompleteOperations(
    operations: DiagramOperation[] | undefined,
): DiagramOperation[] {
    if (!operations || !Array.isArray(operations)) return []
    return operations.filter(
        (op) =>
            op &&
            typeof op.operation === "string" &&
            ["update", "add", "delete"].includes(op.operation) &&
            typeof op.cell_id === "string" &&
            op.cell_id.length > 0 &&
            (op.operation === "delete" || typeof op.new_xml === "string"),
    )
}

/** A connector's end names a cell the page does not have (pass one page:
 * draw.io looks the ends up on the connector's own page) */
function hasDanglingEdge(xml: string): boolean {
    const doc = new DOMParser().parseFromString(xml, "text/xml")
    const ids = new Set(
        Array.from(doc.querySelectorAll("mxCell, object, UserObject")).map(
            (el) => el.getAttribute("id"),
        ),
    )
    return Array.from(doc.getElementsByTagName("mxCell")).some((cell) =>
        ["source", "target"].some((end) => {
            const id = cell.getAttribute(end)
            return !!id && !ids.has(id)
        }),
    )
}

interface UseDiagramStreamingParams {
    messages: UIMessage[]
    processedToolCallsRef: RefObject<Set<string>>
    editDiagramOriginalXmlRef: RefObject<Map<string, string>>
    loadedMessageIdsRef: RefObject<Set<string>>
    // The page the model draws on in this turn; null: the first page
    turnPageIdRef?: RefObject<string | null>
}

/**
 * Draws AI tool output onto the canvas while it streams, as a preview that
 * is not recorded in undo history.
 *
 * display_diagram: the complete mxCells written so far. edit_diagram: the
 * complete operations applied to the diagram from before the call. The tool
 * handler validates and commits the final result. Runs in the chat engine
 * so streaming continues while the chat panel is collapsed.
 */
export function useDiagramStreaming({
    messages,
    processedToolCallsRef,
    editDiagramOriginalXmlRef,
    loadedMessageIdsRef,
    turnPageIdRef,
}: UseDiagramStreamingParams) {
    const { chartXML, chartXMLRef, loadDiagram } = useDiagram()
    const previousXML = useRef<string>("")
    // Last processed XML per toolCallId, to skip redundant work while streaming
    const lastProcessedXmlRef = useRef<Map<string, string>>(new Map())

    // Reset when messages become empty (new chat or session switch), so
    // cached examples work again after starting a new session
    useEffect(() => {
        if (messages.length === 0) {
            previousXML.current = ""
            lastProcessedXmlRef.current.clear()
            processedToolCallsRef.current.clear()
            editDiagramOriginalXmlRef.current.clear()
        }
    }, [messages.length, processedToolCallsRef, editDiagramOriginalXmlRef])

    // Streaming preview of display_diagram: draw the complete cells written
    // so far. The tool handler validates and loads the final diagram.
    const handleDisplayChart = useCallback(
        (xml: string) => {
            // Named styles come before the cells, so the ones written so
            // far are known by the time their cells stream in
            const { classes, xml: cellsXml } = readStyleClasses(xml)
            const completeCells = extractCompleteMxCells(cellsXml)
            if (!completeCells) return
            // The same wrapping, fixes and expansion as the final diagram
            // (prepareNewDiagram), so the preview matches what is committed
            const model = addDefaultStyles(
                applyStyleClasses(
                    expandCompactCells(
                        autoFixXml(
                            wrapCellsInModel(
                                restoreImageData(completeCells, chartXML),
                            ),
                        ).fixed,
                    ),
                    classes,
                ),
            )
            if (model === previousXML.current) return

            // Skip this update while the cells written so far don't parse
            const testDoc = new DOMParser().parseFromString(model, "text/xml")
            if (testDoc.querySelector("parsererror")) return

            try {
                // Replace the model's page so other pages stay intact; an
                // empty canvas gets the blank mxfile to put the page in
                const replacedXML = replacePageModel(
                    chartXML,
                    turnPageIdRef?.current,
                    model,
                )
                previousXML.current = model
                loadDiagram(replacedXML, true, "preview")
            } catch (error) {
                console.error("Error processing XML:", error)
            }
        },
        [chartXML, loadDiagram],
    )

    useEffect(() => {
        // Only the last message can still be streaming
        const message = messages[messages.length - 1]
        if (!message) return

        // Messages restored from a saved session were applied before it was
        // saved; the saved diagram is authoritative, so don't replay them
        if (loadedMessageIdsRef.current.has(message.id)) return

        // The diagram without streamed previews, as loaded last: the tool
        // handler's result of an earlier edit is there before the chartXML
        // state catches up. Undoing a failed edit's preview below changes it
        // too, and an edit streaming right after must start from the undone
        // diagram.
        let baseXml = chartXMLRef.current

        for (const part of message.parts) {
            if (
                part.type !== "tool-display_diagram" &&
                part.type !== "tool-edit_diagram"
            ) {
                continue
            }
            const { toolCallId, state, input } = part as ToolPartLike

            // Failed or stopped: if the original XML is still stored, the
            // tool handler never ran (invalid JSON, or the user pressed
            // stop), so undo the streamed preview here. Invalid JSON leaves
            // no input, so check this first.
            if (state === "output-error") {
                const originalXml =
                    editDiagramOriginalXmlRef.current.get(toolCallId)
                if (originalXml) {
                    editDiagramOriginalXmlRef.current.delete(toolCallId)
                    loadDiagram(originalXml, true, "revert")
                    baseXml = originalXml
                }
                continue
            }

            // Input complete, or the tool handler, a stop or an error took
            // the call already: the tool handler loads the checked diagram.
            // The messages update at most every 150 ms (useChat throttle in
            // the chat engine), so they can still show the call streaming
            // after that.
            if (
                state !== "input-streaming" ||
                processedToolCallsRef.current.has(toolCallId)
            ) {
                processedToolCallsRef.current.add(toolCallId)
                lastProcessedXmlRef.current.delete(toolCallId)
                lastProcessedXmlRef.current.delete(`${toolCallId}-result`)
                lastProcessedXmlRef.current.delete(`${toolCallId}-ops`)
                continue
            }

            if (part.type === "tool-display_diagram") {
                const xml = input?.xml as string | undefined
                // Skip if XML hasn't changed since last processing
                if (!xml || lastProcessedXmlRef.current.get(toolCallId) === xml)
                    continue
                // Keep the diagram from before the preview, to undo it on a
                // stop or an error
                if (!editDiagramOriginalXmlRef.current.has(toolCallId)) {
                    editDiagramOriginalXmlRef.current.set(
                        toolCallId,
                        baseXml || BLANK_MXFILE,
                    )
                }
                handleDisplayChart(xml)
                lastProcessedXmlRef.current.set(toolCallId, xml)
                continue
            }

            // edit_diagram: apply operations incrementally for a preview.
            // editDiagramOriginalXmlRef is shared with the tool handler.
            if (!input?.operations) continue
            const completeOps = getCompleteOperations(
                input.operations as DiagramOperation[],
            )
            if (completeOps.length === 0) continue

            // Capture the original XML when streaming starts
            let originalXml = editDiagramOriginalXmlRef.current.get(toolCallId)
            if (!originalXml) {
                if (!baseXml) {
                    console.warn(
                        "[edit_diagram streaming] No chart XML available",
                    )
                    continue
                }
                originalXml = baseXml
                editDiagramOriginalXmlRef.current.set(toolCallId, baseXml)
            }

            // The last operation's XML may still be streaming: it applies
            // once it parses, so compare results, not the number of
            // operations. Skip if nothing changed since the last preview.
            const resultKey = `${toolCallId}-result`
            const opsKey = `${toolCallId}-ops`
            const ops = JSON.stringify(completeOps)
            if (lastProcessedXmlRef.current.get(opsKey) === ops) continue
            lastProcessedXmlRef.current.set(opsKey, ops)
            try {
                // The model's page: the edges on it and its default layer,
                // as editDiagram reads them
                const selector = pageSelectorFor(
                    originalXml,
                    turnPageIdRef?.current,
                )
                const page = targetPageXml(originalXml, selector)
                const edges = edgeIdsOf(page)
                const layer = defaultLayerOf(page)
                const { result } = applyDiagramOperations(
                    originalXml,
                    completeOps.map((op) =>
                        op.new_xml
                            ? {
                                  ...op,
                                  new_xml: addDefaultStyles(
                                      expandCompactCells(
                                          restoreImageData(
                                              op.new_xml,
                                              originalXml,
                                          ),
                                          layer,
                                      ),
                                      edges,
                                  ),
                              }
                            : op,
                    ),
                    selector,
                )
                if (lastProcessedXmlRef.current.get(resultKey) === result) {
                    continue
                }
                // A connector to a shape an operation still to come adds:
                // draw.io would log an error for it; the next preview has it
                if (hasDanglingEdge(targetPageXml(result, selector))) continue
                // Load the full document so other pages stay intact
                loadDiagram(result, true, "preview")
                lastProcessedXmlRef.current.set(resultKey, result)
            } catch (e) {
                console.warn(
                    "[edit_diagram streaming] Operation failed:",
                    e instanceof Error ? e.message : e,
                )
            }
        }
    }, [
        messages,
        handleDisplayChart,
        chartXMLRef,
        loadDiagram,
        processedToolCallsRef,
        editDiagramOriginalXmlRef,
        loadedMessageIdsRef,
    ])
}
