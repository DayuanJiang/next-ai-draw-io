"use client"

import type { UIMessage } from "ai"

import {
    Check,
    ChevronDown,
    ChevronUp,
    Copy,
    FileCode,
    FileText,
    Link,
    Pencil,
    RotateCcw,
    ThumbsDown,
    ThumbsUp,
    X,
} from "lucide-react"
import type { MutableRefObject } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { toast } from "sonner"
import {
    Reasoning,
    ReasoningContent,
    ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import { ChatLobby } from "@/components/chat/ChatLobby"
import { ToolCallCard } from "@/components/chat/ToolCallCard"
import type { DiagramOperation, ToolPartLike } from "@/components/chat/types"
import type { ValidationState } from "@/components/chat/ValidationCard"
import { ValidationCard } from "@/components/chat/ValidationCard"
import Image from "@/components/image-with-basepath"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useDictionary } from "@/hooks/use-dictionary"
import { getApiEndpoint } from "@/lib/base-path"
import {
    applyDiagramOperations,
    convertToLegalXml,
    extractCompleteMxCells,
    replaceNodes,
    validateAndFixXml,
} from "@/lib/utils"

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

import { useDiagram } from "@/contexts/diagram-context"

// Helper to split text content into regular text and file/URL sections (PDF, text files, or URLs)
interface TextSection {
    type: "text" | "file" | "url"
    content: string
    filename?: string
    charCount?: number
    fileType?: "pdf" | "text" | "url"
}

function splitTextIntoFileSections(text: string): TextSection[] {
    const sections: TextSection[] = []
    // Match [PDF: filename], [File: filename], or [URL: url] patterns
    const filePattern =
        /\[(PDF|File|URL):\s*([^\]]+)\]\n([\s\S]*?)(?=\n\n\[(PDF|File|URL):|$)/g
    let lastIndex = 0
    let match

    while ((match = filePattern.exec(text)) !== null) {
        // Add text before this file section
        const beforeText = text.slice(lastIndex, match.index).trim()
        if (beforeText) {
            sections.push({ type: "text", content: beforeText })
        }

        // Add file/url section
        const sectionType = match[1].toLowerCase()
        const fileType =
            sectionType === "pdf"
                ? "pdf"
                : sectionType === "url"
                  ? "url"
                  : "text"
        const filename = match[2].trim()
        const content = match[3].trim()
        sections.push({
            type: sectionType === "url" ? "url" : "file",
            content: content,
            filename,
            charCount: content.length,
            fileType,
        })

        lastIndex = match.index + match[0].length
    }

    // Add remaining text after last section
    const remainingText = text.slice(lastIndex).trim()
    if (remainingText) {
        sections.push({ type: "text", content: remainingText })
    }

    // If no file/url sections found, return original text
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
    // Strip out [PDF: ...], [File: ...], and [URL: ...] sections that were appended
    const filePattern = /\n\n\[(PDF|File|URL):\s*[^\]]+\]\n[\s\S]*$/
    return fullText.replace(filePattern, "").trim()
}

interface SessionMetadata {
    id: string
    title: string
    updatedAt: number
    thumbnailDataUrl?: string
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
    isRestored?: boolean
    sessions?: SessionMetadata[]
    onSelectSession?: (id: string) => void
    onDeleteSession?: (id: string) => void
    loadedMessageIdsRef?: MutableRefObject<Set<string>>
    validationStates?: Record<string, ValidationState>
    onImproveWithSuggestions?: (feedback: string) => void
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
    isRestored = false,
    sessions = [],
    onSelectSession,
    onDeleteSession,
    loadedMessageIdsRef,
    validationStates = {},
    onImproveWithSuggestions,
}: ChatMessageDisplayProps) {
    const dict = useDictionary()
    const { chartXML, loadDiagram: onDisplayChart } = useDiagram()
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const scrollTopRef = useRef<HTMLDivElement>(null)
    const previousXML = useRef<string>("")
    const processedToolCalls = processedToolCallsRef
    // Track the last processed XML per toolCallId to skip redundant processing during streaming
    const lastProcessedXmlRef = useRef<Map<string, string>>(new Map())

    // Reset refs when messages become empty (new chat or session switch)
    // This ensures cached examples work correctly after starting a new session
    useEffect(() => {
        if (messages.length === 0) {
            previousXML.current = ""
            lastProcessedXmlRef.current.clear()
            // Note: processedToolCalls is passed from parent, so we clear it too
            processedToolCalls.current.clear()
            // Scroll to top to show newest history items
            scrollTopRef.current?.scrollIntoView({ behavior: "instant" })
        }
    }, [messages.length, processedToolCalls])
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
    const [copiedToolCallId, setCopiedToolCallId] = useState<string | null>(
        null,
    )
    const [copyFailedToolCallId, setCopyFailedToolCallId] = useState<
        string | null
    >(null)
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

    const setCopyState = (
        messageId: string,
        isToolCall: boolean,
        isSuccess: boolean,
    ) => {
        if (isSuccess) {
            if (isToolCall) {
                setCopiedToolCallId(messageId)
                setTimeout(() => setCopiedToolCallId(null), 2000)
            } else {
                setCopiedMessageId(messageId)
                setTimeout(() => setCopiedMessageId(null), 2000)
            }
        } else {
            if (isToolCall) {
                setCopyFailedToolCallId(messageId)
                setTimeout(() => setCopyFailedToolCallId(null), 2000)
            } else {
                setCopyFailedMessageId(messageId)
                setTimeout(() => setCopyFailedMessageId(null), 2000)
            }
        }
    }

    const copyMessageToClipboard = async (
        messageId: string,
        text: string,
        isToolCall = false,
    ) => {
        try {
            await navigator.clipboard.writeText(text)
            setCopyState(messageId, isToolCall, true)
        } catch (_err) {
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
                setCopyState(messageId, isToolCall, true)
            } catch (fallbackErr) {
                console.error("Failed to copy message:", fallbackErr)
                toast.error(dict.chat.failedToCopyDetail)
                setCopyState(messageId, isToolCall, false)
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
            await fetch(getApiEndpoint("/api/log-feedback"), {
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
            toast.error(dict.errors.failedToRecordFeedback)
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
            let currentXml = xml || ""

            // During streaming (showToast=false), extract only complete mxCell elements
            // This allows progressive rendering even with partial/incomplete trailing XML
            if (!showToast) {
                const completeCells = extractCompleteMxCells(currentXml)
                if (!completeCells) {
                    return
                }
                currentXml = completeCells
            }

            const convertedXml = convertToLegalXml(currentXml)
            if (convertedXml !== previousXML.current) {
                // Parse and validate XML BEFORE calling replaceNodes
                const parser = new DOMParser()
                // Wrap in root element for parsing multiple mxCell elements
                const testDoc = parser.parseFromString(
                    `<root>${convertedXml}</root>`,
                    "text/xml",
                )
                const parseError = testDoc.querySelector("parsererror")

                if (parseError) {
                    // Only show toast if this is the final XML (not during streaming)
                    if (showToast) {
                        toast.error(dict.errors.malformedXml)
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

                    // During streaming (showToast=false), skip heavy validation for lower latency
                    // The quick DOM parse check above catches malformed XML
                    // Full validation runs on final output (showToast=true)
                    if (!showToast) {
                        previousXML.current = convertedXml
                        onDisplayChart(replacedXML, true)
                        return
                    }

                    // Final output: run full validation and auto-fix
                    const validation = validateAndFixXml(replacedXML)
                    if (validation.valid) {
                        previousXML.current = convertedXml
                        // Use fixed XML if available, otherwise use original
                        const xmlToLoad = validation.fixed || replacedXML
                        onDisplayChart(xmlToLoad, true)
                    } else {
                        toast.error(dict.errors.validationFailed)
                    }
                } catch (error) {
                    console.error("Error processing XML:", error)
                    // Only show toast if this is the final XML (not during streaming)
                    if (showToast) {
                        toast.error(dict.errors.failedToProcess)
                    }
                }
            }
        },
        [chartXML, onDisplayChart],
    )

    // Track previous message count to detect bulk loads vs streaming
    const prevMessageCountRef = useRef(0)

    useEffect(() => {
        if (messagesEndRef.current && messages.length > 0) {
            const prevCount = prevMessageCountRef.current
            const currentCount = messages.length
            prevMessageCountRef.current = currentCount

            // Bulk load (session restore) - instant scroll, no animation
            if (prevCount === 0 || currentCount - prevCount > 1) {
                messagesEndRef.current.scrollIntoView({ behavior: "instant" })
                return
            }

            // Single message added - smooth scroll
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

                        // Auto-collapse on completion, but only if user hasn't manually toggled
                        if (state === "output-available") {
                            setExpandedTools((prev) => {
                                // Only auto-collapse if not already set (user hasn't interacted)
                                if (prev[toolCallId] === undefined) {
                                    return { ...prev, [toolCallId]: false }
                                }
                                return prev
                            })
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

        // NOTE: Don't cleanup debounce timeouts here!
        // The cleanup runs on every re-render (when messages changes),
        // which would cancel the timeout before it fires.
        // Let the timeouts complete naturally - they're harmless if component unmounts.
    }, [messages, handleDisplayChart, chartXML])

    return (
        <ScrollArea className="h-full w-full scrollbar-thin">
            <div ref={scrollTopRef} />
            {messages.length === 0 && isRestored ? (
                <ChatLobby
                    sessions={sessions}
                    onSelectSession={onSelectSession || (() => {})}
                    onDeleteSession={onDeleteSession}
                    setInput={setInput}
                    setFiles={setFiles}
                    dict={dict}
                />
            ) : messages.length === 0 ? null : (
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
                        // Skip animation for loaded messages (from session restore)
                        const isRestoredMessage =
                            loadedMessageIdsRef?.current.has(message.id) ??
                            false
                        return (
                            <div
                                key={message.id}
                                className={`flex w-full ${message.role === "user" ? "justify-end" : "justify-start"} ${isRestoredMessage ? "" : "animate-message-in"}`}
                                style={
                                    isRestoredMessage
                                        ? undefined
                                        : {
                                              animationDelay: `${messageIndex * 50}ms`,
                                          }
                                }
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
                                                        title={
                                                            dict.chat
                                                                .editMessage
                                                        }
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
                                                        ? dict.chat.copied
                                                        : copyFailedMessageId ===
                                                            message.id
                                                          ? dict.chat
                                                                .failedToCopy
                                                          : dict.chat
                                                                .copyResponse
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
                                                            defaultOpen={
                                                                !isRestoredMessage
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
                                                    {dict.common.cancel}
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
                                                    {dict.chat.saveAndSubmit}
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
                                                        const toolPart = group
                                                            .parts[0] as ToolPartLike
                                                        const toolCallId =
                                                            toolPart.toolCallId
                                                        const isDisplayDiagram =
                                                            toolPart.type ===
                                                            "tool-display_diagram"
                                                        const validationState =
                                                            validationStates[
                                                                toolCallId
                                                            ]

                                                        return (
                                                            <div
                                                                key={`${message.id}-tool-${group.startIndex}`}
                                                            >
                                                                <ToolCallCard
                                                                    part={
                                                                        toolPart
                                                                    }
                                                                    expandedTools={
                                                                        expandedTools
                                                                    }
                                                                    setExpandedTools={
                                                                        setExpandedTools
                                                                    }
                                                                    onCopy={
                                                                        copyMessageToClipboard
                                                                    }
                                                                    copiedToolCallId={
                                                                        copiedToolCallId
                                                                    }
                                                                    copyFailedToolCallId={
                                                                        copyFailedToolCallId
                                                                    }
                                                                    dict={dict}
                                                                />
                                                                {/* Show validation card for display_diagram tools */}
                                                                {isDisplayDiagram &&
                                                                    validationState && (
                                                                        <ValidationCard
                                                                            state={
                                                                                validationState
                                                                            }
                                                                            onImproveWithSuggestions={
                                                                                onImproveWithSuggestions
                                                                            }
                                                                        />
                                                                    )}
                                                            </div>
                                                        )
                                                    }

                                                    // Content bubble
                                                    return (
                                                        <div
                                                            key={`${message.id}-content-${group.startIndex}`}
                                                            className={`px-4 py-3 text-sm leading-relaxed ${
                                                                message.role ===
                                                                "user"
                                                                    ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md shadow-sm"
                                                                    : message.role ===
                                                                        "system"
                                                                      ? "bg-destructive/10 text-destructive border border-destructive/20 rounded-2xl rounded-bl-md"
                                                                      : "bg-muted/60 text-foreground rounded-2xl rounded-bl-md"
                                                            } ${message.role === "user" && isLastUserMessage && onEditMessage ? "cursor-pointer hover:opacity-90 transition-opacity" : ""} ${groupIndex > 0 ? "mt-3" : ""}`}
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
                                                                    ? dict.chat
                                                                          .clickToEdit
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
                                                                                                "file" ||
                                                                                            section.type ===
                                                                                                "url"
                                                                                        ) {
                                                                                            const sectionKey = `${message.id}-${section.type}-${partIndex}-${sectionIndex}`
                                                                                            const isExpanded =
                                                                                                expandedPdfSections[
                                                                                                    sectionKey
                                                                                                ] ??
                                                                                                false
                                                                                            const charDisplay =
                                                                                                section.charCount &&
                                                                                                section.charCount >=
                                                                                                    1000
                                                                                                    ? `${(section.charCount / 1000).toFixed(1)}k`
                                                                                                    : section.charCount

                                                                                            // Icon selector
                                                                                            const Icon =
                                                                                                section.fileType ===
                                                                                                "pdf"
                                                                                                    ? FileText
                                                                                                    : section.fileType ===
                                                                                                        "url"
                                                                                                      ? Link
                                                                                                      : FileCode

                                                                                            const iconColor =
                                                                                                section.fileType ===
                                                                                                "pdf"
                                                                                                    ? "text-red-500"
                                                                                                    : "text-blue-700"

                                                                                            return (
                                                                                                <div
                                                                                                    key={
                                                                                                        sectionKey
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
                                                                                                                    [sectionKey]:
                                                                                                                        !isExpanded,
                                                                                                                }),
                                                                                                            )
                                                                                                        }}
                                                                                                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
                                                                                                    >
                                                                                                        <div className="flex items-center gap-2">
                                                                                                            <Icon
                                                                                                                className={`h-4 w-4 ${iconColor}`}
                                                                                                            />
                                                                                                            <span className="text-xs font-medium truncate max-w-[200px]">
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
                                                                                                        <div className="px-3 py-2 border-t border-border/40 max-h-48 overflow-y-auto bg-muted/30 scrollbar-thin">
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
                                                        ? dict.chat.copied
                                                        : dict.chat.copyResponse
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
                                                        title={
                                                            dict.chat.regenerate
                                                        }
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
                                                title={dict.chat.goodResponse}
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
                                                title={dict.chat.badResponse}
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
