"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import {
    MessageSquarePlus,
    PanelRightClose,
    PanelRightOpen,
    Settings,
} from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type React from "react"
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react"
import { flushSync } from "react-dom"
import { Toaster, toast } from "sonner"
import { ButtonWithTooltip } from "@/components/button-with-tooltip"
import { ChatInput } from "@/components/chat-input"
import Image from "@/components/image-with-basepath"
import { ModelConfigDialog } from "@/components/model-config-dialog"
import { SettingsDialog } from "@/components/settings-dialog"
import { useDiagram } from "@/contexts/diagram-context"
import { useDiagramToolHandlers } from "@/hooks/use-diagram-tool-handlers"
import { useDictionary } from "@/hooks/use-dictionary"
import { getSelectedAIConfig, useModelConfig } from "@/hooks/use-model-config"
import { useSessionManager } from "@/hooks/use-session-manager"
import { useValidateDiagram } from "@/hooks/use-validate-diagram"
import { getApiEndpoint } from "@/lib/base-path"
import { findCachedResponse } from "@/lib/cached-responses"
import { formatMessage } from "@/lib/i18n/utils"
import { isPdfFile, isTextFile } from "@/lib/pdf-utils"
import { sanitizeMessages } from "@/lib/session-storage"
import { STORAGE_KEYS } from "@/lib/storage"
import type { UrlData } from "@/lib/url-utils"
import { type FileData, useFileProcessor } from "@/lib/use-file-processor"
import { useQuotaManager } from "@/lib/use-quota-manager"
import { cn, formatXML, isRealDiagram } from "@/lib/utils"
import type { ValidationState } from "./chat/ValidationCard"
import { ChatMessageDisplay } from "./chat-message-display"
import { DevXmlSimulator } from "./dev-xml-simulator"

// localStorage keys for persistence
const STORAGE_SESSION_ID_KEY = "next-ai-draw-io-session-id"

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
}

// Constants for tool states
const TOOL_ERROR_STATE = "output-error" as const
const DEBUG = process.env.NODE_ENV === "development"
// Increased to 3 to support VLM validation retries (matches MAX_VALIDATION_RETRIES)
const MAX_AUTO_RETRY_COUNT = 3

const MAX_CONTINUATION_RETRY_COUNT = 2 // Limit for truncation continuation retries

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
}: ChatPanelProps) {
    const {
        loadDiagram: onDisplayChart,
        handleExport: onExport,
        handleExportWithoutHistory,
        resolverRef,
        chartXML,
        latestSvg,
        clearDiagram,
        getThumbnailSvg,
        captureValidationPng,
        diagramHistory,
        setDiagramHistory,
    } = useDiagram()

    const dict = useDictionary()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const urlSessionId = searchParams.get("session")

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
    const [urlData, setUrlData] = useState<Map<string, UrlData>>(new Map())

    const [showSettingsDialog, setShowSettingsDialog] = useState(false)
    const [showModelConfigDialog, setShowModelConfigDialog] = useState(false)

    // Model configuration hook
    const modelConfig = useModelConfig()

    // Session manager for chat history (pass URL session ID for restoration)
    const sessionManager = useSessionManager({ initialSessionId: urlSessionId })

    const [input, setInput] = useState("")
    const [dailyRequestLimit, setDailyRequestLimit] = useState(0)
    const [dailyTokenLimit, setDailyTokenLimit] = useState(0)
    const [tpmLimit, setTpmLimit] = useState(0)
    const [minimalStyle, setMinimalStyle] = useState(false)
    const [vlmValidationEnabled, setVlmValidationEnabled] = useState(false)
    const [shouldFocusInput, setShouldFocusInput] = useState(false)

    // Restore input from sessionStorage on mount (when ChatPanel remounts due to key change)
    useEffect(() => {
        const savedInput = sessionStorage.getItem(SESSION_STORAGE_INPUT_KEY)
        if (savedInput) {
            setInput(savedInput)
        }
    }, [])

    // Load VLM validation setting from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.vlmValidationEnabled)
        if (stored !== null) {
            setVlmValidationEnabled(stored === "true")
        }
    }, [])

    // Check config on mount
    useEffect(() => {
        fetch(getApiEndpoint("/api/config"))
            .then((res) => res.json())
            .then((data) => {
                setDailyRequestLimit(data.dailyRequestLimit || 0)
                setDailyTokenLimit(data.dailyTokenLimit || 0)
                setTpmLimit(data.tpmLimit || 0)
            })
            .catch(() => {})
    }, [])

    // Quota management using extracted hook
    const quotaManager = useQuotaManager({
        dailyRequestLimit,
        dailyTokenLimit,
        tpmLimit,
        onConfigModel: () => setShowModelConfigDialog(true),
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
    const [isRestored, setIsRestored] = useState(false)

    // Track previous isVisible to only animate when toggling (not on page load)
    const prevIsVisibleRef = useRef(isVisible)
    const [shouldAnimatePanel, setShouldAnimatePanel] = useState(false)
    useEffect(() => {
        // Only animate when visibility changes from false to true (not on initial load)
        if (!prevIsVisibleRef.current && isVisible) {
            setShouldAnimatePanel(true)
        }
        prevIsVisibleRef.current = isVisible
    }, [isVisible])

    // Ref to track latest chartXML for use in callbacks (avoids stale closure)
    const chartXMLRef = useRef(chartXML)
    // Track session ID that was loaded without a diagram (to prevent thumbnail contamination)
    const justLoadedSessionIdRef = useRef<string | null>(null)
    useEffect(() => {
        chartXMLRef.current = chartXML
        // Clear the no-diagram flag when a diagram is generated
        if (chartXML) {
            justLoadedSessionIdRef.current = null
        }
    }, [chartXML])

    // Ref to track latest SVG for thumbnail generation
    const latestSvgRef = useRef(latestSvg)
    useEffect(() => {
        latestSvgRef.current = latestSvg
    }, [latestSvg])

    // Ref to track consecutive auto-retry count (reset on user action)
    const autoRetryCountRef = useRef(0)
    // Ref to track continuation retry count (for truncation handling)
    const continuationRetryCountRef = useRef(0)

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

    // Validation state for displaying VLM validation progress
    // Key: toolCallId, Value: ValidationState
    const [validationStates, setValidationStates] = useState<
        Record<string, ValidationState>
    >({})

    // Callback to update validation state from tool handler
    const handleValidationStateChange = useCallback(
        (toolCallId: string, state: ValidationState) => {
            setValidationStates((prev) => ({
                ...prev,
                [toolCallId]: state,
            }))
        },
        [],
    )

    // Handler for VLM validation setting change
    const handleVlmValidationChange = useCallback((value: boolean) => {
        setVlmValidationEnabled(value)
        localStorage.setItem(STORAGE_KEYS.vlmValidationEnabled, String(value))
    }, [])

    // Ref to store the sendMessage function for use in callbacks
    const sendMessageRef = useRef<typeof sendMessage | null>(null)

    // Callback to improve diagram with validation suggestions
    const handleImproveWithSuggestions = useCallback((feedback: string) => {
        if (sendMessageRef.current) {
            // Send the feedback as a new user message to trigger regeneration
            sendMessageRef.current({
                role: "user",
                parts: [{ type: "text", text: feedback }],
            })
        }
    }, [])

    // VLM validation hook using AI SDK's useObject
    const { validateWithFallback } = useValidateDiagram()

    // Diagram tool handlers (display_diagram, edit_diagram, append_diagram)
    const { handleToolCall } = useDiagramToolHandlers({
        partialXmlRef,
        editDiagramOriginalXmlRef,
        chartXMLRef,
        onDisplayChart,
        onFetchChart,
        onExport,
        captureValidationPng,
        validateDiagram: validateWithFallback,
        enableVlmValidation: vlmValidationEnabled,
        sessionId,
        onValidationStateChange: handleValidationStateChange,
    })

    const {
        messages,
        sendMessage,
        addToolOutput,
        status,
        error,
        setMessages,
        stop,
    } = useChat({
        transport: new DefaultChatTransport({
            api: getApiEndpoint("/api/chat"),
        }),
        onToolCall: async ({ toolCall }) => {
            await handleToolCall({ toolCall }, addToolOutput)
        },
        onError: (error) => {
            // Handle server-side quota limit (429 response)
            // AI SDK puts the full response body in error.message for non-OK responses
            try {
                const data = JSON.parse(error.message)
                if (data.type === "request") {
                    quotaManager.showQuotaLimitToast(data.used, data.limit)
                    return
                }
                if (data.type === "token") {
                    quotaManager.showTokenLimitToast(data.used, data.limit)
                    return
                }
                if (data.type === "tpm") {
                    quotaManager.showTPMLimitToast(data.limit)
                    return
                }
            } catch {
                // Not JSON, fall through to string matching for backwards compatibility
            }

            // Fallback to string matching
            if (error.message.includes("Daily request limit")) {
                quotaManager.showQuotaLimitToast()
                return
            }
            if (error.message.includes("Daily token limit")) {
                quotaManager.showTokenLimitToast()
                return
            }
            if (
                error.message.includes("Rate limit exceeded") ||
                error.message.includes("tokens per minute")
            ) {
                quotaManager.showTPMLimitToast()
                return
            }

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

            // Truncated tool input error (model output limit too low)
            if (friendlyMessage.includes("toolUse.input is invalid")) {
                friendlyMessage =
                    "Output was truncated before the diagram could be generated. Try a simpler request or increase the maxOutputLength."
            }

            // Translate image not supported error
            if (
                friendlyMessage.includes("image content block") ||
                friendlyMessage.toLowerCase().includes("image_url")
            ) {
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
                // Show settings dialog to help user fix it
                setShowSettingsDialog(true)
            }
        },
        onFinish: () => {},
        sendAutomaticallyWhen: ({ messages }) => {
            const isInContinuationMode = partialXmlRef.current.length > 0

            const shouldRetry = hasToolErrors(
                messages as unknown as ChatMessage[],
            )

            if (!shouldRetry) {
                // No error, reset retry count and clear state
                autoRetryCountRef.current = 0
                continuationRetryCountRef.current = 0
                partialXmlRef.current = ""
                return false
            }

            // Continuation mode: limited retries for truncation handling
            if (isInContinuationMode) {
                if (
                    continuationRetryCountRef.current >=
                    MAX_CONTINUATION_RETRY_COUNT
                ) {
                    toast.error(
                        formatMessage(dict.errors.continuationRetryLimit, {
                            max: MAX_CONTINUATION_RETRY_COUNT,
                        }),
                    )
                    continuationRetryCountRef.current = 0
                    partialXmlRef.current = ""
                    return false
                }
                continuationRetryCountRef.current++
            } else {
                // Regular error: check retry count limit
                if (autoRetryCountRef.current >= MAX_AUTO_RETRY_COUNT) {
                    toast.error(
                        formatMessage(dict.errors.retryLimit, {
                            max: MAX_AUTO_RETRY_COUNT,
                        }),
                    )
                    autoRetryCountRef.current = 0
                    partialXmlRef.current = ""
                    return false
                }
                // Increment retry count for actual errors
                autoRetryCountRef.current++
            }

            return true
        },
    })

    // Store sendMessage in ref for use in callbacks (like handleImproveWithSuggestions)
    useEffect(() => {
        sendMessageRef.current = sendMessage
    }, [sendMessage])

    // Ref to track latest messages for unload persistence
    const messagesRef = useRef(messages)
    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    // Track last synced session ID to detect external changes (e.g., URL back/forward)
    const lastSyncedSessionIdRef = useRef<string | null>(null)

    // Helper: Sync UI state with session data (eliminates duplication)
    // Track message IDs that are being loaded from session (to skip animations/scroll)
    const loadedMessageIdsRef = useRef<Set<string>>(new Set())
    // Track when session was just loaded (to skip auto-save on load)
    const justLoadedSessionRef = useRef(false)

    const syncUIWithSession = useCallback(
        (
            data: {
                messages: unknown[]
                xmlSnapshots: [number, string][]
                diagramXml: string
                diagramHistory?: { svg: string; xml: string }[]
            } | null,
        ) => {
            const hasRealDiagram = isRealDiagram(data?.diagramXml)
            if (data) {
                // Mark all message IDs as loaded from session
                const messageIds = (data.messages as any[]).map(
                    (m: any) => m.id,
                )
                loadedMessageIdsRef.current = new Set(messageIds)
                setMessages(data.messages as any)
                xmlSnapshotsRef.current = new Map(data.xmlSnapshots)
                if (hasRealDiagram) {
                    onDisplayChart(data.diagramXml, true)
                    chartXMLRef.current = data.diagramXml
                } else {
                    clearDiagram()
                    // Clear refs to prevent stale data from being saved
                    chartXMLRef.current = ""
                    latestSvgRef.current = ""
                }
                setDiagramHistory(data.diagramHistory || [])
            } else {
                loadedMessageIdsRef.current = new Set()
                setMessages([])
                xmlSnapshotsRef.current.clear()
                clearDiagram()
                // Clear refs to prevent stale data from being saved
                chartXMLRef.current = ""
                latestSvgRef.current = ""
                setDiagramHistory([])
            }
        },
        [setMessages, onDisplayChart, clearDiagram, setDiagramHistory],
    )

    // Helper: Build session data object for saving (eliminates duplication)
    const buildSessionData = useCallback(
        async (options: { withThumbnail?: boolean } = {}) => {
            const currentDiagramXml = chartXMLRef.current || ""
            // Only capture thumbnail if there's a meaningful diagram (not just empty template)
            const hasRealDiagram = isRealDiagram(currentDiagramXml)
            let thumbnailDataUrl: string | undefined
            if (hasRealDiagram && options.withThumbnail) {
                const freshThumb = await getThumbnailSvg()
                if (freshThumb) {
                    latestSvgRef.current = freshThumb
                    thumbnailDataUrl = freshThumb
                } else if (latestSvgRef.current) {
                    // Use cached thumbnail only if we have a real diagram
                    thumbnailDataUrl = latestSvgRef.current
                }
            }
            return {
                messages: sanitizeMessages(messagesRef.current),
                xmlSnapshots: Array.from(xmlSnapshotsRef.current.entries()),
                diagramXml: currentDiagramXml,
                thumbnailDataUrl,
                diagramHistory,
            }
        },
        [diagramHistory, getThumbnailSvg],
    )

    // Restore messages and XML snapshots from session manager on mount
    // This effect syncs with the session manager's loaded session
    useLayoutEffect(() => {
        if (hasRestoredRef.current) return
        if (sessionManager.isLoading) return // Wait for session manager to load

        hasRestoredRef.current = true

        try {
            const currentSession = sessionManager.currentSession
            if (currentSession && currentSession.messages.length > 0) {
                // Restore from session manager (IndexedDB)
                justLoadedSessionRef.current = true
                syncUIWithSession(currentSession)
            }
            // Initialize lastSyncedSessionIdRef to prevent sync effect from firing immediately
            lastSyncedSessionIdRef.current = sessionManager.currentSessionId
            // Note: Migration from old localStorage format is handled by session-storage.ts
        } catch (error) {
            console.error("Failed to restore session:", error)
            toast.error(dict.errors.sessionCorrupted)
        } finally {
            setIsRestored(true)
        }
    }, [
        sessionManager.isLoading,
        sessionManager.currentSession,
        syncUIWithSession,
        dict.errors.sessionCorrupted,
    ])

    // Sync UI when session changes externally (e.g., URL navigation via back/forward)
    // This handles changes AFTER initial restore
    useEffect(() => {
        if (!isRestored) return // Wait for initial restore to complete
        if (!sessionManager.isAvailable) return

        const newSessionId = sessionManager.currentSessionId
        const newSession = sessionManager.currentSession

        // Skip if session ID hasn't changed (our own saves don't change the ID)
        if (newSessionId === lastSyncedSessionIdRef.current) return

        // Update last synced ID
        lastSyncedSessionIdRef.current = newSessionId

        // Sync UI with new session
        if (newSession && newSession.messages.length > 0) {
            justLoadedSessionRef.current = true
            syncUIWithSession(newSession)
        } else if (!newSession) {
            syncUIWithSession(null)
        }
    }, [
        isRestored,
        sessionManager.isAvailable,
        sessionManager.currentSessionId,
        sessionManager.currentSession,
        syncUIWithSession,
    ])

    // Save messages to session manager (debounced, only when not streaming)
    // Destructure stable values to avoid effect re-running on every render
    const {
        isAvailable: sessionIsAvailable,
        currentSessionId,
        saveCurrentSession,
    } = sessionManager

    // Use ref for saveCurrentSession to avoid infinite loop
    // (saveCurrentSession changes after each save, which would re-trigger the effect)
    const saveCurrentSessionRef = useRef(saveCurrentSession)
    saveCurrentSessionRef.current = saveCurrentSession

    useEffect(() => {
        if (!hasRestoredRef.current) return
        if (!sessionIsAvailable) return
        // Only save when not actively streaming to avoid write storms
        if (status === "streaming" || status === "submitted") return

        // Skip auto-save if session was just loaded (to prevent re-ordering)
        if (justLoadedSessionRef.current) {
            justLoadedSessionRef.current = false
            return
        }

        // Clear any pending save
        if (localStorageDebounceRef.current) {
            clearTimeout(localStorageDebounceRef.current)
        }

        // Capture current session ID at schedule time to verify at save time
        const scheduledForSessionId = currentSessionId
        // Capture whether there's a REAL diagram NOW (not just empty template)
        const hasDiagramNow = isRealDiagram(chartXMLRef.current)
        // Check if this session was just loaded without a diagram
        const isNodiagramSession =
            justLoadedSessionIdRef.current === scheduledForSessionId

        // Debounce: save after 1 second of no changes
        localStorageDebounceRef.current = setTimeout(async () => {
            try {
                if (messages.length > 0) {
                    const sessionData = await buildSessionData({
                        // Only capture thumbnail if there was a diagram AND this isn't a no-diagram session
                        withThumbnail: hasDiagramNow && !isNodiagramSession,
                    })
                    await saveCurrentSessionRef.current(
                        sessionData,
                        scheduledForSessionId,
                    )
                }
            } catch (error) {
                console.error("Failed to save session:", error)
            }
        }, LOCAL_STORAGE_DEBOUNCE_MS)

        // Cleanup on unmount
        return () => {
            if (localStorageDebounceRef.current) {
                clearTimeout(localStorageDebounceRef.current)
            }
        }
    }, [
        messages,
        status,
        sessionIsAvailable,
        currentSessionId,
        buildSessionData,
    ])

    // Update URL when a new session is created (first message sent)
    useEffect(() => {
        if (sessionManager.currentSessionId && !urlSessionId) {
            // A session was created but URL doesn't have the session param yet
            router.replace(`?session=${sessionManager.currentSessionId}`, {
                scroll: false,
            })
        }
    }, [sessionManager.currentSessionId, urlSessionId, router])

    // Save session ID to localStorage
    useEffect(() => {
        localStorage.setItem(STORAGE_SESSION_ID_KEY, sessionId)
    }, [sessionId])

    // Save session when page becomes hidden (tab switch, close, navigate away)
    // This is more reliable than beforeunload for async IndexedDB operations
    useEffect(() => {
        if (!sessionManager.isAvailable) return

        const handleVisibilityChange = async () => {
            if (
                document.visibilityState === "hidden" &&
                messagesRef.current.length > 0
            ) {
                try {
                    // Attempt to save session - browser may not wait for completion
                    // Skip thumbnail capture as it may not complete in time
                    const sessionData = await buildSessionData({
                        withThumbnail: false,
                    })
                    await sessionManager.saveCurrentSession(sessionData)
                } catch (error) {
                    console.error(
                        "Failed to save session on visibility change:",
                        error,
                    )
                }
            }
        }

        document.addEventListener("visibilitychange", handleVisibilityChange)
        return () =>
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            )
    }, [sessionManager, buildSessionData])

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
                        undefined,
                        urlData,
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
                    setUrlData(new Map())
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
                    urlData,
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

                sendChatMessage(parts, chartXml, previousXml, sessionId)

                // Token count is tracked in onFinish with actual server usage
                setInput("")
                sessionStorage.removeItem(SESSION_STORAGE_INPUT_KEY)
                setFiles([])
                setUrlData(new Map())
            } catch (error) {
                console.error("Error fetching chart data:", error)
            }
        }
    }

    // Handle session switching from history dropdown
    const handleSelectSession = useCallback(
        async (sessionId: string) => {
            if (!sessionManager.isAvailable) return

            // Save current session before switching
            if (messages.length > 0) {
                const sessionData = await buildSessionData({
                    withThumbnail: true,
                })
                await sessionManager.saveCurrentSession(sessionData)
            }

            // Switch to selected session
            const sessionData = await sessionManager.switchSession(sessionId)
            if (sessionData) {
                const hasRealDiagram = isRealDiagram(sessionData.diagramXml)
                justLoadedSessionRef.current = true

                // CRITICAL: Update latestSvgRef with the NEW session's thumbnail
                // This prevents stale thumbnail from previous session being used by auto-save
                latestSvgRef.current = sessionData.thumbnailDataUrl || ""

                // Track if this session has no real diagram - to prevent thumbnail contamination
                if (!hasRealDiagram) {
                    justLoadedSessionIdRef.current = sessionId
                } else {
                    justLoadedSessionIdRef.current = null
                }
                setValidationStates({}) // Clear validation states when switching sessions
                syncUIWithSession(sessionData)
                router.replace(`?session=${sessionId}`, { scroll: false })
            }
        },
        [sessionManager, messages, buildSessionData, syncUIWithSession, router],
    )

    // Handle session deletion from history dropdown
    const handleDeleteSession = useCallback(
        async (sessionId: string) => {
            if (!sessionManager.isAvailable) return
            const result = await sessionManager.deleteSession(sessionId)

            if (result.wasCurrentSession) {
                // Deleted current session - clear UI and URL
                syncUIWithSession(null)
                router.replace(pathname, { scroll: false })
            }
        },
        [sessionManager, syncUIWithSession, router, pathname],
    )

    const handleNewChat = useCallback(async () => {
        // Save current session before creating new one
        if (sessionManager.isAvailable && messages.length > 0) {
            const sessionData = await buildSessionData({ withThumbnail: true })
            await sessionManager.saveCurrentSession(sessionData)
            // Refresh sessions list to ensure dropdown shows the saved session
            await sessionManager.refreshSessions()
        }

        // Clear session manager state BEFORE clearing URL to prevent race condition
        // (otherwise the URL update effect would restore the old session URL)
        sessionManager.clearCurrentSession()

        // Clear UI state (can't use syncUIWithSession here because we also need to clear files)
        setMessages([])
        setInput("")
        clearDiagram()
        setDiagramHistory([])
        setValidationStates({}) // Clear validation states to prevent memory leak
        handleFileChange([]) // Use handleFileChange to also clear pdfData
        setUrlData(new Map())
        const newSessionId = `session-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 9)}`
        setSessionId(newSessionId)
        xmlSnapshotsRef.current.clear()
        sessionStorage.removeItem(SESSION_STORAGE_INPUT_KEY)
        toast.success(dict.dialogs.clearSuccess)

        // Clear URL param to show blank state
        router.replace(pathname, { scroll: false })

        // After starting a fresh chat, move focus back to the chat input
        setShouldFocusInput(true)
    }, [
        clearDiagram,
        handleFileChange,
        setMessages,
        setSessionId,
        sessionManager,
        messages,
        router,
        dict.dialogs.clearSuccess,
        buildSessionData,
        setDiagramHistory,
        pathname,
    ])

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
    }

    // Handle stop button click
    const handleStop = useCallback(() => {
        const lastMessage = messages[messages.length - 1]
        const toolParts = lastMessage?.parts?.filter(
            (part: any) =>
                part.type?.startsWith("tool-") &&
                part.state === "input-streaming",
        )

        toolParts?.forEach((part: any) => {
            if (part.toolCallId) {
                addToolOutput({
                    tool: part.type.replace("tool-", ""),
                    toolCallId: part.toolCallId,
                    state: "output-error",
                    errorText: "Stopped by user",
                })
            }
        })

        stop()
    }, [messages, addToolOutput, stop])

    // Send chat message with headers
    const sendChatMessage = (
        parts: any,
        xml: string,
        previousXml: string,
        sessionId: string,
    ) => {
        // Reset all retry/continuation state on user-initiated message
        autoRetryCountRef.current = 0
        continuationRetryCountRef.current = 0
        partialXmlRef.current = ""

        const config = getSelectedAIConfig()

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
                        // AWS Bedrock credentials
                        ...(config.awsAccessKeyId && {
                            "x-aws-access-key-id": config.awsAccessKeyId,
                        }),
                        ...(config.awsSecretAccessKey && {
                            "x-aws-secret-access-key":
                                config.awsSecretAccessKey,
                        }),
                        ...(config.awsRegion && {
                            "x-aws-region": config.awsRegion,
                        }),
                        ...(config.awsSessionToken && {
                            "x-aws-session-token": config.awsSessionToken,
                        }),
                        // Vertex AI credentials (Express Mode)
                        ...(config.vertexApiKey && {
                            "x-vertex-api-key": config.vertexApiKey,
                        }),
                    }),
                    // Send selected model ID for server model lookup (apiKeyEnv/baseUrlEnv)
                    ...(config.selectedModelId && {
                        "x-selected-model-id": config.selectedModelId,
                    }),
                    ...(minimalStyle && {
                        "x-minimal-style": "true",
                    }),
                },
            },
        )
    }

    // Process files and append content to user text (handles PDF, text, and optionally images)
    const processFilesAndAppendContent = async (
        baseText: string,
        files: File[],
        pdfData: Map<File, FileData>,
        imageParts?: any[],
        urlDataParam?: Map<string, UrlData>,
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

        if (urlDataParam) {
            for (const [url, data] of urlDataParam) {
                if (data.content) {
                    userText += `\n\n[URL: ${url}]\nTitle: ${data.title}\n\n${data.content}`
                }
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

        // Now send the message after state is guaranteed to be updated
        sendChatMessage(userParts, savedXml, previousXml, sessionId)
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

        // Now send the edited message after state is guaranteed to be updated
        sendChatMessage(newParts, savedXml, previousXml, sessionId)
    }

    // Collapsed view (desktop only)
    if (!isVisible && !isMobile) {
        return (
            <div className="h-full flex flex-col items-center pt-4 bg-card border border-border/30 rounded-xl">
                <ButtonWithTooltip
                    tooltipContent={dict.nav.showPanel}
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
                    }}
                >
                    {dict.nav.aiChat}
                </div>
            </div>
        )
    }

    // Full view
    return (
        <div
            className={cn(
                "h-full flex flex-col bg-card shadow-soft rounded-xl border border-border/30 relative",
                shouldAnimatePanel && "animate-slide-in-right",
            )}
        >
            <Toaster
                position="bottom-left"
                richColors
                expand
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
                    <button
                        type="button"
                        onClick={handleNewChat}
                        disabled={
                            status === "streaming" || status === "submitted"
                        }
                        className="flex items-center gap-2 overflow-x-hidden hover:opacity-80 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title={dict.nav.newChat}
                    >
                        <div className="flex items-center gap-2">
                            <Image
                                src={
                                    darkMode
                                        ? "/favicon-white.svg"
                                        : "/favicon.ico"
                                }
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
                    </button>
                    <div className="flex items-center gap-1 justify-end overflow-visible">
                        <ButtonWithTooltip
                            tooltipContent={dict.nav.newChat}
                            variant="ghost"
                            size="icon"
                            onClick={handleNewChat}
                            disabled={
                                status === "streaming" || status === "submitted"
                            }
                            className="hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                            data-testid="new-chat-button"
                        >
                            <MessageSquarePlus
                                className={`${isMobile ? "h-4 w-4" : "h-5 w-5"} text-muted-foreground`}
                            />
                        </ButtonWithTooltip>

                        <ButtonWithTooltip
                            tooltipContent={dict.nav.settings}
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowSettingsDialog(true)}
                            className="hover:bg-accent"
                            data-testid="settings-button"
                        >
                            <Settings
                                className={`${isMobile ? "h-4 w-4" : "h-5 w-5"} text-muted-foreground`}
                            />
                        </ButtonWithTooltip>
                        <div className="hidden sm:flex items-center gap-2">
                            {!isMobile && (
                                <ButtonWithTooltip
                                    tooltipContent={dict.nav.hidePanel}
                                    variant="ghost"
                                    size="icon"
                                    className="hover:bg-accent"
                                    onClick={onToggleVisibility}
                                >
                                    <PanelRightClose className="h-5 w-5 text-muted-foreground" />
                                </ButtonWithTooltip>
                            )}
                        </div>
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
                    isRestored={isRestored}
                    sessions={sessionManager.sessions}
                    onSelectSession={handleSelectSession}
                    onDeleteSession={handleDeleteSession}
                    loadedMessageIdsRef={loadedMessageIdsRef}
                    validationStates={validationStates}
                    onImproveWithSuggestions={handleImproveWithSuggestions}
                />
            </main>

            {/* Dev XML Streaming Simulator - only in development */}
            {DEBUG && (
                <DevXmlSimulator
                    setMessages={setMessages}
                    onDisplayChart={onDisplayChart}
                    onShowQuotaToast={() =>
                        quotaManager.showQuotaLimitToast(50, 50)
                    }
                />
            )}

            {/* Input */}
            <footer
                className={`${isMobile ? "p-2" : "p-4"} border-t border-border/50 bg-card/50`}
            >
                <ChatInput
                    input={input}
                    status={status}
                    onSubmit={onFormSubmit}
                    onChange={handleInputChange}
                    onStop={handleStop}
                    files={files}
                    onFileChange={handleFileChange}
                    pdfData={pdfData}
                    urlData={urlData}
                    onUrlChange={setUrlData}
                    sessionId={sessionId}
                    error={error}
                    models={modelConfig.models}
                    selectedModelId={modelConfig.selectedModelId}
                    onModelSelect={modelConfig.setSelectedModelId}
                    onConfigureModels={() => setShowModelConfigDialog(true)}
                    showUnvalidatedModels={modelConfig.showUnvalidatedModels}
                    shouldFocus={shouldFocusInput}
                    onFocused={() => setShouldFocusInput(false)}
                />
            </footer>

            <SettingsDialog
                open={showSettingsDialog}
                onOpenChange={setShowSettingsDialog}
                drawioUi={drawioUi}
                onToggleDrawioUi={onToggleDrawioUi}
                darkMode={darkMode}
                onToggleDarkMode={onToggleDarkMode}
                minimalStyle={minimalStyle}
                onMinimalStyleChange={setMinimalStyle}
                vlmValidationEnabled={vlmValidationEnabled}
                onVlmValidationChange={handleVlmValidationChange}
                onOpenModelConfig={() => setShowModelConfigDialog(true)}
            />

            <ModelConfigDialog
                open={showModelConfigDialog}
                onOpenChange={setShowModelConfigDialog}
                modelConfig={modelConfig}
            />
        </div>
    )
}
