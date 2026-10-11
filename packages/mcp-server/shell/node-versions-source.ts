import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type {
    VersionItem,
    VersionsSource,
} from "@/components/canvas/versions-context"
import { useDictionary } from "@/hooks/use-dictionary"
import { type ChangeSummary, diffDiagrams } from "@/lib/diagram-diff"
import { formatMessage } from "@/lib/i18n/utils"
import { contentFingerprint } from "@/packages/mcp-server/src/edit-gate.ts"
import { BLANK_MXFILE, hasCells } from "@/packages/mcp-server/src/pages.ts"
import { useCanvasStore } from "@/stores/canvas-store"
import type { HistoryEntryInfo, HistoryList, McpSync } from "./mcp-sync-core"

/**
 * A version card of the shell: one per distinct content of the server's
 * History, which keeps every state the diagram went through (a restore
 * adds a copy of an older entry; copies fold into their first entry).
 */
export interface NodeVersion extends VersionItem {
    /** The History entry to restore: the newest copy, as restore_version
     * picks it (a later copy may carry page settings the first lacks) */
    entryId: number
    /** The version this one replaced, when it has a card (undo goes there) */
    beforeId: string | null
    /** Who made it: "user", "recover", "restore"; null for the AI */
    source: string | null
}

// The blank page a tab shows before any drawing: the server keeps it in
// History when the first write replaces it, but it is no version to show.
// A blank page after a drawing is the canvas cleared, a version of its own
// (restore_version offers both; the shell hides only the first)
const BLANK_FINGERPRINT = contentFingerprint(BLANK_MXFILE)
const isBlankPage = (xml: string) =>
    !hasCells(xml) && contentFingerprint(xml) === BLANK_FINGERPRINT

/** The ids of a document's pages; a bare model has one, without an id */
function pageIds(xml: string): (string | undefined)[] {
    const doc = new DOMParser().parseFromString(xml, "text/xml")
    const ids = Array.from(doc.querySelectorAll("diagram")).map(
        (page) => page.getAttribute("id") ?? undefined,
    )
    return ids.length > 0 ? ids : [undefined]
}

/** The page a change was made on: the first page with a change, else none */
function changedPage(beforeXml: string, afterXml: string): string | undefined {
    for (const id of pageIds(afterXml)) {
        const { summary } = diffDiagrams(beforeXml, afterXml, id)
        if (Object.values(summary).some((n) => n > 0)) return id
    }
    return undefined
}

/** What a version changed, kept from its first appearance (see buildVersions) */
interface Change {
    beforeXml: string
    pageId?: string
    summary: ChangeSummary
    fromScratch: boolean
}

/**
 * The version cards for a History list: entries folded by content, in the
 * order of their first copy, numbered as they first appeared in this tab,
 * each with what changed since the state it replaced (the entry right
 * before its first copy; after a restore that is another than the card
 * before). numbers and changes are kept between calls, keyed by content:
 * a version keeps its number and change when its first copy drops out of
 * the server's buffer and a later copy stands in. The thumbnail is the
 * first copy's that has one; the newest version on the canvas waits for
 * its picture (the sync sends it), older ones without any show none.
 */
export function buildVersions(
    list: HistoryList,
    numbers: Map<string, number>,
    changes: Map<string, Change>,
): { versions: NodeVersion[]; onCanvasId: string | null } {
    // The server folds entries by content (firstId). A blank page after a
    // drawing is a clear of the canvas, a version of its own, which the
    // server folds into the blank page the tab started with: blanks are
    // grouped here, a restore's copy of a clear with the newest clear
    const groups = new Map<number, HistoryEntryInfo[]>()
    const keys = new Map<number, number>() // entry id -> its group
    const befores = new Map<number, HistoryEntryInfo>() // group -> entry before it
    const hidden = new Set<number>() // the blank page(s) before any drawing
    let drawn = false
    let lastClear: number | null = null
    list.entries.forEach((entry, i) => {
        let key = entry.firstId
        if (!isBlankPage(entry.xml)) {
            drawn = true
        } else if (drawn) {
            key =
                entry.source === "restore" && lastClear !== null
                    ? lastClear
                    : entry.id
            lastClear = key
        } else {
            hidden.add(key)
        }
        keys.set(entry.id, key)
        const copies = groups.get(key)
        if (copies) copies.push(entry)
        else {
            groups.set(key, [entry])
            if (i > 0) befores.set(key, list.entries[i - 1])
        }
    })
    const onCanvasId =
        list.currentId !== null && keys.has(list.currentId)
            ? String(keys.get(list.currentId))
            : null
    const versions: NodeVersion[] = []
    for (const [key, copies] of groups) {
        if (hidden.has(key)) continue
        const first = copies[0]
        const newest = copies[copies.length - 1]
        const previous = befores.get(key) ?? null
        // Clears have one content: each is its own version
        const contentKey = isBlankPage(first.xml)
            ? `clear:${key}`
            : contentFingerprint(first.xml)
        let number = numbers.get(contentKey)
        if (number === undefined) {
            number = Math.max(0, ...numbers.values()) + 1
            numbers.set(contentKey, number)
        }
        let change = changes.get(contentKey)
        if (!change) {
            const beforeXml = previous?.xml ?? ""
            const pageId = changedPage(beforeXml, first.xml)
            const { summary, fromScratch } = diffDiagrams(
                beforeXml,
                first.xml,
                pageId,
            )
            change = { beforeXml, pageId, summary, fromScratch }
            changes.set(contentKey, change)
        }
        const svg = copies.find((c) => c.svg)?.svg
        const beforeKey = previous ? keys.get(previous.id) : undefined
        versions.push({
            id: String(key),
            entryId: newest.id,
            beforeId:
                beforeKey !== undefined && !hidden.has(beforeKey)
                    ? String(beforeKey)
                    : null,
            number,
            xml: newest.xml,
            beforeXml: change.beforeXml,
            ...(change.pageId && { pageId: change.pageId }),
            summary: change.summary,
            fromScratch: change.fromScratch,
            svg: svg || "",
            source: first.source,
        })
    }
    // The newest version on the canvas waits for its picture
    const latest = versions.at(-1)
    if (latest && !latest.svg && latest.id === onCanvasId) {
        latest.svg = undefined
    }
    return { versions, onCanvasId }
}

/** The versions source with the shell's own version type */
export interface NodeVersionsSource extends Omit<VersionsSource, "versions"> {
    versions: NodeVersion[]
}

/**
 * The canvas components' versions, from the MCP server's History: read
 * again whenever the sync reports a change on the server, restored through
 * it. Undo and redo of the newest version restore the one it replaced, or
 * it again; the server keeps the state they leave as an entry of its own,
 * so hand edits are never lost.
 */
export function useNodeVersions(sync: McpSync | null): NodeVersionsSource {
    const dict = useDictionary()
    const [list, setList] = useState<HistoryList | null>(null)
    const [busy, setBusy] = useState(false)
    // Stable across refreshes: a version's number and change never move
    const numbersRef = useRef(new Map<string, number>())
    const changesRef = useRef(new Map<string, Change>())
    // The server state the cards are of: another one (the session expired,
    // the process restarted) is a History of its own, numbered anew
    const cacheStateIdRef = useRef<string | null>(null)
    // Reads overlap when changes come fast; only the latest one counts
    const readSeqRef = useRef(0)

    const refresh = useCallback(async () => {
        if (!sync) return
        const seq = ++readSeqRef.current
        const next = await sync.fetchHistory()
        if (!next || seq !== readSeqRef.current) return
        if (next.stateId !== cacheStateIdRef.current) {
            numbersRef.current.clear()
            changesRef.current.clear()
            cacheStateIdRef.current = next.stateId
        }
        setList(next)
    }, [sync])

    useEffect(() => {
        if (!sync) return
        refresh()
        return sync.onServerChange(refresh)
    }, [sync, refresh])

    const { versions, onCanvasId } = useMemo(
        () =>
            list
                ? buildVersions(list, numbersRef.current, changesRef.current)
                : { versions: [], onCanvasId: null },
        [list],
    )

    const restore = async (id: string) => {
        if (!sync || !list || busy) return
        const version = versions.find((v) => v.id === id)
        if (!version) return
        setBusy(true)
        // The canvas components wait (SelectionAsk, the cards' buttons)
        useCanvasStore.getState().set({ isBusy: true })
        try {
            const result = await sync.restoreEntry(
                version.entryId,
                list.stateId,
            )
            if (result === "ok") {
                toast.success(
                    formatMessage(dict.versions.restoredVersion, {
                        n: version.number,
                    }),
                    { duration: 4000 },
                )
            }
            // The sync's notices tell about a stale list or a failure; the
            // list on screen is read again either way
            await refresh()
        } finally {
            setBusy(false)
            useCanvasStore.getState().set({ isBusy: false })
        }
    }

    const latest = versions.at(-1)
    // The version the newest one replaced (restore_version's steps_back=1)
    const previous = latest?.beforeId
        ? versions.find((v) => v.id === latest.beforeId)
        : undefined
    const canUndo = !!latest && !!previous && onCanvasId === latest.id
    // The newest change is undone when the canvas is at the version before
    const undoneId =
        latest && previous && onCanvasId === previous.id ? latest.id : null

    return {
        versions,
        onCanvasId,
        undoneId,
        isBusy: busy,
        canUndo,
        canRedo: undoneId !== null,
        restore,
        undo: () => {
            if (canUndo && previous) restore(previous.id)
        },
        redo: () => {
            if (undoneId && latest) restore(latest.id)
        },
    }
}
