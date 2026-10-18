import type { ChatAddToolOutputFunction } from "ai"
import type { RefObject } from "react"
import type { DiagramOperation } from "@/components/chat/types"
import type {
    ValidationState,
    ValidationStatus,
} from "@/components/chat/ValidationCard"
import type { LoadMode } from "@/contexts/diagram-context"
import type { ChatUIMessage } from "@/lib/chat-message"
import { type AiCanvasState, diagramFingerprint } from "@/lib/diagram-context"
import { pageModelXml, pageSelectorFor, placeOnPage } from "@/lib/diagram-pages"
import type { ValidationResult } from "@/lib/diagram-validator"
import { formatValidationFeedback } from "@/lib/diagram-validator"
import { isMxCellXmlComplete } from "@/lib/utils"
import { foldCells } from "@/packages/mcp-server/src/compact-cells.ts"
import { editDiagram } from "@/packages/mcp-server/src/edit-diagram.ts"
import { restoreImageData } from "@/packages/mcp-server/src/embedded-images.ts"
import { prepareNewDiagram } from "@/packages/mcp-server/src/new-diagram.ts"
import { hasCells } from "@/packages/mcp-server/src/pages.ts"

// The page a drawing is wrapped in; on the canvas it replaces the page the
// model works on, so the canvas page keeps its own id and name
const NEW_PAGE = { pageId: "page-1", pageName: "Page-1" }

interface ToolCall {
    toolCallId: string
    toolName: string
    input: unknown
}

// useChat's addToolOutput, typed with the chat's tools
type AddToolOutputFn = ChatAddToolOutputFunction<ChatUIMessage>

const MAX_VALIDATION_RETRIES = 3

// Type for the validation function passed from useValidateDiagram hook
type ValidateDiagramFn = (
    imageData: string,
    sessionId?: string,
) => Promise<ValidationResult>

interface UseDiagramToolHandlersParams {
    partialXmlRef: RefObject<string>
    // Diagram before a cut off display_diagram whose half drawn preview
    // stays while append_diagram finishes it; null when none is pending
    continuationOriginalRef: RefObject<string | null>
    editDiagramOriginalXmlRef: RefObject<Map<string, string>>
    // Tool calls the streaming preview must leave alone (shared with it)
    processedToolCallsRef: RefObject<Set<string>>
    // Failed VLM validations in the current user turn (reset on each user message)
    validationRetryCountRef: RefObject<number>
    chartXMLRef: RefObject<string>
    // The page the model reads and writes in this turn (the one the user
    // viewed when it began); null, or absent, means the first page
    turnPageIdRef?: RefObject<string | null>
    // The canvas after each change the model made, by tool call: the next
    // message sends the canvas only when it differs (lib/diagram-context.ts)
    aiCanvasStatesRef?: RefObject<Map<string, AiCanvasState>>
    onDisplayChart: (
        xml: string,
        skipValidation?: boolean,
        mode?: LoadMode,
        meta?: { toolCallId?: string; pageId?: string | null },
    ) => string | null
    onFetchChart: () => Promise<string>
    captureValidationPng?: () => Promise<string | null>
    validateDiagram?: ValidateDiagramFn
    enableVlmValidation?: boolean
    sessionId?: string
    // Called when a screenshot check begins; the function it returns
    // tells whether the user pressed Stop in this turn, also after the next
    // message was sent. A check that has not started then is skipped (one
    // already running is cancelled by the caller).
    watchStop?: () => () => boolean
    onValidationStateChange?: (
        toolCallId: string,
        state: ValidationState,
    ) => void
}

/**
 * Hook that creates the onToolCall handler for diagram-related tools.
 * Handles display_diagram, edit_diagram, and append_diagram tools.
 *
 * Note: addToolOutput is passed at call time (not hook init) because
 * it comes from useChat which creates a circular dependency.
 */
export function useDiagramToolHandlers({
    partialXmlRef,
    continuationOriginalRef,
    editDiagramOriginalXmlRef,
    processedToolCallsRef,
    validationRetryCountRef,
    chartXMLRef,
    turnPageIdRef,
    aiCanvasStatesRef,
    onDisplayChart,
    onFetchChart,
    captureValidationPng,
    validateDiagram,
    enableVlmValidation = true,
    sessionId,
    watchStop,
    onValidationStateChange,
}: UseDiagramToolHandlersParams) {
    // Helper to update validation state
    const updateValidationState = (
        toolCallId: string,
        status: ValidationStatus,
        options?: {
            attempt?: number
            maxAttempts?: number
            result?: ValidationResult
            error?: string
            imageData?: string
        },
    ) => {
        if (onValidationStateChange) {
            onValidationStateChange(toolCallId, {
                status,
                ...options,
            })
        }
    }
    const handleToolCall = async (
        { toolCall }: { toolCall: ToolCall },
        addToolOutput: AddToolOutputFn,
    ) => {
        processedToolCallsRef.current.add(toolCall.toolCallId)
        // Only display_diagram, edit_diagram and a completing append_diagram
        // put their result on the canvas. Other tools (get_shape_library,
        // which the server runs, still arrives here) leave the stored
        // originals for the preview code to undo.
        if (toolCall.toolName === "display_diagram") {
            await handleDisplayDiagram(toolCall, addToolOutput, takeOriginals())
        } else if (toolCall.toolName === "edit_diagram") {
            await handleEditDiagram(toolCall, addToolOutput, takeOriginals())
        } else if (toolCall.toolName === "append_diagram") {
            handleAppendDiagram(toolCall, addToolOutput)
        }
    }

    // Stored originals belong to previews not handled yet: this call's, and
    // those of earlier calls with invalid input, which never get to the
    // handler. The first is the diagram before all of them. A call that
    // draws its result replaces those previews, so the preview code must
    // neither draw them again nor undo them later. Returns that first one.
    // The final result as one undo step. A cut off drawing it replaces goes
    // first, so the step (and the version) starts from the diagram before
    // it, also when a failed call in between was undone to the cut off one.
    // exact: the canvas holds what the model wrote, with no auto-fix and no
    // continuation joined to it; otherwise the next message sends the canvas.
    // base: an edit's starting canvas, to tell a hand change made meanwhile
    const commit = (
        xml: string,
        toolCallId: string,
        exact: boolean,
        base: string | null = null,
    ) => {
        const original = continuationOriginalRef.current
        if (original !== null) onDisplayChart(original, true, "revert")
        onDisplayChart(xml, true, "commit", {
            toolCallId,
            pageId: aiPageId(),
        })
        continuationOriginalRef.current = null
        aiCanvasStatesRef?.current.set(toolCallId, {
            pageId: aiPageId(),
            fingerprint: pageFingerprint(xml),
            exact,
            base: base === null ? null : pageFingerprint(base),
        })
    }

    const pageFingerprint = (xml: string) =>
        diagramFingerprint(pageModelXml(xml, aiPageId()) ?? xml)

    const aiPageId = () => turnPageIdRef?.current ?? null

    // The diagram as the model sees it in the chat request: its page only
    const shownToModel = (xml: string) =>
        foldCells(pageModelXml(xml, aiPageId()) ?? xml)

    // The model's XML with the pictures it was shown as references
    // (embedded-images.ts) put back
    const withImages = (xml: string) =>
        restoreImageData(xml, chartXMLRef.current)

    // A drawn page goes onto the model's page of the canvas file, which
    // keeps its other pages; a drawing that brings several pages replaces
    // the file. Either way it keeps the file's variables unless it sets its own.
    const onAiPage = (drawnXml: string) =>
        placeOnPage(drawnXml, chartXMLRef.current, aiPageId())

    const takeOriginals = (): string | undefined => {
        const [originalXml] = editDiagramOriginalXmlRef.current.values()
        for (const id of editDiagramOriginalXmlRef.current.keys()) {
            processedToolCallsRef.current.add(id)
        }
        editDiagramOriginalXmlRef.current.clear()
        return originalXml
    }

    // originalXml: the diagram before the streamed previews, if any were drawn
    const handleDisplayDiagram = async (
        toolCall: ToolCall,
        addToolOutput: AddToolOutputFn,
        originalXml: string | undefined,
    ) => {
        const { xml } = toolCall.input as { xml: string }

        // Check if XML is truncated (incomplete mxCell indicates truncated output)
        const isTruncated = !isMxCellXmlComplete(xml)

        if (isTruncated) {
            // Store the partial XML for continuation via append_diagram
            partialXmlRef.current = xml
            // The half drawn preview stays while append_diagram finishes
            // it; the chat engine brings this diagram back if that never
            // happens
            if (
                originalXml !== undefined &&
                continuationOriginalRef.current === null
            ) {
                continuationOriginalRef.current = originalXml
            }

            // Tell LLM to use append_diagram to continue
            const partialEnding = partialXmlRef.current.slice(-500)
            addToolOutput({
                tool: "display_diagram",
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: `Output was truncated due to length limits. Use the append_diagram tool to continue.

Your output ended with:
\`\`\`
${partialEnding}
\`\`\`

NEXT STEP: Call append_diagram with the continuation XML.
- Do NOT include wrapper tags or root cells (id="0", id="1")
- Start from EXACTLY where you stopped
- Complete all remaining mxCell elements`,
            })
            return
        }

        // Complete XML received - use it directly
        // (continuation is now handled via append_diagram tool)
        const finalXml = xml
        partialXmlRef.current = "" // Reset any partial from previous truncation

        // Wrap, validate and auto-fix the model's XML like the MCP server's
        // create_new_diagram, then load it
        // One undo step (and a version) right away, before the screenshot
        // check: a stop, another chat or a hand edit during the check then
        // finds the diagram already in place
        const prepared = prepareNewDiagram(withImages(finalXml), NEW_PAGE)
        if (prepared.ok) {
            commit(
                onAiPage(prepared.xml),
                toolCall.toolCallId,
                prepared.fixes.length === 0,
            )
        }
        const validationError = prepared.ok ? null : prepared.error

        if (validationError) {
            console.warn("[display_diagram] Validation error:", validationError)
            // Undo the streamed preview, as a failed edit does: the canvas
            // keeps the diagram from before this failed call
            if (originalXml) onDisplayChart(originalXml, true, "revert")
            // Return error to model - sendAutomaticallyWhen will trigger retry
            addToolOutput({
                tool: "display_diagram",
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: `${validationError}

Please fix the XML issues and call display_diagram again with corrected XML.

Your failed XML:
\`\`\`xml
${finalXml}
\`\`\``,
            })
        } else {
            // Success - diagram will be rendered by chat-message-display
            // VLM validation after successful display
            if (
                enableVlmValidation &&
                captureValidationPng &&
                validateDiagram &&
                // At most this many checks per user turn, passed or not
                validationRetryCountRef.current < MAX_VALIDATION_RETRIES
            ) {
                let capturedPngData: string | null = null
                const stopped = watchStop?.()
                try {
                    // Notify UI that we're starting capture
                    updateValidationState(toolCall.toolCallId, "capturing")

                    // Small delay (100ms) to allow diagram rendering to complete before capture.
                    // This is a best-effort heuristic and may need adjustment for complex diagrams or slower devices.
                    await new Promise((resolve) => setTimeout(resolve, 100))

                    capturedPngData = await captureValidationPng()
                    // Stopped while the screenshot was taken: no check. The
                    // chat waits for this handler, so it must end now.
                    if (stopped?.()) {
                        updateValidationState(toolCall.toolCallId, "skipped")
                    } else if (capturedPngData) {
                        // Each retry is a new tool call, so count attempts
                        // per user turn (the chat resets it when the user sends)
                        const attempt = validationRetryCountRef.current + 1
                        validationRetryCountRef.current = attempt

                        // Notify UI that we're validating (include the image)
                        updateValidationState(
                            toolCall.toolCallId,
                            "validating",
                            {
                                attempt,
                                maxAttempts: MAX_VALIDATION_RETRIES,
                                imageData: capturedPngData,
                            },
                        )

                        const result = await validateDiagram(
                            capturedPngData,
                            sessionId,
                        )

                        if (!result.valid) {
                            if (attempt < MAX_VALIDATION_RETRIES) {
                                const feedback =
                                    formatValidationFeedback(result)

                                // Notify UI of validation failure (include the image)
                                updateValidationState(
                                    toolCall.toolCallId,
                                    "failed",
                                    {
                                        attempt,
                                        maxAttempts: MAX_VALIDATION_RETRIES,
                                        result,
                                        imageData: capturedPngData,
                                    },
                                )

                                addToolOutput({
                                    tool: "display_diagram",
                                    toolCallId: toolCall.toolCallId,
                                    state: "output-error",
                                    // The drawing stays on the canvas, as
                                    // the app may have fixed it
                                    errorText: `[Validation attempt ${attempt}/${MAX_VALIDATION_RETRIES}]\n${feedback}\n\nCurrent diagram XML:\n\`\`\`xml\n${shownToModel(chartXMLRef.current)}\n\`\`\``,
                                })
                                return
                            } else {
                                // Last attempt - accept the diagram with warning
                                // Notify UI that we're accepting with issues (include the image)
                                updateValidationState(
                                    toolCall.toolCallId,
                                    "skipped",
                                    { result, imageData: capturedPngData },
                                )

                                addToolOutput({
                                    tool: "display_diagram",
                                    toolCallId: toolCall.toolCallId,
                                    output: "Diagram displayed (validation issues noted but max retries reached).",
                                })
                                return
                            }
                        } else {
                            // Notify UI of success (include the image)
                            // Use "success_with_warnings" if valid but has issues
                            const hasWarnings = result.issues.length > 0
                            updateValidationState(
                                toolCall.toolCallId,
                                hasWarnings
                                    ? "success_with_warnings"
                                    : "success",
                                { result, imageData: capturedPngData },
                            )
                        }
                    } else {
                        // PNG capture failed - skip validation
                        updateValidationState(toolCall.toolCallId, "skipped")
                    }
                } catch (error) {
                    // Cancelled by Stop: the diagram stays, unchecked
                    if ((error as Error)?.name === "AbortError") {
                        updateValidationState(toolCall.toolCallId, "skipped")
                        addToolOutput({
                            tool: "display_diagram",
                            toolCallId: toolCall.toolCallId,
                            output: "Successfully displayed the diagram.",
                        })
                        return
                    }
                    // VLM validation error - log but don't block the user
                    console.warn(
                        "[display_diagram] VLM validation error:",
                        error,
                    )
                    updateValidationState(toolCall.toolCallId, "error", {
                        error:
                            error instanceof Error
                                ? error.message
                                : "Validation failed",
                        imageData: capturedPngData || undefined,
                    })
                }
            }

            addToolOutput({
                tool: "display_diagram",
                toolCallId: toolCall.toolCallId,
                output: "Successfully displayed the diagram.",
            })
        }
    }

    // originalXml: the diagram before the streamed previews, if any were drawn.
    // Operations apply to it, the same base XML that streaming used.
    const handleEditDiagram = async (
        toolCall: ToolCall,
        addToolOutput: AddToolOutputFn,
        originalXml: string | undefined,
    ) => {
        const { operations } = toolCall.input as {
            operations: DiagramOperation[]
        }

        let currentXml = ""
        // On failure, undo the streaming preview so the canvas matches the XML
        // reported back to the model
        const restoreOriginal = () => {
            if (originalXml) onDisplayChart(originalXml, true, "revert")
        }
        try {
            if (originalXml) {
                currentXml = originalXml
            } else {
                // Fallback: use chartXML from ref if streaming didn't capture original
                const cachedXML = chartXMLRef.current
                if (cachedXML) {
                    currentXml = cachedXML
                } else {
                    // Last resort: export from iframe
                    currentXml = await onFetchChart()
                }
            }

            // All or nothing, checked like the MCP server's edit_diagram.
            // The model sees its page, so edits target it.
            const outcome = editDiagram(
                currentXml,
                operations,
                pageSelectorFor(currentXml, aiPageId()),
            )
            if (!outcome.ok) {
                const reason = outcome.pageError
                    ? outcome.errors[0]
                    : `No changes were made because ${outcome.errors.length} operation(s) failed:\n${outcome.errors.map((e) => `- ${e}`).join("\n")}`
                restoreOriginal()
                addToolOutput({
                    tool: "edit_diagram",
                    toolCallId: toolCall.toolCallId,
                    state: "output-error",
                    errorText: `${reason}

Current diagram XML:
\`\`\`xml
${shownToModel(currentXml)}
\`\`\`

Please check the cell IDs and retry.`,
                })
                return
            }

            commit(
                outcome.xml,
                toolCall.toolCallId,
                outcome.fixes.length === 0,
                currentXml,
            )
            addToolOutput({
                tool: "edit_diagram",
                toolCallId: toolCall.toolCallId,
                output: `Successfully applied ${outcome.applied} operation(s) to the diagram.`,
            })
        } catch (error) {
            console.error("[edit_diagram] Failed:", error)

            const errorMessage =
                error instanceof Error ? error.message : String(error)

            restoreOriginal()
            addToolOutput({
                tool: "edit_diagram",
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: `Edit failed: ${errorMessage}

Current diagram XML:
\`\`\`xml
${currentXml ? shownToModel(currentXml) : "No XML available"}
\`\`\`

Please check cell IDs and retry, or use display_diagram to regenerate.`,
            })
        }
    }

    const handleAppendDiagram = (
        toolCall: ToolCall,
        addToolOutput: AddToolOutputFn,
    ) => {
        const { xml } = toolCall.input as { xml: string }

        // Nothing to continue: loading the fragment alone would replace the whole diagram
        if (!partialXmlRef.current) {
            addToolOutput({
                tool: "append_diagram",
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: `ERROR: There is no truncated diagram to continue, so append_diagram cannot be used now.

Use display_diagram to create the complete diagram, or edit_diagram to change the current one.`,
            })
            return
        }

        // Detect if LLM incorrectly started fresh instead of continuing
        // LLM should only output bare mxCells now, so wrapper tags indicate error
        const trimmed = xml.trim()
        // Definitions at the start are a restart only once cells were written
        const isFreshStart =
            (trimmed.startsWith("<mxStyle") &&
                hasCells(partialXmlRef.current)) ||
            trimmed.startsWith("<mxGraphModel") ||
            trimmed.startsWith("<root") ||
            trimmed.startsWith("<mxfile") ||
            trimmed.startsWith('<mxCell id="0"') ||
            trimmed.startsWith('<mxCell id="1"')

        if (isFreshStart) {
            addToolOutput({
                tool: "append_diagram",
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: `ERROR: You started fresh with wrapper tags. Do NOT include wrapper tags or root cells (id="0", id="1").

Continue from EXACTLY where the partial ended:
\`\`\`
${partialXmlRef.current.slice(-500)}
\`\`\`

Start your continuation with the NEXT character after where it stopped.`,
            })
            return
        }

        // Append to accumulated XML
        partialXmlRef.current += xml

        // Check if XML is now complete (last mxCell is complete)
        const isComplete = isMxCellXmlComplete(partialXmlRef.current)

        if (isComplete) {
            // Wrap and display the complete diagram
            const finalXml = partialXmlRef.current
            partialXmlRef.current = "" // Reset

            const prepared = prepareNewDiagram(withImages(finalXml), NEW_PAGE)
            // The continuation ends here, drawn or not: it takes the stored
            // originals, so the preview code undoes none of them later
            const originalXml = takeOriginals()
            // A continued drawing is pieced together from several calls:
            // the next message sends the canvas
            if (prepared.ok) {
                commit(onAiPage(prepared.xml), toolCall.toolCallId, false)
            }
            const validationError = prepared.ok ? null : prepared.error

            if (validationError) {
                // Back to the diagram before the cut off drawing, or else
                // before the previews
                const before = continuationOriginalRef.current ?? originalXml
                continuationOriginalRef.current = null
                if (before) onDisplayChart(before, true, "revert")
                addToolOutput({
                    tool: "append_diagram",
                    toolCallId: toolCall.toolCallId,
                    state: "output-error",
                    errorText: `Validation error after assembly: ${validationError}

Assembled XML:
\`\`\`xml
${finalXml.substring(0, 2000)}...
\`\`\`

Please use display_diagram with corrected XML.`,
                })
            } else {
                addToolOutput({
                    tool: "append_diagram",
                    toolCallId: toolCall.toolCallId,
                    output: "Diagram assembly complete and displayed successfully.",
                })
            }
        } else {
            // Still incomplete - signal to continue
            addToolOutput({
                tool: "append_diagram",
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: `XML still incomplete (mxCell not closed). Call append_diagram again to continue.

Current ending:
\`\`\`
${partialXmlRef.current.slice(-500)}
\`\`\`

Continue from EXACTLY where you stopped.`,
            })
        }
    }

    return { handleToolCall }
}
