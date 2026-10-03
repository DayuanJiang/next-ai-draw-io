/**
 * Simple diagram history - matches Next.js app pattern
 * Stores {xml, svg} entries in a circular buffer
 */

import { log } from "./logger.js"

const MAX_HISTORY = 20

interface HistoryEntry {
    id: number // Stable across shifts of the circular buffer
    xml: string
    svg: string
}

let nextEntryId = 0
const historyStore = new Map<string, HistoryEntry[]>()

export function addHistory(sessionId: string, xml: string, svg = ""): number {
    let history = historyStore.get(sessionId)
    if (!history) {
        history = []
        historyStore.set(sessionId, history)
    }

    // Dedupe: skip if same as last entry
    const last = history[history.length - 1]
    if (last?.xml === xml) {
        return history.length - 1
    }

    history.push({ id: nextEntryId++, xml, svg })

    // Circular buffer
    if (history.length > MAX_HISTORY) {
        history.shift()
    }

    log.debug(`History: session=${sessionId}, entries=${history.length}`)
    return history.length - 1
}

export function getHistory(sessionId: string): HistoryEntry[] {
    return historyStore.get(sessionId) || []
}

/** Look up an entry by its id; the array index shifts as old entries drop. */
export function getHistoryEntry(
    sessionId: string,
    id: number,
): HistoryEntry | undefined {
    return historyStore.get(sessionId)?.find((entry) => entry.id === id)
}

export function clearHistory(sessionId: string): void {
    historyStore.delete(sessionId)
}

export function updateLastHistorySvg(sessionId: string, svg: string): boolean {
    const history = historyStore.get(sessionId)
    if (!history || history.length === 0) return false
    const last = history[history.length - 1]
    if (!last.svg) {
        last.svg = svg
        return true
    }
    return false
}
