"use client"

import { useChat } from "@ai-sdk/react"
import {
    type ChatStatus,
    DefaultChatTransport,
    isToolUIPart,
    type UIMessage,
} from "ai"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type React from "react"
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react"
import { flushSync } from "react-dom"
import { toast } from "sonner"
import type { ValidationState } from "@/components/chat/ValidationCard"
import { useDiagram } from "@/contexts/diagram-context"
import {
    keepFileVars,
    useDiagramToolHandlers,
} from "@/hooks/use-diagram-tool-handlers"
import { useDictionary } from "@/hooks/use-dictionary"
import {
    getSelectedAIConfig,
    type UseModelConfigReturn,
    useModelConfig,
} from "@/hooks/use-model-config"
import {
    getSessionVersions,
    type SessionData,
    useSessionManager,
} from "@/hooks/use-session-manager"
import { useValidateDiagram } from "@/hooks/use-validate-diagram"
import { getApiEndpoint } from "@/lib/base-path"
import { findCachedResponse } from "@/lib/cached-responses"
import { buildChatHeaders } from "@/lib/chat-request"
import { EMPTY_DRAWIO_DOCUMENT } from "@/lib/drawio/drawio-config"
import { formatMessage } from "@/lib/i18n/utils"
import { isPdfFile, isTextFile } from "@/lib/pdf-utils"
import type { SessionMetadata } from "@/lib/session-storage"
import { sanitizeMessages } from "@/lib/session-storage"
import { STORAGE_KEYS } from "@/lib/storage"
import type { UrlData } from "@/lib/url-utils"
import { type FileData, useFileProcessor } from "@/lib/use-file-processor"
import { useQuotaManager } from "@/lib/use-quota-manager"
import { formatXML, isRealDiagram } from "@/lib/utils"
import { parseDrawioFileContent } from "@/packages/mcp-server/src/load-diagram.ts"
import { prepareNewDiagram } from "@/packages/mcp-server/src/new-diagram.ts"
import { BLANK_MXFILE, hasCells } from "@/packages/mcp-server/src/pages.ts"
import { type SelectedCell, useCanvasStore } from "@/stores/canvas-store"
import { useSettingsStore } from "@/stores/settings-store"
import { useUiStore } from "@/stores/ui-store"
import { useVersionsStore } from "@/stores/versions-store"
import { APPENDED_FILE_SECTIONS_PATTERN } from "./message-text"
import { useDiagramStreaming } from "./use-diagram-streaming"
import { useVersions } from "./use-versions"

// sessionStorage key for the unsent input (survives remounts and reloads)
const SESSION_STORAGE_INPUT_KEY = "next-ai-draw-io-input"

const TOOL_ERROR_STATE = "output-error" as const
// 3 to support VLM validation retries (matches MAX_VALIDATION_RETRIES)
const MAX_AUTO_RETRY_COUNT = 3
// Limit for truncation continuation retries
const MAX_CONTINUATION_RETRY_COUNT = 2
// Save the session at most once per second
const SAVE_DEBOUNCE_MS = 1000

/**
 * Check if auto-resubmit should happen based on tool errors.
 * Only checks the LAST tool part (most recent tool call), not all tool parts.
 * A call the user stopped is not one to retry.
 */
function hasToolErrors(messages: UIMessage[]): boolean {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role !== "assistant") return false
    const lastToolPart = lastMessage.parts.filter(isToolUIPart).at(-1)
    return (
        lastToolPart?.state === TOOL_ERROR_STATE &&
        lastToolPart.errorText !== "Stopped by user"
    )
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

// Shapes sent with a user message (also kept in its metadata)
type MessageSelection = Pick<SelectedCell, "id" | "label">[]

function selectionOf(message: UIMessage): MessageSelection {
    const meta = message.metadata as
        | { selectedCells?: MessageSelection }
        | undefined
    return Array.isArray(meta?.selectedCells) ? meta.selectedCells : []
}

function newLangfuseSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const XML_PROLOG =
    /^(?:\s|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>)*/i

/**
 * Read the diagram document out of a .drawio, .xml or .drawio.svg file, with
 * its pages inflated: previews and the model read it before draw.io saves
 * it again. A broken or cut off file gives null.
 */
async function readDiagramFile(file: File): Promise<string | null> {
    const raw = await file.text()
    // What XML allows before the root element: the declaration, comments,
    // a DOCTYPE (the parser below expects the root first)
    let text = raw.replace(XML_PROLOG, "")
    // Editable SVG: the diagram is stored in the root's `content` attribute.
    // Parsed whole: its DOCTYPE may define entities the content uses.
    if (/^<(?:[\w.-]+:)?svg[\s>]/i.test(text)) {
        const doc = new DOMParser().parseFromString(raw, "image/svg+xml")
        text = (doc.documentElement?.getAttribute("content") ?? "").replace(
            XML_PROLOG,
            "",
        )
    }
    const loaded = parseDrawioFileContent(text)
    if (!loaded.ok) return null
    return withUniquePageIds(loaded.xml)
}

/**
 * draw.io refuses a file whose pages share an id (EditorUi.setFileData: a
 * page without one gets its index, and ids are looked up in a plain object,
 * so "constructor" counts as taken too). Ids the file writes keep their
 * pages, for links to them; the others get a new one.
 */
function withUniquePageIds(xml: string): string {
    const doc = new DOMParser().parseFromString(xml, "text/xml")
    const pages = Array.from(doc.getElementsByTagName("diagram"))
    const usable = (id: string) => !(id in {})
    const written = pages.map((page) => page.getAttribute("id"))
    const taken = new Set<string>()
    const ids: (string | null)[] = written.map((id) => {
        if (id === null || taken.has(id) || !usable(id)) return null
        taken.add(id)
        return id
    })
    let changed = false
    pages.forEach((page, i) => {
        if (ids[i] !== null) return
        // As draw.io would number it, or else a new id
        let id = written[i] ?? String(i)
        if (taken.has(id) || !usable(id)) {
            const base = id && usable(id) ? id : "page"
            let n = 1
            while (taken.has(`${base}-${n}`)) n++
            id = `${base}-${n}`
        }
        taken.add(id)
        // (draw.io numbers a page without an id the same way itself)
        if (id !== (written[i] ?? String(i))) {
            page.setAttribute("id", id)
            changed = true
        }
    })
    return changed ? new XMLSerializer().serializeToString(doc) : xml
}

// An attachment that could not be read (its file went away meanwhile)
class FileReadError extends Error {}

export interface ChatEngine {
    messages: UIMessage[]
    status: ChatStatus
    error: Error | undefined
    isBusy: boolean
    /** The chat on screen is being left (saved, then another one shown) */
    isLeaving: boolean
    /** A message is being sent again; the chat is not empty meanwhile */
    isResending: boolean
    setMessages: (messages: UIMessage[]) => void
    stop: () => void

    input: string
    setInput: (value: string) => void
    files: File[]
    pdfData: Map<File, FileData>
    setFiles: (files: File[]) => void
    urlData: Map<string, UrlData>
    setUrlData: React.Dispatch<React.SetStateAction<Map<string, UrlData>>>
    isExtractingAttachments: boolean

    /** Whether the message was sent */
    submit: (overrideText?: string) => Promise<boolean>
    /** Whether it was sent */
    sendTemplate: (prompt: string) => Promise<boolean>
    improveWithSuggestions: (feedback: string) => Promise<void>
    regenerate: (messageIndex: number) => Promise<void>
    retryLastMessage: () => Promise<void>
    /** False when nothing was sent (another answer is being prepared) */
    editMessage: (messageIndex: number, newText: string) => Promise<boolean>

    /** Selected shapes that will be sent with the next message */
    chatSelection: SelectedCell[]
    dismissSelection: () => void

    sessions: SessionMetadata[]
    currentSessionId: string | null
    currentTitle: string | null
    isRestored: boolean
    newChat: () => Promise<void>
    selectSession: (id: string) => Promise<void>
    deleteSession: (id: string) => Promise<void>
    renameSession: (title: string) => Promise<void>
    openDiagramFile: (file: File) => Promise<void>
    /**
     * Save the chat on screen, then leave the page (another language) with
     * the chat's session id; nothing happens while an answer runs
     */
    leavePage: (go: (sessionId: string | null) => void) => Promise<void>

    restoreVersion: (versionId: string) => void
    undoVersion: (versionId: string) => void

    langfuseSessionId: string
    loadedMessageIdsRef: React.RefObject<Set<string>>
    /** Stop was pressed in the turn on screen (until the next message) */
    stoppedRef: React.RefObject<boolean>
    validationStates: Record<string, ValidationState>
    modelConfig: UseModelConfigReturn
}

const ChatEngineContext = createContext<ChatEngine | null>(null)

export function useChatEngine(): ChatEngine {
    const engine = useContext(ChatEngineContext)
    if (!engine) {
        throw new Error("useChatEngine must be used inside ChatEngineProvider")
    }
    return engine
}

export function ChatEngineProvider({
    children,
}: {
    children: React.ReactNode
}) {
    const {
        loadDiagram: onDisplayChart,
        handleExport: onExport,
        exportResolversRef,
        chartXML,
        chartXMLRef: liveChartXMLRef,
        latestSvg,
        clearDiagram,
        getThumbnailSvg,
        captureValidationPng,
        startTurn,
    } = useDiagram()

    const dict = useDictionary()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const urlSessionId = searchParams.get("session")

    const settings = useSettingsStore()
    const openSettings = useUiStore((s) => s.openSettings)
    const focusComposer = useUiStore((s) => s.focusComposer)

    const onFetchChart = () => {
        // Waits for the reply to its own export, by its tag
        const tag = onExport()
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

    const { files, pdfData, handleFileChange, setFiles } = useFileProcessor({
        tooLong: dict.errors.fileTooLong,
        readFailed: dict.errors.fileReadFailed,
    })
    const [urlData, setUrlData] = useState<Map<string, UrlData>>(new Map())
    const filesRef = useRef(files)
    filesRef.current = files
    const urlDataRef = useRef(urlData)
    urlDataRef.current = urlData

    const modelConfig = useModelConfig()
    const sessionManager = useSessionManager({ initialSessionId: urlSessionId })

    const [input, setInputState] = useState("")
    const [dailyRequestLimit, setDailyRequestLimit] = useState(0)
    const [dailyTokenLimit, setDailyTokenLimit] = useState(0)
    const [tpmLimit, setTpmLimit] = useState(0)

    // Restore the unsent input from sessionStorage
    useEffect(() => {
        const savedInput = sessionStorage.getItem(SESSION_STORAGE_INPUT_KEY)
        if (savedInput) {
            inputRef.current = savedInput
            setInputState(savedInput)
        }
    }, [])

    // Latest composer contents, for code that runs after an await
    const inputRef = useRef("")
    const setInput = useCallback((value: string) => {
        inputRef.current = value
        setInputState(value)
        if (value) sessionStorage.setItem(SESSION_STORAGE_INPUT_KEY, value)
        else sessionStorage.removeItem(SESSION_STORAGE_INPUT_KEY)
    }, [])

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

    const quotaManager = useQuotaManager({
        dailyRequestLimit,
        dailyTokenLimit,
        tpmLimit,
        onConfigModel: () => openSettings("models"),
    })

    // Session ID for Langfuse tracing (restored from localStorage if available)
    const [langfuseSessionId, setLangfuseSessionId] = useState(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem(STORAGE_KEYS.sessionId)
            if (saved) return saved
        }
        return newLangfuseSessionId()
    })
    useEffect(() => {
        localStorage.setItem(STORAGE_KEYS.sessionId, langfuseSessionId)
    }, [langfuseSessionId])

    // Title for a session that is not saved yet (opened file, early rename)
    const [pendingTitle, setPendingTitleState] = useState<string | null>(null)
    const pendingTitleRef = useRef<string | null>(null)
    const setPendingTitle = (title: string | null) => {
        pendingTitleRef.current = title
        setPendingTitleState(title)
    }

    // XML snapshot taken before each user message (keyed by message index)
    const xmlSnapshotsRef = useRef<Map<number, string>>(new Map())
    // Index of the user message whose turn is running (versions belong to it)
    const currentTurnRef = useRef(0)
    // The chat (its generation) the running turn was sent in: a reply that
    // ends after another chat came on screen has nothing to say there
    const turnChatRef = useRef(0)

    const hasRestoredRef = useRef(false)
    const [isRestored, setIsRestored] = useState(false)

    // Latest chartXML for callbacks (avoids stale closures)
    const chartXMLRef = useRef(chartXML)
    // Session loaded without a diagram (prevents thumbnail contamination)
    const justLoadedSessionIdRef = useRef<string | null>(null)
    useEffect(() => {
        chartXMLRef.current = chartXML
        if (chartXML) justLoadedSessionIdRef.current = null
    }, [chartXML])

    const latestSvgRef = useRef(latestSvg)
    useEffect(() => {
        latestSvgRef.current = latestSvg
    }, [latestSvg])

    const autoRetryCountRef = useRef(0)
    const continuationRetryCountRef = useRef(0)
    // Partial XML when output was truncated; non-empty means continuation mode
    const partialXmlRef = useRef<string>("")
    // Diagram before a cut off drawing, whose half drawn preview stays on
    // the canvas while append_diagram finishes it
    const continuationOriginalRef = useRef<string | null>(null)
    // Tool calls already applied, so remounts never replay old outputs
    const processedToolCallsRef = useRef<Set<string>>(new Set())
    // Set by Stop until the user sends the next message
    const stoppedRef = useRef(false)
    const preparingSendRef = useRef(false)
    // Set while the chat on screen is left (saved, then another one put on
    // screen): an answer started meanwhile would land in the next chat
    const leavingRef = useRef(false)
    const [isLeaving, setIsLeaving] = useState(false)
    // The user's provider the current turn was sent to, for its errors
    const requestProviderIdRef = useRef<string | undefined>(undefined)
    // A message is being sent again (retry, regenerate, edit), until the
    // SDK has put it back
    const [isResending, setIsResending] = useState(false)
    // Presses of Stop: a check that began before one still knows of it after
    // the next message clears stoppedRef
    const stopCountRef = useRef(0)
    // Diagram before each streamed display_diagram and edit_diagram preview
    // (key: toolCallId), shared between the streaming preview and the tool
    // handler
    const editDiagramOriginalXmlRef = useRef<Map<string, string>>(new Map())
    const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const [validationStates, setValidationStates] = useState<
        Record<string, ValidationState>
    >({})
    const handleValidationStateChange = useCallback(
        (toolCallId: string, state: ValidationState) => {
            setValidationStates((prev) => ({ ...prev, [toolCallId]: state }))
        },
        [],
    )

    // Failed VLM validations in the current user turn (reset on user action)
    const validationRetryCountRef = useRef(0)
    const { validateWithFallback, cancel: cancelValidation } =
        useValidateDiagram()

    const { handleToolCall } = useDiagramToolHandlers({
        partialXmlRef,
        continuationOriginalRef,
        editDiagramOriginalXmlRef,
        processedToolCallsRef,
        validationRetryCountRef,
        // A preview undone just before the tool call is in this one already
        chartXMLRef: liveChartXMLRef,
        onDisplayChart,
        onFetchChart,
        captureValidationPng,
        validateDiagram: validateWithFallback,
        enableVlmValidation: settings.vlmValidationEnabled,
        sessionId: langfuseSessionId,
        watchStop: () => {
            const stopsBefore = stopCountRef.current
            // Also when the page is gone
            return () =>
                stoppedRef.current ||
                stopCountRef.current !== stopsBefore ||
                !mountedRef.current
        },
        onValidationStateChange: handleValidationStateChange,
    })

    // The turn ends without finishing a cut off drawing: back to the
    // diagram before it
    const abandonContinuation = () => {
        const original = continuationOriginalRef.current
        if (original === null) return
        continuationOriginalRef.current = null
        // Previews drawn since are on top of the cut off one: none of them
        // may be undone to it later
        for (const id of editDiagramOriginalXmlRef.current.keys()) {
            processedToolCallsRef.current.add(id)
        }
        editDiagramOriginalXmlRef.current.clear()
        onDisplayChart(original, true, "revert")
    }

    const transport = useMemo(
        () => new DefaultChatTransport({ api: getApiEndpoint("/api/chat") }),
        [],
    )

    const {
        messages,
        sendMessage,
        addToolOutput,
        status,
        error,
        setMessages,
        stop,
    } = useChat({
        transport,
        onToolCall: async ({ toolCall }) => {
            await handleToolCall({ toolCall }, addToolOutputSafely)
        },
        onFinish: ({ message, isAbort, isError }) => {
            // Stopped, failed, or the reply just ended (a closed connection):
            // tool calls still streaming never reach the tool handler. Mark
            // them handled so a later render of the stream does not draw
            // their preview again.
            const cut = (message.parts as any[]).filter(
                (part) => part.state === "input-streaming" && part.toolCallId,
            )
            for (const part of cut) {
                processedToolCallsRef.current.add(part.toolCallId)
            }
            // A call that started just before Stop was not on screen yet, so
            // Stop did not mark it: it was stopped too, not cut off (Stop,
            // or the page going, aborts a reply). Not once another chat is
            // on screen: the call is not among its messages.
            if (isAbort && getChatGeneration() === turnChatRef.current) {
                for (const part of cut) {
                    addToolOutputSafely({
                        tool: part.type.replace("tool-", ""),
                        toolCallId: part.toolCallId,
                        state: "output-error",
                        errorText: "Stopped by user",
                    })
                }
            }
            if (isAbort || isError || cut.length === 0) return
            // Ended with no error: undo the preview, and say so, as an
            // error does (with Retry)
            const [originalXml] = editDiagramOriginalXmlRef.current.values()
            if (originalXml) onDisplayChart(originalXml, true, "revert")
            editDiagramOriginalXmlRef.current.clear()
            abandonContinuation()
            // Not in another chat that came on screen meanwhile
            if (getChatGeneration() !== turnChatRef.current) return
            setMessages((currentMessages) => [
                ...currentMessages,
                {
                    id: `error-${Date.now()}`,
                    role: "system" as const,
                    parts: [
                        {
                            type: "text" as const,
                            text: dict.errors.answerEndedEarly,
                        },
                    ],
                },
            ])
        },
        onError: (error) => {
            // A diagram still streaming when the request failed never
            // reaches the tool handler: undo its preview. Only previews not
            // handled yet are stored, and the first one holds the diagram
            // before any of them.
            const [originalXml] = editDiagramOriginalXmlRef.current.values()
            if (originalXml) onDisplayChart(originalXml, true, "revert")
            editDiagramOriginalXmlRef.current.clear()
            abandonContinuation()

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

            // Not in another chat that came on screen meanwhile
            if (getChatGeneration() !== turnChatRef.current) return

            // The provider the turn was sent to (none for a server model);
            // the model selected may have changed since, e.g. in another tab
            const providerId = requestProviderIdRef.current

            // A system message, so it can be cleared with the conversation
            setMessages((currentMessages) => [
                ...currentMessages,
                {
                    id: `error-${Date.now()}`,
                    role: "system" as const,
                    parts: [{ type: "text" as const, text }],
                    // The message shows a button that opens model settings,
                    // on the page of the provider that refused
                    ...(openModelConfig && {
                        metadata: { openModelConfig: true, providerId },
                    }),
                },
            ])

            if (isAccessCodeError) openSettings("general")
        },
        // Re-render streamed messages at most every 150 ms. The streaming
        // diagram preview draws on each update, so this also limits redraws
        experimental_throttle: 150,
        sendAutomaticallyWhen: ({ messages }) => {
            const send = shouldSendAgain(messages)
            // The turn ends here
            if (!send) abandonContinuation()
            return send
        },
    })

    // The SDK applies a tool output to the last message of the chat on
    // screen when its turn comes (after a running tool call). One of a chat
    // that was left belongs to none of these messages; and a chat emptied
    // meanwhile (New Chat right after Stop) has none to apply it to.
    const addToolOutputSafely = (
        params: Parameters<typeof addToolOutput>[0],
    ) => {
        if (getChatGeneration() !== turnChatRef.current)
            return Promise.resolve()
        return Promise.resolve(addToolOutput(params)).catch((error: unknown) =>
            console.warn("[chat] Tool output not applied:", error),
        )
    }

    // After each request: send the next one (retry, continue a cut off
    // drawing) or end the turn
    const shouldSendAgain = (messages: UIMessage[]) => {
        // The user stopped: a tool result that arrives later (a VLM
        // check still running) must not start a new request
        if (stoppedRef.current) return false
        // Another chat came on screen: these are its messages, and the
        // request would carry the left chat's diagram. Nor from a page that
        // is gone (its aborted turn's tool outputs still arrive).
        if (getChatGeneration() !== turnChatRef.current) return false
        if (!mountedRef.current) return false

        const isInContinuationMode = partialXmlRef.current.length > 0
        const shouldRetry = hasToolErrors(messages)

        if (!shouldRetry) {
            autoRetryCountRef.current = 0
            continuationRetryCountRef.current = 0
            partialXmlRef.current = ""
            return false
        }

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
            autoRetryCountRef.current++
        }
        return true
    }

    const isBusy = status === "streaming" || status === "submitted"
    useEffect(() => {
        if (messages.length > 0) setIsResending(false)
    }, [messages.length])
    // isBusy of the latest render, for code that runs after an await
    const busyRef = useRef(isBusy)
    busyRef.current = isBusy
    // The page goes (another language mounts a new one): the answer stops,
    // so it cannot reach the next page's canvas
    const stopRef = useRef(stop)
    stopRef.current = stop
    // (Development runs this twice, with a cleanup in between)
    const mountedRef = useRef(false)
    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
            stopRef.current()
        }
    }, [])
    // While an answer is sent or streams in, the chat must stay on screen:
    // the rest of the answer and its diagram would land in another chat
    // (Between the requests of one turn the SDK is idle for a moment; a cut
    // off drawing still waiting for its continuation keeps the turn going)
    const isTurnActive = () =>
        busyRef.current ||
        preparingSendRef.current ||
        continuationOriginalRef.current !== null
    // Sending, version actions: not during an answer, nor while leaving
    const canStartTurn = () => !isTurnActive() && !leavingRef.current

    // Message IDs loaded from a session (skip animations and replays)
    const loadedMessageIdsRef = useRef<Set<string>>(new Set())

    useDiagramStreaming({
        messages,
        processedToolCallsRef,
        editDiagramOriginalXmlRef,
        loadedMessageIdsRef,
    })

    const { restoreVersion, undoVersion } = useVersions({
        currentTurnRef,
        isBusy,
        isTurnActive: () => !canStartTurn(),
        getChatGeneration: sessionManager.getChatGeneration,
    })

    // ---------------------------------------------------------------------
    // Selection sent with the next message
    // ---------------------------------------------------------------------

    const selection = useCanvasStore((s) => s.selection)
    // The model sees and edits the first page only
    const onFirstPage = useCanvasStore(
        (s) => s.pages.length === 0 || s.pages[0]?.id === s.currentPageId,
    )
    const [dismissedSelectionKey, setDismissedSelectionKey] = useState("")
    const selectionKey = selection.map((c) => c.id).join(",")
    const chatSelection =
        !onFirstPage || selectionKey === dismissedSelectionKey ? [] : selection
    // Once nothing is selected, picking the same shapes again attaches them
    useEffect(() => {
        if (selection.length === 0) setDismissedSelectionKey("")
    }, [selection.length])
    const dismissSelection = useCallback(
        () => setDismissedSelectionKey(selectionKey),
        [selectionKey],
    )

    // ---------------------------------------------------------------------
    // Sessions
    // ---------------------------------------------------------------------

    const messagesRef = useRef(messages)
    useEffect(() => {
        messagesRef.current = messages
    }, [messages])

    // Last synced session ID, to detect external changes (URL back/forward)
    const lastSyncedSessionIdRef = useRef<string | null>(null)
    // Message arrays of our own saves. A session holding one of them was
    // created by our own save, so it must not be treated as an external
    // switch (with two saves of a new chat at once, the first creates it).
    const savedMessagesRef = useRef(new WeakSet<object>())
    // Session was just loaded (skip the auto-save that would reorder it)
    const justLoadedSessionRef = useRef(false)

    const abandonContinuationRef = useRef(abandonContinuation)
    abandonContinuationRef.current = abandonContinuation
    // The chat on screen is left while its answer comes in: the answer stops
    // (also a screenshot check), and its calls are done with, so a render
    // that still shows its messages does not keep the next chat's diagram
    // as the one from before their previews
    const stopAnswerOfChatLeft = useCallback(() => {
        stopCountRef.current++
        cancelValidation()
        stopRef.current()
        // As Stop does: a cut off drawing waits for no continuation
        abandonContinuationRef.current()
        const last = messagesRef.current[messagesRef.current.length - 1]
        for (const part of (last?.parts ?? []) as any[]) {
            if (part.toolCallId)
                processedToolCallsRef.current.add(part.toolCallId)
        }
    }, [cancelValidation])

    // Counts the chats put on screen; the state changes in the render that
    // shows the chat's messages, which can come a render after its session
    const shownChatsRef = useRef(0)
    const [shownChats, setShownChats] = useState(0)
    // The messages shown when another chat was put on screen: useChat can
    // show that chat's own up to 150 ms later than the rest of its state
    const messagesBeforeShownRef = useRef<UIMessage[] | null>(null)

    const syncUIWithSession = useCallback(
        (
            data:
                | (SessionData & {
                      diagramHistory?: { svg: string; xml: string }[]
                  })
                | null,
        ) => {
            // An answer still coming in belongs to the chat that was on
            // screen (browser back or forward): it stops, before this chat's
            // messages are put in its place, so none of it lands here
            if (busyRef.current) stopAnswerOfChatLeft()
            // They act on the chat that was on screen: its canvas (Undo of
            // a restore) or leaving it unsaved, and so does its title
            // waiting for a session
            toast.dismiss("version-restored")
            toast.dismiss("session-save-leave")
            setPendingTitle(null)
            // A saved chat shows its canvas (it can hold just a blank
            // file); one with nothing in it, or none, shows the start screen
            useUiStore
                .getState()
                .setHeroDismissed(
                    !!data &&
                        (data.messages.length > 0 ||
                            (!!data.diagramXml &&
                                data.diagramXml !== EMPTY_DRAWIO_DOCUMENT)),
                )
            // Its versions are not this chat's (old ones share their ids)
            useUiStore.getState().closeCompare()
            // Comes with this chat's state, in the same render
            shownChatsRef.current++
            setShownChats(shownChatsRef.current)
            messagesBeforeShownRef.current = messagesRef.current
            // Diagrams from before a preview of the chat left: saves and an
            // undone preview of this chat must not bring them here. A Stop
            // there is not one here either.
            editDiagramOriginalXmlRef.current.clear()
            continuationOriginalRef.current = null
            stoppedRef.current = false
            if (data) {
                loadedMessageIdsRef.current = new Set(
                    (data.messages as { id: string }[]).map((m) => m.id),
                )
                setMessages(data.messages as unknown as UIMessage[])
                xmlSnapshotsRef.current = new Map(data.xmlSnapshots)
                if (data.diagramXml) {
                    onDisplayChart(data.diagramXml, true)
                    chartXMLRef.current = data.diagramXml
                } else {
                    clearDiagram()
                    chartXMLRef.current = ""
                }
                if (!isRealDiagram(data.diagramXml)) latestSvgRef.current = ""
                useVersionsStore
                    .getState()
                    .setVersions(getSessionVersions(data))
            } else {
                loadedMessageIdsRef.current = new Set()
                setMessages([])
                xmlSnapshotsRef.current.clear()
                clearDiagram()
                chartXMLRef.current = ""
                latestSvgRef.current = ""
                useVersionsStore.getState().clear()
            }
        },
        [setMessages, onDisplayChart, clearDiagram, stopAnswerOfChatLeft],
    )

    const buildSessionData = useCallback(
        async (
            options: { withThumbnail?: boolean } = {},
        ): Promise<SessionData> => {
            // Read together, before the wait for the thumbnail: what changes
            // meanwhile goes into the next save, not half into this one.
            // A drawing still streaming (the tab is hidden mid-answer) is
            // not saved: the diagram before its preview is.
            const [previewOriginal] = editDiagramOriginalXmlRef.current.values()
            const currentDiagramXml =
                continuationOriginalRef.current ??
                previewOriginal ??
                (chartXMLRef.current || "")
            const messages = sanitizeMessages(messagesRef.current)
            savedMessagesRef.current.add(messages)
            const data = {
                messages,
                xmlSnapshots: Array.from(xmlSnapshotsRef.current.entries()),
                diagramXml: currentDiagramXml,
                versions: useVersionsStore.getState().versions,
                title: pendingTitleRef.current ?? undefined,
            }
            let thumbnailDataUrl: string | undefined
            if (isRealDiagram(currentDiagramXml) && options.withThumbnail) {
                const freshThumb = await getThumbnailSvg()
                if (freshThumb) {
                    latestSvgRef.current = freshThumb
                    thumbnailDataUrl = freshThumb
                } else if (latestSvgRef.current) {
                    thumbnailDataUrl = latestSvgRef.current
                }
            }
            return { ...data, thumbnailDataUrl }
        },
        [getThumbnailSvg],
    )

    // Restore from the session manager once it has loaded
    useLayoutEffect(() => {
        if (hasRestoredRef.current) return
        if (sessionManager.isLoading) return
        hasRestoredRef.current = true
        try {
            const currentSession = sessionManager.currentSession
            if (currentSession) {
                justLoadedSessionRef.current = true
                syncUIWithSession(currentSession)
            } else {
                // A page of another language comes up empty: the versions
                // of the chat left unsaved are not this one's
                useVersionsStore.getState().clear()
            }
            lastSyncedSessionIdRef.current = sessionManager.currentSessionId
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

    // Sync UI when the session changes externally (URL back/forward)
    useEffect(() => {
        if (!isRestored) return
        if (!sessionManager.isAvailable) return
        const newSessionId = sessionManager.currentSessionId
        const newSession = sessionManager.currentSession
        if (newSessionId === lastSyncedSessionIdRef.current) return
        const isOwnNewSession =
            !!newSession && savedMessagesRef.current.has(newSession.messages)
        lastSyncedSessionIdRef.current = newSessionId
        if (isOwnNewSession) {
            // Renamed while that first save ran: it has the old title
            const title = pendingTitleRef.current
            setPendingTitle(null)
            if (title && title !== newSession.title) {
                sessionManager.renameSession(newSession.id, title)
            }
            return
        }
        justLoadedSessionRef.current = true
        syncUIWithSession(newSession)
    }, [
        isRestored,
        sessionManager.isAvailable,
        sessionManager.currentSessionId,
        sessionManager.currentSession,
        syncUIWithSession,
    ])

    const {
        isAvailable: sessionIsAvailable,
        currentSessionId,
        saveCurrentSession,
        getChatGeneration,
        getSaveTicket,
    } = sessionManager
    // Ref avoids re-running the save effect after every save
    const saveCurrentSessionRef = useRef(saveCurrentSession)
    saveCurrentSessionRef.current = saveCurrentSession

    const versions = useVersionsStore((s) => s.versions)

    // Debounced auto-save, only when not streaming
    useEffect(() => {
        if (!hasRestoredRef.current) return
        if (!sessionIsAvailable) return
        if (status === "streaming" || status === "submitted") return
        if (justLoadedSessionRef.current) {
            // Not before the render with the loaded chat's own state, its
            // messages included
            if (shownChats !== shownChatsRef.current) return
            if (messages === messagesBeforeShownRef.current) return
            justLoadedSessionRef.current = false
            // Shown as loaded: nothing to save. A message sent before they
            // were shown is a change of its own.
            const loaded = loadedMessageIdsRef.current
            if (
                messages.length === loaded.size &&
                messages.every((m) => loaded.has(m.id))
            ) {
                return
            }
        }
        if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)

        // Capture the chat on screen at schedule time; the save is dropped
        // if another chat is on screen by the time it runs
        const scheduledForChat = getChatGeneration()
        const hasDiagramNow = isRealDiagram(chartXMLRef.current)
        const isNoDiagramSession =
            justLoadedSessionIdRef.current === currentSessionId

        saveDebounceRef.current = setTimeout(async () => {
            try {
                // Also a chat with just a title (an opened blank file)
                if (
                    messagesRef.current.length > 0 ||
                    hasDiagramNow ||
                    pendingTitleRef.current !== null
                ) {
                    // Taken before the data is read, for the chat it was
                    // scheduled for
                    const ticket = {
                        ...getSaveTicket(),
                        generation: scheduledForChat,
                    }
                    const sessionData = await buildSessionData({
                        withThumbnail: hasDiagramNow && !isNoDiagramSession,
                    })
                    await saveCurrentSessionRef.current(sessionData, ticket)
                }
            } catch (error) {
                console.error("Failed to save session:", error)
            }
        }, SAVE_DEBOUNCE_MS)

        return () => {
            if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current)
        }
    }, [
        chartXML,
        messages,
        versions,
        status,
        sessionIsAvailable,
        currentSessionId,
        getChatGeneration,
        getSaveTicket,
        buildSessionData,
        // A title typed for an empty chat saves it too
        pendingTitle,
        shownChats,
    ])

    // Put the session in the URL once it exists. Not while the chat is left:
    // the save just gave it a session, and this URL would win over the one
    // of what comes next (another chat, a new one, another language).
    useEffect(() => {
        if (leavingRef.current) return
        if (sessionManager.currentSessionId && !urlSessionId) {
            router.replace(`?session=${sessionManager.currentSessionId}`, {
                scroll: false,
            })
        }
    }, [sessionManager.currentSessionId, urlSessionId, router])

    // Save when the page is hidden (more reliable than beforeunload for IndexedDB)
    useEffect(() => {
        if (!sessionManager.isAvailable) return
        const handleVisibilityChange = async () => {
            if (
                document.visibilityState === "hidden" &&
                (messagesRef.current.length > 0 ||
                    isRealDiagram(chartXMLRef.current) ||
                    pendingTitleRef.current !== null)
            ) {
                try {
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

    // ---------------------------------------------------------------------
    // Sending
    // ---------------------------------------------------------------------

    const isExtractingAttachments =
        files.some((f) => pdfData.get(f)?.isExtracting) ||
        Array.from(urlData.values()).some((d) => d.isExtracting)

    // Append PDF, text file and URL content to the user's text; images
    // become file parts when imageParts is given
    const processFilesAndAppendContent = async (
        baseText: string,
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
                const reader = new FileReader()
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    reader.onload = () => resolve(reader.result as string)
                    reader.onerror = () =>
                        reject(
                            new FileReadError(
                                formatMessage(dict.errors.fileReadFailed, {
                                    name: file.name,
                                }),
                            ),
                        )
                    reader.readAsDataURL(file)
                })
                imageParts.push({
                    type: "file",
                    url: dataUrl,
                    mediaType: file.type,
                })
            }
        }
        for (const [url, data] of urlData) {
            if (data.content) {
                userText += `\n\n[URL: ${url}]\nTitle: ${data.title}\n\n${data.content}`
            }
        }
        return userText
    }

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

    const sendChatMessage = (
        parts: any,
        xml: string,
        previousXml: string,
        turnIndex: number,
        selectedCells: MessageSelection,
    ) => {
        autoRetryCountRef.current = 0
        continuationRetryCountRef.current = 0
        validationRetryCountRef.current = 0
        partialXmlRef.current = ""
        continuationOriginalRef.current = null
        stoppedRef.current = false
        currentTurnRef.current = turnIndex
        turnChatRef.current = getChatGeneration()
        // Busy from now on, before the next render says so
        busyRef.current = true
        // Its Undo would take this answer's diagram away
        toast.dismiss("version-restored")
        startTurn()

        const config = getSelectedAIConfig()
        const { customSystemMessage, minimalStyle, maxOutputTokens } =
            useSettingsStore.getState()
        // For this turn's errors: the provider these headers name (read with
        // them, from storage: another tab may have changed it meanwhile)
        requestProviderIdRef.current = config.providerId || undefined

        const selected = selectedCells.map(({ id, label }) => ({ id, label }))
        const options = {
            body: {
                xml,
                previousXml,
                sessionId: langfuseSessionId,
                customSystemMessage,
                ...(selected.length > 0 && { selectedCells: selected }),
            },
            headers: buildChatHeaders(config, {
                minimalStyle,
                maxOutputTokens,
            }),
        }
        // The selection stays with the message, for regenerate and retry
        sendMessage(
            {
                parts,
                ...(selected.length > 0 && {
                    metadata: { selectedCells: selected },
                }),
            },
            options,
        )
    }

    // Export the current diagram, snapshot it for this message, and send.
    // False when another chat came on screen meanwhile (browser back or
    // forward), also since `generation` (when the send began): nothing is
    // sent.
    const sendWithCurrentDiagram = async (
        parts: any[],
        selectedCells: MessageSelection = [],
        generation = getChatGeneration(),
    ): Promise<boolean> => {
        const chartXml = formatXML(await onFetchChart())
        if (getChatGeneration() !== generation || leavingRef.current) {
            return false
        }
        const turnIndex = messagesRef.current.length
        const previousXml = getPreviousXml(turnIndex)
        // Snapshot the full multi-page document (kept fresh by autosave) so
        // regenerate/edit can restore every page; the model gets page 1 only
        xmlSnapshotsRef.current.set(turnIndex, chartXMLRef.current || chartXml)
        sendChatMessage(parts, chartXml, previousXml, turnIndex, selectedCells)
        return true
    }

    const clearComposer = () => {
        setInput("")
        setFiles([])
        setUrlData(new Map())
    }

    // Whether the message was sent
    const submitInput = async (overrideText?: string): Promise<boolean> => {
        const text = overrideText ?? input
        // busyRef: also when called after a wait (a template click)
        if (!text.trim() || busyRef.current || isExtractingAttachments) {
            return false
        }
        // The first message is typed on the start screen: its answer shows
        // in the panel, also when the panel was closed before
        if (messagesRef.current.length === 0) {
            useUiStore.getState().setPanelOpen(true)
        }

        // Cached example: only with no messages and an empty canvas (same
        // rule as the server)
        if (
            messagesRef.current.length === 0 &&
            !hasCells(chartXMLRef.current || "")
        ) {
            // The file name keeps a user's own file from matching an example
            const cached = findCachedResponse(
                text.trim(),
                files.length > 0,
                files.length === 1 ? files[0].name : undefined,
            )
            if (cached) {
                const toolCallId = `cached-${Date.now()}`
                const userText = await processFilesAndAppendContent(text)
                currentTurnRef.current = 0
                startTurn()
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
                // Load its diagram here: these messages never reach the
                // tool handler
                const prepared = prepareNewDiagram(cached.xml, {
                    pageId: "page-1",
                    pageName: "Page-1",
                })
                if (prepared.ok) {
                    onDisplayChart(
                        keepFileVars(prepared.xml, chartXMLRef.current || ""),
                        true,
                        "commit",
                        { toolCallId },
                    )
                }
                clearComposer()
                return true
            }
        }

        // Another chat can come on screen while the attachments are read or
        // the diagram exports (browser back or forward): then nothing is sent
        const generation = getChatGeneration()
        const sentFiles = files
        const sentUrls = urlData
        const sentSelectionKey = selectionKey
        let sent = false
        try {
            const parts: any[] = []
            // The backend only reads the first text part, so combine them
            const userText = await processFilesAndAppendContent(text, parts)
            parts.unshift({ type: "text", text: userText })
            if (getChatGeneration() === generation) {
                // Clear right away, so text typed while the diagram exports
                // is kept
                clearComposer()
                sent = await sendWithCurrentDiagram(
                    parts,
                    chatSelection,
                    generation,
                )
            }
        } catch (error) {
            console.warn("Error preparing the message:", error)
            toast.error(
                error instanceof FileReadError
                    ? error.message
                    : dict.errors.failedToExport,
            )
        }
        if (sent) {
            // The selected shapes went with it, if they are still the ones
            // selected. Not before: a message that is not sent keeps them for
            // the next try, and a selection taken off or changed meanwhile
            // stays as it is.
            const nowSelected = useCanvasStore
                .getState()
                .selection.map((c) => c.id)
                .join(",")
            if (nowSelected === sentSelectionKey) {
                setDismissedSelectionKey(sentSelectionKey)
            }
            return true
        }
        // Nothing was sent: give the message back, unless something new
        // was typed or attached meanwhile
        if (
            !inputRef.current &&
            filesRef.current.length === 0 &&
            urlDataRef.current.size === 0
        ) {
            setInput(text)
            setFiles(sentFiles)
            // Also not over links attached in the same moment
            setUrlData((current) => (current.size > 0 ? current : sentUrls))
        }
        return false
    }

    const submit = async (overrideText?: string): Promise<boolean> => {
        // While a send is prepared (attachments read, diagram exported) the
        // status is still "ready": a second Enter or click would send the
        // message again
        if (leavingRef.current) return false
        if (preparingSendRef.current) {
            toast.error(dict.errors.sendInProgress, { id: "send-in-progress" })
            return false
        }
        preparingSendRef.current = true
        try {
            return await submitInput(overrideText)
        } finally {
            preparingSendRef.current = false
        }
    }

    // Templates fill the input and send it right away (attachments included)
    // Whether it was sent (it can run after a wait: the template panel
    // stores its click count first, so busy is read from the ref)
    const sendTemplate = async (prompt: string): Promise<boolean> => {
        // Like the send button, it waits for an answer or a message being
        // prepared (that message may still come back to the input), and for
        // attachments still being read; the input keeps what it has
        if (leavingRef.current) return false
        if (busyRef.current) {
            toast.error(dict.errors.answerInProgress, {
                id: "template-not-sent",
            })
            return false
        }
        if (preparingSendRef.current) {
            toast.error(dict.errors.sendInProgress, { id: "send-in-progress" })
            return false
        }
        if (isExtractingAttachments) {
            toast.error(dict.errors.attachmentsStillReading, {
                id: "template-not-sent",
            })
            return false
        }
        setInput(prompt)
        return submit(prompt)
    }

    const improveWithSuggestions = async (feedback: string) => {
        if (!canStartTurn()) return
        // Like submit: the diagram export comes first
        preparingSendRef.current = true
        try {
            await sendWithCurrentDiagram([{ type: "text", text: feedback }])
        } catch (error) {
            console.error("Error fetching chart data:", error)
            toast.error(dict.errors.failedToExport)
        } finally {
            preparingSendRef.current = false
        }
    }

    const restoreDiagramFromSnapshot = (savedXml: string) => {
        onDisplayChart(savedXml, true)
        chartXMLRef.current = savedXml
    }

    // Snapshots of the messages after this one go with them
    const dropLaterSnapshots = (messageIndex: number) => {
        for (const key of xmlSnapshotsRef.current.keys()) {
            if (key > messageIndex) xmlSnapshotsRef.current.delete(key)
        }
    }

    // Send the user message at index again with these parts, from the
    // diagram it was sent with
    const rerunFrom = (index: number, parts: any[]): boolean => {
        const savedXml = xmlSnapshotsRef.current.get(index)
        if (!savedXml) {
            console.error("No saved XML snapshot for message index:", index)
            toast.error(dict.errors.cannotResend)
            return false
        }
        const previousXml = getPreviousXml(index)
        restoreDiagramFromSnapshot(savedXml)
        dropLaterSnapshots(index)
        useVersionsStore.getState().removeFromTurn(index)

        // Remove the user message onwards (sendMessage re-adds it). For a
        // moment there may be no message: that is no empty chat.
        flushSync(() => {
            setIsResending(true)
            setMessages(messages.slice(0, index))
        })
        sendChatMessage(
            parts,
            getFirstPageXml(savedXml),
            previousXml,
            index,
            selectionOf(messages[index]),
        )

        return true
    }

    const regenerate = async (messageIndex: number) => {
        if (!canStartTurn()) return
        let userMessageIndex = messageIndex - 1
        while (
            userMessageIndex >= 0 &&
            messages[userMessageIndex].role !== "user"
        ) {
            userMessageIndex--
        }
        if (userMessageIndex < 0) return
        const userParts = messages[userMessageIndex].parts
        if (!userParts?.some((p: any) => p.type === "text")) return
        rerunFrom(userMessageIndex, userParts)
    }

    const editMessage = async (messageIndex: number, newText: string) => {
        if (!canStartTurn()) return false
        const message = messages[messageIndex]
        if (message?.role !== "user") return false
        // The edit box only shows the typed text; keep appended file content
        const newParts = message.parts?.map((part: any) => {
            if (part.type === "text") {
                const appended =
                    part.text.match(APPENDED_FILE_SECTIONS_PATTERN)?.[0] ?? ""
                return { ...part, text: newText + appended }
            }
            return part
        }) || [{ type: "text", text: newText }]
        return rerunFrom(messageIndex, newParts)
    }

    /**
     * Send the last user message again (after an error) with the canvas as
     * it is now: the failed answer's preview was undone, so what it shows
     * are the user's edits since and the versions that answer drew (they
     * stay in the strip). The message keeps the snapshot it was first sent
     * with, for a later regenerate.
     */
    const retryLastMessage = async () => {
        if (!canStartTurn()) return
        const index = messagesRef.current.map((m) => m.role).lastIndexOf("user")
        if (index < 0) return
        const message = messagesRef.current[index]
        const generation = getChatGeneration()
        // Like submit: the diagram export comes first
        preparingSendRef.current = true
        try {
            const chartXml = formatXML(await onFetchChart())
            // Another chat came on screen meanwhile (browser back/forward),
            // or this one is being left
            if (getChatGeneration() !== generation || leavingRef.current) {
                return
            }
            dropLaterSnapshots(index)
            if (!xmlSnapshotsRef.current.has(index)) {
                xmlSnapshotsRef.current.set(
                    index,
                    chartXMLRef.current || chartXml,
                )
            }
            flushSync(() => {
                setIsResending(true)
                setMessages(messagesRef.current.slice(0, index))
            })
            sendChatMessage(
                message.parts,
                chartXml,
                getPreviousXml(index),
                index,
                selectionOf(message),
            )
        } catch (error) {
            console.error("Error fetching chart data:", error)
            toast.error(dict.errors.failedToExport)
        } finally {
            preparingSendRef.current = false
        }
    }

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
        for (const part of (toolParts ?? []) as any[]) {
            if (part.toolCallId) {
                addToolOutputSafely({
                    tool: part.type.replace("tool-", ""),
                    toolCallId: part.toolCallId,
                    state: "output-error",
                    errorText: "Stopped by user",
                })
            }
        }
        stop()
        abandonContinuation()
    }, [messages, addToolOutputSafely, stop, cancelValidation])

    // ---------------------------------------------------------------------
    // Session actions
    // ---------------------------------------------------------------------

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
        if (isBusy) toast.dismiss("session-save-leave")
    }, [isBusy])

    // Save the chat on screen before leaving it (also a diagram drawn
    // without messages, or a chat with just a title, like an opened blank
    // file). If that failed (storage full), stay on it unless the user goes
    // on without saving: then proceed runs later. Resolves to whether the
    // caller can leave now.
    const saveBeforeLeaving = async (proceed: () => void) => {
        if (!sessionManager.isAvailable) return true
        if (
            messagesRef.current.length === 0 &&
            !isRealDiagram(chartXMLRef.current) &&
            pendingTitleRef.current === null
        ) {
            return true
        }
        // Of the chat on screen now, also if another one comes on screen
        // while the thumbnail is taken
        const ticket = sessionManager.getSaveTicket()
        const sessionData = await buildSessionData({ withThumbnail: true })
        if (!(await sessionManager.saveCurrentSession(sessionData, ticket))) {
            offerToContinueUnsaved(proceed)
            return false
        }
        return true
    }

    // Browser back or forward puts another chat on screen without the app's
    // own leaving: this one is saved first, with what was sent and answered
    // so far, its answer stopped. A call left unfinished is saved as
    // stopped. No thumbnail: taking one would hold the switch for seconds
    // (the old one stays).
    // Meanwhile it is being left: nothing can be sent (a message being
    // prepared is given back to the input instead)
    const saveBeforeUrlSwitch = () =>
        whileLeaving(async () => {
            const wasAnswering = busyRef.current
            const save =
                sessionManager.isAvailable &&
                (messagesRef.current.length > 0 ||
                    isRealDiagram(chartXMLRef.current) ||
                    pendingTitleRef.current !== null)
            // Read before the stop: it puts the diagram from before a cut
            // off drawing back, on the canvas only a moment later
            const ticket = save ? sessionManager.getSaveTicket() : null
            const reading = save ? buildSessionData() : null
            if (wasAnswering) stopAnswerOfChatLeft()
            if (!ticket || !reading) return
            const data = await reading
            const last = data.messages[data.messages.length - 1]
            if (wasAnswering && last?.role === "assistant") {
                // A call with a version drew its diagram (the messages
                // shown can be a moment behind); the others were stopped
                const drawn = new Set(
                    useVersionsStore
                        .getState()
                        .versions.map((v) => v.toolCallId),
                )
                const ended = (part: any) => {
                    if (
                        !part.toolCallId ||
                        (part.state !== "input-streaming" &&
                            part.state !== "input-available")
                    ) {
                        return part
                    }
                    if (drawn.has(part.toolCallId)) {
                        return {
                            ...part,
                            state: "output-available",
                            output:
                                part.type === "tool-edit_diagram"
                                    ? "Successfully applied the operations to the diagram."
                                    : "Successfully displayed the diagram.",
                        }
                    }
                    return {
                        ...part,
                        state: "output-error",
                        errorText: "Stopped by user",
                    }
                }
                const messages = [
                    ...data.messages.slice(0, -1),
                    { ...last, parts: last.parts.map(ended) },
                ]
                // Saved by this chat itself (the effect that follows
                // session changes must not put it on screen again)
                savedMessagesRef.current.add(messages)
                data.messages = messages
            }
            await sessionManager.saveCurrentSession(data, ticket)
        })
    const { setBeforeUrlSwitch } = sessionManager
    useEffect(() => {
        setBeforeUrlSwitch(saveBeforeUrlSwitch)
        return () => setBeforeUrlSwitch(null)
    })

    // Leaving the chat on screen: no answer can start until it is done
    // (Can run inside another: browser back while a file is being opened)
    const leavingCountRef = useRef(0)
    const whileLeaving = async (fn: () => unknown) => {
        leavingCountRef.current++
        leavingRef.current = true
        // The composer shows it: what is typed now could not be sent
        setIsLeaving(true)
        try {
            await fn()
        } finally {
            leavingCountRef.current--
            if (leavingCountRef.current === 0) {
                leavingRef.current = false
                setIsLeaving(false)
            }
        }
    }

    const selectSession = async (id: string) => {
        if (!sessionManager.isAvailable || !canStartTurn()) return
        const open = async () => {
            if (isTurnActive()) return
            const sessionData = await sessionManager.switchSession(id)
            if (!sessionData) {
                // That chat is gone (deleted in another tab): this one
                // stays, and the save before may have just given it a
                // session, which the URL skipped while leaving
                const current = sessionManager.getCurrentSessionId()
                if (current) {
                    router.replace(`?session=${current}`, { scroll: false })
                }
                await sessionManager.refreshSessions()
                return
            }
            const hasRealDiagram = isRealDiagram(sessionData.diagramXml)
            justLoadedSessionRef.current = true
            // Use the new session's thumbnail, never the previous one's
            latestSvgRef.current = sessionData.thumbnailDataUrl || ""
            justLoadedSessionIdRef.current = hasRealDiagram ? null : id
            // Shown here: the effect that follows session changes must not
            // show it again (that would save it, first in the list)
            lastSyncedSessionIdRef.current = id
            setValidationStates({})
            syncUIWithSession(sessionData)
            router.replace(`?session=${id}`, { scroll: false })
        }
        // Going on without saving (storage full) is a leave of its own
        const proceed = () => whileLeaving(open)
        // A save meanwhile over the chat limit keeps the chat opened (also
        // an auto-save waiting for its thumbnail)
        await whileLeaving(() =>
            sessionManager.whileOpening(id, async () => {
                if (await saveBeforeLeaving(proceed)) await open()
            }),
        )
    }

    const deleteSession = useCallback(
        async (id: string) => {
            if (!sessionManager.isAvailable) return
            const isCurrent = id === sessionManager.currentSessionId
            if (isCurrent && !canStartTurn()) return
            const remove = async () => {
                const result = await sessionManager.deleteSession(id)
                if (result.wasCurrentSession) {
                    syncUIWithSession(null)
                    router.replace(pathname, { scroll: false })
                }
            }
            if (isCurrent) await whileLeaving(remove)
            else await remove()
        },
        [sessionManager, syncUIWithSession, router, pathname, isBusy],
    )

    // Clear everything for a new conversation (the old one is saved)
    const startNewChat = () => {
        // Clear session state BEFORE the URL, so the URL effect does not
        // bring the old session back
        sessionManager.clearCurrentSession()
        toast.dismiss("version-restored")
        toast.dismiss("session-save-leave")
        // A new conversation brings the start screen back
        useUiStore.getState().setHeroDismissed(false)
        setMessages([])
        setInput("")
        clearDiagram()
        useVersionsStore.getState().clear()
        setValidationStates({})
        handleFileChange([])
        setUrlData(new Map())
        setLangfuseSessionId(newLangfuseSessionId())
        xmlSnapshotsRef.current.clear()
        setPendingTitle(null)
        router.replace(pathname, { scroll: false })
    }

    const newChat = async () => {
        if (!canStartTurn()) return
        const start = () => {
            if (isTurnActive()) return
            startNewChat()
            toast.success(dict.dialogs.clearSuccess)
            focusComposer()
        }
        await whileLeaving(async () => {
            if (!(await saveBeforeLeaving(start))) return
            // The list shows the chat just saved
            if (sessionManager.isAvailable) {
                await sessionManager.refreshSessions()
            }
            start()
        })
    }

    const renameSession = useCallback(
        async (title: string) => {
            const id = sessionManager.currentSessionId
            if (!id) {
                // Not saved yet: use the title when the session is created
                setPendingTitle(title.trim().slice(0, 100) || null)
                return
            }
            await sessionManager.renameSession(id, title)
        },
        [sessionManager],
    )

    const leavePage = async (go: (sessionId: string | null) => void) => {
        if (!canStartTurn()) return
        // Also run later, from the "continue without saving" offer: not
        // while an answer started meanwhile (or is being prepared)
        const proceed = () => {
            if (isTurnActive()) return
            go(sessionManager.getCurrentSessionId())
        }
        await whileLeaving(async () => {
            if (await saveBeforeLeaving(proceed)) proceed()
        })
    }

    const openDiagramFile = async (file: File) => {
        if (!canStartTurn()) return
        await whileLeaving(() => openFile(file))
    }

    const openFile = async (file: File) => {
        const xml = await readDiagramFile(file).catch(() => null)
        if (!xml) {
            toast.error(
                formatMessage(dict.errors.notADiagramFile, {
                    name: file.name,
                }),
            )
            return
        }
        // A loaded file starts a fresh conversation named after it
        const open = () => {
            if (isTurnActive()) return
            startNewChat()
            // This empty chat is ours: the effect that follows session
            // changes must not clear the file it is about to show
            lastSyncedSessionIdRef.current = null
            setPendingTitle(
                file.name.replace(/\.(drawio\.svg|drawio|xml|svg)$/i, ""),
            )
            onDisplayChart(xml, true)
            // The file is on screen, also one without shapes yet
            useUiStore.getState().setHeroDismissed(true)
        }
        // Going on without saving (storage full) is a leave of its own
        const proceed = () => whileLeaving(open)
        if (await saveBeforeLeaving(proceed)) open()
    }

    const engine: ChatEngine = {
        messages,
        status,
        error,
        isBusy,
        isLeaving,
        isResending,
        setMessages: setMessages as (messages: UIMessage[]) => void,
        stop: handleStop,
        input,
        setInput,
        files,
        pdfData,
        setFiles: handleFileChange,
        urlData,
        setUrlData,
        isExtractingAttachments,
        submit,
        sendTemplate,
        improveWithSuggestions,
        regenerate,
        retryLastMessage,
        editMessage,
        chatSelection,
        dismissSelection,
        sessions: sessionManager.sessions,
        currentSessionId: sessionManager.currentSessionId,
        currentTitle: sessionManager.currentSession?.title ?? pendingTitle,
        isRestored,
        newChat,
        selectSession,
        deleteSession,
        renameSession,
        openDiagramFile,
        leavePage,
        restoreVersion,
        undoVersion,
        langfuseSessionId,
        loadedMessageIdsRef,
        stoppedRef,
        validationStates,
        modelConfig,
    }

    return (
        <ChatEngineContext.Provider value={engine}>
            {children}
        </ChatEngineContext.Provider>
    )
}
