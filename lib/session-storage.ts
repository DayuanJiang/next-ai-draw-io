import { type DBSchema, type IDBPDatabase, openDB } from "idb"
import { nanoid } from "nanoid"
import { toast } from "sonner"
import type { DiagramVersion } from "@/stores/versions-store"

// Constants
const DB_NAME = "next-ai-drawio"
const DB_VERSION = 2
const STORE_NAME = "sessions"
const MAX_SESSIONS = 50

// Types
export interface ChatSession {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    messages: StoredMessage[]
    xmlSnapshots: [number, string][]
    diagramXml: string
    thumbnailDataUrl?: string // Small PNG preview of the diagram
    // Diagram states produced by AI changes, shown as cards in the chat
    versions?: DiagramVersion[]
}

export interface StoredMessage {
    id: string
    role: "user" | "assistant" | "system"
    parts: Array<{ type: string; [key: string]: unknown }>
    // e.g. the shapes selected when a user message was sent
    metadata?: unknown
}

export interface SessionMetadata {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    messageCount: number
    hasDiagram: boolean
    thumbnailDataUrl?: string
}

interface ChatSessionDB extends DBSchema {
    sessions: {
        key: string
        value: ChatSession
        indexes: { "by-updated": number }
    }
}

// Database singleton
let dbPromise: Promise<IDBPDatabase<ChatSessionDB>> | null = null

async function getDB(): Promise<IDBPDatabase<ChatSessionDB>> {
    if (!dbPromise) {
        // A failed or lost connection is not cached: the next call reopens it
        dbPromise = openDB<ChatSessionDB>(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion) {
                if (oldVersion < 1) {
                    const store = db.createObjectStore(STORE_NAME, {
                        keyPath: "id",
                    })
                    store.createIndex("by-updated", "updatedAt")
                }
            },
            blocked() {
                // An older tab keeps the DB open, so the upgrade has to wait
                toast.warning(
                    "Please close other tabs of this app to finish updating chat storage.",
                    { id: "idb-upgrade-blocked", duration: 10000 },
                )
            },
            blocking(_currentVersion, _blockedVersion, event) {
                // Another tab needs to upgrade the DB: close our connection so
                // it is not stuck, and reopen on the next call
                const db = event.target as IDBDatabase
                db.close()
                dbPromise = null
            },
            terminated() {
                // The browser closed the connection (e.g. Safari after a long
                // time in the background)
                dbPromise = null
            },
        }).catch((error) => {
            dbPromise = null
            throw error
        })
    }
    return dbPromise
}

// Check if IndexedDB is available
export function isIndexedDBAvailable(): boolean {
    if (typeof window === "undefined") return false
    try {
        return "indexedDB" in window && window.indexedDB !== null
    } catch {
        return false
    }
}

// CRUD Operations
export async function getAllSessionMetadata(): Promise<SessionMetadata[]> {
    if (!isIndexedDBAvailable()) return []
    try {
        const db = await getDB()
        const tx = db.transaction(STORE_NAME, "readonly")
        const index = tx.store.index("by-updated")
        const metadata: SessionMetadata[] = []

        // Use cursor to read only metadata fields (avoids loading full messages/XML)
        let cursor = await index.openCursor(null, "prev") // newest first
        while (cursor) {
            const s = cursor.value
            metadata.push({
                id: s.id,
                title: s.title,
                createdAt: s.createdAt,
                updatedAt: s.updatedAt,
                messageCount: s.messages.length,
                hasDiagram: !!s.diagramXml && s.diagramXml.trim().length > 0,
                thumbnailDataUrl: s.thumbnailDataUrl,
            })
            cursor = await cursor.continue()
        }
        return metadata
    } catch (error) {
        console.error("Failed to get session metadata:", error)
        return []
    }
}

export async function getSession(id: string): Promise<ChatSession | null> {
    if (!isIndexedDBAvailable()) return null
    try {
        const db = await getDB()
        return (await db.get(STORE_NAME, id)) || null
    } catch (error) {
        console.error("Failed to get session:", error)
        return null
    }
}

// Returns false on failure (e.g. storage quota exceeded). Other sessions are
// never deleted automatically; the caller tells the user instead.
export async function saveSession(session: ChatSession): Promise<boolean> {
    if (!isIndexedDBAvailable()) return false
    try {
        const db = await getDB()
        await db.put(STORE_NAME, session)
        // The desktop app opens this port (this origin's chats) next launch
        window.electronAPI?.chatSaved?.().catch(() => {})
        return true
    } catch (error) {
        console.error("Failed to save session:", error)
        // Reopen the connection next time in case it was lost (Safari reports
        // "Connection to Indexed Database server lost" without closing it)
        dbPromise = null
        return false
    }
}

export async function deleteSession(id: string): Promise<void> {
    if (!isIndexedDBAvailable()) return
    try {
        const db = await getDB()
        await db.delete(STORE_NAME, id)
    } catch (error) {
        console.error("Failed to delete session:", error)
    }
}

export async function getSessionCount(): Promise<number> {
    return (await readSessionCount()) ?? 0
}

/** The number of saved chats, or null when it could not be read */
export async function readSessionCount(): Promise<number | null> {
    if (!isIndexedDBAvailable()) return null
    try {
        const db = await getDB()
        return await db.count(STORE_NAME)
    } catch (error) {
        console.error("Failed to get session count:", error)
        return null
    }
}

// keepId: a chat being opened, which stays
export async function deleteOldestSession(keepId?: string): Promise<void> {
    if (!isIndexedDBAvailable()) return
    try {
        const db = await getDB()
        const tx = db.transaction(STORE_NAME, "readwrite")
        const index = tx.store.index("by-updated")
        let cursor = await index.openCursor()
        while (cursor && cursor.value.id === keepId) {
            cursor = await cursor.continue()
        }
        if (cursor) {
            await cursor.delete()
        }
        await tx.done
    } catch (error) {
        console.error("Failed to delete oldest session:", error)
    }
}

// Enforce max sessions limit. keep: the chat being opened, asked for right
// before each deletion (it can be clicked while the count is read)
export async function enforceSessionLimit(
    keep?: () => string | undefined,
): Promise<void> {
    const count = await getSessionCount()
    if (count > MAX_SESSIONS) {
        const toDelete = count - MAX_SESSIONS
        for (let i = 0; i < toDelete; i++) {
            await deleteOldestSession(keep?.())
        }
    }
}

export async function renameSession(
    id: string,
    title: string,
): Promise<ChatSession | null> {
    const session = await getSession(id)
    if (!session) return null
    const updated = { ...session, title, updatedAt: Date.now() }
    return (await saveSession(updated)) ? updated : null
}

// Helper: Create a new empty session
export function createEmptySession(): ChatSession {
    return {
        id: nanoid(),
        title: "New Chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        xmlSnapshots: [],
        diagramXml: "",
    }
}

// Helper: Extract title from first user message (truncated to reasonable length)
const MAX_TITLE_LENGTH = 100

// The [PDF: ...], [File: ...] and [URL: ...] sections the chat appends to
// the typed text
const APPENDED_SECTIONS = /\n\n\[(PDF|File|URL):\s*[^\]]+\]\n[\s\S]*$/

export function extractTitle(messages: StoredMessage[]): string {
    const firstUserMessage = messages.find((m) => m.role === "user")
    if (!firstUserMessage) return "New Chat"

    const textPart = firstUserMessage.parts.find((p) => p.type === "text")
    if (!textPart || typeof textPart.text !== "string") return "New Chat"

    // The typed text only, on one line
    const text = textPart.text
        .replace(APPENDED_SECTIONS, "")
        .replace(/\s+/g, " ")
        .trim()
    if (!text) return "New Chat"

    // Truncate long titles
    if (text.length > MAX_TITLE_LENGTH) {
        return text.slice(0, MAX_TITLE_LENGTH).trim() + "..."
    }
    return text
}

// Helper: Sanitize UIMessage to StoredMessage
export function sanitizeMessage(message: unknown): StoredMessage | null {
    if (!message || typeof message !== "object") return null

    const msg = message as Record<string, unknown>
    if (!msg.id || !msg.role) return null

    const role = msg.role as string
    if (!["user", "assistant", "system"].includes(role)) return null

    let parts: Array<{ type: string; [key: string]: unknown }> = []
    if (Array.isArray(msg.parts)) {
        parts = msg.parts.map((part: unknown) =>
            part && typeof part === "object"
                ? (part as { type: string; [key: string]: unknown })
                : { type: "unknown" },
        )
    }

    return {
        id: msg.id as string,
        role: role as "user" | "assistant" | "system",
        parts,
        ...(msg.metadata !== undefined && { metadata: msg.metadata }),
    }
}

export function sanitizeMessages(messages: unknown[]): StoredMessage[] {
    return messages
        .map(sanitizeMessage)
        .filter((m): m is StoredMessage => m !== null)
}
