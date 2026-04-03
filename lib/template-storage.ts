import { type DBSchema, type IDBPDatabase, openDB } from "idb"
import { nanoid } from "nanoid"

// Constants
const DB_NAME = "next-ai-drawio-templates"
const DB_VERSION = 1
const STORE_NAME = "templates"

// Types
export interface Template {
    id: string
    title: string
    prompt: string
    description?: string
    createdAt: number
    updatedAt: number
    clickCount: number
    runCount: number
    lastUsedAt: number
    pinned: boolean
}

export type TemplateCreateInput = Pick<Template, "prompt"> &
    Partial<
        Omit<
            Template,
            | "id"
            | "createdAt"
            | "updatedAt"
            | "clickCount"
            | "runCount"
            | "lastUsedAt"
        >
    >

interface TemplateDB extends DBSchema {
    templates: {
        key: string
        value: Template
        indexes: {
            "by-updated": number
            "by-pinned": number
            "by-run-count": number
            "by-last-used": number
        }
    }
}

// Default title: first 20 chars of trimmed prompt, with ellipsis if truncated
const DEFAULT_TITLE_MAX_LENGTH = 20

export function generateDefaultTitle(prompt: string): string {
    const trimmed = prompt.trim()
    if (trimmed.length <= DEFAULT_TITLE_MAX_LENGTH) return trimmed
    return trimmed.slice(0, DEFAULT_TITLE_MAX_LENGTH).trim() + "..."
}

// Database singleton
let dbPromise: Promise<IDBPDatabase<TemplateDB>> | null = null
const resetDBPromise = () => {
    dbPromise = null
}

const isClosingError = (error: unknown): boolean => {
    return (
        error instanceof DOMException &&
        error.name === "InvalidStateError" &&
        /closing/i.test(error.message)
    )
}

const withDB = async <T>(
    action: (db: IDBPDatabase<TemplateDB>) => Promise<T>,
): Promise<T> => {
    try {
        const db = await getDB()
        return await action(db)
    } catch (error) {
        if (isClosingError(error)) {
            resetDBPromise()
            const db = await getDB()
            return await action(db)
        }
        throw error
    }
}

async function getDB(): Promise<IDBPDatabase<TemplateDB>> {
    if (!dbPromise) {
        dbPromise = openDB<TemplateDB>(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion) {
                if (oldVersion < 1) {
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        const templateStore = db.createObjectStore(STORE_NAME, {
                            keyPath: "id",
                        })
                        templateStore.createIndex("by-updated", "updatedAt")
                        templateStore.createIndex("by-pinned", "pinned")
                        templateStore.createIndex("by-run-count", "runCount")
                        templateStore.createIndex("by-last-used", "lastUsedAt")
                    }
                }
            },
            terminated() {
                resetDBPromise()
            },
        })
        dbPromise
            .then((db) => {
                db.onversionchange = () => {
                    db.close()
                    resetDBPromise()
                }
                db.onclose = () => {
                    resetDBPromise()
                }
            })
            .catch(() => {
                resetDBPromise()
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

export async function getAllTemplates(): Promise<Template[]> {
    if (!isIndexedDBAvailable()) return []
    try {
        return await withDB(async (db) => {
            const templates = await db.getAll(STORE_NAME)
            return sortTemplates(templates)
        })
    } catch (error) {
        console.error("Failed to get templates:", error)
        return []
    }
}

export async function getTemplate(id: string): Promise<Template | null> {
    if (!isIndexedDBAvailable()) return null
    try {
        return await withDB(async (db) => {
            return (await db.get(STORE_NAME, id)) || null
        })
    } catch (error) {
        console.error("Failed to get template:", error)
        return null
    }
}

export async function createTemplate(
    input: TemplateCreateInput,
): Promise<Template | null> {
    if (!isIndexedDBAvailable()) return null

    const prompt = input.prompt.trim()
    if (!prompt) return null

    const now = Date.now()
    const template: Template = {
        id: nanoid(),
        title: input.title?.trim() || generateDefaultTitle(prompt),
        prompt,
        description: input.description?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        clickCount: 0,
        runCount: 0,
        lastUsedAt: 0,
        pinned: input.pinned ?? false,
    }

    try {
        await withDB(async (db) => {
            await db.put(STORE_NAME, template)
        })
        return template
    } catch (error) {
        console.error("Failed to create template:", error)
        return null
    }
}

export async function updateTemplate(
    id: string,
    updates: Partial<Omit<Template, "id" | "createdAt">>,
): Promise<Template | null> {
    if (!isIndexedDBAvailable()) return null
    try {
        return await withDB(async (db) => {
            const existing = await db.get(STORE_NAME, id)
            if (!existing) return null

            const updated: Template = {
                ...existing,
                ...updates,
                id: existing.id,
                createdAt: existing.createdAt,
                updatedAt: Date.now(),
            }
            await db.put(STORE_NAME, updated)
            return updated
        })
    } catch (error) {
        console.error("Failed to update template:", error)
        return null
    }
}

export async function deleteTemplate(id: string): Promise<boolean> {
    if (!isIndexedDBAvailable()) return false
    try {
        await withDB(async (db) => {
            await db.delete(STORE_NAME, id)
        })
        return true
    } catch (error) {
        console.error("Failed to delete template:", error)
        return false
    }
}

export async function duplicateTemplate(
    id: string,
    copySuffix = "(copy)",
): Promise<Template | null> {
    if (!isIndexedDBAvailable()) return null
    try {
        return await withDB(async (db) => {
            const existing = await db.get(STORE_NAME, id)
            if (!existing) return null

            const now = Date.now()
            const duplicate: Template = {
                ...existing,
                id: nanoid(),
                title: `${existing.title} ${copySuffix}`,
                createdAt: now,
                updatedAt: now,
                clickCount: 0,
                runCount: 0,
                lastUsedAt: 0,
                pinned: false,
            }
            await db.put(STORE_NAME, duplicate)
            return duplicate
        })
    } catch (error) {
        console.error("Failed to duplicate template:", error)
        return null
    }
}

// Usage tracking

export async function incrementClickCount(id: string): Promise<void> {
    if (!isIndexedDBAvailable()) return
    try {
        await withDB(async (db) => {
            const template = await db.get(STORE_NAME, id)
            if (!template) return
            template.clickCount += 1
            template.updatedAt = Date.now()
            await db.put(STORE_NAME, template)
        })
    } catch (error) {
        console.error("Failed to increment click count:", error)
    }
}

export async function incrementRunCount(id: string): Promise<void> {
    if (!isIndexedDBAvailable()) return
    try {
        await withDB(async (db) => {
            const template = await db.get(STORE_NAME, id)
            if (!template) return
            const now = Date.now()
            template.runCount += 1
            template.lastUsedAt = now
            template.updatedAt = now
            await db.put(STORE_NAME, template)
        })
    } catch (error) {
        console.error("Failed to increment run count:", error)
    }
}

// Search

export function searchTemplates(
    templates: Template[],
    query: string,
): Template[] {
    if (!query.trim()) return templates
    const lowerQuery = query.toLowerCase()
    return templates.filter((t) => {
        const titleMatch = t.title.toLowerCase().includes(lowerQuery)
        const descMatch =
            t.description?.toLowerCase().includes(lowerQuery) ?? false
        return titleMatch || descMatch
    })
}

// Sorting

export function sortTemplates(templates: Template[]): Template[] {
    return [...templates].sort((a, b) => {
        // pinned desc
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        // runCount desc
        if (a.runCount !== b.runCount) return b.runCount - a.runCount
        // lastUsedAt desc
        if (a.lastUsedAt !== b.lastUsedAt) return b.lastUsedAt - a.lastUsedAt
        // updatedAt desc
        return b.updatedAt - a.updatedAt
    })
}

// Import / Export

export const TEMPLATE_EXPORT_SCHEMA_VERSION = 1

export interface TemplateExportData {
    schemaVersion: number
    exportedAt: number
    templates: Template[]
}

export function exportTemplates(templates: Template[]): TemplateExportData {
    return {
        schemaVersion: TEMPLATE_EXPORT_SCHEMA_VERSION,
        exportedAt: Date.now(),
        templates,
    }
}

export function validateImportData(data: unknown): {
    valid: boolean
    error?: string
} {
    if (!data || typeof data !== "object") {
        return { valid: false, error: "Invalid data: expected an object" }
    }

    const obj = data as Record<string, unknown>

    if (typeof obj.schemaVersion !== "number") {
        return { valid: false, error: "Missing or invalid schemaVersion" }
    }

    if (!Array.isArray(obj.templates)) {
        return { valid: false, error: "Missing or invalid templates array" }
    }

    for (let i = 0; i < obj.templates.length; i++) {
        const t = obj.templates[i]
        if (!t || typeof t !== "object") {
            return {
                valid: false,
                error: `Template at index ${i} is not an object`,
            }
        }
        const template = t as Record<string, unknown>
        if (typeof template.prompt !== "string" || !template.prompt.trim()) {
            return {
                valid: false,
                error: `Template at index ${i} has missing or empty prompt`,
            }
        }
        if (typeof template.title !== "string" || !template.title.trim()) {
            return {
                valid: false,
                error: `Template at index ${i} has missing or empty title`,
            }
        }
    }

    return { valid: true }
}

export async function importTemplates(
    templates: Template[],
    existingTemplates: Template[],
): Promise<{ imported: number; skipped: number }> {
    let imported = 0
    let skipped = 0

    const existingKeys = new Set(
        existingTemplates.map((t) => `${t.title}|||${t.prompt}`),
    )

    for (const t of templates) {
        const key = `${t.title}|||${t.prompt}`
        if (existingKeys.has(key)) {
            skipped++
            continue
        }

        const now = Date.now()
        const newTemplate: Template = {
            id: nanoid(),
            title:
                String(t.title || "").trim() ||
                generateDefaultTitle(String(t.prompt || "")),
            prompt: String(t.prompt || "").trim(),
            description: t.description ? String(t.description) : undefined,
            createdAt: typeof t.createdAt === "number" ? t.createdAt : now,
            updatedAt: now,
            clickCount: typeof t.clickCount === "number" ? t.clickCount : 0,
            runCount: typeof t.runCount === "number" ? t.runCount : 0,
            lastUsedAt: typeof t.lastUsedAt === "number" ? t.lastUsedAt : 0,
            pinned: typeof t.pinned === "boolean" ? t.pinned : false,
        }
        try {
            await withDB(async (db) => {
                await db.put(STORE_NAME, newTemplate)
            })
            existingKeys.add(key)
            imported++
        } catch (error) {
            console.error("Failed to import template:", error)
        }
    }

    return { imported, skipped }
}
