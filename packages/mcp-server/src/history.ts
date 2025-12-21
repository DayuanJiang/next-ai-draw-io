/**
 * Diagram Version History for MCP Server
 *
 * Stores diagram versions in-memory per session.
 * Enables users and AI to restore previous diagram states.
 */

import { log } from "./logger.js"

export interface HistoryEntry {
    version: number
    xml: string
    svg: string // SVG data for thumbnail preview
    source: "ai" | "human"
    tool?: string // Which tool made the change (display_diagram, edit_diagram, browser_sync)
    timestamp: Date
    description?: string
}

interface SessionHistory {
    entries: HistoryEntry[]
    nextVersion: number
}

// In-memory history store keyed by session ID
const historyStore = new Map<string, SessionHistory>()

// Configuration
const MAX_HISTORY_ENTRIES = 50

/**
 * Add a new entry to session history
 * Returns the assigned version number
 */
export function addHistoryEntry(
    sessionId: string,
    entry: Omit<HistoryEntry, "version">,
): number {
    let history = historyStore.get(sessionId)
    if (!history) {
        history = { entries: [], nextVersion: 1 }
        historyStore.set(sessionId, history)
    }

    // Deduplicate: skip if XML is identical to last entry
    const lastEntry = history.entries[history.entries.length - 1]
    if (lastEntry && lastEntry.xml === entry.xml) {
        log.debug(`Skipping duplicate history entry for session ${sessionId}`)
        return lastEntry.version
    }

    const version = history.nextVersion++
    const newEntry: HistoryEntry = {
        ...entry,
        version,
    }

    history.entries.push(newEntry)

    // Prune oldest entries if over limit (circular buffer)
    if (history.entries.length > MAX_HISTORY_ENTRIES) {
        const removed = history.entries.shift()
        log.debug(`Pruned oldest history entry v${removed?.version}`)
    }

    log.info(
        `Added history v${version} for session ${sessionId} (source: ${entry.source}, entries: ${history.entries.length})`,
    )

    return version
}

/**
 * Get history entries for a session
 * Returns newest first, limited to specified count
 */
export function getHistory(
    sessionId: string,
    limit: number = 20,
): HistoryEntry[] {
    const history = historyStore.get(sessionId)
    if (!history) {
        return []
    }

    // Return newest first
    return [...history.entries].reverse().slice(0, limit)
}

/**
 * Get a specific version from history
 */
export function getVersion(
    sessionId: string,
    version: number,
): HistoryEntry | undefined {
    const history = historyStore.get(sessionId)
    if (!history) {
        return undefined
    }

    return history.entries.find((e) => e.version === version)
}

/**
 * Get the latest version number for a session
 */
export function getLatestVersion(sessionId: string): number {
    const history = historyStore.get(sessionId)
    if (!history || history.entries.length === 0) {
        return 0
    }
    return history.entries[history.entries.length - 1].version
}

/**
 * Clear history for a session (used on session expiry)
 */
export function clearHistory(sessionId: string): void {
    if (historyStore.has(sessionId)) {
        historyStore.delete(sessionId)
        log.info(`Cleared history for session ${sessionId}`)
    }
}

/**
 * Update the SVG of the latest entry (or specific version) that has empty SVG
 * Used when browser generates SVG after loading AI diagram
 */
export function updateLatestEntrySvg(
    sessionId: string,
    svg: string,
    targetVersion?: number,
): boolean {
    const history = historyStore.get(sessionId)
    if (!history || history.entries.length === 0) {
        return false
    }

    // Find entry to update - either specific version or latest without SVG
    let entry: HistoryEntry | undefined
    if (targetVersion !== undefined) {
        entry = history.entries.find((e) => e.version === targetVersion)
    } else {
        // Find most recent entry without SVG
        for (let i = history.entries.length - 1; i >= 0; i--) {
            if (!history.entries[i].svg) {
                entry = history.entries[i]
                break
            }
        }
    }

    if (entry && !entry.svg) {
        entry.svg = svg
        log.debug(`Updated SVG for history v${entry.version}`)
        return true
    }

    return false
}

/**
 * Get count of history entries for a session
 */
export function getHistoryCount(sessionId: string): number {
    const history = historyStore.get(sessionId)
    return history?.entries.length || 0
}
