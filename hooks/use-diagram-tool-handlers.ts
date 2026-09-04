import type { MutableRefObject } from "react"
import { useRef } from "react"
import type { DiagramOperation } from "@/components/chat/types"
import type {
    ValidationState,
    ValidationStatus,
} from "@/components/chat/ValidationCard"
import type { Operation } from "@/lib/diagram-engine"
import { restructureDiagram } from "@/lib/diagram-engine"
import type { ValidationResult } from "@/lib/diagram-validator"
import { formatValidationFeedback } from "@/lib/diagram-validator"
import { isMxCellXmlComplete, isRealDiagram, wrapWithMxFile } from "@/lib/utils"

const DEBUG = process.env.NODE_ENV === "development"

interface ToolCall {
    toolCallId: string
    toolName: string
    input: unknown
}

type AddToolOutputSuccess = {
    tool: string
    toolCallId: string
    state?: "output-available"
    output: string
    errorText?: undefined
}

type AddToolOutputError = {
    tool: string
    toolCallId: string
    state: "output-error"
    output?: undefined
    errorText: string
}

type AddToolOutputParams = AddToolOutputSuccess | AddToolOutputError

type AddToolOutputFn = (params: AddToolOutputParams) => void

const MAX_VALIDATION_RETRIES = 3

// Type for the validation function passed from useValidateDiagram hook
type ValidateDiagramFn = (
    imageData: string,
    sessionId?: string,
) => Promise<ValidationResult>

interface UseDiagramToolHandlersParams {
    partialXmlRef: MutableRefObject<string>
    editDiagramOriginalXmlRef: MutableRefObject<Map<string, string>>
    chartXMLRef: MutableRefObject<string>
    onDisplayChart: (xml: string, skipValidation?: boolean) => string | null
    onFetchChart: (saveToHistory?: boolean) => Promise<string>
    onExport: () => void
    captureValidationPng?: () => Promise<string | null>
    validateDiagram?: ValidateDiagramFn
    enableVlmValidation?: boolean
    sessionId?: string
    onValidationStateChange?: (
        toolCallId: string,
        state: ValidationState,
    ) => void
}

/**
 * Hook that creates the onToolCall handler for diagram-related tools.
 * Handles edit_diagram and restructure_diagram, plus the cached-XML replay that arrives
 * as display_diagram.
 *
 * Note: addToolOutput is passed at call time (not hook init) because
 * it comes from useChat which creates a circular dependency.
 */
export function useDiagramToolHandlers({
    partialXmlRef,
    editDiagramOriginalXmlRef,
    chartXMLRef,
    onDisplayChart,
    onFetchChart,
    onExport,
    captureValidationPng,
    validateDiagram,
    enableVlmValidation = true,
    sessionId,
    onValidationStateChange,
}: UseDiagramToolHandlersParams) {
    // Track validation retry count per tool call
    const validationRetryCountRef = useRef<Map<string, number>>(new Map())

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
        if (DEBUG) {
            console.log(
                `[onToolCall] Tool: ${toolCall.toolName}, CallId: ${toolCall.toolCallId}`,
            )
        }

        if (toolCall.toolName === "display_diagram") {
            await handleDisplayDiagram(toolCall, addToolOutput)
        } else if (toolCall.toolName === "edit_diagram") {
            await handleEditDiagram(toolCall, addToolOutput)
        } else if (toolCall.toolName === "restructure_diagram") {
            await handleRestructureDiagram(toolCall, addToolOutput)
        }
    }

    // Replays a cached XML answer onto the canvas. The model can no longer call this tool —
    // it only arrives from the server's cache-hit path (see createCachedStreamResponse), which
    // speaks the same wire format. So there is no truncation to continue and no model to send
    // errors back to: load it, or report that it did not load.
    const handleDisplayDiagram = async (
        toolCall: ToolCall,
        addToolOutput: AddToolOutputFn,
    ) => {
        const { xml } = toolCall.input as { xml: string }
        const validationError = onDisplayChart(wrapWithMxFile(xml))
        if (validationError) {
            console.warn("[display_diagram] Validation error:", validationError)
            addToolOutput({
                tool: "display_diagram",
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: validationError,
            })
            return
        }
        addToolOutput({
            tool: "display_diagram",
            toolCallId: toolCall.toolCallId,
            output: "Successfully displayed the diagram.",
        })
    }

    const handleEditDiagram = async (
        toolCall: ToolCall,
        addToolOutput: AddToolOutputFn,
    ) => {
        const { operations } = toolCall.input as {
            operations: DiagramOperation[]
        }

        let currentXml = ""
        try {
            // Use the original XML captured during streaming (shared with chat-message-display)
            // This ensures we apply operations to the same base XML that streaming used
            const originalXml = editDiagramOriginalXmlRef.current.get(
                toolCall.toolCallId,
            )
            if (originalXml) {
                currentXml = originalXml
            } else {
                // Fallback: use chartXML from ref if streaming didn't capture original
                const cachedXML = chartXMLRef.current
                if (cachedXML) {
                    currentXml = cachedXML
                } else {
                    // Last resort: export from iframe
                    currentXml = await onFetchChart(false)
                }
            }

            const { applyDiagramOperations } = await import("@/lib/utils")
            const { result: editedXml, errors } = applyDiagramOperations(
                currentXml,
                operations,
            )

            // Check for operation errors
            if (errors.length > 0) {
                const errorMessages = errors
                    .map(
                        (e) =>
                            `- ${e.type} on cell_id="${e.cellId}": ${e.message}`,
                    )
                    .join("\n")

                addToolOutput({
                    tool: "edit_diagram",
                    toolCallId: toolCall.toolCallId,
                    state: "output-error",
                    errorText: `Some operations failed:\n${errorMessages}

Current diagram XML:
\`\`\`xml
${currentXml}
\`\`\`

Please check the cell IDs and retry.`,
                })
                // Clean up the shared original XML ref
                editDiagramOriginalXmlRef.current.delete(toolCall.toolCallId)
                return
            }

            // loadDiagram validates and returns error if invalid
            const validationError = onDisplayChart(editedXml)
            if (validationError) {
                console.warn(
                    "[edit_diagram] Validation error:",
                    validationError,
                )
                addToolOutput({
                    tool: "edit_diagram",
                    toolCallId: toolCall.toolCallId,
                    state: "output-error",
                    errorText: `Edit produced invalid XML: ${validationError}

Current diagram XML:
\`\`\`xml
${currentXml}
\`\`\`

Please fix the operations to avoid structural issues.`,
                })
                // Clean up the shared original XML ref
                editDiagramOriginalXmlRef.current.delete(toolCall.toolCallId)
                return
            }
            onExport()
            addToolOutput({
                tool: "edit_diagram",
                toolCallId: toolCall.toolCallId,
                output: `Successfully applied ${operations.length} operation(s) to the diagram.`,
            })
            // Clean up the shared original XML ref
            editDiagramOriginalXmlRef.current.delete(toolCall.toolCallId)
        } catch (error) {
            console.error("[edit_diagram] Failed:", error)

            const errorMessage =
                error instanceof Error ? error.message : String(error)

            addToolOutput({
                tool: "edit_diagram",
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: `Edit failed: ${errorMessage}

Current diagram XML:
\`\`\`xml
${currentXml || "No XML available"}
\`\`\`

Please check cell IDs and retry, or rebuild with restructure_diagram.`,
            })
            // Clean up the shared original XML ref even on error
            editDiagramOriginalXmlRef.current.delete(toolCall.toolCallId)
        }
    }

    /**
     * Structural editing. The model sends operations against the tree; the engine
     * re-derives that tree from whatever is on the canvas right now — including anything
     * the user moved or recoloured by hand — applies the operations, recomputes every
     * coordinate, and returns new XML.
     *
     * Nothing about the tree is stored between calls, so there is no second copy of the
     * state to drift out of sync with the canvas.
     */
    const handleRestructureDiagram = async (
        toolCall: ToolCall,
        addToolOutput: AddToolOutputFn,
    ) => {
        const { operations } = toolCall.input as { operations: Operation[] }

        // Read the live canvas, not the last thing we generated: the user may have
        // edited it since.
        let currentXml = ""
        try {
            currentXml = await onFetchChart(false)
        } catch {
            currentXml = chartXMLRef.current ?? ""
        }
        if (!isRealDiagram(currentXml)) currentXml = ""

        const result = restructureDiagram(currentXml, operations)

        if (result.errors.length > 0 || !result.xml) {
            addToolOutput({
                tool: "restructure_diagram",
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: `Could not apply the operations:
${result.errors.map((e) => `- ${e}`).join("\n")}

Structure as it stands:
${result.outline}

Fix the operations and call restructure_diagram again.`,
            })
            return
        }

        const loadError = onDisplayChart(result.xml)
        if (loadError) {
            addToolOutput({
                tool: "restructure_diagram",
                toolCallId: toolCall.toolCallId,
                state: "output-error",
                errorText: `The diagram was built but draw.io rejected it: ${loadError}`,
            })
            return
        }

        // Report the outline rather than the XML: it is what the model needs to name ids
        // in the next call, at a fraction of the tokens.
        const notes = result.warnings.length
            ? `\n\nNotes:\n${result.warnings.map((w) => `- ${w}`).join("\n")}`
            : ""
        addToolOutput({
            tool: "restructure_diagram",
            toolCallId: toolCall.toolCallId,
            output: `Diagram updated.\n\n${result.outline}${notes}`,
        })
    }

    return { handleToolCall }
}
