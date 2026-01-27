import { type DBSchema, type IDBPDatabase, openDB } from "idb"
import { nanoid } from "nanoid"

// Constants
const DB_NAME = "next-ai-drawio"
const DB_VERSION = 1
const STORE_NAME = "sessions"
const MIGRATION_FLAG = "next-ai-drawio-migrated-to-idb"
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
    diagramHistory?: { svg: string; xml: string }[] // Version history of diagram edits
}

export interface StoredMessage {
    id: string
    role: "user" | "assistant" | "system"
    parts: Array<{ type: string; [key: string]: unknown }>
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
        dbPromise = openDB<ChatSessionDB>(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion) {
                if (oldVersion < 1) {
                    const store = db.createObjectStore(STORE_NAME, {
                        keyPath: "id",
                    })
                    store.createIndex("by-updated", "updatedAt")
                }
                // Future migrations: if (oldVersion < 2) { ... }
            },
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

// Check if IndexedDB is actually usable (not just present).
// Note: Do NOT close the db here - getDB() returns a shared singleton connection
// that other code depends on.
export async function isIndexedDBUsable(): Promise<boolean> {
    if (!isIndexedDBAvailable()) return false
    try {
        await getDB()
        return true
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

export async function saveSession(session: ChatSession): Promise<boolean> {
    if (!isIndexedDBAvailable()) return false
    try {
        const db = await getDB()
        await db.put(STORE_NAME, session)
        return true
    } catch (error) {
        // Handle quota exceeded
        if (
            error instanceof DOMException &&
            error.name === "QuotaExceededError"
        ) {
            console.warn("Storage quota exceeded, deleting oldest session...")
            await deleteOldestSession()
            // Retry once
            try {
                const db = await getDB()
                await db.put(STORE_NAME, session)
                return true
            } catch (retryError) {
                console.error(
                    "Failed to save session after cleanup:",
                    retryError,
                )
                return false
            }
        } else {
            console.error("Failed to save session:", error)
            return false
        }
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
    if (!isIndexedDBAvailable()) return 0
    try {
        const db = await getDB()
        return await db.count(STORE_NAME)
    } catch (error) {
        console.error("Failed to get session count:", error)
        return 0
    }
}

export async function deleteOldestSession(): Promise<void> {
    if (!isIndexedDBAvailable()) return
    try {
        const db = await getDB()
        const tx = db.transaction(STORE_NAME, "readwrite")
        const index = tx.store.index("by-updated")
        const cursor = await index.openCursor()
        if (cursor) {
            await cursor.delete()
        }
        await tx.done
    } catch (error) {
        console.error("Failed to delete oldest session:", error)
    }
}

// Enforce max sessions limit
export async function enforceSessionLimit(): Promise<void> {
    const count = await getSessionCount()
    if (count > MAX_SESSIONS) {
        const toDelete = count - MAX_SESSIONS
        for (let i = 0; i < toDelete; i++) {
            await deleteOldestSession()
        }
    }
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

export function extractTitle(messages: StoredMessage[]): string {
    const firstUserMessage = messages.find((m) => m.role === "user")
    if (!firstUserMessage) return "New Chat"

    const textPart = firstUserMessage.parts.find((p) => p.type === "text")
    if (!textPart || typeof textPart.text !== "string") return "New Chat"

    const text = textPart.text.trim()
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

    // Extract parts, removing streaming state artifacts
    let parts: Array<{ type: string; [key: string]: unknown }> = []
    if (Array.isArray(msg.parts)) {
        parts = msg.parts.map((part: unknown) => {
            if (!part || typeof part !== "object") return { type: "unknown" }
            const p = part as Record<string, unknown>
            // Remove streaming-related fields
            const { isStreaming, streamingState, ...cleanPart } = p
            return cleanPart as { type: string; [key: string]: unknown }
        })
    }

    return {
        id: msg.id as string,
        role: role as "user" | "assistant" | "system",
        parts,
    }
}

export function sanitizeMessages(messages: unknown[]): StoredMessage[] {
    return messages
        .map(sanitizeMessage)
        .filter((m): m is StoredMessage => m !== null)
}

// Migration from localStorage
export async function migrateFromLocalStorage(): Promise<string | null> {
    if (typeof window === "undefined") return null
    if (!isIndexedDBAvailable()) return null

    // Check if already migrated
    if (localStorage.getItem(MIGRATION_FLAG)) return null

    try {
        const savedMessages = localStorage.getItem("next-ai-draw-io-messages")
        const savedSnapshots = localStorage.getItem(
            "next-ai-draw-io-xml-snapshots",
        )
        const savedXml = localStorage.getItem("next-ai-draw-io-diagram-xml")

        let newSessionId: string | null = null
        let migrationSucceeded = false

        if (savedMessages) {
            const messages = JSON.parse(savedMessages)
            if (Array.isArray(messages) && messages.length > 0) {
                const sanitized = sanitizeMessages(messages)
                const session: ChatSession = {
                    id: nanoid(),
                    title: extractTitle(sanitized),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    messages: sanitized,
                    xmlSnapshots: savedSnapshots
                        ? JSON.parse(savedSnapshots)
                        : [],
                    diagramXml: savedXml || "",
                }
                const saved = await saveSession(session)
                if (saved) {
                    // Verify the session was actually written
                    const verified = await getSession(session.id)
                    if (verified) {
                        newSessionId = session.id
                        migrationSucceeded = true
                    }
                }
            } else {
                // Empty array or invalid data - nothing to migrate, mark as success
                migrationSucceeded = true
            }
        } else {
            // No data to migrate - mark as success
            migrationSucceeded = true
        }

        // Only clean up old data if migration succeeded
        if (migrationSucceeded) {
            localStorage.setItem(MIGRATION_FLAG, "true")
            localStorage.removeItem("next-ai-draw-io-messages")
            localStorage.removeItem("next-ai-draw-io-xml-snapshots")
            localStorage.removeItem("next-ai-draw-io-diagram-xml")
        } else {
            console.warn(
                "Migration to IndexedDB failed - keeping localStorage data for retry",
            )
        }

        return newSessionId
    } catch (error) {
        console.error("Migration failed:", error)
        // Don't mark as migrated - allow retry on next load
        return null
    }
}
