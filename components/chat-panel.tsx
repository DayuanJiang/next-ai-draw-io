"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import {
    AlertTriangle,
    MessageSquarePlus,
    PanelRightClose,
    PanelRightOpen,
    Settings,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { FaGithub } from "react-icons/fa"
import { Toaster, toast } from "sonner"
import { ButtonWithTooltip } from "@/components/button-with-tooltip"
import { ChatInput } from "@/components/chat-input"
import { ResetWarningModal } from "@/components/reset-warning-modal"
import { SettingsDialog } from "@/components/settings-dialog"
import { useDiagram } from "@/contexts/diagram-context"
import { getAIConfig } from "@/lib/ai-config"
import { findCachedResponse } from "@/lib/cached-responses"
import {
    resolveImageSupport,
    setCachedImageCapability,
} from "@/lib/model-capabilities"
import { isPdfFile, isTextFile } from "@/lib/pdf-utils"
import { type FileData, useFileProcessor } from "@/lib/use-file-processor"
import { useQuotaManager } from "@/lib/use-quota-manager"
import { formatXML, isMxCellXmlComplete, wrapWithMxFile } from "@/lib/utils"
import { ChatMessageDisplay } from "./chat-message-display"

// localStorage keys for persistence
const STORAGE_MESSAGES_KEY = "next-ai-draw-io-messages"
const STORAGE_XML_SNAPSHOTS_KEY = "next-ai-draw-io-xml-snapshots"
const STORAGE_SESSION_ID_KEY = "next-ai-draw-io-session-id"
export const STORAGE_DIAGRAM_XML_KEY = "next-ai-draw-io-diagram-xml"

// sessionStorage keys
const SESSION_STORAGE_INPUT_KEY = "next-ai-draw-io-input"

// Type for message parts (tool calls and their states)
interface MessagePart {
    type: string
    state?: string
    toolName?: string
    input?: { xml?: string; [key: string]: unknown }
    [key: string]: unknown
}

interface ChatMessage {
    role: string
    parts?: MessagePart[]
    [key: string]: unknown
}

interface ChatPanelProps {
    isVisible: boolean
    onToggleVisibility: () => void
    drawioUi: "min" | "sketch"
    onToggleDrawioUi: () => void
    darkMode: boolean
    onToggleDarkMode: () => void
    isMobile?: boolean
    onCloseProtectionChange?: (enabled: boolean) => void
}

// Constants for tool states
const TOOL_ERROR_STATE = "output-error" as const
const DEBUG = process.env.NODE_ENV === "development"
const MAX_AUTO_RETRY_COUNT = 1

/**
 * Check if auto-resubmit should happen based on tool errors.
 * Only checks the LAST tool part (most recent tool call), not all tool parts.
 */
function hasToolErrors(messages: ChatMessage[]): boolean {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== "assistant") {
        return false
    }

    const toolParts =
        (lastMessage.parts as MessagePart[] | undefined)?.filter((part) =>
            part.type?.startsWith("tool-"),
        ) || []

    if (toolParts.length === 0) {
        return false
    }

    const lastToolPart = toolParts[toolParts.length - 1]
    return lastToolPart?.state === TOOL_ERROR_STATE
}

export default function ChatPanel({
    isVisible,
    onToggleVisibility,
    drawioUi,
    onToggleDrawioUi,
    darkMode,
    onToggleDarkMode,
    isMobile = false,
    onCloseProtectionChange,
}: ChatPanelProps) {
    const {
        loadDiagram: onDisplayChart,
        handleExport: onExport,
        handleExportWithoutHistory,
        resolverRef,
        chartXML,
        clearDiagram,
    } = useDiagram()

    const onFetchChart = (saveToHistory = true) => {
        return Promise.race([
            new Promise<string>((resolve) => {
                if (resolverRef && "current" in resolverRef) {
                    resolverRef.current = resolve
                }
                if (saveToHistory) {
                    onExport()
                } else {
                    handleExportWithoutHistory()
                }
            }),
            new Promise<string>((_, reject) =>
                setTimeout(
                    () =>
                        reject(
                            new Error(
                                "Chart export timed out after 10 seconds",
                            ),
                        ),
                    10000,
                ),
            ),
        ])
    }

    // File processing using extracted hook
    const { files, pdfData, handleFileChange, setFiles } = useFileProcessor()

    const [showHistory, setShowHistory] = useState(false)
    const [showSettingsDialog, setShowSettingsDialog] = useState(false)
    const [, setAccessCodeRequired] = useState(false)
    const [input, setInput] = useState("")
    const [dailyRequestLimit, setDailyRequestLimit] = useState(0)
    const [dailyTokenLimit, setDailyTokenLimit] = useState(0)
    const [tpmLimit, setTpmLimit] = useState(0)
    const [showNewChatDialog, setShowNewChatDialog] = useState(false)
    const [minimalStyle, setMinimalStyle] = useState(false)

    // Restore input from sessionStorage on mount (when ChatPanel remounts due to key change)
    useEffect(() => {
        const savedInput = sessionStorage.getItem(SESSION_STORAGE_INPUT_KEY)
        if (savedInput) {
            setInput(savedInput)
        }
    }, [])

    // Check config on mount
    useEffect(() => {
        fetch("/api/config")
            .then((res) => res.json())
            .then((data) => {
                setAccessCodeRequired(data.accessCodeRequired)
                setDailyRequestLimit(data.dailyRequestLimit || 0)
                setDailyTokenLimit(data.dailyTokenLimit || 0)
                setTpmLimit(data.tpmLimit || 0)
            })
            .catch(() => setAccessCodeRequired(false))
    }, [])

    // Quota management using extracted hook
    const quotaManager = useQuotaManager({
        dailyRequestLimit,
        dailyTokenLimit,
        tpmLimit,
    })

    // Generate a unique session ID for Langfuse tracing (restore from localStorage if available)
    const [sessionId, setSessionId] = useState(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem(STORAGE_SESSION_ID_KEY)
            if (saved) return saved
        }
        return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    })

    // Store XML snapshots for each user message (keyed by message index)
    const xmlSnapshotsRef = useRef<Map<number, string>>(new Map())

    // Flag to track if we've restored from localStorage
    const hasRestoredRef = useRef(false)

    // Ref to track latest chartXML for use in callbacks (avoids stale closure)
    const chartXMLRef = useRef(chartXML)
    useEffect(() => {
        chartXMLRef.current = chartXML
    }, [chartXML])

    // Ref to hold stop function for use in onToolCall (avoids stale closure)
    const stopRef = useRef<(() => void) | null>(null)

    // Ref to track consecutive auto-retry count (reset on user action)
    const autoRetryCountRef = useRef(0)

    // Ref to accumulate partial XML when output is truncated due to maxOutputTokens
    // When partialXmlRef.current.length > 0, we're in continuation mode
    const partialXmlRef = useRef<string>("")

    // Persist processed tool call IDs so collapsing the chat doesn't replay old tool outputs
    const processedToolCallsRef = useRef<Set<string>>(new Set())

    // Store original XML for edit_diagram streaming - shared between streaming preview and tool handler
    // Key: toolCallId, Value: original XML before any operations applied
    const editDiagramOriginalXmlRef = useRef<Map<string, string>>(new Map())

    // Debounce timeout for localStorage writes (prevents blocking during streaming)
    const localStorageDebounceRef = useRef<ReturnType<
        typeof setTimeout
    > | null>(null)
    const LOCAL_STORAGE_DEBOUNCE_MS = 1000 // Save at most once per second

    const {
        messages,
        sendMessage,
        addToolOutput,
        stop,
        status,
        error,
        setMessages,
    } = useChat({
        transport: new DefaultChatTransport({
            api: "/api/chat",
        }),
        async onToolCall({ toolCall }) {
            if (DEBUG) {
                console.log(
                    `[onToolCall] Tool: ${toolCall.toolName}, CallId: ${toolCall.toolCallId}`,
                )
            }

            if (toolCall.toolName === "display_diagram") {
                const { xml } = toolCall.input as { xml: string }

                // DEBUG: Log raw input to diagnose false truncation detection
                console.log(
                    "[display_diagram] XML ending (last 100 chars):",
                    xml.slice(-100),
                )
                console.log("[display_diagram] XML length:", xml.length)

                // Check if XML is truncated (incomplete mxCell indicates truncated output)
                const isTruncated = !isMxCellXmlComplete(xml)
                console.log("[display_diagram] isTruncated:", isTruncated)

                if (isTruncated) {
                    // Store the partial XML for continuation via append_diagram
                    partialXmlRef.current = xml

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

                // Wrap raw XML with full mxfile structure for draw.io
                const fullXml = wrapWithMxFile(finalXml)

                // loadDiagram validates and returns error if invalid
                const validationError = onDisplayChart(fullXml)

                if (validationError) {
                    console.warn(
                        "[display_diagram] Validation error:",
                        validationError,
                    )
                    // Return error to model - sendAutomaticallyWhen will trigger retry
                    if (DEBUG) {
                        console.log(
                            "[display_diagram] Adding tool output with state: output-error",
                        )
                    }
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
                    if (DEBUG) {
                        console.log(
                            "[display_diagram] Success! Adding tool output with state: output-available",
                        )
                    }
                    addToolOutput({
                        tool: "display_diagram",
                        toolCallId: toolCall.toolCallId,
                        output: "Successfully displayed the diagram.",
                    })
                    if (DEBUG) {
                        console.log(
                            "[display_diagram] Tool output added. Diagram should be visible now.",
                        )
                    }
                }
            } else if (toolCall.toolName === "edit_diagram") {
                const { operations } = toolCall.input as {
                    operations: Array<{
                        type: "update" | "add" | "delete"
                        cell_id: string
                        new_xml?: string
                    }>
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

                    const { applyDiagramOperations } = await import(
                        "@/lib/utils"
                    )
                    const { result: editedXml, errors } =
                        applyDiagramOperations(currentXml, operations)

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
                        editDiagramOriginalXmlRef.current.delete(
                            toolCall.toolCallId,
                        )
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
                        editDiagramOriginalXmlRef.current.delete(
                            toolCall.toolCallId,
                        )
                        return
                    }
                    onExport()
                    addToolOutput({
                        tool: "edit_diagram",
                        toolCallId: toolCall.toolCallId,
                        output: `Successfully applied ${operations.length} operation(s) to the diagram.`,
                    })
                    // Clean up the shared original XML ref
                    editDiagramOriginalXmlRef.current.delete(
                        toolCall.toolCallId,
                    )
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

Please check cell IDs and retry, or use display_diagram to regenerate.`,
                    })
                    // Clean up the shared original XML ref even on error
                    editDiagramOriginalXmlRef.current.delete(
                        toolCall.toolCallId,
                    )
                }
            } else if (toolCall.toolName === "append_diagram") {
                const { xml } = toolCall.input as { xml: string }

                // Detect if LLM incorrectly started fresh instead of continuing
                // LLM should only output bare mxCells now, so wrapper tags indicate error
                const trimmed = xml.trim()
                const isFreshStart =
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

                    const fullXml = wrapWithMxFile(finalXml)
                    const validationError = onDisplayChart(fullXml)

                    if (validationError) {
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
        },
        onError: (error) => {
            // Silence access code error in console since it's handled by UI
            if (!error.message.includes("Invalid or missing access code")) {
                console.error("Chat error:", error)
                // Debug: Log messages structure when error occurs
                console.log("[onError] messages count:", messages.length)
                messages.forEach((msg, idx) => {
                    console.log(`[onError] Message ${idx}:`, {
                        role: msg.role,
                        partsCount: msg.parts?.length,
                    })
                    if (msg.parts) {
                        msg.parts.forEach((part: any, partIdx: number) => {
                            console.log(
                                `[onError]   Part ${partIdx}:`,
                                JSON.stringify({
                                    type: part.type,
                                    toolName: part.toolName,
                                    hasInput: !!part.input,
                                    inputType: typeof part.input,
                                    inputKeys:
                                        part.input &&
                                        typeof part.input === "object"
                                            ? Object.keys(part.input)
                                            : null,
                                }),
                            )
                        })
                    }
                })
            }

            // Translate technical errors into user-friendly messages
            // The server now handles detailed error messages, so we can display them directly.
            // But we still handle connection/network errors that happen before reaching the server.
            let friendlyMessage = error.message

            // Simple check for network errors if message is generic
            if (friendlyMessage === "Failed to fetch") {
                friendlyMessage = "Network error. Please check your connection."
            }

            // Truncated tool input error (model output limit too low)
            if (friendlyMessage.includes("toolUse.input is invalid")) {
                friendlyMessage =
                    "Output was truncated before the diagram could be generated. Try a simpler request or increase the maxOutputLength."
            }

            if (
                friendlyMessage.includes("image content block") ||
                friendlyMessage.toLowerCase().includes("image_url") ||
                friendlyMessage.toLowerCase().includes("unknown variant")
            ) {
                friendlyMessage = "This model doesn't support image input."
                // Cache capability as unsupported for current provider/model
                const cfg = getAIConfig()
                setCachedImageCapability(cfg.aiProvider, cfg.aiModel, false)
            }

            // Add system message for error so it can be cleared
            setMessages((currentMessages) => {
                const errorMessage = {
                    id: `error-${Date.now()}`,
                    role: "system" as const,
                    content: friendlyMessage,
                    parts: [{ type: "text" as const, text: friendlyMessage }],
                }
                return [...currentMessages, errorMessage]
            })

            if (error.message.includes("Invalid or missing access code")) {
                // Show settings button and open dialog to help user fix it
                setAccessCodeRequired(true)
                setShowSettingsDialog(true)
            }
        },
        onFinish: ({ message }) => {
            // Track actual token usage from server metadata
            const metadata = message?.metadata as
                | Record<string, unknown>
                | undefined

            // DEBUG: Log finish reason to diagnose truncation
            console.log("[onFinish] finishReason:", metadata?.finishReason)
            console.log("[onFinish] metadata:", metadata)

            if (metadata) {
                // Use Number.isFinite to guard against NaN (typeof NaN === 'number' is true)
                const inputTokens = Number.isFinite(metadata.inputTokens)
                    ? (metadata.inputTokens as number)
                    : 0
                const outputTokens = Number.isFinite(metadata.outputTokens)
                    ? (metadata.outputTokens as number)
                    : 0
                const actualTokens = inputTokens + outputTokens
                if (actualTokens > 0) {
                    quotaManager.incrementTokenCount(actualTokens)
                    quotaManager.incrementTPMCount(actualTokens)
                }
            }
        },
        sendAutomaticallyWhen: ({ messages }) => {
            const isInContinuationMode = partialXmlRef.current.length > 0

            const shouldRetry = hasToolErrors(
                messages as unknown as ChatMessage[],
            )

            if (!shouldRetry) {
                // No error, reset retry count and clear state
                autoRetryCountRef.current = 0
                partialXmlRef.current = ""
                return false
            }

            // Continuation mode: unlimited retries (truncation continuation, not real errors)
            // Server limits to 5 steps via stepCountIs(5)
            if (isInContinuationMode) {
                // Don't count against retry limit for continuation
                // Quota checks still apply below
            } else {
                // Regular error: check retry count limit
                if (autoRetryCountRef.current >= MAX_AUTO_RETRY_COUNT) {
                    toast.error(
                        `Auto-retry limit reached (${MAX_AUTO_RETRY_COUNT}). Please try again manually.`,
                    )
                    autoRetryCountRef.current = 0
                    partialXmlRef.current = ""
                    return false
                }
                // Increment retry count for actual errors
                autoRetryCountRef.current++
            }

            // Check quota limits before auto-retry
            const tokenLimitCheck = quotaManager.checkTokenLimit()
            if (!tokenLimitCheck.allowed) {
                quotaManager.showTokenLimitToast(tokenLimitCheck.used)
                autoRetryCountRef.current = 0
                partialXmlRef.current = ""
                return false
            }

            const tpmCheck = quotaManager.checkTPMLimit()
            if (!tpmCheck.allowed) {
                quotaManager.showTPMLimitToast()
                autoRetryCountRef.current = 0
                partialXmlRef.current = ""
                return false
            }

            return true
        },
    })

    // Update stopRef so onToolCall can access it
    stopRef.current = stop

    // Ref to track latest messages for unload persistence
    const messagesRef = useRef(messages)
    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Restore messages and XML snapshots from localStorage on mount
    useEffect(() => {
        if (hasRestoredRef.current) return
        hasRestoredRef.current = true

        try {
            // Restore messages
            const savedMessages = localStorage.getItem(STORAGE_MESSAGES_KEY)
            if (savedMessages) {
                const parsed = JSON.parse(savedMessages)
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setMessages(parsed)
                }
            }

            // Restore XML snapshots
            const savedSnapshots = localStorage.getItem(
                STORAGE_XML_SNAPSHOTS_KEY,
            )
            if (savedSnapshots) {
                const parsed = JSON.parse(savedSnapshots)
                xmlSnapshotsRef.current = new Map(parsed)
            }
        } catch (error) {
            console.error("Failed to restore from localStorage:", error)
            // On complete failure, clear storage to allow recovery
            localStorage.removeItem(STORAGE_MESSAGES_KEY)
            localStorage.removeItem(STORAGE_XML_SNAPSHOTS_KEY)
            toast.error("Session data was corrupted. Starting fresh.")
        }
    }, [setMessages])

    // Save messages to localStorage whenever they change (debounced to prevent blocking during streaming)
    useEffect(() => {
        if (!hasRestoredRef.current) return

        // Clear any pending save
        if (localStorageDebounceRef.current) {
            clearTimeout(localStorageDebounceRef.current)
        }

        // Debounce: save after 1 second of no changes
        localStorageDebounceRef.current = setTimeout(() => {
            try {
                localStorage.setItem(
                    STORAGE_MESSAGES_KEY,
                    JSON.stringify(messages),
                )
            } catch (error) {
                console.error("Failed to save messages to localStorage:", error)
            }
        }, LOCAL_STORAGE_DEBOUNCE_MS)

        // Cleanup on unmount
        return () => {
            if (localStorageDebounceRef.current) {
                clearTimeout(localStorageDebounceRef.current)
            }
        }
    }, [messages])

    // Save XML snapshots to localStorage whenever they change
    const saveXmlSnapshots = useCallback(() => {
        try {
            const snapshotsArray = Array.from(xmlSnapshotsRef.current.entries())
            localStorage.setItem(
                STORAGE_XML_SNAPSHOTS_KEY,
                JSON.stringify(snapshotsArray),
            )
        } catch (error) {
            console.error(
                "Failed to save XML snapshots to localStorage:",
                error,
            )
        }
    }, [])

    // Save session ID to localStorage
    useEffect(() => {
        localStorage.setItem(STORAGE_SESSION_ID_KEY, sessionId)
    }, [sessionId])

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" })
        }
    }, [messages])

    // Save state right before page unload (refresh/close)
    useEffect(() => {
        const handleBeforeUnload = () => {
            try {
                localStorage.setItem(
                    STORAGE_MESSAGES_KEY,
                    JSON.stringify(messagesRef.current),
                )
                localStorage.setItem(
                    STORAGE_XML_SNAPSHOTS_KEY,
                    JSON.stringify(
                        Array.from(xmlSnapshotsRef.current.entries()),
                    ),
                )
                const xml = chartXMLRef.current
                if (xml && xml.length > 300) {
                    localStorage.setItem(STORAGE_DIAGRAM_XML_KEY, xml)
                }
                localStorage.setItem(STORAGE_SESSION_ID_KEY, sessionId)
            } catch (error) {
                console.error("Failed to persist state before unload:", error)
            }
        }

        window.addEventListener("beforeunload", handleBeforeUnload)
        return () =>
            window.removeEventListener("beforeunload", handleBeforeUnload)
    }, [sessionId])

    const onFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const isProcessing = status === "streaming" || status === "submitted"
        if (input.trim() && !isProcessing) {
            // Check if input matches a cached example (only when no messages yet)
            if (messages.length === 0) {
                const cached = findCachedResponse(
                    input.trim(),
                    files.length > 0,
                )
                if (cached) {
                    // Add user message and fake assistant response to messages
                    // The chat-message-display useEffect will handle displaying the diagram
                    const toolCallId = `cached-${Date.now()}`

                    // Build user message text including any file content
                    const userText = await processFilesAndAppendContent(
                        input,
                        files,
                        pdfData,
                    )

                    setMessages([
                        {
                            id: `user-${Date.now()}`,
                            role: "user" as const,
                            parts: [{ type: "text" as const, text: userText }],
                        },
                        {
                            id: `assistant-${Date.now()}`,
                            role: "assistant" as const,
                            parts: [
                                {
                                    type: "tool-display_diagram" as const,
                                    toolCallId,
                                    state: "output-available" as const,
                                    input: { xml: cached.xml },
                                    output: "Successfully displayed the diagram.",
                                },
                            ],
                        },
                    ] as any)
                    setInput("")
                    sessionStorage.removeItem(SESSION_STORAGE_INPUT_KEY)
                    setFiles([])
                    return
                }
            }

            try {
                let chartXml = await onFetchChart()
                chartXml = formatXML(chartXml)

                // Update ref directly to avoid race condition with React's async state update
                // This ensures edit_diagram has the correct XML before AI responds
                chartXMLRef.current = chartXml

                // Build user text by concatenating input with pre-extracted text
                // (Backend only reads first text part, so we must combine them)
                const parts: any[] = []
                const userText = await processFilesAndAppendContent(
                    input,
                    files,
                    pdfData,
                    parts,
                )

                // Add the combined text as the first part
                parts.unshift({ type: "text", text: userText })

                // Get previous XML from the last snapshot (before this message)
                const snapshotKeys = Array.from(
                    xmlSnapshotsRef.current.keys(),
                ).sort((a, b) => b - a)
                const previousXml =
                    snapshotKeys.length > 0
                        ? xmlSnapshotsRef.current.get(snapshotKeys[0]) || ""
                        : ""

                // Save XML snapshot for this message (will be at index = current messages.length)
                const messageIndex = messages.length
                xmlSnapshotsRef.current.set(messageIndex, chartXml)
                saveXmlSnapshots()

                // Check all quota limits
                if (!checkAllQuotaLimits()) return

                {
                    const config = getAIConfig()
                    const provider = config.aiProvider
                    const modelId = config.aiModel
                    const canUseImages = resolveImageSupport(provider, modelId)
                    const hasImage =
                        files.some((f) => !isPdfFile(f) && !isTextFile(f)) &&
                        parts.some((p) => p.type === "file")
                    if (hasImage && !canUseImages) {
                        const filtered = parts.filter((p) => p.type !== "file")
                        sendChatMessage(
                            filtered,
                            chartXml,
                            previousXml,
                            sessionId,
                        )
                        toast.warning(
                            "当前模型不支持图片输入，已忽略上传的图片",
                        )
                    } else {
                        sendChatMessage(parts, chartXml, previousXml, sessionId)
                    }
                }

                // Token count is tracked in onFinish with actual server usage
                setInput("")
                sessionStorage.removeItem(SESSION_STORAGE_INPUT_KEY)
                setFiles([])
            } catch (error) {
                console.error("Error fetching chart data:", error)
            }
        }
    }

    const handleNewChat = useCallback(() => {
        setMessages([])
        clearDiagram()
        handleFileChange([]) // Use handleFileChange to also clear pdfData
        const newSessionId = `session-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 9)}`
        setSessionId(newSessionId)
        xmlSnapshotsRef.current.clear()
        // Clear localStorage with error handling
        try {
            localStorage.removeItem(STORAGE_MESSAGES_KEY)
            localStorage.removeItem(STORAGE_XML_SNAPSHOTS_KEY)
            localStorage.removeItem(STORAGE_DIAGRAM_XML_KEY)
            localStorage.setItem(STORAGE_SESSION_ID_KEY, newSessionId)
            sessionStorage.removeItem(SESSION_STORAGE_INPUT_KEY)
            toast.success("Started a fresh chat")
        } catch (error) {
            console.error("Failed to clear localStorage:", error)
            toast.warning(
                "Chat cleared but browser storage could not be updated",
            )
        }

        setShowNewChatDialog(false)
    }, [clearDiagram, handleFileChange, setMessages, setSessionId])

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
        saveInputToSessionStorage(e.target.value)
        setInput(e.target.value)
    }

    const saveInputToSessionStorage = (input: string) => {
        sessionStorage.setItem(SESSION_STORAGE_INPUT_KEY, input)
    }

    // Helper functions for message actions (regenerate/edit)
    // Extract previous XML snapshot before a given message index
    const getPreviousXml = (beforeIndex: number): string => {
        const snapshotKeys = Array.from(xmlSnapshotsRef.current.keys())
            .filter((k) => k < beforeIndex)
            .sort((a, b) => b - a)
        return snapshotKeys.length > 0
            ? xmlSnapshotsRef.current.get(snapshotKeys[0]) || ""
            : ""
    }

    // Restore diagram from snapshot and update ref
    const restoreDiagramFromSnapshot = (savedXml: string) => {
        onDisplayChart(savedXml, true) // Skip validation for trusted snapshots
        chartXMLRef.current = savedXml
    }

    // Clean up snapshots after a given message index
    const cleanupSnapshotsAfter = (messageIndex: number) => {
        for (const key of xmlSnapshotsRef.current.keys()) {
            if (key > messageIndex) {
                xmlSnapshotsRef.current.delete(key)
            }
        }
        saveXmlSnapshots()
    }

    // Check all quota limits (daily requests, tokens, TPM)
    const checkAllQuotaLimits = (): boolean => {
        const limitCheck = quotaManager.checkDailyLimit()
        if (!limitCheck.allowed) {
            quotaManager.showQuotaLimitToast()
            return false
        }

        const tokenLimitCheck = quotaManager.checkTokenLimit()
        if (!tokenLimitCheck.allowed) {
            quotaManager.showTokenLimitToast(tokenLimitCheck.used)
            return false
        }

        const tpmCheck = quotaManager.checkTPMLimit()
        if (!tpmCheck.allowed) {
            quotaManager.showTPMLimitToast()
            return false
        }

        return true
    }

    // Send chat message with headers and increment quota
    const sendChatMessage = (
        parts: any,
        xml: string,
        previousXml: string,
        sessionId: string,
    ) => {
        // Reset all retry/continuation state on user-initiated message
        autoRetryCountRef.current = 0
        partialXmlRef.current = ""

        const config = getAIConfig()

        sendMessage(
            { parts },
            {
                body: { xml, previousXml, sessionId },
                headers: {
                    "x-access-code": config.accessCode,
                    ...(config.aiProvider && {
                        "x-ai-provider": config.aiProvider,
                        ...(config.aiBaseUrl && {
                            "x-ai-base-url": config.aiBaseUrl,
                        }),
                        ...(config.aiApiKey && {
                            "x-ai-api-key": config.aiApiKey,
                        }),
                        ...(config.aiModel && { "x-ai-model": config.aiModel }),
                    }),
                    ...(minimalStyle && {
                        "x-minimal-style": "true",
                    }),
                },
            },
        )
        quotaManager.incrementRequestCount()
    }

    // Process files and append content to user text (handles PDF, text, and optionally images)
    const processFilesAndAppendContent = async (
        baseText: string,
        files: File[],
        pdfData: Map<File, FileData>,
        imageParts?: any[],
    ): Promise<string> => {
        let userText = baseText

        for (const file of files) {
            if (isPdfFile(file)) {
                const extracted = pdfData.get(file)
                if (extracted?.text) {
                    userText += `\n\n[PDF: ${file.name}]\n${extracted.text}`
                }
            } else if (isTextFile(file)) {
                const extracted = pdfData.get(file)
                if (extracted?.text) {
                    userText += `\n\n[File: ${file.name}]\n${extracted.text}`
                }
            } else if (imageParts) {
                // Handle as image (only if imageParts array provided)
                const reader = new FileReader()
                const dataUrl = await new Promise<string>((resolve) => {
                    reader.onload = () => resolve(reader.result as string)
                    reader.readAsDataURL(file)
                })

                imageParts.push({
                    type: "file",
                    url: dataUrl,
                    mediaType: file.type,
                })
            }
        }

        return userText
    }

    const handleRegenerate = async (messageIndex: number) => {
        const isProcessing = status === "streaming" || status === "submitted"
        if (isProcessing) return

        // Find the user message before this assistant message
        let userMessageIndex = messageIndex - 1
        while (
            userMessageIndex >= 0 &&
            messages[userMessageIndex].role !== "user"
        ) {
            userMessageIndex--
        }

        if (userMessageIndex < 0) return

        const userMessage = messages[userMessageIndex]
        const userParts = userMessage.parts

        // Get the text from the user message
        const textPart = userParts?.find((p: any) => p.type === "text")
        if (!textPart) return

        // Get the saved XML snapshot for this user message
        const savedXml = xmlSnapshotsRef.current.get(userMessageIndex)
        if (!savedXml) {
            console.error(
                "No saved XML snapshot for message index:",
                userMessageIndex,
            )
            return
        }

        // Get previous XML and restore diagram state
        const previousXml = getPreviousXml(userMessageIndex)
        restoreDiagramFromSnapshot(savedXml)

        // Clean up snapshots for messages after the user message (they will be removed)
        cleanupSnapshotsAfter(userMessageIndex)

        // Remove the user message AND assistant message onwards (sendMessage will re-add the user message)
        // Use flushSync to ensure state update is processed synchronously before sending
        const newMessages = messages.slice(0, userMessageIndex)
        flushSync(() => {
            setMessages(newMessages)
        })

        // Check all quota limits
        if (!checkAllQuotaLimits()) return

        // Now send the message after state is guaranteed to be updated
        sendChatMessage(userParts, savedXml, previousXml, sessionId)

        // Token count is tracked in onFinish with actual server usage
    }

    const handleEditMessage = async (messageIndex: number, newText: string) => {
        const isProcessing = status === "streaming" || status === "submitted"
        if (isProcessing) return

        const message = messages[messageIndex]
        if (!message || message.role !== "user") return

        // Get the saved XML snapshot for this user message
        const savedXml = xmlSnapshotsRef.current.get(messageIndex)
        if (!savedXml) {
            console.error(
                "No saved XML snapshot for message index:",
                messageIndex,
            )
            return
        }

        // Get previous XML and restore diagram state
        const previousXml = getPreviousXml(messageIndex)
        restoreDiagramFromSnapshot(savedXml)

        // Clean up snapshots for messages after the user message (they will be removed)
        cleanupSnapshotsAfter(messageIndex)

        // Create new parts with updated text
        const newParts = message.parts?.map((part: any) => {
            if (part.type === "text") {
                return { ...part, text: newText }
            }
            return part
        }) || [{ type: "text", text: newText }]

        // Remove the user message AND assistant message onwards (sendMessage will re-add the user message)
        // Use flushSync to ensure state update is processed synchronously before sending
        const newMessages = messages.slice(0, messageIndex)
        flushSync(() => {
            setMessages(newMessages)
        })

        // Check all quota limits
        if (!checkAllQuotaLimits()) return

        // Now send the edited message after state is guaranteed to be updated
        sendChatMessage(newParts, savedXml, previousXml, sessionId)
        // Token count is tracked in onFinish with actual server usage
    }

    // Collapsed view (desktop only)
    if (!isVisible && !isMobile) {
        return (
            <div className="h-full flex flex-col items-center pt-4 bg-card border border-border/30 rounded-xl shadow-sm transition-all duration-300 ease-in-out">
                <ButtonWithTooltip
                    tooltipContent="Show chat panel (Ctrl+B)"
                    variant="ghost"
                    size="icon"
                    onClick={onToggleVisibility}
                    className="hover:bg-accent transition-colors rounded-xl"
                >
                    <PanelRightOpen className="h-5 w-5 text-muted-foreground" />
                </ButtonWithTooltip>
                <div
                    className="text-sm font-medium text-muted-foreground mt-8 tracking-wide opacity-80"
                    style={{
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                    }}
                >
                    AI Chat
                </div>
            </div>
        )
    }

    // Full view
    return (
        <div className="h-full flex flex-col bg-card/80 backdrop-blur-sm shadow-soft animate-slide-in-right rounded-xl border border-border/40 relative overflow-hidden transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-b from-background/50 to-transparent pointer-events-none" />
            <Toaster
                position="bottom-center"
                richColors
                expand
                style={{ position: "absolute" }}
                toastOptions={{
                    style: {
                        maxWidth: "480px",
                    },
                    duration: 2000,
                }}
            />
            {/* Header */}
            <header
                className={`${isMobile ? "px-3 py-2" : "px-5 py-4"} border-b border-border/50`}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-x-hidden">
                        <div className="flex items-center gap-2">
                            <Image
                                src="/favicon.ico"
                                alt="Next AI Drawio"
                                width={isMobile ? 24 : 28}
                                height={isMobile ? 24 : 28}
                                className="rounded flex-shrink-0"
                            />
                            <h1
                                className={`${isMobile ? "text-sm" : "text-base"} font-semibold tracking-tight whitespace-nowrap`}
                            >
                                Next AI Drawio
                            </h1>
                        </div>
                        {!isMobile && (
                            <Link
                                href="/about"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-muted-foreground hover:text-foreground transition-colors ml-2"
                            >
                                About
                            </Link>
                        )}
                        {!isMobile && (
                            <Link
                                href="/about"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <ButtonWithTooltip
                                    tooltipContent="Due to high usage, I have changed the model to minimax-m2 and added some usage limits. See About page for details."
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-amber-500 hover:text-amber-600"
                                >
                                    <AlertTriangle className="h-4 w-4" />
                                </ButtonWithTooltip>
                            </Link>
                        )}
                    </div>
                    <div className="flex items-center gap-1 justify-end overflow-x-hidden">
                        <ButtonWithTooltip
                            tooltipContent="Start fresh chat"
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowNewChatDialog(true)}
                            className="hover:bg-accent"
                        >
                            <MessageSquarePlus
                                className={`${isMobile ? "h-4 w-4" : "h-5 w-5"} text-muted-foreground`}
                            />
                        </ButtonWithTooltip>
                        <div className="w-px h-5 bg-border mx-1" />
                        <a
                            href="https://github.com/DayuanJiang/next-ai-draw-io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                            <FaGithub
                                className={`${isMobile ? "w-4 h-4" : "w-5 h-5"}`}
                            />
                        </a>
                        <ButtonWithTooltip
                            tooltipContent="Settings"
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowSettingsDialog(true)}
                            className="hover:bg-accent"
                        >
                            <Settings
                                className={`${isMobile ? "h-4 w-4" : "h-5 w-5"} text-muted-foreground`}
                            />
                        </ButtonWithTooltip>
                        {!isMobile && (
                            <ButtonWithTooltip
                                tooltipContent="Hide chat panel (Ctrl+B)"
                                variant="ghost"
                                size="icon"
                                onClick={onToggleVisibility}
                                className="hover:bg-accent"
                            >
                                <PanelRightClose className="h-5 w-5 text-muted-foreground" />
                            </ButtonWithTooltip>
                        )}
                    </div>
                </div>
            </header>

            {/* Messages */}
            <main className="flex-1 w-full overflow-hidden">
                <ChatMessageDisplay
                    messages={messages}
                    setInput={setInput}
                    setFiles={handleFileChange}
                    processedToolCallsRef={processedToolCallsRef}
                    editDiagramOriginalXmlRef={editDiagramOriginalXmlRef}
                    sessionId={sessionId}
                    onRegenerate={handleRegenerate}
                    status={status}
                    onEditMessage={handleEditMessage}
                />
            </main>

            {/* Input */}
            <footer
                className={`${isMobile ? "p-2" : "p-4"} border-t border-border/50 bg-card/50`}
            >
                {(() => {
                    const cfg = getAIConfig()
                    const imgCap = resolveImageSupport(
                        cfg.aiProvider,
                        cfg.aiModel,
                    )
                    return (
                        <ChatInput
                            input={input}
                            status={status}
                            onSubmit={onFormSubmit}
                            onChange={handleInputChange}
                            onClearChat={handleNewChat}
                            files={files}
                            onFileChange={handleFileChange}
                            pdfData={pdfData}
                            showHistory={showHistory}
                            onToggleHistory={setShowHistory}
                            sessionId={sessionId}
                            error={error}
                            minimalStyle={minimalStyle}
                            onMinimalStyleChange={setMinimalStyle}
                            imageSupported={imgCap}
                        />
                    )
                })()}
            </footer>

            <SettingsDialog
                open={showSettingsDialog}
                onOpenChange={setShowSettingsDialog}
                onCloseProtectionChange={onCloseProtectionChange}
                drawioUi={drawioUi}
                onToggleDrawioUi={onToggleDrawioUi}
                darkMode={darkMode}
                onToggleDarkMode={onToggleDarkMode}
            />

            <ResetWarningModal
                open={showNewChatDialog}
                onOpenChange={setShowNewChatDialog}
                onClear={handleNewChat}
            />
        </div>
    )
}
