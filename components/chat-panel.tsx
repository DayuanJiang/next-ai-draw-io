"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import {
    AlertTriangle,
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
import { QuotaLimitToast } from "@/components/quota-limit-toast"
import {
    SettingsDialog,
    STORAGE_ACCESS_CODE_KEY,
    STORAGE_AI_API_KEY_KEY,
    STORAGE_AI_BASE_URL_KEY,
    STORAGE_AI_MODEL_KEY,
    STORAGE_AI_PROVIDER_KEY,
} from "@/components/settings-dialog"

// localStorage keys for persistence
const STORAGE_MESSAGES_KEY = "next-ai-draw-io-messages"
const STORAGE_XML_SNAPSHOTS_KEY = "next-ai-draw-io-xml-snapshots"
const STORAGE_SESSION_ID_KEY = "next-ai-draw-io-session-id"
export const STORAGE_DIAGRAM_XML_KEY = "next-ai-draw-io-diagram-xml"
const STORAGE_REQUEST_COUNT_KEY = "next-ai-draw-io-request-count"
const STORAGE_REQUEST_DATE_KEY = "next-ai-draw-io-request-date"
const STORAGE_TOKEN_COUNT_KEY = "next-ai-draw-io-token-count"
const STORAGE_TOKEN_DATE_KEY = "next-ai-draw-io-token-date"
const STORAGE_TPM_COUNT_KEY = "next-ai-draw-io-tpm-count"
const STORAGE_TPM_MINUTE_KEY = "next-ai-draw-io-tpm-minute"

import { useDiagram } from "@/contexts/diagram-context"
import { findCachedResponse } from "@/lib/cached-responses"
import {
    extractPdfText,
    extractTextFileContent,
    isPdfFile,
    isTextFile,
    MAX_EXTRACTED_CHARS,
} from "@/lib/pdf-utils"
import { formatXML, wrapWithMxFile } from "@/lib/utils"
import { ChatMessageDisplay } from "./chat-message-display"

// Type for message parts (tool calls and their states)
interface MessagePart {
    type: string
    state?: string
    toolName?: string
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

/**
 * Custom auto-resubmit logic for the AI chat.
 *
 * Strategy:
 * - When tools return errors (e.g., invalid XML), automatically resubmit
 *   the conversation to let the AI retry with corrections
 * - When tools succeed (e.g., diagram displayed), stop without AI acknowledgment
 *   to prevent unnecessary regeneration cycles
 *
 * This fixes the issue where successful diagrams were being regenerated
 * multiple times because the previous logic (lastAssistantMessageIsCompleteWithToolCalls)
 * auto-resubmitted on BOTH success and error.
 *
 * @param messages - Current conversation messages from AI SDK
 * @returns true to auto-resubmit (for error recovery), false to stop
 */
function shouldAutoResubmit(messages: ChatMessage[]): boolean {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== "assistant") {
        if (DEBUG) {
            console.log(
                "[sendAutomaticallyWhen] No assistant message, returning false",
            )
        }
        return false
    }

    const toolParts =
        (lastMessage.parts as MessagePart[] | undefined)?.filter((part) =>
            part.type?.startsWith("tool-"),
        ) || []

    if (toolParts.length === 0) {
        if (DEBUG) {
            console.log(
                "[sendAutomaticallyWhen] No tool parts, returning false",
            )
        }
        return false
    }

    // Only auto-resubmit if ANY tool has an error
    const hasError = toolParts.some((part) => part.state === TOOL_ERROR_STATE)

    if (DEBUG) {
        if (hasError) {
            console.log(
                "[sendAutomaticallyWhen] Retrying due to errors in tools:",
                toolParts
                    .filter((p) => p.state === TOOL_ERROR_STATE)
                    .map((p) => p.toolName),
            )
        } else {
            console.log("[sendAutomaticallyWhen] No errors, stopping")
        }
    }

    return hasError
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
        isDrawioReady,
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

    const [files, setFiles] = useState<File[]>([])
    // Store extracted PDF text with extraction status
    const [pdfData, setPdfData] = useState<
        Map<File, { text: string; charCount: number; isExtracting: boolean }>
    >(new Map())
    const [showHistory, setShowHistory] = useState(false)
    const [showSettingsDialog, setShowSettingsDialog] = useState(false)
    const [, setAccessCodeRequired] = useState(false)
    const [input, setInput] = useState("")
    const [dailyRequestLimit, setDailyRequestLimit] = useState(0)
    const [dailyTokenLimit, setDailyTokenLimit] = useState(0)
    const [tpmLimit, setTpmLimit] = useState(0)

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

    // Helper to check daily request limit
    // Check if user has their own API key configured (bypass limits)
    const hasOwnApiKey = useCallback((): boolean => {
        const provider = localStorage.getItem(STORAGE_AI_PROVIDER_KEY)
        const apiKey = localStorage.getItem(STORAGE_AI_API_KEY_KEY)
        return !!(provider && apiKey)
    }, [])

    const checkDailyLimit = useCallback((): {
        allowed: boolean
        remaining: number
        used: number
    } => {
        // Skip limit if user has their own API key
        if (hasOwnApiKey()) return { allowed: true, remaining: -1, used: 0 }
        if (dailyRequestLimit <= 0)
            return { allowed: true, remaining: -1, used: 0 }

        const today = new Date().toDateString()
        const storedDate = localStorage.getItem(STORAGE_REQUEST_DATE_KEY)
        let count = parseInt(
            localStorage.getItem(STORAGE_REQUEST_COUNT_KEY) || "0",
            10,
        )

        if (storedDate !== today) {
            count = 0
            localStorage.setItem(STORAGE_REQUEST_DATE_KEY, today)
            localStorage.setItem(STORAGE_REQUEST_COUNT_KEY, "0")
        }

        return {
            allowed: count < dailyRequestLimit,
            remaining: dailyRequestLimit - count,
            used: count,
        }
    }, [dailyRequestLimit, hasOwnApiKey])

    // Helper to increment request count
    const incrementRequestCount = useCallback((): void => {
        const count = parseInt(
            localStorage.getItem(STORAGE_REQUEST_COUNT_KEY) || "0",
            10,
        )
        localStorage.setItem(STORAGE_REQUEST_COUNT_KEY, String(count + 1))
    }, [])

    // Helper to show quota limit toast (request-based)
    const showQuotaLimitToast = useCallback(() => {
        toast.custom(
            (t) => (
                <QuotaLimitToast
                    used={dailyRequestLimit}
                    limit={dailyRequestLimit}
                    onDismiss={() => toast.dismiss(t)}
                />
            ),
            { duration: 15000 },
        )
    }, [dailyRequestLimit, hasOwnApiKey])

    // Helper to check daily token limit (checks if already over limit)
    const checkTokenLimit = useCallback((): {
        allowed: boolean
        remaining: number
        used: number
    } => {
        // Skip limit if user has their own API key
        if (hasOwnApiKey()) return { allowed: true, remaining: -1, used: 0 }
        if (dailyTokenLimit <= 0)
            return { allowed: true, remaining: -1, used: 0 }

        const today = new Date().toDateString()
        const storedDate = localStorage.getItem(STORAGE_TOKEN_DATE_KEY)
        let count = parseInt(
            localStorage.getItem(STORAGE_TOKEN_COUNT_KEY) || "0",
            10,
        )

        // Guard against NaN (e.g., if "NaN" was stored)
        if (Number.isNaN(count)) count = 0

        if (storedDate !== today) {
            count = 0
            localStorage.setItem(STORAGE_TOKEN_DATE_KEY, today)
            localStorage.setItem(STORAGE_TOKEN_COUNT_KEY, "0")
        }

        return {
            allowed: count < dailyTokenLimit,
            remaining: dailyTokenLimit - count,
            used: count,
        }
    }, [dailyTokenLimit, hasOwnApiKey])

    // Helper to increment token count
    const incrementTokenCount = useCallback((tokens: number): void => {
        // Guard against NaN tokens
        if (!Number.isFinite(tokens) || tokens <= 0) return

        let count = parseInt(
            localStorage.getItem(STORAGE_TOKEN_COUNT_KEY) || "0",
            10,
        )
        // Guard against NaN count
        if (Number.isNaN(count)) count = 0

        localStorage.setItem(STORAGE_TOKEN_COUNT_KEY, String(count + tokens))
    }, [])

    // Helper to show token limit toast
    const showTokenLimitToast = useCallback(
        (used: number) => {
            toast.custom(
                (t) => (
                    <QuotaLimitToast
                        type="token"
                        used={used}
                        limit={dailyTokenLimit}
                        onDismiss={() => toast.dismiss(t)}
                    />
                ),
                { duration: 15000 },
            )
        },
        [dailyTokenLimit],
    )

    // Helper to check TPM (tokens per minute) limit
    // Note: This only READS, doesn't write. incrementTPMCount handles writes.
    const checkTPMLimit = useCallback((): {
        allowed: boolean
        remaining: number
        used: number
    } => {
        // Skip limit if user has their own API key
        if (hasOwnApiKey()) return { allowed: true, remaining: -1, used: 0 }
        if (tpmLimit <= 0) return { allowed: true, remaining: -1, used: 0 }

        const currentMinute = Math.floor(Date.now() / 60000).toString()
        const storedMinute = localStorage.getItem(STORAGE_TPM_MINUTE_KEY)
        let count = parseInt(
            localStorage.getItem(STORAGE_TPM_COUNT_KEY) || "0",
            10,
        )

        // Guard against NaN
        if (Number.isNaN(count)) count = 0

        // If we're in a new minute, treat count as 0 (will be reset on next increment)
        if (storedMinute !== currentMinute) {
            count = 0
        }

        return {
            allowed: count < tpmLimit,
            remaining: tpmLimit - count,
            used: count,
        }
    }, [tpmLimit, hasOwnApiKey])

    // Helper to increment TPM count
    const incrementTPMCount = useCallback((tokens: number): void => {
        // Guard against NaN tokens
        if (!Number.isFinite(tokens) || tokens <= 0) return

        const currentMinute = Math.floor(Date.now() / 60000).toString()
        const storedMinute = localStorage.getItem(STORAGE_TPM_MINUTE_KEY)
        let count = parseInt(
            localStorage.getItem(STORAGE_TPM_COUNT_KEY) || "0",
            10,
        )

        // Guard against NaN
        if (Number.isNaN(count)) count = 0

        // Reset if we're in a new minute
        if (storedMinute !== currentMinute) {
            count = 0
            localStorage.setItem(STORAGE_TPM_MINUTE_KEY, currentMinute)
        }

        localStorage.setItem(STORAGE_TPM_COUNT_KEY, String(count + tokens))
    }, [])

    // Helper to show TPM limit toast
    const showTPMLimitToast = useCallback(() => {
        const limitDisplay =
            tpmLimit >= 1000 ? `${tpmLimit / 1000}k` : String(tpmLimit)
        toast.error(
            `Rate limit reached (${limitDisplay} tokens/min). Please wait 60 seconds before sending another request.`,
            { duration: 8000 },
        )
    }, [tpmLimit])

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
                if (DEBUG) {
                    console.log(
                        `[display_diagram] Received XML length: ${xml.length}`,
                    )
                }

                // Wrap raw XML with full mxfile structure for draw.io
                const fullXml = wrapWithMxFile(xml)

                // loadDiagram validates and returns error if invalid
                const validationError = onDisplayChart(fullXml)

                if (validationError) {
                    console.warn(
                        "[display_diagram] Validation error:",
                        validationError,
                    )
                    // Return error to model - sendAutomaticallyWhen will trigger retry
                    const errorMessage = `${validationError}

Please fix the XML issues and call display_diagram again with corrected XML.

Your failed XML:
\`\`\`xml
${xml}
\`\`\``
                    if (DEBUG) {
                        console.log(
                            "[display_diagram] Adding tool output with state: output-error",
                        )
                    }
                    addToolOutput({
                        tool: "display_diagram",
                        toolCallId: toolCall.toolCallId,
                        state: "output-error",
                        errorText: errorMessage,
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
                const { edits } = toolCall.input as {
                    edits: Array<{ search: string; replace: string }>
                }

                let currentXml = ""
                try {
                    console.log("[edit_diagram] Starting...")
                    // Use chartXML from ref directly - more reliable than export
                    // especially on Vercel where DrawIO iframe may have latency issues
                    // Using ref to avoid stale closure in callback
                    const cachedXML = chartXMLRef.current
                    if (cachedXML) {
                        currentXml = cachedXML
                        console.log(
                            "[edit_diagram] Using cached chartXML, length:",
                            currentXml.length,
                        )
                    } else {
                        // Fallback to export only if no cached XML
                        console.log(
                            "[edit_diagram] No cached XML, fetching from DrawIO...",
                        )
                        currentXml = await onFetchChart(false)
                        console.log(
                            "[edit_diagram] Got XML from export, length:",
                            currentXml.length,
                        )
                    }

                    const { replaceXMLParts } = await import("@/lib/utils")
                    const editedXml = replaceXMLParts(currentXml, edits)

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

Please fix the edit to avoid structural issues (e.g., duplicate IDs, invalid references).`,
                        })
                        return
                    }
                    onExport()
                    addToolOutput({
                        tool: "edit_diagram",
                        toolCallId: toolCall.toolCallId,
                        output: `Successfully applied ${edits.length} edit(s) to the diagram.`,
                    })
                    console.log("[edit_diagram] Success")
                } catch (error) {
                    console.error("[edit_diagram] Failed:", error)

                    const errorMessage =
                        error instanceof Error ? error.message : String(error)

                    // Use addToolOutput with state: 'output-error' for proper error signaling
                    addToolOutput({
                        tool: "edit_diagram",
                        toolCallId: toolCall.toolCallId,
                        state: "output-error",
                        errorText: `Edit failed: ${errorMessage}

Current diagram XML:
\`\`\`xml
${currentXml || "No XML available"}
\`\`\`

Please retry with an adjusted search pattern or use display_diagram if retries are exhausted.`,
                    })
                }
            }
        },
        onError: (error) => {
            // Silence access code error in console since it's handled by UI
            if (!error.message.includes("Invalid or missing access code")) {
                console.error("Chat error:", error)
            }

            // Translate technical errors into user-friendly messages
            // The server now handles detailed error messages, so we can display them directly.
            // But we still handle connection/network errors that happen before reaching the server.
            let friendlyMessage = error.message

            // Simple check for network errors if message is generic
            if (friendlyMessage === "Failed to fetch") {
                friendlyMessage = "Network error. Please check your connection."
            }

            // Translate image not supported error
            if (friendlyMessage.includes("image content block")) {
                friendlyMessage = "This model doesn't support image input."
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
                    incrementTokenCount(actualTokens)
                    incrementTPMCount(actualTokens)
                }
            }
        },
        sendAutomaticallyWhen: ({ messages }) =>
            shouldAutoResubmit(messages as unknown as ChatMessage[]),
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
        }
    }, [setMessages])

    // Restore diagram XML when DrawIO becomes ready
    const hasDiagramRestoredRef = useRef(false)
    const [canSaveDiagram, setCanSaveDiagram] = useState(false)
    useEffect(() => {
        // Reset restore flag when DrawIO is not ready (e.g., theme/UI change remounts it)
        if (!isDrawioReady) {
            hasDiagramRestoredRef.current = false
            setCanSaveDiagram(false)
            return
        }
        if (hasDiagramRestoredRef.current) return
        hasDiagramRestoredRef.current = true

        try {
            const savedDiagramXml = localStorage.getItem(
                STORAGE_DIAGRAM_XML_KEY,
            )
            console.log(
                "[ChatPanel] Restoring diagram, has saved XML:",
                !!savedDiagramXml,
            )
            if (savedDiagramXml) {
                console.log(
                    "[ChatPanel] Loading saved diagram XML, length:",
                    savedDiagramXml.length,
                )
                // Skip validation for trusted saved diagrams
                onDisplayChart(savedDiagramXml, true)
                chartXMLRef.current = savedDiagramXml
            }
        } catch (error) {
            console.error("Failed to restore diagram from localStorage:", error)
        }

        // Allow saving after restore is complete
        setTimeout(() => {
            console.log("[ChatPanel] Enabling diagram save")
            setCanSaveDiagram(true)
        }, 500)
    }, [isDrawioReady, onDisplayChart])

    // Save messages to localStorage whenever they change
    useEffect(() => {
        if (!hasRestoredRef.current) return
        try {
            localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(messages))
        } catch (error) {
            console.error("Failed to save messages to localStorage:", error)
        }
    }, [messages])

    // Save diagram XML to localStorage whenever it changes
    useEffect(() => {
        if (!canSaveDiagram) return
        if (chartXML && chartXML.length > 300) {
            localStorage.setItem(STORAGE_DIAGRAM_XML_KEY, chartXML)
        }
    }, [chartXML, canSaveDiagram])

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
                    let userText = input
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
                        }
                    }

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
                let userText = input
                const parts: any[] = []

                if (files.length > 0) {
                    for (const file of files) {
                        if (isPdfFile(file)) {
                            // Use pre-extracted PDF text from pdfData
                            const extracted = pdfData.get(file)
                            if (extracted?.text) {
                                userText += `\n\n[PDF: ${file.name}]\n${extracted.text}`
                            }
                        } else if (isTextFile(file)) {
                            // Use pre-extracted text file content from pdfData
                            const extracted = pdfData.get(file)
                            if (extracted?.text) {
                                userText += `\n\n[File: ${file.name}]\n${extracted.text}`
                            }
                        } else {
                            // Handle as image
                            const reader = new FileReader()
                            const dataUrl = await new Promise<string>(
                                (resolve) => {
                                    reader.onload = () =>
                                        resolve(reader.result as string)
                                    reader.readAsDataURL(file)
                                },
                            )

                            parts.push({
                                type: "file",
                                url: dataUrl,
                                mediaType: file.type,
                            })
                        }
                    }
                }

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

                // Check daily limit
                const limitCheck = checkDailyLimit()
                if (!limitCheck.allowed) {
                    showQuotaLimitToast()
                    return
                }

                // Check daily token limit (actual usage tracked after response)
                const tokenLimitCheck = checkTokenLimit()
                if (!tokenLimitCheck.allowed) {
                    showTokenLimitToast(tokenLimitCheck.used)
                    return
                }

                // Check TPM (tokens per minute) limit
                const tpmCheck = checkTPMLimit()
                if (!tpmCheck.allowed) {
                    showTPMLimitToast()
                    return
                }

                const accessCode =
                    localStorage.getItem(STORAGE_ACCESS_CODE_KEY) || ""
                const aiProvider =
                    localStorage.getItem(STORAGE_AI_PROVIDER_KEY) || ""
                const aiBaseUrl =
                    localStorage.getItem(STORAGE_AI_BASE_URL_KEY) || ""
                const aiApiKey =
                    localStorage.getItem(STORAGE_AI_API_KEY_KEY) || ""
                const aiModel = localStorage.getItem(STORAGE_AI_MODEL_KEY) || ""

                sendMessage(
                    { parts },
                    {
                        body: {
                            xml: chartXml,
                            previousXml,
                            sessionId,
                        },
                        headers: {
                            "x-access-code": accessCode,
                            ...(aiProvider && { "x-ai-provider": aiProvider }),
                            ...(aiBaseUrl && { "x-ai-base-url": aiBaseUrl }),
                            ...(aiApiKey && { "x-ai-api-key": aiApiKey }),
                            ...(aiModel && { "x-ai-model": aiModel }),
                        },
                    },
                )

                incrementRequestCount()
                // Token count is tracked in onFinish with actual server usage
                setInput("")
                setFiles([])
            } catch (error) {
                console.error("Error fetching chart data:", error)
            }
        }
    }

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
        setInput(e.target.value)
    }

    const handleFileChange = async (newFiles: File[]) => {
        setFiles(newFiles)

        // Extract text immediately for new PDF/text files
        for (const file of newFiles) {
            const needsExtraction =
                (isPdfFile(file) || isTextFile(file)) && !pdfData.has(file)
            if (needsExtraction) {
                // Mark as extracting
                setPdfData((prev) => {
                    const next = new Map(prev)
                    next.set(file, {
                        text: "",
                        charCount: 0,
                        isExtracting: true,
                    })
                    return next
                })

                // Extract text asynchronously
                try {
                    let text: string
                    if (isPdfFile(file)) {
                        text = await extractPdfText(file)
                    } else {
                        text = await extractTextFileContent(file)
                    }

                    // Check character limit
                    if (text.length > MAX_EXTRACTED_CHARS) {
                        const limitK = MAX_EXTRACTED_CHARS / 1000
                        toast.error(
                            `${file.name}: Content exceeds ${limitK}k character limit (${(text.length / 1000).toFixed(1)}k chars)`,
                        )
                        setPdfData((prev) => {
                            const next = new Map(prev)
                            next.delete(file)
                            return next
                        })
                        // Remove the file from the list
                        setFiles((prev) => prev.filter((f) => f !== file))
                        continue
                    }

                    setPdfData((prev) => {
                        const next = new Map(prev)
                        next.set(file, {
                            text,
                            charCount: text.length,
                            isExtracting: false,
                        })
                        return next
                    })
                } catch (error) {
                    console.error("Failed to extract text:", error)
                    toast.error(`Failed to read file: ${file.name}`)
                    setPdfData((prev) => {
                        const next = new Map(prev)
                        next.delete(file)
                        return next
                    })
                }
            }
        }

        // Clean up pdfData for removed files
        setPdfData((prev) => {
            const next = new Map(prev)
            for (const key of prev.keys()) {
                if (!newFiles.includes(key)) {
                    next.delete(key)
                }
            }
            return next
        })
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

        // Get previous XML (snapshot before the one being regenerated)
        const snapshotKeys = Array.from(xmlSnapshotsRef.current.keys())
            .filter((k) => k < userMessageIndex)
            .sort((a, b) => b - a)
        const previousXml =
            snapshotKeys.length > 0
                ? xmlSnapshotsRef.current.get(snapshotKeys[0]) || ""
                : ""

        // Restore the diagram to the saved state (skip validation for trusted snapshots)
        onDisplayChart(savedXml, true)

        // Update ref directly to ensure edit_diagram has the correct XML
        chartXMLRef.current = savedXml

        // Clean up snapshots for messages after the user message (they will be removed)
        for (const key of xmlSnapshotsRef.current.keys()) {
            if (key > userMessageIndex) {
                xmlSnapshotsRef.current.delete(key)
            }
        }
        saveXmlSnapshots()

        // Remove the user message AND assistant message onwards (sendMessage will re-add the user message)
        // Use flushSync to ensure state update is processed synchronously before sending
        const newMessages = messages.slice(0, userMessageIndex)
        flushSync(() => {
            setMessages(newMessages)
        })

        // Check daily limit
        const limitCheck = checkDailyLimit()
        if (!limitCheck.allowed) {
            showQuotaLimitToast()
            return
        }

        // Check daily token limit (actual usage tracked after response)
        const tokenLimitCheck = checkTokenLimit()
        if (!tokenLimitCheck.allowed) {
            showTokenLimitToast(tokenLimitCheck.used)
            return
        }

        // Check TPM (tokens per minute) limit
        const tpmCheck = checkTPMLimit()
        if (!tpmCheck.allowed) {
            showTPMLimitToast()
            return
        }

        // Now send the message after state is guaranteed to be updated
        const accessCode = localStorage.getItem(STORAGE_ACCESS_CODE_KEY) || ""
        const aiProvider = localStorage.getItem(STORAGE_AI_PROVIDER_KEY) || ""
        const aiBaseUrl = localStorage.getItem(STORAGE_AI_BASE_URL_KEY) || ""
        const aiApiKey = localStorage.getItem(STORAGE_AI_API_KEY_KEY) || ""
        const aiModel = localStorage.getItem(STORAGE_AI_MODEL_KEY) || ""

        sendMessage(
            { parts: userParts },
            {
                body: {
                    xml: savedXml,
                    previousXml,
                    sessionId,
                },
                headers: {
                    "x-access-code": accessCode,
                    ...(aiProvider && { "x-ai-provider": aiProvider }),
                    ...(aiBaseUrl && { "x-ai-base-url": aiBaseUrl }),
                    ...(aiApiKey && { "x-ai-api-key": aiApiKey }),
                    ...(aiModel && { "x-ai-model": aiModel }),
                },
            },
        )

        incrementRequestCount()
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

        // Get previous XML (snapshot before the one being edited)
        const snapshotKeys = Array.from(xmlSnapshotsRef.current.keys())
            .filter((k) => k < messageIndex)
            .sort((a, b) => b - a)
        const previousXml =
            snapshotKeys.length > 0
                ? xmlSnapshotsRef.current.get(snapshotKeys[0]) || ""
                : ""

        // Restore the diagram to the saved state (skip validation for trusted snapshots)
        onDisplayChart(savedXml, true)

        // Update ref directly to ensure edit_diagram has the correct XML
        chartXMLRef.current = savedXml

        // Clean up snapshots for messages after the user message (they will be removed)
        for (const key of xmlSnapshotsRef.current.keys()) {
            if (key > messageIndex) {
                xmlSnapshotsRef.current.delete(key)
            }
        }
        saveXmlSnapshots()

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

        // Check daily limit
        const limitCheck = checkDailyLimit()
        if (!limitCheck.allowed) {
            showQuotaLimitToast()
            return
        }

        // Check daily token limit (actual usage tracked after response)
        const tokenLimitCheck = checkTokenLimit()
        if (!tokenLimitCheck.allowed) {
            showTokenLimitToast(tokenLimitCheck.used)
            return
        }

        // Check TPM (tokens per minute) limit
        const tpmCheck = checkTPMLimit()
        if (!tpmCheck.allowed) {
            showTPMLimitToast()
            return
        }

        // Now send the edited message after state is guaranteed to be updated
        const accessCode = localStorage.getItem(STORAGE_ACCESS_CODE_KEY) || ""
        const aiProvider = localStorage.getItem(STORAGE_AI_PROVIDER_KEY) || ""
        const aiBaseUrl = localStorage.getItem(STORAGE_AI_BASE_URL_KEY) || ""
        const aiApiKey = localStorage.getItem(STORAGE_AI_API_KEY_KEY) || ""
        const aiModel = localStorage.getItem(STORAGE_AI_MODEL_KEY) || ""

        sendMessage(
            { parts: newParts },
            {
                body: {
                    xml: savedXml,
                    previousXml,
                    sessionId,
                },
                headers: {
                    "x-access-code": accessCode,
                    ...(aiProvider && { "x-ai-provider": aiProvider }),
                    ...(aiBaseUrl && { "x-ai-base-url": aiBaseUrl }),
                    ...(aiApiKey && { "x-ai-api-key": aiApiKey }),
                    ...(aiModel && { "x-ai-model": aiModel }),
                },
            },
        )

        incrementRequestCount()
        // Token count is tracked in onFinish with actual server usage
    }

    // Collapsed view (desktop only)
    if (!isVisible && !isMobile) {
        return (
            <div className="h-full flex flex-col items-center pt-4 bg-card border border-border/30 rounded-xl">
                <ButtonWithTooltip
                    tooltipContent="Show chat panel (Ctrl+B)"
                    variant="ghost"
                    size="icon"
                    onClick={onToggleVisibility}
                    className="hover:bg-accent transition-colors"
                >
                    <PanelRightOpen className="h-5 w-5 text-muted-foreground" />
                </ButtonWithTooltip>
                <div
                    className="text-sm font-medium text-muted-foreground mt-8 tracking-wide"
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
        <div className="h-full flex flex-col bg-card shadow-soft animate-slide-in-right rounded-xl border border-border/30 relative">
            <Toaster
                position="bottom-center"
                richColors
                expand
                style={{ position: "absolute" }}
                toastOptions={{
                    style: {
                        maxWidth: "480px",
                    },
                }}
            />
            {/* Header */}
            <header
                className={`${isMobile ? "px-3 py-2" : "px-5 py-4"} border-b border-border/50`}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                            <Image
                                src="/favicon.ico"
                                alt="Next AI Drawio"
                                width={isMobile ? 24 : 28}
                                height={isMobile ? 24 : 28}
                                className="rounded"
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
                    <div className="flex items-center gap-1">
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
                <ChatInput
                    input={input}
                    status={status}
                    onSubmit={onFormSubmit}
                    onChange={handleInputChange}
                    onClearChat={() => {
                        setMessages([])
                        clearDiagram()
                        const newSessionId = `session-${Date.now()}-${Math.random()
                            .toString(36)
                            .slice(2, 9)}`
                        setSessionId(newSessionId)
                        xmlSnapshotsRef.current.clear()
                        // Clear localStorage
                        localStorage.removeItem(STORAGE_MESSAGES_KEY)
                        localStorage.removeItem(STORAGE_XML_SNAPSHOTS_KEY)
                        localStorage.removeItem(STORAGE_DIAGRAM_XML_KEY)
                        localStorage.setItem(
                            STORAGE_SESSION_ID_KEY,
                            newSessionId,
                        )
                    }}
                    files={files}
                    onFileChange={handleFileChange}
                    pdfData={pdfData}
                    showHistory={showHistory}
                    onToggleHistory={setShowHistory}
                    sessionId={sessionId}
                    error={error}
                />
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
        </div>
    )
}
