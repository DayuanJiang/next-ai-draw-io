import { type DBSchema, type IDBPDatabase, openDB } from "idb"
import { nanoid } from "nanoid"
import { isIndexedDBAvailable } from "./session-storage"

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
    runCount: number
    lastUsedAt: number
    pinned: boolean
}

export type TemplateCreateInput = Pick<Template, "prompt"> &
    Partial<
        Omit<
            Template,
            "id" | "createdAt" | "updatedAt" | "runCount" | "lastUsedAt"
        >
    >

interface TemplateDB extends DBSchema {
    templates: {
        key: string
        value: Template
    }
}

// Default title: the start of the trimmed prompt, with ellipsis if truncated.
// Long enough to tell apart prompts that begin alike ("Draw an AWS
// architecture for..."); the list cuts off what does not fit its row
const DEFAULT_TITLE_MAX_LENGTH = 60

export function generateDefaultTitle(prompt: string): string {
    const trimmed = prompt.trim()
    if (trimmed.length <= DEFAULT_TITLE_MAX_LENGTH) return trimmed
    return trimmed.slice(0, DEFAULT_TITLE_MAX_LENGTH).trim() + "..."
}

// Database singleton
let dbPromise: Promise<IDBPDatabase<TemplateDB>> | null = null

// Every failed call below drops the cached connection, so the next call opens
// a new one: Safari can lose the connection of a page left in the background
// ("Connection to Indexed Database server lost") and each request then fails
async function getDB(): Promise<IDBPDatabase<TemplateDB>> {
    if (!dbPromise) {
        dbPromise = openDB<TemplateDB>(DB_NAME, DB_VERSION, {
            upgrade(db, oldVersion) {
                if (oldVersion < 1) {
                    db.createObjectStore(STORE_NAME, { keyPath: "id" })
                }
            },
        })
    }
    return dbPromise
}

// CRUD Operations

export async function getAllTemplates(): Promise<Template[]> {
    if (!isIndexedDBAvailable()) return []
    try {
        const db = await getDB()
        const templates = await db.getAll(STORE_NAME)
        return sortTemplates(templates)
    } catch (error) {
        console.error("Failed to get templates:", error)
        dbPromise = null
        return []
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
        runCount: 0,
        lastUsedAt: 0,
        pinned: input.pinned ?? false,
    }

    try {
        const db = await getDB()
        await db.put(STORE_NAME, template)
        return template
    } catch (error) {
        console.error("Failed to create template:", error)
        dbPromise = null
        return null
    }
}

export async function updateTemplate(
    id: string,
    updates: Partial<Omit<Template, "id" | "createdAt">>,
): Promise<Template | null> {
    if (!isIndexedDBAvailable()) return null
    try {
        const db = await getDB()
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
    } catch (error) {
        console.error("Failed to update template:", error)
        dbPromise = null
        return null
    }
}

export async function deleteTemplate(id: string): Promise<boolean> {
    if (!isIndexedDBAvailable()) return false
    try {
        const db = await getDB()
        await db.delete(STORE_NAME, id)
        return true
    } catch (error) {
        console.error("Failed to delete template:", error)
        dbPromise = null
        return false
    }
}

export async function duplicateTemplate(
    id: string,
    copySuffix = "(copy)",
): Promise<Template | null> {
    if (!isIndexedDBAvailable()) return null
    try {
        const db = await getDB()
        const existing = await db.get(STORE_NAME, id)
        if (!existing) return null

        const now = Date.now()
        const duplicate: Template = {
            ...existing,
            id: nanoid(),
            title: `${existing.title} ${copySuffix}`,
            createdAt: now,
            updatedAt: now,
            runCount: 0,
            lastUsedAt: 0,
            pinned: false,
        }
        await db.put(STORE_NAME, duplicate)
        return duplicate
    } catch (error) {
        console.error("Failed to duplicate template:", error)
        dbPromise = null
        return null
    }
}

// Usage tracking

export async function incrementRunCount(id: string): Promise<void> {
    if (!isIndexedDBAvailable()) return
    try {
        const db = await getDB()
        const template = await db.get(STORE_NAME, id)
        if (!template) return
        const now = Date.now()
        template.runCount += 1
        template.lastUsedAt = now
        template.updatedAt = now
        await db.put(STORE_NAME, template)
    } catch (error) {
        console.error("Failed to increment run count:", error)
        dbPromise = null
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
        // What the user remembers may be a word in the middle of the prompt
        const promptMatch = t.prompt.toLowerCase().includes(lowerQuery)
        return titleMatch || descMatch || promptMatch
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
            title: t.title.trim(),
            prompt: t.prompt.trim(),
            description: t.description ? String(t.description) : undefined,
            createdAt: typeof t.createdAt === "number" ? t.createdAt : now,
            updatedAt: now,
            runCount: typeof t.runCount === "number" ? t.runCount : 0,
            lastUsedAt: typeof t.lastUsedAt === "number" ? t.lastUsedAt : 0,
            pinned: typeof t.pinned === "boolean" ? t.pinned : false,
        }
        try {
            const db = await getDB()
            await db.put(STORE_NAME, newTemplate)
            existingKeys.add(key)
            imported++
        } catch (error) {
            console.error("Failed to import template:", error)
            dbPromise = null
        }
    }

    return { imported, skipped }
}
