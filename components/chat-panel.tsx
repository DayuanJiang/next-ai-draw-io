"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai"
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
import type { DrawioTheme } from "@/lib/drawio-themes"
import { formatMessage } from "@/lib/i18n/utils"
import { isPdfFile, isTextFile } from "@/lib/pdf-utils"
import { sanitizeMessages } from "@/lib/session-storage"
import { STORAGE_KEYS } from "@/lib/storage"
import type { UrlData } from "@/lib/url-utils"
import { type FileData, useFileProcessor } from "@/lib/use-file-processor"
import { useQuotaManager } from "@/lib/use-quota-manager"
import { cn, formatXML, isRealDiagram } from "@/lib/utils"
import { prepareNewDiagram } from "@/packages/mcp-server/src/new-diagram.ts"
import { BLANK_MXFILE, hasCells } from "@/packages/mcp-server/src/pages.ts"
import type { ValidationState } from "./chat/ValidationCard"
import {
    APPENDED_FILE_SECTIONS_PATTERN,
    ChatMessageDisplay,
} from "./chat-message-display"
import { DevXmlSimulator } from "./dev-xml-simulator"

// localStorage keys for persistence
const STORAGE_SESSION_ID_KEY = "next-ai-draw-io-session-id"

// sessionStorage keys
const SESSION_STORAGE_INPUT_KEY = "next-ai-draw-io-input"

interface ChatPanelProps {
    isVisible: boolean
    onToggleVisibility: () => void
    drawioUi: DrawioTheme
    onDrawioUiChange: (theme: DrawioTheme) => void
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
function hasToolErrors(messages: UIMessage[]): boolean {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role !== "assistant") return false
    const lastToolPart = lastMessage.parts.filter(isToolUIPart).at(-1)
    return lastToolPart?.state === TOOL_ERROR_STATE
}

/**
 * Snapshots keep the full multi-page document, but the model only sees and
 * edits the first page, so give it the first page's mxGraphModel.
 * Older snapshots already hold a single mxGraphModel and are returned as is.
 */
function getFirstPageXml(xml: string): string {
    if (!xml.includes("<mxfile")) return xml
    const doc = new DOMParser().parseFromString(xml, "text/xml")
    const model = doc.querySelector("diagram")?.querySelector("mxGraphModel")
    return model ? formatXML(new XMLSerializer().serializeToString(model)) : xml
}

export default function ChatPanel({
    isVisible,
    onToggleVisibility,
    drawioUi,
    onDrawioUiChange,
    darkMode,
    onToggleDarkMode,
    isMobile = false,
}: ChatPanelProps) {
    const {
        loadDiagram: onDisplayChart,
        handleExport: onExport,
        handleExportWithoutHistory,
        exportResolversRef,
        chartXML,
        chartXMLRef: liveChartXMLRef,
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
        // Waits for the reply to its own export, by its tag
        const tag = saveToHistory ? onExport() : handleExportWithoutHistory()
        return Promise.race([
            new Promise<string>((resolve) => {
                if (tag) exportResolversRef.current[tag] = resolve
            }),
            new Promise<string>((_, reject) => {
                setTimeout(() => {
                    delete exportResolversRef.current[tag]
                    reject(new Error("Chart export timed out after 10 seconds"))
                }, 10000)
            }),
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
    const [customSystemMessage, setCustomSystemMessage] = useState("")
    const [maxOutputTokens, setMaxOutputTokens] = useState("")
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

    // Load custom system message from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.customSystemMessage)
        if (stored !== null) {
            setCustomSystemMessage(stored)
        }
    }, [])

    // Load output token budget from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEYS.maxOutputTokens)
        if (stored !== null) {
            setMaxOutputTokens(stored)
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

    // Set by Stop until the user sends the next message
    const stoppedRef = useRef(false)
    const preparingSendRef = useRef(false)
    // Presses of Stop: a check that began before one still knows of it after
    // the next message clears stoppedRef
    const stopCountRef = useRef(0)

    // Store original XML for display_diagram and edit_diagram streaming -
    // shared between streaming preview and tool handler
    // Key: toolCallId, Value: XML before the call's preview was drawn
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

    // Handler for custom system message change
    const handleCustomSystemMessageChange = useCallback((value: string) => {
        setCustomSystemMessage(value)
        localStorage.setItem(STORAGE_KEYS.customSystemMessage, value)
    }, [])

    // Handler for output token budget change (empty string = use server default)
    const handleMaxOutputTokensChange = useCallback((value: string) => {
        const digitsOnly = value.replace(/\D/g, "")
        setMaxOutputTokens(digitsOnly)
        localStorage.setItem(STORAGE_KEYS.maxOutputTokens, digitsOnly)
    }, [])

    // Failed VLM validations in the current user turn (reset on user action)
    const validationRetryCountRef = useRef(0)

    // VLM validation hook using AI SDK's useObject
    const { validateWithFallback, cancel: cancelValidation } =
        useValidateDiagram()

    // Diagram tool handlers (display_diagram, edit_diagram, append_diagram)
    const { handleToolCall } = useDiagramToolHandlers({
        partialXmlRef,
        editDiagramOriginalXmlRef,
        processedToolCallsRef,
        validationRetryCountRef,
        // A preview undone just before the tool call is in this one already
        chartXMLRef: liveChartXMLRef,
        onDisplayChart,
        onFetchChart,
        onExport,
        captureValidationPng,
        validateDiagram: validateWithFallback,
        enableVlmValidation: vlmValidationEnabled,
        sessionId,
        watchStop: () => {
            const stopsBefore = stopCountRef.current
            return () =>
                stoppedRef.current || stopCountRef.current !== stopsBefore
        },
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
        onFinish: ({ message, isAbort, isError }) => {
            // Stopped or failed: tool calls still streaming never reach the
            // tool handler. Mark them handled so a later render of the
            // stream does not draw their preview again.
            if (!isAbort && !isError) return
            for (const part of message.parts as any[]) {
                if (part.state === "input-streaming" && part.toolCallId) {
                    processedToolCallsRef.current.add(part.toolCallId)
                }
            }
        },
        onError: (error) => {
            // A diagram still streaming when the request failed never
            // reaches the tool handler: undo its preview. Only previews not
            // handled yet are stored, and the first one holds the diagram
            // before any of them.
            const [originalXml] = editDiagramOriginalXmlRef.current.values()
            if (originalXml) onDisplayChart(originalXml, true)
            editDiagramOriginalXmlRef.current.clear()

            // Server errors are JSON: a quota limit ({type: request, token or
            // tpm}), a provider error ({type: "provider", code, message}) or
            // {error}. The SDK puts the response body in error.message.
            let data: any = null
            try {
                data = JSON.parse(error.message)
            } catch {
                // Plain text, e.g. a network failure in the browser
            }
            if (data?.type === "request") {
                quotaManager.showQuotaLimitToast(data.used, data.limit)
                return
            }
            if (data?.type === "token") {
                quotaManager.showTokenLimitToast(data.used, data.limit)
                return
            }
            if (data?.type === "tpm") {
                quotaManager.showTPMLimitToast(data.limit)
                return
            }

            const isAccessCodeError = String(
                data?.error ?? error.message,
            ).includes("Invalid or missing access code")
            // Silence access code error in console since it's handled by UI
            if (!isAccessCodeError) console.error("Chat error:", error)

            // A hint the user can act on, then the provider's own words
            let text: string = error.message
            let openModelConfig = false
            if (data?.type === "provider") {
                const hints = dict.errors.llm as Record<string, string>
                const hint = hints[data.code]
                text =
                    hint && data.message
                        ? `${hint}\n\n${data.message}`
                        : hint || data.message
                openModelConfig = [
                    "invalid_api_key",
                    "forbidden",
                    "model_not_found",
                    "server_key_forbidden",
                ].includes(data.code)
            } else if (typeof data?.error === "string") {
                text = data.error
            } else if (error.message === "Failed to fetch") {
                text = dict.errors.networkError
            }

            // Add system message for error so it can be cleared
            setMessages((currentMessages) => [
                ...currentMessages,
                {
                    id: `error-${Date.now()}`,
                    role: "system" as const,
                    content: text,
                    parts: [{ type: "text" as const, text }],
                    // The message shows a button that opens model settings
                    ...(openModelConfig && {
                        metadata: { openModelConfig: true },
                    }),
                },
            ])

            if (isAccessCodeError) {
                // Show settings dialog to help user fix it
                setShowSettingsDialog(true)
            }
        },
        // Re-render streamed messages at most every 150 ms. The streaming
        // diagram preview draws on each update, so this also limits redraws
        experimental_throttle: 150,
        sendAutomaticallyWhen: ({ messages }) => {
            // The user stopped: a tool result that arrives later (a VLM
            // check still running) must not start a new request
            if (stoppedRef.current) return false

            const isInContinuationMode = partialXmlRef.current.length > 0

            const shouldRetry = hasToolErrors(messages)

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

    // Ref to track latest messages for unload persistence
    const messagesRef = useRef(messages)
    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    // Track last synced session ID to detect external changes (e.g., URL back/forward)
    const lastSyncedSessionIdRef = useRef<string | null>(null)
    // Message arrays of our own saves. A session holding one of them was
    // created by our own save, so it must not be treated as an external
    // switch (with two saves of a new chat at once, the first creates it).
    const savedMessagesRef = useRef(new WeakSet<object>())

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
            const messages = sanitizeMessages(messagesRef.current)
            savedMessagesRef.current.add(messages)
            return {
                messages,
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
            if (currentSession) {
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

        // Our own save created this session; the UI already shows its content
        const isOwnNewSession =
            !!newSession && savedMessagesRef.current.has(newSession.messages)

        // Update last synced ID
        lastSyncedSessionIdRef.current = newSessionId
        if (isOwnNewSession) return

        // Sync UI with new session
        if (newSession) {
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
        getChatGeneration,
        getSaveTicket,
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

        // Capture the chat on screen at schedule time; the save is dropped
        // if another chat is on screen by the time it runs
        const scheduledForChat = getChatGeneration()
        // Capture whether there's a REAL diagram NOW (not just empty template)
        const hasDiagramNow = isRealDiagram(chartXMLRef.current)
        // Check if this session was just loaded without a diagram
        const isNodiagramSession =
            justLoadedSessionIdRef.current === currentSessionId

        // Debounce: save after 1 second of no changes
        localStorageDebounceRef.current = setTimeout(async () => {
            try {
                if (messages.length > 0 || hasDiagramNow) {
                    // Taken before the data is read, for the chat it was
                    // scheduled for
                    const ticket = {
                        ...getSaveTicket(),
                        generation: scheduledForChat,
                    }
                    const sessionData = await buildSessionData({
                        // Only capture thumbnail if there was a diagram AND this isn't a no-diagram session
                        withThumbnail: hasDiagramNow && !isNodiagramSession,
                    })
                    await saveCurrentSessionRef.current(sessionData, ticket)
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
        chartXML,
        messages,
        status,
        sessionIsAvailable,
        currentSessionId,
        getChatGeneration,
        getSaveTicket,
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
                (messagesRef.current.length > 0 ||
                    isRealDiagram(chartXMLRef.current))
            ) {
                try {
                    // Attempt to save session - browser may not wait for completion
                    // Skip thumbnail capture as it may not complete in time
                    const ticket = sessionManager.getSaveTicket()
                    const sessionData = await buildSessionData({
                        withThumbnail: false,
                    })
                    await sessionManager.saveCurrentSession(sessionData, ticket)
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

    const submitInput = async () => {
        const isProcessing = status === "streaming" || status === "submitted"
        // Attachments still extracting have no text yet. Template sends call
        // requestSubmit() and skip the disabled send button, so check here too.
        const isExtracting =
            files.some((f) => pdfData.get(f)?.isExtracting) ||
            Array.from(urlData.values()).some((d) => d.isExtracting)
        if (input.trim() && !isProcessing && !isExtracting) {
            // Check if input matches a cached example (only when no messages
            // yet and the canvas is empty, same rule as the server)
            if (messages.length === 0 && !hasCells(chartXMLRef.current || "")) {
                // Pass the file name so a user's own file never matches an example
                const cached = findCachedResponse(
                    input.trim(),
                    files.length > 0,
                    files.length === 1 ? files[0].name : undefined,
                )
                if (cached) {
                    // Add the user message and a finished display_diagram
                    // answer, and load its diagram here: these messages never
                    // reach the tool handler
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
                    // Snapshot the canvas before the example so editing this message works
                    xmlSnapshotsRef.current.set(
                        0,
                        chartXMLRef.current || BLANK_MXFILE,
                    )
                    const prepared = prepareNewDiagram(cached.xml, {
                        pageId: "page-1",
                        pageName: "Page-1",
                    })
                    if (prepared.ok) onDisplayChart(prepared.xml, true)
                    setInput("")
                    sessionStorage.removeItem(SESSION_STORAGE_INPUT_KEY)
                    setFiles([])
                    setUrlData(new Map())
                    return
                }
            }

            try {
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

                await sendWithCurrentDiagram(parts, () => {
                    setInput("")
                    sessionStorage.removeItem(SESSION_STORAGE_INPUT_KEY)
                    setFiles([])
                    setUrlData(new Map())
                })
            } catch (error) {
                console.error("Error fetching chart data:", error)
                toast.error(dict.errors.failedToExport)
            }
        }
    }

    const onFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        // While a send is prepared (attachments read, diagram exported) the
        // status is still "ready": a second Enter or click would send the
        // message again
        if (preparingSendRef.current) return
        preparingSendRef.current = true
        try {
            await submitInput()
        } finally {
            preparingSendRef.current = false
        }
    }

    // Export the current diagram, snapshot it for this message, and send.
    // onSent runs right after sending, so the input empties as the message
    // shows in the chat
    const sendWithCurrentDiagram = async (
        parts: any[],
        onSent?: () => void,
    ) => {
        const chartXml = formatXML(await onFetchChart())
        const previousXml = getPreviousXml(messages.length)

        // Snapshot the full multi-page document (kept fresh by autosave) so
        // regenerate/edit can restore every page; the model gets page 1 only
        xmlSnapshotsRef.current.set(
            messages.length,
            chartXMLRef.current || chartXml,
        )

        sendChatMessage(parts, chartXml, previousXml, sessionId)
        onSent?.()
    }

    // Send VLM validation feedback as a new user message through the normal send path
    const handleImproveWithSuggestions = async (feedback: string) => {
        if (status === "streaming" || status === "submitted") return
        try {
            await sendWithCurrentDiagram([{ type: "text", text: feedback }])
        } catch (error) {
            console.error("Error fetching chart data:", error)
            toast.error(dict.errors.failedToExport)
        }
    }

    // The current chat could not be saved (storage full). The list where
    // old chats can be deleted shows only in an empty chat, so let the user
    // go on without saving. It replaces the plain message, and has its own
    // id so a later failed auto-save does not take its button away.
    const offerToContinueUnsaved = useCallback(
        (proceed: () => void) => {
            toast.dismiss("session-save-failed")
            toast.error(dict.errors.sessionSaveFailedLeave, {
                id: "session-save-leave",
                duration: 15000,
                action: {
                    label: dict.errors.continueWithoutSaving,
                    onClick: proceed,
                },
            })
        },
        [dict],
    )

    // A new turn makes the offer stale: going on would clear the chat while
    // the answer streams in
    useEffect(() => {
        if (status === "submitted" || status === "streaming") {
            toast.dismiss("session-save-leave")
        }
    }, [status])

    // Handle session switching from history dropdown
    const handleSelectSession = useCallback(
        async (sessionId: string) => {
            if (!sessionManager.isAvailable) return

            // Switch to selected session
            const open = async () => {
                const sessionData =
                    await sessionManager.switchSession(sessionId)
                if (!sessionData) return
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

            // Save current session before switching (also a diagram drawn
            // without messages); if that failed (storage full), stay on it
            // unless the user goes on without saving it
            if (messages.length > 0 || isRealDiagram(chartXMLRef.current)) {
                // Of the chat on screen now, also if another one comes on
                // screen while the thumbnail is taken
                const ticket = sessionManager.getSaveTicket()
                const sessionData = await buildSessionData({
                    withThumbnail: true,
                })
                if (
                    !(await sessionManager.saveCurrentSession(
                        sessionData,
                        ticket,
                    ))
                ) {
                    offerToContinueUnsaved(open)
                    return
                }
            }
            await open()
        },
        [
            sessionManager,
            messages,
            buildSessionData,
            syncUIWithSession,
            router,
            offerToContinueUnsaved,
        ],
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

    const startNewChat = useCallback(() => {
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
        router,
        dict.dialogs.clearSuccess,
        setDiagramHistory,
        pathname,
    ])

    const handleNewChat = useCallback(async () => {
        // Save current session before creating new one (also a diagram
        // drawn without messages)
        if (
            sessionManager.isAvailable &&
            (messages.length > 0 || isRealDiagram(chartXMLRef.current))
        ) {
            const ticket = sessionManager.getSaveTicket()
            const sessionData = await buildSessionData({ withThumbnail: true })
            // Not saved (storage full): keep the chat on screen, unless the
            // user goes on without saving it
            if (
                !(await sessionManager.saveCurrentSession(sessionData, ticket))
            ) {
                offerToContinueUnsaved(startNewChat)
                return
            }
            // Refresh sessions list to ensure dropdown shows the saved session
            await sessionManager.refreshSessions()
        }
        startNewChat()
    }, [
        sessionManager,
        messages,
        buildSessionData,
        offerToContinueUnsaved,
        startNewChat,
    ])

    // Handle sending a template directly (called from TemplatePanel)
    const handleSendTemplate = useCallback(
        async (template: { prompt: string }) => {
            // Keep attachments: they are sent along with the template prompt
            flushSync(() => {
                setInput(template.prompt)
            })

            const formElement = document.getElementById(
                "chat-form",
            ) as HTMLFormElement | null
            if (formElement) {
                formElement.requestSubmit()
            }
        },
        [setInput],
    )

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
    // Extract previous XML snapshot (first page, as sent to the model) before a given message index
    const getPreviousXml = (beforeIndex: number): string => {
        const snapshotKeys = Array.from(xmlSnapshotsRef.current.keys())
            .filter((k) => k < beforeIndex)
            .sort((a, b) => b - a)
        return snapshotKeys.length > 0
            ? getFirstPageXml(
                  xmlSnapshotsRef.current.get(snapshotKeys[0]) || "",
              )
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
        stoppedRef.current = true
        stopCountRef.current++
        // A running screenshot check holds up the chat (the SDK waits for
        // the tool handler): end it, so the call gets its result now
        cancelValidation()
        const lastMessage = messages[messages.length - 1]
        // Calls the tool handler already took can still show as streaming:
        // the messages update at most every 150 ms (useChat throttle)
        const toolParts = lastMessage?.parts?.filter(
            (part: any) =>
                part.type?.startsWith("tool-") &&
                part.state === "input-streaming" &&
                !processedToolCallsRef.current.has(part.toolCallId),
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
    }, [messages, addToolOutput, stop, cancelValidation])

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
        validationRetryCountRef.current = 0
        partialXmlRef.current = ""
        stoppedRef.current = false

        const config = getSelectedAIConfig()

        sendMessage(
            { parts },
            {
                body: { xml, previousXml, sessionId, customSystemMessage },
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
                    ...(maxOutputTokens && {
                        "x-max-output-tokens": maxOutputTokens,
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
        sendChatMessage(
            userParts,
            getFirstPageXml(savedXml),
            previousXml,
            sessionId,
        )
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

        // Create new parts with updated text. The edit box only shows the typed
        // text, so keep the appended PDF/file/URL content
        const newParts = message.parts?.map((part: any) => {
            if (part.type === "text") {
                const appended =
                    part.text.match(APPENDED_FILE_SECTIONS_PATTERN)?.[0] ?? ""
                return { ...part, text: newText + appended }
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
        sendChatMessage(
            newParts,
            getFirstPageXml(savedXml),
            previousXml,
            sessionId,
        )
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
                    onOpenModelConfig={() => setShowModelConfigDialog(true)}
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
                    onSendTemplate={handleSendTemplate}
                    currentInput={input}
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
                onDrawioUiChange={onDrawioUiChange}
                darkMode={darkMode}
                onToggleDarkMode={onToggleDarkMode}
                minimalStyle={minimalStyle}
                onMinimalStyleChange={setMinimalStyle}
                vlmValidationEnabled={vlmValidationEnabled}
                onVlmValidationChange={handleVlmValidationChange}
                customSystemMessage={customSystemMessage}
                onCustomSystemMessageChange={handleCustomSystemMessageChange}
                maxOutputTokens={maxOutputTokens}
                onMaxOutputTokensChange={handleMaxOutputTokensChange}
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
