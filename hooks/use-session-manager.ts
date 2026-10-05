"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useDictionary } from "@/hooks/use-dictionary"
import {
    type ChatSession,
    createEmptySession,
    deleteSession as deleteSessionFromDB,
    enforceSessionLimit,
    extractTitle,
    getAllSessionMetadata,
    getSession,
    isIndexedDBAvailable,
    migrateFromLocalStorage,
    readSessionCount,
    type SessionMetadata,
    type StoredMessage,
    saveSession,
} from "@/lib/session-storage"
import { STORAGE_KEYS } from "@/lib/storage"

export interface SessionData {
    messages: StoredMessage[]
    xmlSnapshots: [number, string][]
    diagramXml: string
    thumbnailDataUrl?: string
    diagramHistory?: { svg: string; xml: string }[]
}

// Taken right before a save's data is read: the chat on screen then, and
// the order of the reads
export interface SaveTicket {
    generation: number
    seq: number
}

export interface UseSessionManagerReturn {
    // State
    sessions: SessionMetadata[]
    currentSessionId: string | null
    currentSession: ChatSession | null
    isLoading: boolean
    isAvailable: boolean

    // Actions
    switchSession: (id: string) => Promise<SessionData | null>
    deleteSession: (id: string) => Promise<{ wasCurrentSession: boolean }>
    // ticket: getSaveTicket() before the data was read (by default, now).
    // The save is dropped if another chat is on screen when its turn comes,
    // or if a copy of this chat read later was saved already.
    // Resolves to false when the save failed (the user was told)
    saveCurrentSession: (
        data: SessionData,
        ticket?: SaveTicket,
    ) => Promise<boolean>
    refreshSessions: () => Promise<void>
    clearCurrentSession: () => void
    getChatGeneration: () => number
    getSaveTicket: () => SaveTicket
}

// Reading the session list loads every stored session in full, and window
// focus also fires each time the user clicks back from the draw.io iframe
const FOCUS_REFRESH_INTERVAL_MS = 30_000

function notifySaveFailed(message: string) {
    // Same id, so repeated failures update one toast instead of stacking
    toast.error(message, { id: "session-save-failed", duration: 8000 })
}

interface UseSessionManagerOptions {
    /** Session ID from URL param - if provided, load this session; if null, start blank */
    initialSessionId?: string | null
}

export function useSessionManager(
    options: UseSessionManagerOptions = {},
): UseSessionManagerReturn {
    const { initialSessionId } = options
    const dict = useDictionary()
    const [sessions, setSessions] = useState<SessionMetadata[]>([])
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(
        null,
    )
    const [currentSession, setCurrentSession] = useState<ChatSession | null>(
        null,
    )
    const [isLoading, setIsLoading] = useState(true)
    const [isAvailable, setIsAvailable] = useState(false)

    const isInitializedRef = useRef(false)
    // Sequence guard for URL changes - prevents out-of-order async resolution
    const urlChangeSequenceRef = useRef(0)
    // The chat on screen, read by saves that run after a render or a wait
    const currentSessionRef = useRef<ChatSession | null>(null)
    // Goes up each time another chat is put on screen (creating the
    // session of the chat on screen does not count)
    const chatGenerationRef = useRef(0)
    // Saves run one at a time, so two saves of a new chat create it once
    const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve())
    // The last ticket number, and that of the newest data saved
    const saveSeqRef = useRef(0)
    const savedSeqRef = useRef(0)

    const changeChat = useCallback((session: ChatSession | null) => {
        chatGenerationRef.current++
        currentSessionRef.current = session
        setCurrentSession(session)
        setCurrentSessionId(session?.id ?? null)
    }, [])

    // Load sessions list
    const refreshSessions = useCallback(async () => {
        if (!isIndexedDBAvailable()) return
        try {
            const metadata = await getAllSessionMetadata()
            setSessions(metadata)
        } catch (error) {
            console.error("Failed to refresh sessions:", error)
        }
    }, [])

    // Initialize on mount
    useEffect(() => {
        if (isInitializedRef.current) return
        isInitializedRef.current = true

        async function init() {
            setIsLoading(true)

            if (!isIndexedDBAvailable()) {
                setIsAvailable(false)
                setIsLoading(false)
                return
            }

            setIsAvailable(true)

            try {
                // Run migration first (one-time conversion from localStorage)
                await migrateFromLocalStorage()

                // Load sessions list
                const metadata = await getAllSessionMetadata()
                setSessions(metadata)
                // The desktop app may try its other port next launch, where
                // an older version may have saved the chats: only when this
                // origin surely has none (a failed read is not "none") and
                // keeps no model settings or keys either
                if (window.electronAPI?.chatsLoaded) {
                    const count = await readSessionCount()
                    // The app saves an empty config on its first load; the
                    // providers are what holds the keys, besides an access
                    // code
                    let hasSettings = true
                    try {
                        const config = JSON.parse(
                            localStorage.getItem(STORAGE_KEYS.modelConfigs) ??
                                "{}",
                        )
                        hasSettings =
                            (config.providers?.length ?? 0) > 0 ||
                            !!localStorage.getItem(STORAGE_KEYS.accessCode)
                    } catch {
                        // Unreadable: treat as settings, and stay
                    }
                    if (count !== null && !hasSettings) {
                        window.electronAPI.chatsLoaded(count).catch(() => {})
                    }
                }

                // Only load a session if initialSessionId is provided (from URL param)
                if (initialSessionId) {
                    const session = await getSession(initialSessionId)
                    if (session) changeChat(session)
                    // If session not found, stay in blank state (URL has invalid session ID)
                }
                // If no initialSessionId, start with blank state (no auto-restore)
            } catch (error) {
                console.error("Failed to initialize session manager:", error)
            } finally {
                setIsLoading(false)
            }
        }

        init()
    }, [initialSessionId, changeChat])

    // Handle URL session ID changes after initialization
    // Note: intentionally NOT including currentSessionId in deps to avoid race conditions
    // when clearCurrentSession() is called before URL updates
    useEffect(() => {
        if (!isInitializedRef.current) return // Wait for initial load
        if (!isAvailable) return

        // Increment sequence to invalidate any pending async operations
        urlChangeSequenceRef.current++
        const currentSequence = urlChangeSequenceRef.current

        async function handleSessionIdChange() {
            if (initialSessionId) {
                const generation = chatGenerationRef.current
                // URL has session ID - load it
                const session = await getSession(initialSessionId)

                // Check if this request is still the latest (sequence guard)
                // If not, a newer URL change happened while we were loading
                if (currentSequence !== urlChangeSequenceRef.current) {
                    return
                }
                // Another chat was put on screen meanwhile (New Chat right
                // after this one got its session id in the URL): keep it
                if (generation !== chatGenerationRef.current) return

                // Only update if the session is different from current
                if (session && currentSessionRef.current?.id !== session.id) {
                    changeChat(session)
                }
            }
            // Removed: else clause that clears session
            // Clearing is now handled explicitly by clearCurrentSession()
            // This prevents race conditions when URL update is async
        }

        handleSessionIdChange()
    }, [initialSessionId, isAvailable, changeChat])

    // Refresh sessions on window focus (multi-tab sync), at most once per interval
    const lastFocusRefreshRef = useRef(0)
    useEffect(() => {
        const handleFocus = () => {
            const now = Date.now()
            if (now - lastFocusRefreshRef.current < FOCUS_REFRESH_INTERVAL_MS) {
                return
            }
            lastFocusRefreshRef.current = now
            refreshSessions()
        }
        window.addEventListener("focus", handleFocus)
        return () => window.removeEventListener("focus", handleFocus)
    }, [refreshSessions])

    // Switch to a different session
    const switchSession = useCallback(
        async (id: string): Promise<SessionData | null> => {
            if (id === currentSessionId) return null

            // Save current session first if it has messages (as saved
            // last: the caller may have just saved it)
            const current = currentSessionRef.current
            if (current && current.messages.length > 0) {
                await saveSession(current)
            }

            // Load the target session
            const session = await getSession(id)
            if (!session) {
                console.error("Session not found:", id)
                return null
            }

            changeChat(session)

            return {
                messages: session.messages,
                xmlSnapshots: session.xmlSnapshots,
                diagramXml: session.diagramXml,
                thumbnailDataUrl: session.thumbnailDataUrl,
                diagramHistory: session.diagramHistory,
            }
        },
        [currentSessionId, changeChat],
    )

    // Delete a session
    const deleteSession = useCallback(
        async (id: string): Promise<{ wasCurrentSession: boolean }> => {
            const wasCurrentSession = id === currentSessionId
            await deleteSessionFromDB(id)

            // If deleting current session, clear state (caller will show new empty session)
            if (wasCurrentSession) changeChat(null)

            await refreshSessions()

            return { wasCurrentSession }
        },
        [currentSessionId, refreshSessions, changeChat],
    )

    // Save current session data (debounced externally by caller)
    const saveCurrentSession = useCallback(
        (data: SessionData, ticket?: SaveTicket): Promise<boolean> => {
            // The data is of the chat on screen when it was read
            const { generation, seq } = ticket ?? {
                generation: chatGenerationRef.current,
                seq: ++saveSeqRef.current,
            }
            const run = async (): Promise<boolean> => {
                // That chat is no longer on screen (leaving it saved it)
                if (generation !== chatGenerationRef.current) return true
                // A copy read later was saved already (one that waited for
                // its thumbnail must not undo it)
                if (seq < savedSeqRef.current) return true
                // Nothing can be stored without IndexedDB
                if (!isIndexedDBAvailable()) return true
                // The user may put another chat on screen while this one is
                // written; the stored copy is still right, the state is not
                const stillOnScreen = () =>
                    chatGenerationRef.current === generation
                const currentSession = currentSessionRef.current

                if (!currentSession) {
                    // Create a new session if none exists
                    const newSession: ChatSession = {
                        ...createEmptySession(),
                        messages: data.messages,
                        xmlSnapshots: data.xmlSnapshots,
                        diagramXml: data.diagramXml,
                        thumbnailDataUrl: data.thumbnailDataUrl,
                        diagramHistory: data.diagramHistory,
                        title: extractTitle(data.messages),
                    }
                    // Without a stored session, keep no session id (it would end
                    // up in the URL and point to nothing after a reload)
                    if (!(await saveSession(newSession))) {
                        notifySaveFailed(dict.errors.sessionSaveFailed)
                        return false
                    }
                    savedSeqRef.current = seq
                    await enforceSessionLimit()
                    if (stillOnScreen()) {
                        currentSessionRef.current = newSession
                        setCurrentSession(newSession)
                        setCurrentSessionId(newSession.id)
                    }
                    await refreshSessions()
                    return true
                }

                // Update existing session
                const updatedSession: ChatSession = {
                    ...currentSession,
                    messages: data.messages,
                    xmlSnapshots: data.xmlSnapshots,
                    diagramXml: data.diagramXml,
                    thumbnailDataUrl:
                        data.thumbnailDataUrl ??
                        currentSession.thumbnailDataUrl,
                    diagramHistory:
                        data.diagramHistory ?? currentSession.diagramHistory,
                    updatedAt: Date.now(),
                    // Update title if it's still default and we have messages
                    title:
                        currentSession.title === "New Chat" &&
                        data.messages.length > 0
                            ? extractTitle(data.messages)
                            : currentSession.title,
                }

                if (!(await saveSession(updatedSession))) {
                    notifySaveFailed(dict.errors.sessionSaveFailed)
                    return false
                }
                savedSeqRef.current = seq
                if (stillOnScreen()) {
                    currentSessionRef.current = updatedSession
                    setCurrentSession(updatedSession)
                }

                // Update sessions list metadata
                setSessions((prev) =>
                    prev.map((s) =>
                        s.id === updatedSession.id
                            ? {
                                  ...s,
                                  title: updatedSession.title,
                                  updatedAt: updatedSession.updatedAt,
                                  messageCount: updatedSession.messages.length,
                                  hasDiagram:
                                      !!updatedSession.diagramXml &&
                                      updatedSession.diagramXml.trim().length >
                                          0,
                                  thumbnailDataUrl:
                                      updatedSession.thumbnailDataUrl,
                              }
                            : s,
                    ),
                )
                return true
            }
            const result = saveQueueRef.current.then(run)
            saveQueueRef.current = result.catch(() => {})
            return result
        },
        [refreshSessions, dict],
    )

    // Clear current session state (for starting fresh without loading another session)
    const clearCurrentSession = useCallback(() => {
        changeChat(null)
    }, [changeChat])

    const getChatGeneration = useCallback(() => chatGenerationRef.current, [])

    const getSaveTicket = useCallback(
        (): SaveTicket => ({
            generation: chatGenerationRef.current,
            seq: ++saveSeqRef.current,
        }),
        [],
    )

    return {
        sessions,
        currentSessionId,
        currentSession,
        isLoading,
        isAvailable,
        switchSession,
        deleteSession,
        saveCurrentSession,
        refreshSessions,
        clearCurrentSession,
        getChatGeneration,
        getSaveTicket,
    }
}
