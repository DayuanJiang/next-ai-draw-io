import { nanoid } from "nanoid"
import { create } from "zustand"
import type { ChangeSummary } from "@/lib/diagram-diff"
import { EMPTY_SUMMARY } from "@/lib/diagram-diff"

/** One diagram state produced by an AI change, shown as a card in the chat */
export interface DiagramVersion {
    id: string
    /** Shown as v{number}; it stays when older versions are dropped */
    number: number
    /** Full multi-page document after the change */
    xml: string
    /** Diagram before the change; kept only on the latest version */
    beforeXml?: string
    /** SVG data URL thumbnail; "" when none could be made */
    svg?: string
    /** Index of the user message that started this turn */
    turnIndex: number
    toolCallId?: string
    summary: ChangeSummary
    /** Drawn on an empty canvas (the card shows totals, not changes) */
    fromScratch?: boolean
    /** Saved with the session: this version is what the canvas shows */
    onCanvas?: boolean
    /** Saved with the session: this version's change was undone */
    undone?: boolean
}

// The two flags live on the versions so they are saved with the session
function withFlags(
    versions: DiagramVersion[],
    onCanvasId: string | null,
    undoneId: string | null,
): DiagramVersion[] {
    return versions.map(({ onCanvas, undone, ...rest }) => ({
        ...rest,
        ...(rest.id === onCanvasId && { onCanvas: true }),
        ...(rest.id === undoneId && { undone: true }),
    }))
}

// Versions are stored with the session; keep the list bounded
export const MAX_VERSIONS = 20

interface VersionsState {
    versions: DiagramVersion[]
    /** The change on the latest version was undone with its card's button */
    undoneVersionId: string | null
    /** The version the canvas shows (null after an undo or hand edits) */
    onCanvasVersionId: string | null
    setVersions: (versions: DiagramVersion[]) => void
    addVersion: (version: Omit<DiagramVersion, "id" | "number">) => string
    updateVersion: (id: string, patch: Partial<DiagramVersion>) => void
    /** Drop versions from turns that are being re-run (edit or regenerate) */
    removeFromTurn: (turnIndex: number) => void
    /** The change of this version was undone; null: no undone change */
    setUndone: (id: string | null) => void
    /** This version is on the canvas again (restored or redone) */
    setOnCanvas: (id: string) => void
    /** The canvas was changed by hand (undo included): no version is on it */
    clearCanvasFlags: () => void
    clear: () => void
}

export const useVersionsStore = create<VersionsState>((set) => ({
    versions: [],
    undoneVersionId: null,
    onCanvasVersionId: null,
    setVersions: (versions) =>
        set({
            // A missing thumbnail could not be made: no "rendering" forever.
            // Versions saved before they had numbers count from 1.
            versions: versions.map((v, i) => ({
                ...v,
                number: v.number ?? i + 1,
                svg: v.svg ?? "",
            })),
            undoneVersionId: versions.find((v) => v.undone)?.id ?? null,
            onCanvasVersionId: versions.find((v) => v.onCanvas)?.id ?? null,
        }),
    addVersion: (version) => {
        const id = nanoid(10)
        set((state) => {
            // Only the newest version keeps its "before" XML
            const older = state.versions.map(({ beforeXml, ...rest }) => rest)
            const number = (state.versions.at(-1)?.number ?? 0) + 1
            const next = [...older, { ...version, id, number }].slice(
                -MAX_VERSIONS,
            )
            return {
                versions: withFlags(next, id, null),
                undoneVersionId: null,
                onCanvasVersionId: id,
            }
        })
        return id
    },
    updateVersion: (id, patch) =>
        set((state) => ({
            versions: state.versions.map((v) =>
                v.id === id ? { ...v, ...patch } : v,
            ),
        })),
    removeFromTurn: (turnIndex) =>
        set((state) => {
            const versions = state.versions.filter(
                (v) => v.turnIndex < turnIndex,
            )
            // The canvas goes back to the snapshot before that turn, which
            // can hold hand edits made after the latest kept version
            return {
                versions: withFlags(versions, null, null),
                undoneVersionId: null,
                onCanvasVersionId: null,
            }
        }),
    setUndone: (id) =>
        set((state) => ({
            versions: withFlags(state.versions, null, id),
            undoneVersionId: id,
            onCanvasVersionId: null,
        })),
    setOnCanvas: (id) =>
        set((state) => ({
            versions: withFlags(state.versions, id, null),
            undoneVersionId: null,
            onCanvasVersionId: id,
        })),
    clearCanvasFlags: () =>
        set((state) =>
            state.onCanvasVersionId === null && state.undoneVersionId === null
                ? state
                : {
                      versions: withFlags(state.versions, null, null),
                      undoneVersionId: null,
                      onCanvasVersionId: null,
                  },
        ),
    clear: () =>
        set({ versions: [], undoneVersionId: null, onCanvasVersionId: null }),
}))

/** Convert the old `diagramHistory` list ({svg, xml}) saved by earlier versions */
export function versionsFromLegacyHistory(
    history: { svg: string; xml: string }[] | undefined,
): DiagramVersion[] {
    if (!history?.length) return []
    return history.slice(-MAX_VERSIONS).map((entry, index) => ({
        id: `legacy-${index}`,
        number: index + 1,
        xml: entry.xml,
        svg: entry.svg,
        turnIndex: -1,
        summary: { ...EMPTY_SUMMARY },
    }))
}
