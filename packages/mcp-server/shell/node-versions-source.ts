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
    /** The History entry to restore (the first copy's) */
    entryId: number
    /** Who made it: "user", "recover", "restore"; null for the AI */
    source: string | null
}

// The blank page a tab shows before any drawing: the server keeps it in
// History when the first write replaces it, but it is no version to show
// or go back to (the server's restore leaves it out by the same rule)
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

interface Change {
    pageId?: string
    summary: ChangeSummary
    fromScratch: boolean
}

/**
 * The version cards for a History list: entries folded by content, in the
 * order of their first copy, numbered as they first appeared in this tab
 * (numbers is kept between calls), each with what changed since the one
 * before. The thumbnail is the first copy's that has one; the newest
 * version on the canvas waits for its picture (the sync sends it), older
 * ones without any show none. The blank page is no version.
 */
export function buildVersions(
    list: HistoryList,
    numbers: Map<number, number>,
    changes: Map<number, Change>,
): { versions: NodeVersion[]; onCanvasId: string | null } {
    const groups = new Map<number, HistoryEntryInfo[]>()
    for (const entry of list.entries) {
        const copies = groups.get(entry.firstId)
        if (copies) copies.push(entry)
        else groups.set(entry.firstId, [entry])
    }
    const current = list.entries.find((e) => e.id === list.currentId)
    const onCanvasId = current ? String(current.firstId) : null
    const versions: NodeVersion[] = []
    let previous: HistoryEntryInfo | null = null
    for (const [firstId, copies] of groups) {
        const first = copies[0]
        if (isBlankPage(first.xml)) {
            previous = first
            continue
        }
        let number = numbers.get(firstId)
        if (number === undefined) {
            number = Math.max(0, ...numbers.values()) + 1
            numbers.set(firstId, number)
        }
        let change = changes.get(firstId)
        if (!change) {
            const beforeXml = previous?.xml ?? ""
            const pageId = changedPage(beforeXml, first.xml)
            const { summary, fromScratch } = diffDiagrams(
                beforeXml,
                first.xml,
                pageId,
            )
            change = { pageId, summary, fromScratch }
            changes.set(firstId, change)
        }
        const svg = copies.find((c) => c.svg)?.svg
        versions.push({
            id: String(firstId),
            entryId: firstId,
            number,
            xml: first.xml,
            beforeXml: previous?.xml ?? "",
            ...(change.pageId && { pageId: change.pageId }),
            summary: change.summary,
            fromScratch: change.fromScratch,
            svg: svg || "",
            source: first.source,
        })
        previous = first
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
 * it. Undo and redo of the newest version restore the one before it, or it
 * again; the server keeps the state they leave as an entry of its own, so
 * hand edits are never lost.
 */
export function useNodeVersions(sync: McpSync | null): NodeVersionsSource {
    const dict = useDictionary()
    const [list, setList] = useState<HistoryList | null>(null)
    const [busy, setBusy] = useState(false)
    // Stable across refreshes: an entry's number and change never move
    const numbersRef = useRef(new Map<number, number>())
    const changesRef = useRef(new Map<number, Change>())
    // Reads overlap when changes come fast; only the latest one counts
    const readSeqRef = useRef(0)

    const refresh = useCallback(async () => {
        if (!sync) return
        const seq = ++readSeqRef.current
        const next = await sync.fetchHistory()
        if (next && seq === readSeqRef.current) setList(next)
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
    const previous = versions.at(-2)
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
