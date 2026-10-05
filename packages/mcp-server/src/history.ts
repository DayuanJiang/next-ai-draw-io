/**
 * Simple diagram history - matches Next.js app pattern
 * Stores {xml, svg} entries in a circular buffer
 */

import { contentFingerprint } from "./edit-gate.ts"
import { log } from "./logger.ts"
import { normalizeToMxfile, parseMxfile } from "./pages.ts"

const MAX_HISTORY = 20

interface HistoryEntry {
    id: number // Stable across shifts of the circular buffer
    xml: string
    svg: string
}

let nextEntryId = 0
const historyStore = new Map<string, HistoryEntry[]>()

/** Each page's background colour */
function backgrounds(xml: string): string {
    const doc = parseMxfile(normalizeToMxfile(xml) ?? xml)
    if (!doc) return ""
    return Array.from(doc.querySelectorAll("mxGraphModel"))
        .map((m) => m.getAttribute("background") || "none")
        .join(",")
}

// The same pages, cells and backgrounds. draw.io's own copy of a diagram
// (a sync reply) adds view and page attributes such as dx, grid and the
// page size, which the model's XML leaves out, so those are not compared.
// A document without pages has an empty fingerprint and is compared as
// text only.
function sameDiagram(a: string, b: string): boolean {
    if (a === b) return true
    const fingerprint = contentFingerprint(a)
    return (
        fingerprint !== "" &&
        fingerprint === contentFingerprint(b) &&
        backgrounds(a) === backgrounds(b)
    )
}

export function addHistory(sessionId: string, xml: string, svg = ""): number {
    let history = historyStore.get(sessionId)
    if (!history) {
        history = []
        historyStore.set(sessionId, history)
    }

    // Dedupe: skip if same as last entry, also when only re-serialized
    // (a change of background only is a new version)
    const last = history[history.length - 1]
    if (last && sameDiagram(last.xml, xml)) {
        if (svg && !last.svg) last.svg = svg
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

/**
 * Give the last entry the image the browser took of shownXml, the diagram
 * it just loaded, when that entry is this diagram
 */
export function updateLastHistorySvg(
    sessionId: string,
    svg: string,
    shownXml: string,
): boolean {
    const history = historyStore.get(sessionId)
    if (!history || history.length === 0) return false
    const last = history[history.length - 1]
    if (!last.svg && last.xml === shownXml) {
        last.svg = svg
        return true
    }
    return false
}
