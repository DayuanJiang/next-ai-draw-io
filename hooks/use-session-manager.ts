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
    type SessionMetadata,
    type StoredMessage,
    saveSession,
} from "@/lib/session-storage"

export interface SessionData {
    messages: StoredMessage[]
    xmlSnapshots: [number, string][]
    diagramXml: string
    thumbnailDataUrl?: string
    diagramHistory?: { svg: string; xml: string }[]
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
    // forSessionId: optional session ID to verify save targets correct session (prevents stale debounce writes)
    // Resolves to false when the save failed (the user was told)
    saveCurrentSession: (
        data: SessionData,
        forSessionId?: string | null,
    ) => Promise<boolean>
    refreshSessions: () => Promise<void>
    clearCurrentSession: () => void
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
                // an older version may have saved the chats
                window.electronAPI
                    ?.chatsLoaded?.(metadata.length)
                    .catch(() => {})

                // Only load a session if initialSessionId is provided (from URL param)
                if (initialSessionId) {
                    const session = await getSession(initialSessionId)
                    if (session) {
                        setCurrentSession(session)
                        setCurrentSessionId(session.id)
                    }
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
    }, [initialSessionId])

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
                // URL has session ID - load it
                const session = await getSession(initialSessionId)

                // Check if this request is still the latest (sequence guard)
                // If not, a newer URL change happened while we were loading
                if (currentSequence !== urlChangeSequenceRef.current) {
                    return
                }

                if (session) {
                    // Only update if the session is different from current
                    setCurrentSessionId((current) => {
                        if (current !== session.id) {
                            setCurrentSession(session)
                            return session.id
                        }
                        return current
                    })
                }
            }
            // Removed: else clause that clears session
            // Clearing is now handled explicitly by clearCurrentSession()
            // This prevents race conditions when URL update is async
        }

        handleSessionIdChange()
    }, [initialSessionId, isAvailable])

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

            // Save current session first if it has messages
            if (currentSession && currentSession.messages.length > 0) {
                await saveSession(currentSession)
            }

            // Load the target session
            const session = await getSession(id)
            if (!session) {
                console.error("Session not found:", id)
                return null
            }

            // Update state
            setCurrentSession(session)
            setCurrentSessionId(session.id)

            return {
                messages: session.messages,
                xmlSnapshots: session.xmlSnapshots,
                diagramXml: session.diagramXml,
                thumbnailDataUrl: session.thumbnailDataUrl,
                diagramHistory: session.diagramHistory,
            }
        },
        [currentSessionId, currentSession],
    )

    // Delete a session
    const deleteSession = useCallback(
        async (id: string): Promise<{ wasCurrentSession: boolean }> => {
            const wasCurrentSession = id === currentSessionId
            await deleteSessionFromDB(id)

            // If deleting current session, clear state (caller will show new empty session)
            if (wasCurrentSession) {
                setCurrentSession(null)
                setCurrentSessionId(null)
            }

            await refreshSessions()

            return { wasCurrentSession }
        },
        [currentSessionId, refreshSessions],
    )

    // Save current session data (debounced externally by caller)
    // forSessionId: if provided, verify save targets correct session (prevents stale debounce writes)
    const saveCurrentSession = useCallback(
        async (
            data: SessionData,
            forSessionId?: string | null,
        ): Promise<boolean> => {
            // If forSessionId is provided, verify it matches current session
            // This prevents stale debounced saves from overwriting a newly switched session
            if (
                forSessionId !== undefined &&
                forSessionId !== currentSessionId
            ) {
                return true
            }
            // Nothing can be stored without IndexedDB
            if (!isIndexedDBAvailable()) return true

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
                await enforceSessionLimit()
                setCurrentSession(newSession)
                setCurrentSessionId(newSession.id)
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
                    data.thumbnailDataUrl ?? currentSession.thumbnailDataUrl,
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
            setCurrentSession(updatedSession)

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
                                  updatedSession.diagramXml.trim().length > 0,
                              thumbnailDataUrl: updatedSession.thumbnailDataUrl,
                          }
                        : s,
                ),
            )
            return true
        },
        [currentSession, currentSessionId, refreshSessions, dict],
    )

    // Clear current session state (for starting fresh without loading another session)
    const clearCurrentSession = useCallback(() => {
        setCurrentSession(null)
        setCurrentSessionId(null)
    }, [])

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
    }
}
