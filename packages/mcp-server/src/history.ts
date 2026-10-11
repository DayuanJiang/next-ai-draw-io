/**
 * Simple diagram history - matches Next.js app pattern
 * Stores {xml, svg} entries in a circular buffer
 */

import { contentFingerprint } from "./edit-gate.ts"
import { log } from "./logger.ts"
import { isMxGraphModel } from "./pages.ts"

const MAX_HISTORY = 20

export interface HistoryEntry {
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

    // Dedupe: skip if same as last entry (any other change, also of page
    // settings only, is a new version; keepInHistory leaves out draw.io's
    // copy of a server write)
    const last = history[history.length - 1]
    if (last && last.xml === xml) {
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
 * The versions the diagram can go back (or forward) to: every entry whose
 * content differs from currentXml, newest first, one entry per distinct
 * content (its newest copy). Re-serialised copies of one diagram count as
 * the same version.
 */
export function otherVersions(
    sessionId: string,
    currentXml: string,
): HistoryEntry[] {
    const kept = [versionOf(currentXml)]
    const result: HistoryEntry[] = []
    const history = getHistory(sessionId)
    for (let i = history.length - 1; i >= 0; i--) {
        const version = versionOf(history[i].xml)
        if (kept.some((seen) => sameVersion(seen, version))) continue
        kept.push(version)
        result.push(history[i])
    }
    return result
}

/** True when History holds a copy of this diagram. */
export function isInHistory(sessionId: string, xml: string): boolean {
    const version = versionOf(xml)
    return getHistory(sessionId).some((entry) =>
        sameVersion(version, versionOf(entry.xml)),
    )
}

/** A diagram's fingerprints, with and without its page names */
function versionOf(xml: string) {
    return {
        bare: isMxGraphModel(xml),
        named: contentFingerprint(xml),
        cells: contentFingerprint(xml, false),
    }
}

// Same rule as checkEditGate: a bare <mxGraphModel> (the browser's sync
// can send one) has no page name, so names count only when both have them
function sameVersion(
    a: ReturnType<typeof versionOf>,
    b: ReturnType<typeof versionOf>,
): boolean {
    return a.bare || b.bare ? a.cells === b.cells : a.named === b.named
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
