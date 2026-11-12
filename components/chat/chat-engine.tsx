"use client"

import { useChat } from "@ai-sdk/react"
import {
    type ChatStatus,
    DefaultChatTransport,
    getToolName,
    isToolUIPart,
} from "ai"
import { useSearchParams } from "next/navigation"
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
import { toast } from "sonner"
import type { ValidationState } from "@/components/chat/ValidationCard"
import { useDiagram } from "@/contexts/diagram-context"
import { useDiagramToolHandlers } from "@/hooks/use-diagram-tool-handlers"
import { useDictionary } from "@/hooks/use-dictionary"
import {
    getSelectedAIConfig,
    type UseModelConfigReturn,
    useModelConfig,
} from "@/hooks/use-model-config"
import {
    type SessionData,
    useSessionManager,
} from "@/hooks/use-session-manager"
import { useValidateDiagram } from "@/hooks/use-validate-diagram"
import { getApiEndpoint } from "@/lib/base-path"
import { findCachedResponse } from "@/lib/cached-responses"
import { withoutOldImagesAndThinking } from "@/lib/chat-helpers"
import {
    type ChatToolName,
    type ChatUIMessage,
    type MessageSelection,
    noticeMessage,
} from "@/lib/chat-message"
import { buildChatHeaders } from "@/lib/chat-request"
import {
    isNetworkFailure,
    noteAction,
    recentActions,
    recordError,
    toastUnexpectedError,
} from "@/lib/client-error-report"
import {
    type AiCanvasState,
    diagramFingerprint,
    diagramForMessage,
} from "@/lib/diagram-context"
import { pageModelXml, placeOnPage } from "@/lib/diagram-pages"
import { EMPTY_DRAWIO_DOCUMENT } from "@/lib/drawio/drawio-config"
import { clearHighlights } from "@/lib/drawio/editor-bridge"
import { formatMessage } from "@/lib/i18n/utils"
import { isPdfFile, isTextFile } from "@/lib/pdf-utils"
import type { SessionMetadata, StoredMessage } from "@/lib/session-storage"
import { sanitizeMessages } from "@/lib/session-storage"
import { STORAGE_KEYS } from "@/lib/storage"
import type { UrlData } from "@/lib/url-utils"
import { type FileData, useFileProcessor } from "@/lib/use-file-processor"
import { useQuotaManager } from "@/lib/use-quota-manager"
import { formatXML, isRealDiagram } from "@/lib/utils"
import { rememberImages } from "@/packages/mcp-server/src/embedded-images.ts"
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
 * The parts of the answer's latest step. Every request of a turn adds to
 * the same assistant message, and the SDK starts each step with a
 * step-start part.
 */
function lastStepParts(message: ChatUIMessage) {
    const start = message.parts.findLastIndex((p) => p.type === "step-start")
    return message.parts.slice(start + 1)
}

/**
 * Check if auto-resubmit should happen based on tool errors.
 * Only checks the LAST tool part of the latest step: once the model answers
 * a failed call with words only, the turn is over, and the failed call of
 * the step before must not send the request again.
 * A call the user stopped is not one to retry.
 */
function hasToolErrors(messages: ChatUIMessage[]): boolean {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role !== "assistant") return false
    const lastToolPart = lastStepParts(lastMessage).filter(isToolUIPart).at(-1)
    return (
        lastToolPart?.state === TOOL_ERROR_STATE &&
        lastToolPart.errorText !== "Stopped by user"
    )
}

/**
 * Snapshots keep the full multi-page document, but the model sees and
 * edits one page, the one the user is viewing (the first when unknown), so
 * give it that page's mxGraphModel. Older snapshots already hold a single
 * mxGraphModel and are returned as is.
 */
function getPageXml(xml: string, pageId: string | null): string {
    if (!xml.includes("<mxfile")) return xml
    const model = pageModelXml(xml, pageId)
    return model ? formatXML(model) : xml
}

/** The page the user is viewing; null with an external draw.io */
function viewedPageId(): string | null {
    return useCanvasStore.getState().currentPageId
}

/**
 * The shapes a message was sent with, for sending it again. Not while
 * another page is on screen: the model then reads that page, where the same
 * ids are other shapes or none.
 */
function selectionOf(message: ChatUIMessage): MessageSelection {
    const { selectedCells, selectionPageId } = message.metadata ?? {}
    if (!Array.isArray(selectedCells)) return []
    if (selectionPageId !== undefined && selectionPageId !== viewedPageId()) {
        return []
    }
    return selectedCells
}

/** The message with the reasoning seconds measured on screen in its metadata */
function withReasoningSeconds(
    message: StoredMessage,
    seconds: Record<number, number> | undefined,
): StoredMessage {
    if (!seconds) return message
    const metadata = (message.metadata ?? {}) as {
        reasoningSeconds?: Record<number, number>
    }
    return {
        ...message,
        metadata: {
            ...metadata,
            reasoningSeconds: { ...metadata.reasoningSeconds, ...seconds },
        },
    }
}

/**
 * Whether a saved chat ends in the middle of an answer: with the user's
 * message (it is saved when it is sent), or with a part of the answer that
 * was still coming in. The page was reloaded or closed during the answer,
 * or the answer was stopped.
 */
function endsMidAnswer(messages: StoredMessage[]): boolean {
    const last = messages.at(-1)
    if (!last) return false
    if (last.role === "user") return true
    return last.parts.some((part) =>
        ["streaming", "input-streaming", "input-available"].includes(
            part.state as string,
        ),
    )
}

function newLangfuseSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Read the diagram document out of a .drawio, .xml or .drawio.svg file, with
 * its pages inflated: previews and the model read it before draw.io saves
 * it again. A broken or cut off file gives null.
 */
async function readDiagramFile(file: File): Promise<string | null> {
    const loaded = parseDrawioFileContent(await file.text())
    return loaded.ok ? withUniquePageIds(loaded.xml) : null
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

/**
 * Puts the chat's session id into the address (null: the plain page),
 * through the browser's history, which Next follows on its own. Its router
 * asks the server for the page on every change of the address, and loads
 * the address anew when the server does not answer: a server restart
 * during a chat's first answer took the editor off screen.
 */
function setUrlSession(id: string | null) {
    window.history.replaceState(
        null,
        "",
        id ? `?session=${id}` : window.location.pathname,
    )
}

export interface ChatEngine {
    messages: ChatUIMessage[]
    status: ChatStatus
    error: Error | undefined
    isBusy: boolean
    /** The chat on screen is being left (saved, then another one shown) */
    isLeaving: boolean
    setMessages: (messages: ChatUIMessage[]) => void
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
    submit: () => Promise<boolean>
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
    /** keepComposer: what is typed and attached stays (a file dropped there) */
    openDiagramFile: (
        file: File,
        options?: { keepComposer?: boolean },
    ) => Promise<void>
    /**
     * Save the chat on screen, then leave the page (another language) with
     * the chat's session id; nothing happens while an answer runs
     */
    leavePage: (go: (sessionId: string | null) => void) => Promise<void>

    restoreVersion: (versionId: string) => void
    undoVersion: (versionId: string) => void

    langfuseSessionId: string
    loadedMessageIdsRef: React.RefObject<Set<string>>
    /** Seconds of the reasoning rows that streamed on screen */
    reasoningSecondsRef: React.RefObject<Map<string, Record<number, number>>>
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
        fetchDiagramXml,
        chartXML,
        chartXMLRef,
        latestSvgRef,
        clearDiagram,
        getThumbnailSvg,
        captureValidationPng,
        startTurn,
    } = useDiagram()

    const dict = useDictionary()
    const searchParams = useSearchParams()
    const urlSessionId = searchParams.get("session")

    const vlmValidationEnabled = useSettingsStore((s) => s.vlmValidationEnabled)
    const openSettings = useUiStore((s) => s.openSettings)
    const focusComposer = useUiStore((s) => s.focusComposer)

    const { files, pdfData, handleFileChange, setFiles } = useFileProcessor({
        tooLong: dict.errors.fileTooLong,
        noText: dict.errors.fileNoText,
        readFailed: dict.errors.fileReadFailed,
        report: dict.report.button,
    })
    const [urlData, setUrlData] = useState<Map<string, UrlData>>(new Map())
    const filesRef = useRef(files)
    filesRef.current = files
    const urlDataRef = useRef(urlData)
    urlDataRef.current = urlData

    const modelConfig = useModelConfig()
    const sessionManager = useSessionManager({ initialSessionId: urlSessionId })

    const [input, setInputState] = useState("")

    // Restore the unsent input from sessionStorage. A prompt in the address
    // (?prompt=, from the docs' gallery) wins, is kept like typed text, and
    // leaves the address so a reload does not bring it back.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const prompt = params.get("prompt")
        if (prompt) {
            sessionStorage.setItem(SESSION_STORAGE_INPUT_KEY, prompt)
            params.delete("prompt")
            const query = params.toString()
            window.history.replaceState(
                window.history.state,
                "",
                `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
            )
        }
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

    const quotaManager = useQuotaManager({
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
    // The page the running turn's model reads and writes: the one the user
    // viewed when the message was sent (null: the first page)
    const turnPageIdRef = useRef<string | null>(null)
    // The canvas after each change the model made, by tool call: a message
    // sends the canvas only when it differs (lib/diagram-context.ts)
    const aiCanvasStatesRef = useRef<Map<string, AiCanvasState>>(new Map())
    // Index of the user message whose turn is running (versions belong to it)
    const currentTurnRef = useRef(0)
    // The chat (its generation) the running turn was sent in: a reply that
    // ends after another chat came on screen has nothing to say there
    const turnChatRef = useRef(0)

    const hasRestoredRef = useRef(false)
    const [isRestored, setIsRestored] = useState(false)

    // Session loaded without a diagram (prevents thumbnail contamination)
    const justLoadedSessionIdRef = useRef<string | null>(null)
    useEffect(() => {
        if (chartXML) justLoadedSessionIdRef.current = null
    }, [chartXML])

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
    // The model of this turn's requests, for error reports
    const requestModelRef = useRef<string | undefined>(undefined)
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
    const { validate, cancel: cancelValidation } = useValidateDiagram()

    const { handleToolCall } = useDiagramToolHandlers({
        partialXmlRef,
        continuationOriginalRef,
        editDiagramOriginalXmlRef,
        processedToolCallsRef,
        validationRetryCountRef,
        // A preview undone just before the tool call is in this one already
        chartXMLRef,
        turnPageIdRef,
        aiCanvasStatesRef,
        onDisplayChart,
        onFetchChart: fetchDiagramXml,
        captureValidationPng,
        validateDiagram: validate,
        enableVlmValidation: vlmValidationEnabled,
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

    // The canvas reaches the model in the messages: in the user message's
    // metadata (sendChatMessage), and after a failed call in that call's
    // error text. The request body has no copy of it.
    const transport = useMemo(
        () =>
            new DefaultChatTransport<ChatUIMessage>({
                api: getApiEndpoint("/api/chat"),
                prepareSendMessagesRequest: ({
                    id,
                    messages,
                    body,
                    trigger,
                    messageId,
                }) => ({
                    body: {
                        ...body,
                        id,
                        messages: withoutOldImagesAndThinking(messages),
                        trigger,
                        messageId,
                    },
                }),
            }),
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
    } = useChat<ChatUIMessage>({
        transport,
        onToolCall: async ({ toolCall }) => {
            await handleToolCall({ toolCall }, addToolOutputSafely)
        },
        onFinish: ({ message, isAbort, isError, finishReason }) => {
            // Stopped, failed, or the reply just ended (a closed connection):
            // tool calls still streaming never reach the tool handler. Mark
            // them handled so a later render of the stream does not draw
            // their preview again.
            const cut = message.parts
                .filter(isToolUIPart)
                .filter((part) => part.state === "input-streaming")
            for (const part of cut) {
                processedToolCallsRef.current.add(part.toolCallId)
            }
            // A call that started just before Stop was not on screen yet, so
            // Stop did not mark it: it was stopped too, not cut off (Stop,
            // or the page going, aborts a reply). Not once another chat is
            // on screen: the call is not among its messages.
            if (isAbort && getChatGeneration() === turnChatRef.current) {
                for (const part of cut) stopToolCall(part)
            }
            // A failure was noted by onError, which comes first
            if (isAbort) noteAction("answer stopped")
            if (isAbort || isError) return
            noteAction(
                finishReason === "length"
                    ? "answer cut off"
                    : cut.length > 0
                      ? "answer ended early"
                      : "answer finished",
            )
            const step = lastStepParts(message)
            const stepTools = step.filter(isToolUIPart)
            const lastTool = stepTools.at(-1)
            // The output budget ran out, and no failed call is left that the
            // app sends back to the model: its thinking took the budget and
            // nothing was drawn, or the cut left a call that still ran (the
            // server repairs cut off JSON, so an edit can lack its last
            // operations and a drawing its last shapes)
            const outOfTokens =
                finishReason === "length" &&
                lastTool?.state !== TOOL_ERROR_STATE
            // The server's step limit ended the answer on a step of shape
            // library lookups, before the model drew with what it found
            const lookupOnly =
                finishReason === "tool-calls" &&
                lastTool?.state === "output-available" &&
                stepTools.every(
                    (part) => getToolName(part) === "get_shape_library",
                )
            // The model answered with nothing: no words and no tool call
            // (some providers do when a filter drops the content)
            const empty =
                !lastTool &&
                !step.some((p) => p.type === "text" && p.text.trim())
            if (cut.length === 0 && !outOfTokens && !lookupOnly && !empty) {
                return
            }
            // Ended with no error, but short of what the model set out to
            // draw: undo a preview still on the canvas, and say so, as an
            // error does (with Retry)
            const [originalXml] = editDiagramOriginalXmlRef.current.values()
            if (originalXml) onDisplayChart(originalXml, true, "revert")
            editDiagramOriginalXmlRef.current.clear()
            abandonContinuation()
            const [text, code] = outOfTokens
                ? [dict.errors.llm.output_truncated, "output_truncated"]
                : empty
                  ? [dict.errors.emptyAnswer, "empty_answer"]
                  : [dict.errors.answerEndedEarly, "ended_early"]
            void recordError({
                kind: "chat-error",
                message: text,
                code,
                model: requestModelRef.current,
            })
            // Not in another chat that came on screen meanwhile
            if (getChatGeneration() !== turnChatRef.current) return
            setMessages((currentMessages) => [
                ...currentMessages,
                noticeMessage({ text, actions: recentActions() }),
            ])
        },
        onError: (error) => {
            // Before the error's record takes the recent actions
            noteAction("answer failed")
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
            if (isAccessCodeError) {
                // The server's text is English: say it in the interface's
                // language
                text = dict.errors.invalidAccessCode
            } else if (data?.type === "provider") {
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
            } else if (data?.code === "server_model_gone") {
                // The server no longer has the selected model (its admin
                // removed or renamed it): the list is loaded again, which
                // selects the default one, so Retry works
                text = dict.errors.serverModelGone
                modelConfig.reloadServerModels()
            } else if (typeof data?.error === "string") {
                text = data.error
            } else if (isNetworkFailure(error.message)) {
                text = dict.errors.networkError
            } else if (error.message === "network error") {
                // Chrome's words when the connection breaks while the
                // answer streams: the user's network, a server restart, or
                // the server's own connection to the provider (Node ends
                // one that sends nothing for 300 s)
                text = dict.errors.connectionLost
            } else if (error.message.trimStart().startsWith("<")) {
                // A gateway in front of the server (Cloudflare, nginx)
                // answered with its own HTML error page, e.g. while the
                // server restarts: its title says what happened
                const title = error.message
                    .match(/<title>([^<]*)<\/title>/i)?.[1]
                    .trim()
                text = title
                    ? `${dict.errors.serverUnavailable}\n\n${title}`
                    : dict.errors.serverUnavailable
            }

            // Every error card is recorded; Report on it adds a note
            void recordError({
                kind: "chat-error",
                message: text,
                code:
                    data?.code ??
                    (isAccessCodeError
                        ? "access_code"
                        : isNetworkFailure(error.message)
                          ? "network"
                          : error.message === "network error"
                            ? "connection_lost"
                            : undefined),
                model: requestModelRef.current,
            })

            // Not in another chat that came on screen meanwhile
            if (getChatGeneration() !== turnChatRef.current) return

            // The provider the turn was sent to (none for a server model);
            // the model selected may have changed since, e.g. in another tab
            const providerId = requestProviderIdRef.current

            // In the chat, so it is cleared with the conversation; with a
            // button that opens model settings, on the page of the provider
            // that refused
            setMessages((currentMessages) => [
                ...currentMessages,
                noticeMessage({
                    text,
                    ...(openModelConfig && { openModelConfig, providerId }),
                    ...(isAccessCodeError && { accessCode: true }),
                    actions: recentActions(),
                }),
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

    // A call the user stopped before it reached the tool handler. The SDK
    // finds the call by its id; the tool name is for the types only.
    const stopToolCall = (part: Parameters<typeof getToolName>[0]) =>
        addToolOutputSafely({
            tool: getToolName(part) as ChatToolName,
            toolCallId: part.toolCallId,
            state: "output-error",
            errorText: "Stopped by user",
        })

    // After each request: send the next one (retry, continue a cut off
    // drawing) or end the turn
    const shouldSendAgain = (messages: ChatUIMessage[]) => {
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
                toastUnexpectedError(
                    formatMessage(dict.errors.continuationRetryLimit, {
                        max: MAX_CONTINUATION_RETRY_COUNT,
                    }),
                    dict.report.button,
                )
                continuationRetryCountRef.current = 0
                partialXmlRef.current = ""
                return false
            }
            continuationRetryCountRef.current++
            noteAction("auto continue")
        } else {
            if (autoRetryCountRef.current >= MAX_AUTO_RETRY_COUNT) {
                toastUnexpectedError(
                    formatMessage(dict.errors.retryLimit, {
                        max: MAX_AUTO_RETRY_COUNT,
                    }),
                    dict.report.button,
                )
                autoRetryCountRef.current = 0
                partialXmlRef.current = ""
                return false
            }
            autoRetryCountRef.current++
            noteAction("auto retry")
        }
        return true
    }

    const isBusy = status === "streaming" || status === "submitted"
    // isBusy of the latest render, for code that runs after an await
    const busyRef = useRef(isBusy)
    busyRef.current = isBusy
    // Canvas components (version cards, the compare dialog, "ask AI") read
    // the busy flag from the canvas store
    useEffect(() => {
        useCanvasStore.getState().set({ isBusy })
    }, [isBusy])
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
    // Seconds each reasoning row took as it streamed (message id, then the
    // index of the row's first part); saved in the messages' metadata
    const reasoningSecondsRef = useRef(
        new Map<string, Record<number, number>>(),
    )

    useDiagramStreaming({
        messages,
        processedToolCallsRef,
        editDiagramOriginalXmlRef,
        loadedMessageIdsRef,
        turnPageIdRef,
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
    const [dismissedSelectionKey, setDismissedSelectionKey] = useState("")
    const selectionKey = selection.map((c) => c.id).join(",")
    const chatSelection =
        selectionKey === dismissedSelectionKey ? [] : selection
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
    // Changes of the chat on screen, counted by the auto-save effect, and
    // the count at which the last save that went through read the chat.
    // Equal counts: storage holds what is on screen.
    const changesRef = useRef(0)
    const savedChangesRef = useRef(0)
    // (A save that began earlier can end later)
    const markSaved = (changes: number) => {
        savedChangesRef.current = Math.max(savedChangesRef.current, changes)
    }
    // Whether hiding the tab or leaving the chat has something to save: a
    // chat with content (also just a title, of an opened blank file) that
    // has no session yet, or changed since it was loaded or saved. A chat
    // that was only looked at keeps its stored copy, its time and its place
    // in the list; another tab may have saved a newer copy since.
    const hasUnsavedChanges = () =>
        (messagesRef.current.length > 0 ||
            isRealDiagram(chartXMLRef.current) ||
            pendingTitleRef.current !== null) &&
        (sessionManager.getCurrentSessionId() === null ||
            savedChangesRef.current !== changesRef.current)

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
    const messagesBeforeShownRef = useRef<ChatUIMessage[] | null>(null)

    const syncUIWithSession = useCallback(
        (data: SessionData | null) => {
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
            // What comes on screen is what storage holds
            savedChangesRef.current = changesRef.current
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
                let shown = data.messages as unknown as ChatUIMessage[]
                // Saved in the middle of an answer: the chat says that the
                // answer did not finish, with Retry. Shown with the chat,
                // so looking at it saves nothing.
                if (endsMidAnswer(data.messages)) {
                    shown = [
                        ...shown,
                        noticeMessage({ text: dict.errors.answerEndedEarly }),
                    ]
                }
                loadedMessageIdsRef.current = new Set(shown.map((m) => m.id))
                setMessages(shown)
                xmlSnapshotsRef.current = new Map(data.xmlSnapshots)
                // The chat's messages show the model the canvas they were
                // sent with, pictures as references: its XML may name any
                // of them (embedded-images.ts)
                for (const xml of xmlSnapshotsRef.current.values()) {
                    rememberImages(xml)
                }
                if (data.diagramXml) onDisplayChart(data.diagramXml, true)
                else clearDiagram()
                if (!isRealDiagram(data.diagramXml)) latestSvgRef.current = ""
                useVersionsStore.getState().setVersions(data.versions ?? [])
            } else {
                loadedMessageIdsRef.current = new Set()
                setMessages([])
                xmlSnapshotsRef.current.clear()
                clearDiagram()
                useVersionsStore.getState().clear()
            }
        },
        [
            setMessages,
            onDisplayChart,
            clearDiagram,
            stopAnswerOfChatLeft,
            dict.errors.answerEndedEarly,
        ],
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
                chartXMLRef.current
            const messages = sanitizeMessages(messagesRef.current).map(
                (message) =>
                    withReasoningSeconds(
                        message,
                        reasoningSecondsRef.current.get(message.id),
                    ),
            )
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
            toastUnexpectedError(
                dict.errors.sessionCorrupted,
                dict.report.button,
                error,
            )
        } finally {
            setIsRestored(true)
        }
    }, [
        sessionManager.isLoading,
        sessionManager.currentSession,
        syncUIWithSession,
        dict.errors.sessionCorrupted,
        dict.report.button,
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
            // The address still names a chat this browser does not hold (a
            // link from another device, a deleted chat): this chat's id
            // takes its place, so a reload shows this chat
            if (
                !leavingRef.current &&
                urlSessionId &&
                urlSessionId !== newSession.id
            ) {
                setUrlSession(newSession.id)
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

    // Save the chat on screen as it is now, with the thumbnail it has
    // (taking a new one takes a moment)
    const saveNow = async () => {
        try {
            const changes = changesRef.current
            const ticket = getSaveTicket()
            const sessionData = await buildSessionData()
            if (await saveCurrentSessionRef.current(sessionData, ticket)) {
                markSaved(changes)
            }
        } catch (error) {
            console.error("Failed to save session:", error)
        }
    }

    const versions = useVersionsStore((s) => s.versions)
    // An answer was coming in when the auto-save effect ran last
    const answeringRef = useRef(false)

    // Auto-save: at once when a message is sent and when its answer ends,
    // and a second after each change while no answer comes in
    useEffect(() => {
        if (!hasRestoredRef.current) return
        if (!sessionIsAvailable) return
        if (status === "streaming" || status === "submitted") {
            // The answer coming in is a change, saved when it ends
            changesRef.current++
            answeringRef.current = true
            // The message is saved the moment it is sent: its answer can
            // take a minute, and a reload or a closed tab during it lost
            // the message, and a new chat as a whole. (Once a chat just
            // loaded shows its own messages.)
            if (
                status === "submitted" &&
                !justLoadedSessionRef.current &&
                hasUnsavedChanges()
            ) {
                void saveNow()
            }
            return
        }
        const answerEnded = answeringRef.current
        answeringRef.current = false
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
        changesRef.current++
        // The answer just ended: saved at once, so leaving the page in the
        // next second keeps it. The save below adds the thumbnail. (A chat
        // that is being left stopped its answer, and saves itself.)
        if (answerEnded && !leavingRef.current && hasUnsavedChanges()) {
            void saveNow()
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
                    const changes = changesRef.current
                    const ticket = {
                        ...getSaveTicket(),
                        generation: scheduledForChat,
                    }
                    const sessionData = await buildSessionData({
                        withThumbnail: hasDiagramNow && !isNoDiagramSession,
                    })
                    if (
                        await saveCurrentSessionRef.current(sessionData, ticket)
                    ) {
                        markSaved(changes)
                    }
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
            setUrlSession(sessionManager.currentSessionId)
        }
    }, [sessionManager.currentSessionId, urlSessionId])

    // Save when the page is hidden (more reliable than beforeunload for IndexedDB)
    useEffect(() => {
        if (!sessionManager.isAvailable) return
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden" && hasUnsavedChanges()) {
                void saveNow()
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

    // xml: the page the model works on, as it is when the message is sent.
    // messageId: the user message sent again (regenerate, edit, retry); the
    // SDK puts the new one in its place and drops the answers after it
    const sendChatMessage = (
        parts: any,
        xml: string,
        turnIndex: number,
        selectedCells: MessageSelection,
        messageId?: string,
    ) => {
        autoRetryCountRef.current = 0
        continuationRetryCountRef.current = 0
        validationRetryCountRef.current = 0
        partialXmlRef.current = ""
        // The model sees the pictures in it as references; its XML gets
        // them back from here (embedded-images.ts). Those of the chat's
        // earlier canvases were kept when they were sent or the chat loaded.
        rememberImages(xml)
        continuationOriginalRef.current = null
        stoppedRef.current = false
        currentTurnRef.current = turnIndex
        turnPageIdRef.current = viewedPageId()
        turnChatRef.current = getChatGeneration()
        // Busy from now on, before the next render says so
        busyRef.current = true
        // Its Undo would take this answer's diagram away
        toast.dismiss("version-restored")
        startTurn()
        // The outline of the last AI change is done with
        clearHighlights()

        const config = getSelectedAIConfig()
        const { customSystemMessage, minimalStyle, maxOutputTokens } =
            useSettingsStore.getState()
        // For this turn's errors: the provider these headers name (read with
        // them, from storage: another tab may have changed it meanwhile)
        requestProviderIdRef.current = config.providerId || undefined
        requestModelRef.current = config.aiProvider
            ? `${config.aiProvider}/${config.aiModel}`
            : config.selectedModelId || "server default"

        const selected = selectedCells.map(({ id, label }) => ({ id, label }))
        // The canvas goes with the message only when the model's own calls
        // no longer describe it; kept in the message for later requests
        const diagram = diagramForMessage({
            history: messagesRef.current.slice(0, turnIndex),
            pageXml: xml,
            pageId: turnPageIdRef.current,
            states: aiCanvasStatesRef.current,
        })
        const options = {
            body: {
                sessionId: langfuseSessionId,
                customSystemMessage,
                ...(selected.length > 0 && { selectedCells: selected }),
            },
            headers: buildChatHeaders(config, {
                minimalStyle,
                maxOutputTokens,
            }),
        }
        // The canvas note and the selection stay with the message: every
        // later request sends them the same way, and regenerate and retry
        // keep the selection. Its chip names a connector as one.
        sendMessage(
            {
                ...(messageId !== undefined && { messageId }),
                parts,
                metadata: {
                    diagram,
                    ...(selected.length > 0 && {
                        selectedCells: selectedCells.map(
                            ({ id, label, isEdge }) => ({
                                id,
                                label,
                                isEdge: !!isEdge,
                            }),
                        ),
                        selectionPageId: turnPageIdRef.current,
                    }),
                },
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
        const chartXml = formatXML(await fetchDiagramXml())
        if (getChatGeneration() !== generation || leavingRef.current) {
            return false
        }
        const turnIndex = messagesRef.current.length
        // Snapshot the full multi-page document (kept fresh by autosave) so
        // regenerate/edit can restore every page; the model gets the page
        // the user is viewing
        xmlSnapshotsRef.current.set(turnIndex, chartXMLRef.current || chartXml)
        sendChatMessage(parts, chartXml, turnIndex, selectedCells)
        return true
    }

    const clearComposer = () => {
        setInput("")
        setFiles([])
        setUrlData(new Map())
    }

    // Whether the message was sent
    const submitInput = async (): Promise<boolean> => {
        const text = input
        // busyRef: the value of the latest render
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
            !hasCells(chartXMLRef.current)
        ) {
            // The file name keeps a user's own file from matching an example
            const cached = findCachedResponse(
                text.trim(),
                files.length > 0,
                files.length === 1 ? files[0].name : undefined,
            )
            if (cached) {
                const toolCallId = `cached-${Date.now()}`
                // The attached picture shows in the message, as when sent
                const fileParts: any[] = []
                const userText = await processFilesAndAppendContent(
                    text,
                    fileParts,
                )
                currentTurnRef.current = 0
                startTurn()
                clearHighlights()
                setMessages([
                    {
                        id: `user-${Date.now()}`,
                        role: "user" as const,
                        parts: [
                            { type: "text" as const, text: userText },
                            ...fileParts,
                        ],
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
                    const pageId = viewedPageId()
                    const placed = placeOnPage(
                        prepared.xml,
                        chartXMLRef.current,
                        pageId,
                    )
                    onDisplayChart(placed, true, "commit", {
                        toolCallId,
                        pageId,
                    })
                    // The next message can then leave the canvas out, as
                    // after a drawing of the model
                    aiCanvasStatesRef.current.set(toolCallId, {
                        pageId,
                        fingerprint: diagramFingerprint(
                            pageModelXml(placed, pageId) ?? placed,
                        ),
                        exact: prepared.fixes.length === 0,
                    })
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
            toastUnexpectedError(
                error instanceof FileReadError
                    ? error.message
                    : dict.errors.failedToExport,
                dict.report.button,
                error,
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

    const submit = async (): Promise<boolean> => {
        // While a send is prepared (attachments read, diagram exported) the
        // status is still "ready": a second Enter or click would send the
        // message again
        if (leavingRef.current) return false
        if (preparingSendRef.current) {
            toast.error(dict.errors.sendInProgress, { id: "send-in-progress" })
            return false
        }
        preparingSendRef.current = true
        noteAction("send")
        try {
            return await submitInput()
        } finally {
            preparingSendRef.current = false
        }
    }

    const improveWithSuggestions = async (feedback: string) => {
        if (!canStartTurn()) return
        noteAction("improve diagram")
        // Like submit: the diagram export comes first
        preparingSendRef.current = true
        try {
            await sendWithCurrentDiagram([{ type: "text", text: feedback }])
        } catch (error) {
            console.error("Error fetching chart data:", error)
            toastUnexpectedError(
                dict.errors.failedToExport,
                dict.report.button,
                error,
            )
        } finally {
            preparingSendRef.current = false
        }
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
        // When the model has drawn nothing since the message was sent, all
        // that the canvas gained since is the user's own work: it is in no
        // version, and loading the snapshot would take it away for good (a
        // load resets undo). The canvas then stays, as on Retry, and is the
        // diagram the message is sent with from now on.
        const drawnSince = useVersionsStore
            .getState()
            .versions.some((v) => v.turnIndex >= index)
        const xml = drawnSince ? savedXml : chartXMLRef.current || savedXml
        if (drawnSince) {
            onDisplayChart(savedXml, true)
            useVersionsStore.getState().removeFromTurn(index)
        } else {
            xmlSnapshotsRef.current.set(index, xml)
        }
        dropLaterSnapshots(index)

        sendChatMessage(
            parts,
            getPageXml(xml, viewedPageId()),
            index,
            selectionOf(messages[index]),
            messages[index].id,
        )

        return true
    }

    const regenerate = async (messageIndex: number) => {
        if (!canStartTurn()) return
        noteAction("regenerate")
        let userMessageIndex = messageIndex - 1
        while (
            userMessageIndex >= 0 &&
            messages[userMessageIndex].role !== "user"
        ) {
            userMessageIndex--
        }
        if (userMessageIndex < 0) return
        const userParts = messages[userMessageIndex].parts
        if (!userParts.some((p: any) => p.type === "text")) return
        rerunFrom(userMessageIndex, userParts)
    }

    const editMessage = async (messageIndex: number, newText: string) => {
        if (!canStartTurn()) return false
        noteAction("edit message")
        const message = messages[messageIndex]
        if (message?.role !== "user") return false
        // The edit box only shows the typed text; keep appended file content
        const newParts = message.parts.map((part: any) => {
            if (part.type === "text") {
                const appended =
                    part.text.match(APPENDED_FILE_SECTIONS_PATTERN)?.[0] ?? ""
                return { ...part, text: newText + appended }
            }
            return part
        })
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
        noteAction("retry")
        const index = messagesRef.current.map((m) => m.role).lastIndexOf("user")
        if (index < 0) return
        const message = messagesRef.current[index]
        const generation = getChatGeneration()
        // Like submit: the diagram export comes first
        preparingSendRef.current = true
        try {
            const chartXml = formatXML(await fetchDiagramXml())
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
            sendChatMessage(
                message.parts,
                chartXml,
                index,
                selectionOf(message),
                message.id,
            )
        } catch (error) {
            console.error("Error fetching chart data:", error)
            toastUnexpectedError(
                dict.errors.failedToExport,
                dict.report.button,
                error,
            )
        } finally {
            preparingSendRef.current = false
        }
    }

    const handleStop = useCallback(() => {
        noteAction("stop")
        stoppedRef.current = true
        stopCountRef.current++
        // A running screenshot check holds up the chat (the SDK waits for
        // the tool handler): end it, so the call gets its result now
        cancelValidation()
        const lastMessage = messages[messages.length - 1]
        // Calls the tool handler already took can still show as streaming:
        // the messages update at most every 150 ms (useChat throttle)
        const streaming = (lastMessage?.parts ?? [])
            .filter(isToolUIPart)
            .filter(
                (part) =>
                    part.state === "input-streaming" &&
                    !processedToolCallsRef.current.has(part.toolCallId),
            )
        for (const part of streaming) stopToolCall(part)
        stop()
        abandonContinuation()
    }, [messages, stopToolCall, stop, cancelValidation])

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

    // Save the chat on screen before leaving it, when it changed since it
    // was loaded or saved (also a diagram drawn without messages, or a chat
    // with just a title, like an opened blank file). If that failed
    // (storage full), stay on it unless the user goes on without saving:
    // then proceed runs later. Resolves to whether the caller can leave now.
    const saveBeforeLeaving = async (proceed: () => void) => {
        if (!sessionManager.isAvailable) return true
        if (!hasUnsavedChanges()) return true
        // Of the chat on screen now, also if another one comes on screen
        // while the thumbnail is taken
        const changes = changesRef.current
        const ticket = sessionManager.getSaveTicket()
        const sessionData = await buildSessionData({ withThumbnail: true })
        if (!(await sessionManager.saveCurrentSession(sessionData, ticket))) {
            offerToContinueUnsaved(proceed)
            return false
        }
        markSaved(changes)
        return true
    }

    // Browser back or forward puts another chat on screen without the app's
    // own leaving: this one is saved first when it changed, with what was
    // sent and answered so far, its answer stopped. A call left unfinished
    // is saved as stopped. No thumbnail: taking one would hold the switch
    // for seconds (the old one stays).
    // Meanwhile it is being left: nothing can be sent (a message being
    // prepared is given back to the input instead)
    const saveBeforeUrlSwitch = () =>
        whileLeaving(async () => {
            const wasAnswering = busyRef.current
            const save = sessionManager.isAvailable && hasUnsavedChanges()
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
        noteAction("open chat")
        const open = async () => {
            if (isTurnActive()) return
            const sessionData = await sessionManager.switchSession(id)
            if (!sessionData) {
                // That chat is gone (deleted in another tab): this one
                // stays, and the save before may have just given it a
                // session, which the URL skipped while leaving
                const current = sessionManager.getCurrentSessionId()
                if (current) setUrlSession(current)
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
            setUrlSession(id)
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
                    setUrlSession(null)
                }
            }
            if (isCurrent) await whileLeaving(remove)
            else await remove()
        },
        [sessionManager, syncUIWithSession, isBusy],
    )

    // Clear everything for a new conversation (the old one is saved)
    const startNewChat = (keepComposer = false) => {
        // Clear session state BEFORE the URL, so the URL effect does not
        // bring the old session back
        sessionManager.clearCurrentSession()
        toast.dismiss("version-restored")
        toast.dismiss("session-save-leave")
        // A new conversation brings the start screen back
        useUiStore.getState().setHeroDismissed(false)
        setMessages([])
        clearDiagram()
        useVersionsStore.getState().clear()
        setValidationStates({})
        if (!keepComposer) {
            setInput("")
            handleFileChange([])
            setUrlData(new Map())
        }
        setLangfuseSessionId(newLangfuseSessionId())
        xmlSnapshotsRef.current.clear()
        setPendingTitle(null)
        setUrlSession(null)
    }

    const newChat = async () => {
        if (!canStartTurn()) return
        noteAction("new chat")
        const start = () => {
            if (isTurnActive()) return
            startNewChat()
            toast.success(dict.dialogs.clearSuccess)
            focusComposer()
        }
        await whileLeaving(async () => {
            if (!(await saveBeforeLeaving(start))) return
            // The list shows the chat just saved
            await sessionManager.refreshSessions()
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

    const openDiagramFile = async (
        file: File,
        { keepComposer = false }: { keepComposer?: boolean } = {},
    ) => {
        noteAction("open file")
        // It would start a new chat while the answer still goes to this
        // one: a toast asks the user to open it again after the answer
        if (isTurnActive()) {
            toast.info(
                formatMessage(dict.chat.openFileAfterAnswer, {
                    name: file.name,
                }),
            )
            return
        }
        if (!canStartTurn()) return
        await whileLeaving(() => openFile(file, keepComposer))
    }

    const openFile = async (file: File, keepComposer: boolean) => {
        const xml = await readDiagramFile(file).catch(() => null)
        if (!xml) {
            // An SVG that does not open is a picture without the diagram
            // inside, like this app's own "SVG image" export: the message
            // names the two formats that can be opened again
            toast.error(
                formatMessage(
                    /\.svg$/i.test(file.name)
                        ? dict.errors.svgWithoutDiagram
                        : dict.errors.notADiagramFile,
                    { name: file.name },
                ),
            )
            return
        }
        // A loaded file starts a fresh conversation named after it
        const open = () => {
            if (isTurnActive()) return
            startNewChat(keepComposer)
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
        setMessages: setMessages as (messages: ChatUIMessage[]) => void,
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
        reasoningSecondsRef,
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
