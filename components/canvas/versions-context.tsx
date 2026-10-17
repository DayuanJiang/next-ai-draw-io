"use client"

import { createContext, useContext } from "react"
import type { ChangeSummary } from "@/lib/diagram-diff"

/** One saved state of the diagram, as the version card and the compare
 * dialog show it */
export interface VersionItem {
    id: string
    /** Shown as v{number} */
    number: number
    /** Full multi-page document */
    xml: string
    /** The page the change was made on; none: the first page */
    pageId?: string
    /** Document before the change, when it is known */
    beforeXml?: string
    /** SVG data URL thumbnail; undefined: still being made; "": none could
     * be made */
    svg?: string
    summary: ChangeSummary
    /** Drawn on an empty canvas (the card shows totals, not changes) */
    fromScratch?: boolean
    /** The cells the change added or changed, to outline them again */
    touchedIds?: string[]
}

/**
 * Where the versions come from and what can be done with them. The web app
 * fills it from the chat's version store; the MCP shell from the server's
 * history.
 */
export interface VersionsSource {
    versions: VersionItem[]
    /** The version the canvas shows now, or null (hand edits, undone) */
    onCanvasId: string | null
    /** The latest version, when its change was undone */
    undoneId: string | null
    /** The canvas was changed by hand since this version (no version is
     * on it now) */
    editedSinceId?: string | null
    /** Something is changing the canvas: version actions wait */
    isBusy: boolean
    /** The latest version's change can be undone */
    canUndo: boolean
    /** The latest version's change was undone and can be put back */
    canRedo: boolean
    restore: (id: string) => void
    undo: () => void
    redo: () => void
}

const VersionsContext = createContext<VersionsSource | null>(null)

export function VersionsProvider({
    value,
    children,
}: {
    value: VersionsSource
    children: React.ReactNode
}) {
    return (
        <VersionsContext.Provider value={value}>
            {children}
        </VersionsContext.Provider>
    )
}

export function useVersionsContext(): VersionsSource {
    const source = useContext(VersionsContext)
    if (!source) {
        throw new Error(
            "useVersionsContext must be used within a VersionsProvider",
        )
    }
    return source
}
