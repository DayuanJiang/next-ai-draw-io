/**
 * Simple diagram history - matches Next.js app pattern
 * Stores {xml, svg} entries in a circular buffer
 */

import { contentFingerprint } from "./edit-gate.ts"
import { log } from "./logger.ts"
import { isMxGraphModel } from "./pages.ts"

const MAX_HISTORY = 20

/**
 * Who made an entry's diagram: an edit in the browser ("user"), a tab's
 * copy kept when the server recovered the session ("recover"), a restored
 * copy of an older entry ("restore"), a file opened with load_diagram
 * ("load"), a page added with add_page ("add_page"). The AI's other writes
 * and entries loaded from an older saved file carry none.
 */
export type HistorySource = "user" | "recover" | "restore" | "load" | "add_page"

export interface HistoryEntry {
    id: number // Stable across shifts of the circular buffer
    xml: string
    svg: string
    source?: HistorySource
}

let nextEntryId = 0
const historyStore = new Map<string, HistoryEntry[]>()

export function addHistory(
    sessionId: string,
    xml: string,
    svg = "",
    source?: HistorySource,
): number {
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

    history.push({
        id: nextEntryId++,
        xml,
        svg,
        ...(source && { source }),
    })

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
        const version = entryVersion(history[i])
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
        sameVersion(version, entryVersion(entry)),
    )
}

/**
 * The entry the canvas shows: the newest one with the content of xml (the
 * rule of otherVersions), or null when the canvas is in none of them
 */
export function currentEntryId(sessionId: string, xml: string): number | null {
    const version = versionOf(xml)
    const history = getHistory(sessionId)
    for (let i = history.length - 1; i >= 0; i--) {
        if (sameVersion(version, entryVersion(history[i]))) {
            return history[i].id
        }
    }
    return null
}

/**
 * For every entry, the id of the oldest entry with the same content (its
 * own when no earlier one has it). A restore adds a copy of an older entry;
 * the shell shows one version per content, where its first copy is, and
 * restores the newest copy (as restore_version picks it). An entry is
 * compared with the first of each group, never with later copies: a bare
 * model matches any page name, so "same" is not transitive, and every
 * entry must name a first copy that has its content.
 */
export function firstCopyIds(sessionId: string): Map<number, number> {
    const result = new Map<number, number>()
    const firsts: { version: Version; id: number }[] = []
    for (const entry of getHistory(sessionId)) {
        const version = entryVersion(entry)
        let first = firsts.find((f) => sameVersion(f.version, version))
        if (!first) {
            first = { version, id: entry.id }
            firsts.push(first)
        }
        result.set(entry.id, first.id)
    }
    return result
}

interface Version {
    bare: boolean
    named: string
    cells: string
}

/** A diagram's fingerprints, with and without its page names */
function versionOf(xml: string): Version {
    return {
        bare: isMxGraphModel(xml),
        named: contentFingerprint(xml),
        cells: contentFingerprint(xml, false),
    }
}

// An entry's XML never changes: its fingerprints are computed once
const entryVersions = new WeakMap<HistoryEntry, Version>()
function entryVersion(entry: HistoryEntry): Version {
    let version = entryVersions.get(entry)
    if (!version) {
        version = versionOf(entry.xml)
        entryVersions.set(entry, version)
    }
    return version
}

// Same rule as checkEditGate: a bare <mxGraphModel> (the browser's sync
// can send one) has no page name, so names count only when both have them
function sameVersion(a: Version, b: Version): boolean {
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
