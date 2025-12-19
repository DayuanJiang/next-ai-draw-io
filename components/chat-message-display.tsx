"use client"

import type { UIMessage } from "ai"

import {
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    Cpu,
    FileCode,
    FileText,
    Pencil,
    RotateCcw,
    ThumbsDown,
    ThumbsUp,
    X,
} from "lucide-react"
import Image from "next/image"
import type { MutableRefObject } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { toast } from "sonner"
import {
    Reasoning,
    ReasoningContent,
    ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    applyDiagramOperations,
    convertToLegalXml,
    isMxCellXmlComplete,
    replaceNodes,
    validateAndFixXml,
} from "@/lib/utils"
import ExamplePanel from "./chat-example-panel"
import { CodeBlock } from "./code-block"

interface DiagramOperation {
    type: "update" | "add" | "delete"
    cell_id: string
    new_xml?: string
}

// Helper to extract complete operations from streaming input
function getCompleteOperations(
    operations: DiagramOperation[] | undefined,
): DiagramOperation[] {
    if (!operations || !Array.isArray(operations)) return []
    return operations.filter(
        (op) =>
            op &&
            typeof op.type === "string" &&
            ["update", "add", "delete"].includes(op.type) &&
            typeof op.cell_id === "string" &&
            op.cell_id.length > 0 &&
            // delete doesn't need new_xml, update/add do
            (op.type === "delete" || typeof op.new_xml === "string"),
    )
}

// Tool part interface for type safety
interface ToolPartLike {
    type: string
    toolCallId: string
    state?: string
    input?: {
        xml?: string
        operations?: DiagramOperation[]
    } & Record<string, unknown>
    output?: string
}

function OperationsDisplay({ operations }: { operations: DiagramOperation[] }) {
    return (
        <div className="space-y-3">
            {operations.map((op, index) => (
                <div
                    key={`${op.type}-${op.cell_id}-${index}`}
                    className="rounded-lg border border-border/50 overflow-hidden bg-background/50"
                >
                    <div className="px-3 py-1.5 bg-muted/40 border-b border-border/30 flex items-center gap-2">
                        <span
                            className={`text-[10px] font-medium uppercase tracking-wide ${
                                op.type === "delete"
                                    ? "text-red-600"
                                    : op.type === "add"
                                      ? "text-green-600"
                                      : "text-blue-600"
                            }`}
                        >
                            {op.type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            cell_id: {op.cell_id}
                        </span>
                    </div>
                    {op.new_xml && (
                        <div className="px-3 py-2">
                            <pre className="text-[11px] font-mono text-foreground/80 bg-muted/30 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                                {op.new_xml}
                            </pre>
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}

import { useDiagram } from "@/contexts/diagram-context"

// Helper to split text content into regular text and file sections (PDF or text files)
interface TextSection {
    type: "text" | "file"
    content: string
    filename?: string
    charCount?: number
    fileType?: "pdf" | "text"
}

function splitTextIntoFileSections(text: string): TextSection[] {
    const sections: TextSection[] = []
    // Match [PDF: filename] or [File: filename] patterns
    const filePattern =
        /\[(PDF|File):\s*([^\]]+)\]\n([\s\S]*?)(?=\n\n\[(PDF|File):|$)/g
    let lastIndex = 0
    let match

    while ((match = filePattern.exec(text)) !== null) {
        // Add text before this file section
        const beforeText = text.slice(lastIndex, match.index).trim()
        if (beforeText) {
            sections.push({ type: "text", content: beforeText })
        }

        // Add file section
        const fileType = match[1].toLowerCase() === "pdf" ? "pdf" : "text"
        const filename = match[2].trim()
        const fileContent = match[3].trim()
        sections.push({
            type: "file",
            content: fileContent,
            filename,
            charCount: fileContent.length,
            fileType,
        })

        lastIndex = match.index + match[0].length
    }

    // Add remaining text after last file section
    const remainingText = text.slice(lastIndex).trim()
    if (remainingText) {
        sections.push({ type: "text", content: remainingText })
    }

    // If no file sections found, return original text
    if (sections.length === 0) {
        sections.push({ type: "text", content: text })
    }

    return sections
}

const getMessageTextContent = (message: UIMessage): string => {
    if (!message.parts) return ""
    return message.parts
        .filter((part) => part.type === "text")
        .map((part) => (part as { text: string }).text)
        .join("\n")
}

// Get only the user's original text, excluding appended file content
const getUserOriginalText = (message: UIMessage): string => {
    const fullText = getMessageTextContent(message)
    // Strip out [PDF: ...] and [File: ...] sections that were appended
    const filePattern = /\n\n\[(PDF|File):\s*[^\]]+\]\n[\s\S]*$/
    return fullText.replace(filePattern, "").trim()
}

interface ChatMessageDisplayProps {
    messages: UIMessage[]
    setInput: (input: string) => void
    setFiles: (files: File[]) => void
    processedToolCallsRef: MutableRefObject<Set<string>>
    editDiagramOriginalXmlRef: MutableRefObject<Map<string, string>>
    sessionId?: string
    onRegenerate?: (messageIndex: number) => void
    onEditMessage?: (messageIndex: number, newText: string) => void
    status?: "streaming" | "submitted" | "idle" | "error" | "ready"
}

export function ChatMessageDisplay({
    messages,
    setInput,
    setFiles,
    processedToolCallsRef,
    editDiagramOriginalXmlRef,
    sessionId,
    onRegenerate,
    onEditMessage,
    status = "idle",
}: ChatMessageDisplayProps) {
    const { chartXML, loadDiagram: onDisplayChart } = useDiagram()
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const previousXML = useRef<string>("")
    const processedToolCalls = processedToolCallsRef
    // Track the last processed XML per toolCallId to skip redundant processing during streaming
    const lastProcessedXmlRef = useRef<Map<string, string>>(new Map())
    // Debounce streaming diagram updates - store pending XML and timeout
    const pendingXmlRef = useRef<string | null>(null)
    const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    )
    const STREAMING_DEBOUNCE_MS = 150 // Only update diagram every 150ms during streaming
    // Refs for edit_diagram streaming
    const pendingEditRef = useRef<{
        operations: DiagramOperation[]
        toolCallId: string
    } | null>(null)
    const editDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    )
    const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
        {},
    )
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
    const [copyFailedMessageId, setCopyFailedMessageId] = useState<
        string | null
    >(null)
    const [feedback, setFeedback] = useState<Record<string, "good" | "bad">>({})
    const [editingMessageId, setEditingMessageId] = useState<string | null>(
        null,
    )
    const editTextareaRef = useRef<HTMLTextAreaElement>(null)
    const [editText, setEditText] = useState<string>("")
    // Track which PDF sections are expanded (key: messageId-sectionIndex)
    const [expandedPdfSections, setExpandedPdfSections] = useState<
        Record<string, boolean>
    >({})

    const copyMessageToClipboard = async (messageId: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text)

            setCopiedMessageId(messageId)
            setTimeout(() => setCopiedMessageId(null), 2000)
        } catch (err) {
            // Fallback for non-secure contexts (HTTP) or permission denied
            const textarea = document.createElement("textarea")
            textarea.value = text
            textarea.style.position = "fixed"
            textarea.style.left = "-9999px"
            textarea.style.opacity = "0"
            document.body.appendChild(textarea)

            try {
                textarea.select()
                const success = document.execCommand("copy")
                if (!success) {
                    throw new Error("Copy command failed")
                }
                setCopiedMessageId(messageId)
                setTimeout(() => setCopiedMessageId(null), 2000)
            } catch (fallbackErr) {
                console.error("Failed to copy message:", fallbackErr)
                toast.error(
                    "Failed to copy message. Please copy manually or check clipboard permissions.",
                )
                setCopyFailedMessageId(messageId)
                setTimeout(() => setCopyFailedMessageId(null), 2000)
            } finally {
                document.body.removeChild(textarea)
            }
        }
    }

    const submitFeedback = async (messageId: string, value: "good" | "bad") => {
        // Toggle off if already selected
        if (feedback[messageId] === value) {
            setFeedback((prev) => {
                const next = { ...prev }
                delete next[messageId]
                return next
            })
            return
        }

        setFeedback((prev) => ({ ...prev, [messageId]: value }))

        try {
            await fetch("/api/log-feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messageId,
                    feedback: value,
                    sessionId,
                }),
            })
        } catch (error) {
            console.error("Failed to log feedback:", error)
            toast.error("Failed to record your feedback. Please try again.")
            // Revert optimistic UI update
            setFeedback((prev) => {
                const next = { ...prev }
                delete next[messageId]
                return next
            })
        }
    }

    const handleDisplayChart = useCallback(
        (xml: string, showToast = false) => {
            const currentXml = xml || ""
            const convertedXml = convertToLegalXml(currentXml)
            if (convertedXml !== previousXML.current) {
                // Parse and validate XML BEFORE calling replaceNodes
                const parser = new DOMParser()
                const testDoc = parser.parseFromString(convertedXml, "text/xml")
                const parseError = testDoc.querySelector("parsererror")

                if (parseError) {
                    // Use console.warn instead of console.error to avoid triggering
                    // Next.js dev mode error overlay for expected streaming states
                    // (partial XML during streaming is normal and will be fixed by subsequent updates)
                    if (showToast) {
                        // Only log as error and show toast if this is the final XML
                        console.error(
                            "[ChatMessageDisplay] Malformed XML detected in final output",
                        )
                        toast.error(
                            "AI generated invalid diagram XML. Please try regenerating.",
                        )
                    }
                    return // Skip this update
                }

                try {
                    // If chartXML is empty, create a default mxfile structure to use with replaceNodes
                    // This ensures the XML is properly wrapped in mxfile/diagram/mxGraphModel format
                    const baseXML =
                        chartXML ||
                        `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
                    const replacedXML = replaceNodes(baseXML, convertedXml)

                    // Validate and auto-fix the XML
                    const validation = validateAndFixXml(replacedXML)
                    if (validation.valid) {
                        previousXML.current = convertedXml
                        // Use fixed XML if available, otherwise use original
                        const xmlToLoad = validation.fixed || replacedXML
                        if (validation.fixes.length > 0) {
                            console.log(
                                "[ChatMessageDisplay] Auto-fixed XML issues:",
                                validation.fixes,
                            )
                        }
                        // Skip validation in loadDiagram since we already validated above
                        onDisplayChart(xmlToLoad, true)
                    } else {
                        console.error(
                            "[ChatMessageDisplay] XML validation failed:",
                            validation.error,
                        )
                        // Only show toast if this is the final XML (not during streaming)
                        if (showToast) {
                            toast.error(
                                "Diagram validation failed. Please try regenerating.",
                            )
                        }
                    }
                } catch (error) {
                    console.error(
                        "[ChatMessageDisplay] Error processing XML:",
                        error,
                    )
                    // Only show toast if this is the final XML (not during streaming)
                    if (showToast) {
                        toast.error(
                            "Failed to process diagram. Please try regenerating.",
                        )
                    }
                }
            }
        },
        [chartXML, onDisplayChart],
    )

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }, [messages])

    useEffect(() => {
        if (editingMessageId && editTextareaRef.current) {
            editTextareaRef.current.focus()
        }
    }, [editingMessageId])

    useEffect(() => {
        // Only process the last message for streaming performance
        // Previous messages are already processed and won't change
        const messagesToProcess =
            messages.length > 0 ? [messages[messages.length - 1]] : []

        messagesToProcess.forEach((message) => {
            if (message.parts) {
                message.parts.forEach((part) => {
                    if (part.type?.startsWith("tool-")) {
                        const toolPart = part as ToolPartLike
                        const { toolCallId, state, input } = toolPart

                        if (state === "output-available") {
                            setExpandedTools((prev) => ({
                                ...prev,
                                [toolCallId]: false,
                            }))
                        }

                        if (
                            part.type === "tool-display_diagram" &&
                            input?.xml
                        ) {
                            const xml = input.xml as string

                            // Skip if XML hasn't changed since last processing
                            const lastXml =
                                lastProcessedXmlRef.current.get(toolCallId)
                            if (lastXml === xml) {
                                return // Skip redundant processing
                            }

                            if (
                                state === "input-streaming" ||
                                state === "input-available"
                            ) {
                                // Debounce streaming updates - queue the XML and process after delay
                                pendingXmlRef.current = xml

                                if (!debounceTimeoutRef.current) {
                                    // No pending timeout - set one up
                                    debounceTimeoutRef.current = setTimeout(
                                        () => {
                                            const pendingXml =
                                                pendingXmlRef.current
                                            debounceTimeoutRef.current = null
                                            pendingXmlRef.current = null
                                            if (pendingXml) {
                                                handleDisplayChart(
                                                    pendingXml,
                                                    false,
                                                )
                                                lastProcessedXmlRef.current.set(
                                                    toolCallId,
                                                    pendingXml,
                                                )
                                            }
                                        },
                                        STREAMING_DEBOUNCE_MS,
                                    )
                                }
                            } else if (
                                state === "output-available" &&
                                !processedToolCalls.current.has(toolCallId)
                            ) {
                                // Final output - process immediately (clear any pending debounce)
                                if (debounceTimeoutRef.current) {
                                    clearTimeout(debounceTimeoutRef.current)
                                    debounceTimeoutRef.current = null
                                    pendingXmlRef.current = null
                                }
                                // Show toast only if final XML is malformed
                                handleDisplayChart(xml, true)
                                processedToolCalls.current.add(toolCallId)
                                // Clean up the ref entry - tool is complete, no longer needed
                                lastProcessedXmlRef.current.delete(toolCallId)
                            }
                        }

                        // Handle edit_diagram streaming - apply operations incrementally for preview
                        // Uses shared editDiagramOriginalXmlRef to coordinate with tool handler
                        if (
                            part.type === "tool-edit_diagram" &&
                            input?.operations
                        ) {
                            const completeOps = getCompleteOperations(
                                input.operations as DiagramOperation[],
                            )

                            if (completeOps.length === 0) return

                            // Capture original XML when streaming starts (store in shared ref)
                            if (
                                !editDiagramOriginalXmlRef.current.has(
                                    toolCallId,
                                )
                            ) {
                                if (!chartXML) {
                                    console.warn(
                                        "[edit_diagram streaming] No chart XML available",
                                    )
                                    return
                                }
                                editDiagramOriginalXmlRef.current.set(
                                    toolCallId,
                                    chartXML,
                                )
                            }

                            const originalXml =
                                editDiagramOriginalXmlRef.current.get(
                                    toolCallId,
                                )
                            if (!originalXml) return

                            // Skip if no change from last processed state
                            const lastCount = lastProcessedXmlRef.current.get(
                                toolCallId + "-opCount",
                            )
                            if (lastCount === String(completeOps.length)) return

                            if (
                                state === "input-streaming" ||
                                state === "input-available"
                            ) {
                                // Queue the operations for debounced processing
                                pendingEditRef.current = {
                                    operations: completeOps,
                                    toolCallId,
                                }

                                if (!editDebounceTimeoutRef.current) {
                                    editDebounceTimeoutRef.current = setTimeout(
                                        () => {
                                            const pending =
                                                pendingEditRef.current
                                            editDebounceTimeoutRef.current =
                                                null
                                            pendingEditRef.current = null

                                            if (pending) {
                                                const origXml =
                                                    editDiagramOriginalXmlRef.current.get(
                                                        pending.toolCallId,
                                                    )
                                                if (!origXml) return

                                                try {
                                                    const {
                                                        result: editedXml,
                                                    } = applyDiagramOperations(
                                                        origXml,
                                                        pending.operations,
                                                    )
                                                    handleDisplayChart(
                                                        editedXml,
                                                        false,
                                                    )
                                                    lastProcessedXmlRef.current.set(
                                                        pending.toolCallId +
                                                            "-opCount",
                                                        String(
                                                            pending.operations
                                                                .length,
                                                        ),
                                                    )
                                                } catch (e) {
                                                    console.warn(
                                                        `[edit_diagram streaming] Operation failed:`,
                                                        e instanceof Error
                                                            ? e.message
                                                            : e,
                                                    )
                                                }
                                            }
                                        },
                                        STREAMING_DEBOUNCE_MS,
                                    )
                                }
                            } else if (
                                state === "output-available" &&
                                !processedToolCalls.current.has(toolCallId)
                            ) {
                                // Final state - cleanup streaming refs (tool handler does final application)
                                if (editDebounceTimeoutRef.current) {
                                    clearTimeout(editDebounceTimeoutRef.current)
                                    editDebounceTimeoutRef.current = null
                                }
                                lastProcessedXmlRef.current.delete(
                                    toolCallId + "-opCount",
                                )
                                processedToolCalls.current.add(toolCallId)
                                // Note: Don't delete editDiagramOriginalXmlRef here - tool handler needs it
                            }
                        }
                    }
                })
            }
        })

        // Cleanup: clear any pending debounce timeout on unmount
        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current)
                debounceTimeoutRef.current = null
            }
            if (editDebounceTimeoutRef.current) {
                clearTimeout(editDebounceTimeoutRef.current)
                editDebounceTimeoutRef.current = null
            }
        }
    }, [messages, handleDisplayChart, chartXML])

    const renderToolPart = (part: ToolPartLike) => {
        const callId = part.toolCallId
        const { state, input, output } = part
        const isExpanded = expandedTools[callId] ?? true
        const toolName = part.type?.replace("tool-", "")

        const toggleExpanded = () => {
            setExpandedTools((prev) => ({
                ...prev,
                [callId]: !isExpanded,
            }))
        }

        const getToolDisplayName = (name: string) => {
            switch (name) {
                case "display_diagram":
                    return "Generate Diagram"
                case "edit_diagram":
                    return "Edit Diagram"
                default:
                    return name
            }
        }

        return (
            <div
                key={callId}
                className="my-3 rounded-xl border border-border/60 bg-muted/30 overflow-hidden"
            >
                <div className="flex items-center justify-between px-4 py-3 bg-muted/50">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                            <Cpu className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground/80">
                            {getToolDisplayName(toolName)}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {state === "input-streaming" && (
                            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        )}
                        {state === "output-available" && (
                            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                Complete
                            </span>
                        )}
                        {state === "output-error" &&
                            (() => {
                                // Check if this is a truncation (incomplete XML) vs real error
                                const isTruncated =
                                    (toolName === "display_diagram" ||
                                        toolName === "append_diagram") &&
                                    !isMxCellXmlComplete(input?.xml)
                                return isTruncated ? (
                                    <span className="text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
                                        Truncated
                                    </span>
                                ) : (
                                    <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                        Error
                                    </span>
                                )
                            })()}
                        {input && Object.keys(input).length > 0 && (
                            <button
                                type="button"
                                onClick={toggleExpanded}
                                className="p-1 rounded hover:bg-muted transition-colors"
                            >
                                {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                )}
                            </button>
                        )}
                    </div>
                </div>
                {input && isExpanded && (
                    <div className="px-4 py-3 border-t border-border/40 bg-muted/20">
                        {typeof input === "object" && input.xml ? (
                            <CodeBlock code={input.xml} language="xml" />
                        ) : typeof input === "object" &&
                          input.operations &&
                          Array.isArray(input.operations) ? (
                            <OperationsDisplay operations={input.operations} />
                        ) : typeof input === "object" &&
                          Object.keys(input).length > 0 ? (
                            <CodeBlock
                                code={JSON.stringify(input, null, 2)}
                                language="json"
                            />
                        ) : null}
                    </div>
                )}
                {output &&
                    state === "output-error" &&
                    (() => {
                        const isTruncated =
                            (toolName === "display_diagram" ||
                                toolName === "append_diagram") &&
                            !isMxCellXmlComplete(input?.xml)
                        return (
                            <div
                                className={`px-4 py-3 border-t border-border/40 text-sm ${isTruncated ? "text-yellow-600" : "text-red-600"}`}
                            >
                                {isTruncated
                                    ? "Output truncated due to length limits. Try a simpler request or increase the maxOutputLength."
                                    : output}
                            </div>
                        )
                    })()}
            </div>
        )
    }

    return (
        <ScrollArea className="h-full w-full scrollbar-thin">
            {messages.length === 0 ? (
                <ExamplePanel setInput={setInput} setFiles={setFiles} />
            ) : (
                <div className="py-4 px-4 space-y-4">
                    {messages.map((message, messageIndex) => {
                        const userMessageText =
                            message.role === "user"
                                ? getMessageTextContent(message)
                                : ""
                        const isLastAssistantMessage =
                            message.role === "assistant" &&
                            (messageIndex === messages.length - 1 ||
                                messages
                                    .slice(messageIndex + 1)
                                    .every((m) => m.role !== "assistant"))
                        const isLastUserMessage =
                            message.role === "user" &&
                            (messageIndex === messages.length - 1 ||
                                messages
                                    .slice(messageIndex + 1)
                                    .every((m) => m.role !== "user"))
                        const isEditing = editingMessageId === message.id
                        return (
                            <div
                                key={message.id}
                                className={`flex w-full ${message.role === "user" ? "justify-end" : "justify-start"} animate-message-in`}
                                style={{
                                    animationDelay: `${messageIndex * 50}ms`,
                                }}
                            >
                                {message.role === "user" &&
                                    userMessageText &&
                                    !isEditing && (
                                        <div className="flex items-center gap-1 self-center mr-2">
                                            {/* Edit button - only on last user message */}
                                            {onEditMessage &&
                                                isLastUserMessage && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingMessageId(
                                                                message.id,
                                                            )
                                                            setEditText(
                                                                getUserOriginalText(
                                                                    message,
                                                                ),
                                                            )
                                                        }}
                                                        className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted transition-colors"
                                                        title="Edit message"
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    copyMessageToClipboard(
                                                        message.id,
                                                        userMessageText,
                                                    )
                                                }
                                                className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted transition-colors"
                                                title={
                                                    copiedMessageId ===
                                                    message.id
                                                        ? "Copied!"
                                                        : copyFailedMessageId ===
                                                            message.id
                                                          ? "Failed to copy"
                                                          : "Copy message"
                                                }
                                            >
                                                {copiedMessageId ===
                                                message.id ? (
                                                    <Check className="h-3.5 w-3.5 text-green-500" />
                                                ) : copyFailedMessageId ===
                                                  message.id ? (
                                                    <X className="h-3.5 w-3.5 text-red-500" />
                                                ) : (
                                                    <Copy className="h-3.5 w-3.5" />
                                                )}
                                            </button>
                                        </div>
                                    )}
                                <div className="max-w-[85%] min-w-0">
                                    {/* Reasoning blocks - displayed first for assistant messages */}
                                    {message.role === "assistant" &&
                                        message.parts?.map(
                                            (part, partIndex) => {
                                                if (part.type === "reasoning") {
                                                    const reasoningPart =
                                                        part as {
                                                            type: "reasoning"
                                                            text: string
                                                        }
                                                    const isLastPart =
                                                        partIndex ===
                                                        (message.parts
                                                            ?.length ?? 0) -
                                                            1
                                                    const isLastMessage =
                                                        message.id ===
                                                        messages[
                                                            messages.length - 1
                                                        ]?.id
                                                    const isStreamingReasoning =
                                                        status ===
                                                            "streaming" &&
                                                        isLastPart &&
                                                        isLastMessage

                                                    return (
                                                        <Reasoning
                                                            key={`${message.id}-reasoning-${partIndex}`}
                                                            className="w-full"
                                                            isStreaming={
                                                                isStreamingReasoning
                                                            }
                                                        >
                                                            <ReasoningTrigger />
                                                            <ReasoningContent>
                                                                {
                                                                    reasoningPart.text
                                                                }
                                                            </ReasoningContent>
                                                        </Reasoning>
                                                    )
                                                }
                                                return null
                                            },
                                        )}
                                    {/* Edit mode for user messages */}
                                    {isEditing && message.role === "user" ? (
                                        <div className="flex flex-col gap-2">
                                            <textarea
                                                ref={editTextareaRef}
                                                value={editText}
                                                onChange={(e) =>
                                                    setEditText(e.target.value)
                                                }
                                                className="w-full min-w-[300px] px-4 py-3 text-sm rounded-2xl border border-primary bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                                                rows={Math.min(
                                                    editText.split("\n")
                                                        .length + 1,
                                                    6,
                                                )}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Escape") {
                                                        setEditingMessageId(
                                                            null,
                                                        )
                                                        setEditText("")
                                                    } else if (
                                                        e.key === "Enter" &&
                                                        (e.metaKey || e.ctrlKey)
                                                    ) {
                                                        e.preventDefault()
                                                        if (
                                                            editText.trim() &&
                                                            onEditMessage
                                                        ) {
                                                            onEditMessage(
                                                                messageIndex,
                                                                editText.trim(),
                                                            )
                                                            setEditingMessageId(
                                                                null,
                                                            )
                                                            setEditText("")
                                                        }
                                                    }
                                                }}
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingMessageId(
                                                            null,
                                                        )
                                                        setEditText("")
                                                    }}
                                                    className="px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (
                                                            editText.trim() &&
                                                            onEditMessage
                                                        ) {
                                                            onEditMessage(
                                                                messageIndex,
                                                                editText.trim(),
                                                            )
                                                            setEditingMessageId(
                                                                null,
                                                            )
                                                            setEditText("")
                                                        }
                                                    }}
                                                    disabled={!editText.trim()}
                                                    className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                                >
                                                    Save & Submit
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Render parts in order, grouping consecutive text/file parts into bubbles */
                                        (() => {
                                            const parts = message.parts || []
                                            const groups: {
                                                type: "content" | "tool"
                                                parts: typeof parts
                                                startIndex: number
                                            }[] = []

                                            parts.forEach((part, index) => {
                                                const isToolPart =
                                                    part.type?.startsWith(
                                                        "tool-",
                                                    )
                                                const isContentPart =
                                                    part.type === "text" ||
                                                    part.type === "file"

                                                if (isToolPart) {
                                                    groups.push({
                                                        type: "tool",
                                                        parts: [part],
                                                        startIndex: index,
                                                    })
                                                } else if (isContentPart) {
                                                    const lastGroup =
                                                        groups[
                                                            groups.length - 1
                                                        ]
                                                    if (
                                                        lastGroup?.type ===
                                                        "content"
                                                    ) {
                                                        lastGroup.parts.push(
                                                            part,
                                                        )
                                                    } else {
                                                        groups.push({
                                                            type: "content",
                                                            parts: [part],
                                                            startIndex: index,
                                                        })
                                                    }
                                                }
                                            })

                                            return groups.map(
                                                (group, groupIndex) => {
                                                    if (group.type === "tool") {
                                                        return renderToolPart(
                                                            group
                                                                .parts[0] as ToolPartLike,
                                                        )
                                                    }

                                                    // Content bubble
                                                    return (
                                                        <div
                                                            key={`${message.id}-content-${group.startIndex}`}
                                                            className={`px-5 py-3.5 text-sm leading-7 shadow-sm transition-all duration-300 ${
                                                                message.role ===
                                                                "user"
                                                                    ? "bg-primary text-primary-foreground rounded-[20px] rounded-br-md ml-12"
                                                                    : message.role ===
                                                                        "system"
                                                                      ? "bg-destructive/5 text-destructive border border-destructive/10 rounded-xl rounded-bl-md mr-12"
                                                                      : "bg-background border border-border/50 text-foreground rounded-[20px] rounded-bl-md mr-12 shadow-soft"
                                                            } ${message.role === "user" && isLastUserMessage && onEditMessage ? "cursor-pointer hover:brightness-110" : ""} ${groupIndex > 0 ? "mt-2" : ""}`}
                                                            role={
                                                                message.role ===
                                                                    "user" &&
                                                                isLastUserMessage &&
                                                                onEditMessage
                                                                    ? "button"
                                                                    : undefined
                                                            }
                                                            tabIndex={
                                                                message.role ===
                                                                    "user" &&
                                                                isLastUserMessage &&
                                                                onEditMessage
                                                                    ? 0
                                                                    : undefined
                                                            }
                                                            onClick={() => {
                                                                if (
                                                                    message.role ===
                                                                        "user" &&
                                                                    isLastUserMessage &&
                                                                    onEditMessage
                                                                ) {
                                                                    setEditingMessageId(
                                                                        message.id,
                                                                    )
                                                                    setEditText(
                                                                        getUserOriginalText(
                                                                            message,
                                                                        ),
                                                                    )
                                                                }
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (
                                                                    (e.key ===
                                                                        "Enter" ||
                                                                        e.key ===
                                                                            " ") &&
                                                                    message.role ===
                                                                        "user" &&
                                                                    isLastUserMessage &&
                                                                    onEditMessage
                                                                ) {
                                                                    e.preventDefault()
                                                                    setEditingMessageId(
                                                                        message.id,
                                                                    )
                                                                    setEditText(
                                                                        getUserOriginalText(
                                                                            message,
                                                                        ),
                                                                    )
                                                                }
                                                            }}
                                                            title={
                                                                message.role ===
                                                                    "user" &&
                                                                isLastUserMessage &&
                                                                onEditMessage
                                                                    ? "Click to edit"
                                                                    : undefined
                                                            }
                                                        >
                                                            {group.parts.map(
                                                                (
                                                                    part,
                                                                    partIndex,
                                                                ) => {
                                                                    if (
                                                                        part.type ===
                                                                        "text"
                                                                    ) {
                                                                        const textContent =
                                                                            (
                                                                                part as {
                                                                                    text: string
                                                                                }
                                                                            )
                                                                                .text
                                                                        const sections =
                                                                            splitTextIntoFileSections(
                                                                                textContent,
                                                                            )
                                                                        return (
                                                                            <div
                                                                                key={`${message.id}-text-${group.startIndex}-${partIndex}`}
                                                                                className="space-y-2"
                                                                            >
                                                                                {sections.map(
                                                                                    (
                                                                                        section,
                                                                                        sectionIndex,
                                                                                    ) => {
                                                                                        if (
                                                                                            section.type ===
                                                                                            "file"
                                                                                        ) {
                                                                                            const pdfKey = `${message.id}-file-${partIndex}-${sectionIndex}`
                                                                                            const isExpanded =
                                                                                                expandedPdfSections[
                                                                                                    pdfKey
                                                                                                ] ??
                                                                                                false
                                                                                            const charDisplay =
                                                                                                section.charCount &&
                                                                                                section.charCount >=
                                                                                                    1000
                                                                                                    ? `${(section.charCount / 1000).toFixed(1)}k`
                                                                                                    : section.charCount
                                                                                            return (
                                                                                                <div
                                                                                                    key={
                                                                                                        pdfKey
                                                                                                    }
                                                                                                    className="rounded-lg border border-border/60 bg-muted/30 overflow-hidden"
                                                                                                >
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={(
                                                                                                            e,
                                                                                                        ) => {
                                                                                                            e.stopPropagation()
                                                                                                            setExpandedPdfSections(
                                                                                                                (
                                                                                                                    prev,
                                                                                                                ) => ({
                                                                                                                    ...prev,
                                                                                                                    [pdfKey]:
                                                                                                                        !isExpanded,
                                                                                                                }),
                                                                                                            )
                                                                                                        }}
                                                                                                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
                                                                                                    >
                                                                                                        <div className="flex items-center gap-2">
                                                                                                            {section.fileType ===
                                                                                                            "pdf" ? (
                                                                                                                <FileText className="h-4 w-4 text-red-500" />
                                                                                                            ) : (
                                                                                                                <FileCode className="h-4 w-4 text-blue-500" />
                                                                                                            )}
                                                                                                            <span className="text-xs font-medium">
                                                                                                                {
                                                                                                                    section.filename
                                                                                                                }
                                                                                                            </span>
                                                                                                            <span className="text-[10px] text-muted-foreground">
                                                                                                                (
                                                                                                                {
                                                                                                                    charDisplay
                                                                                                                }{" "}
                                                                                                                chars)
                                                                                                            </span>
                                                                                                        </div>
                                                                                                        {isExpanded ? (
                                                                                                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                                                                                        ) : (
                                                                                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                                                                        )}
                                                                                                    </button>
                                                                                                    {isExpanded && (
                                                                                                        <div className="px-3 py-2 border-t border-border/40 max-h-48 overflow-y-auto bg-muted/30">
                                                                                                            <pre className="text-xs whitespace-pre-wrap text-foreground/80">
                                                                                                                {
                                                                                                                    section.content
                                                                                                                }
                                                                                                            </pre>
                                                                                                        </div>
                                                                                                    )}
                                                                                                </div>
                                                                                            )
                                                                                        }
                                                                                        // Regular text section
                                                                                        return (
                                                                                            <div
                                                                                                key={`${message.id}-textsection-${partIndex}-${sectionIndex}`}
                                                                                                className={`prose prose-sm max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 ${
                                                                                                    message.role ===
                                                                                                    "user"
                                                                                                        ? "[&_*]:!text-primary-foreground prose-code:bg-white/20"
                                                                                                        : "dark:prose-invert"
                                                                                                }`}
                                                                                            >
                                                                                                <ReactMarkdown>
                                                                                                    {
                                                                                                        section.content
                                                                                                    }
                                                                                                </ReactMarkdown>
                                                                                            </div>
                                                                                        )
                                                                                    },
                                                                                )}
                                                                            </div>
                                                                        )
                                                                    }
                                                                    if (
                                                                        part.type ===
                                                                        "file"
                                                                    ) {
                                                                        return (
                                                                            <div
                                                                                key={`${message.id}-file-${group.startIndex}-${partIndex}`}
                                                                                className="mt-2"
                                                                            >
                                                                                <Image
                                                                                    src={
                                                                                        (
                                                                                            part as {
                                                                                                url: string
                                                                                            }
                                                                                        )
                                                                                            .url
                                                                                    }
                                                                                    width={
                                                                                        200
                                                                                    }
                                                                                    height={
                                                                                        200
                                                                                    }
                                                                                    alt={`Uploaded diagram or image for AI analysis`}
                                                                                    className="rounded-lg border border-white/20"
                                                                                    style={{
                                                                                        objectFit:
                                                                                            "contain",
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                        )
                                                                    }
                                                                    return null
                                                                },
                                                            )}
                                                        </div>
                                                    )
                                                },
                                            )
                                        })()
                                    )}
                                    {/* Action buttons for assistant messages */}
                                    {message.role === "assistant" && (
                                        <div className="flex items-center gap-1 mt-2">
                                            {/* Copy button */}
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    copyMessageToClipboard(
                                                        message.id,
                                                        getMessageTextContent(
                                                            message,
                                                        ),
                                                    )
                                                }
                                                className={`p-1.5 rounded-lg transition-colors ${
                                                    copiedMessageId ===
                                                    message.id
                                                        ? "text-green-600 bg-green-100"
                                                        : "text-muted-foreground/60 hover:text-foreground hover:bg-muted"
                                                }`}
                                                title={
                                                    copiedMessageId ===
                                                    message.id
                                                        ? "Copied!"
                                                        : "Copy response"
                                                }
                                            >
                                                {copiedMessageId ===
                                                message.id ? (
                                                    <Check className="h-3.5 w-3.5" />
                                                ) : (
                                                    <Copy className="h-3.5 w-3.5" />
                                                )}
                                            </button>
                                            {/* Regenerate button - only on last assistant message, not for cached examples */}
                                            {onRegenerate &&
                                                isLastAssistantMessage &&
                                                !message.parts?.some((p: any) =>
                                                    p.toolCallId?.startsWith(
                                                        "cached-",
                                                    ),
                                                ) && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            onRegenerate(
                                                                messageIndex,
                                                            )
                                                        }
                                                        className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                                                        title="Regenerate response"
                                                    >
                                                        <RotateCcw className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            {/* Divider */}
                                            <div className="w-px h-4 bg-border mx-1" />
                                            {/* Thumbs up */}
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    submitFeedback(
                                                        message.id,
                                                        "good",
                                                    )
                                                }
                                                className={`p-1.5 rounded-lg transition-colors ${
                                                    feedback[message.id] ===
                                                    "good"
                                                        ? "text-green-600 bg-green-100"
                                                        : "text-muted-foreground/60 hover:text-green-600 hover:bg-green-50"
                                                }`}
                                                title="Good response"
                                            >
                                                <ThumbsUp className="h-3.5 w-3.5" />
                                            </button>
                                            {/* Thumbs down */}
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    submitFeedback(
                                                        message.id,
                                                        "bad",
                                                    )
                                                }
                                                className={`p-1.5 rounded-lg transition-colors ${
                                                    feedback[message.id] ===
                                                    "bad"
                                                        ? "text-red-600 bg-red-100"
                                                        : "text-muted-foreground/60 hover:text-red-600 hover:bg-red-50"
                                                }`}
                                                title="Bad response"
                                            >
                                                <ThumbsDown className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
            <div ref={messagesEndRef} />
        </ScrollArea>
    )
}
