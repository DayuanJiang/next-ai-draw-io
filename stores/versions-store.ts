import { nanoid } from "nanoid"
import { create } from "zustand"
import type { VersionItem } from "@/components/canvas/versions-context"

/**
 * One diagram state produced by an AI change, shown as a card in the chat.
 * What the card displays is the VersionItem part; the rest ties the version
 * to its chat turn. The number stays when older versions are dropped; the
 * "before" document is kept only on the latest version; older sessions
 * have no pageId (the first page).
 */
export interface DiagramVersion extends VersionItem {
    /** Index of the user message that started this turn */
    turnIndex: number
    toolCallId?: string
    /** Saved with the session: this version is what the canvas shows */
    onCanvas?: boolean
    /** Saved with the session: this version's change was undone */
    undone?: boolean
    /** Saved with the session: the canvas was changed by hand since this
     * version was on it */
    editedSince?: boolean
}

// The flags live on the versions so they are saved with the session
function withFlags(
    versions: DiagramVersion[],
    onCanvasId: string | null,
    undoneId: string | null,
    editedSinceId: string | null = null,
): DiagramVersion[] {
    return versions.map(({ onCanvas, undone, editedSince, ...rest }) => ({
        ...rest,
        ...(rest.id === onCanvasId && { onCanvas: true }),
        ...(rest.id === undoneId && { undone: true }),
        ...(rest.id === editedSinceId && { editedSince: true }),
    }))
}

// Versions are stored with the session; keep the list bounded
export const MAX_VERSIONS = 20

interface VersionsState {
    versions: DiagramVersion[]
    /** The change on the latest version was undone with its card's button */
    undoneVersionId: string | null
    /** The version the canvas shows (null after hand edits; after an undo,
     * the older version the canvas is back at, if any) */
    onCanvasVersionId: string | null
    /** The canvas was changed by hand since this version was on it */
    editedSinceId: string | null
    setVersions: (versions: DiagramVersion[]) => void
    addVersion: (version: Omit<DiagramVersion, "id" | "number">) => string
    updateVersion: (id: string, patch: Partial<DiagramVersion>) => void
    /** Drop versions from turns that are being re-run (edit or regenerate) */
    removeFromTurn: (turnIndex: number) => void
    /** The change of this version was undone (null: no undone change);
     * the canvas is back at onCanvasId, when that is a version */
    setUndone: (id: string | null, onCanvasId?: string | null) => void
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
    editedSinceId: null,
    setVersions: (versions) =>
        set({
            // A missing thumbnail could not be made: no "rendering" forever.
            versions: versions.map((v) => ({
                ...v,
                svg: v.svg ?? "",
            })),
            undoneVersionId: versions.find((v) => v.undone)?.id ?? null,
            onCanvasVersionId: versions.find((v) => v.onCanvas)?.id ?? null,
            editedSinceId: versions.find((v) => v.editedSince)?.id ?? null,
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
                editedSinceId: null,
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
                editedSinceId: null,
            }
        }),
    setUndone: (id, onCanvasId = null) =>
        set((state) => ({
            versions: withFlags(state.versions, onCanvasId, id),
            undoneVersionId: id,
            onCanvasVersionId: onCanvasId,
            editedSinceId: null,
        })),
    setOnCanvas: (id) =>
        set((state) => ({
            versions: withFlags(state.versions, id, null),
            undoneVersionId: null,
            onCanvasVersionId: id,
            editedSinceId: null,
        })),
    clearCanvasFlags: () =>
        set((state) => {
            if (
                state.onCanvasVersionId === null &&
                state.undoneVersionId === null
            ) {
                return state
            }
            // The edits start from the version that was on it
            const editedSinceId = state.onCanvasVersionId ?? state.editedSinceId
            return {
                versions: withFlags(state.versions, null, null, editedSinceId),
                undoneVersionId: null,
                onCanvasVersionId: null,
                editedSinceId,
            }
        }),
    clear: () =>
        set({
            versions: [],
            undoneVersionId: null,
            onCanvasVersionId: null,
            editedSinceId: null,
        }),
}))
