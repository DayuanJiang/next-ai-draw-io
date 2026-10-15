"use client"

import {
    VersionsProvider,
    type VersionsSource,
} from "@/components/canvas/versions-context"
import { useCanvasStore } from "@/stores/canvas-store"
import { useVersionsStore } from "@/stores/versions-store"
import { useChatEngine } from "./chat-engine"

/**
 * The chat's versions for the canvas components (version cards, the strip,
 * the compare dialog): the version store's list and flags, and the chat
 * engine's restore and undo
 */
export function ChatVersionsProvider({
    children,
}: {
    children: React.ReactNode
}) {
    const { restoreVersion, undoVersion } = useChatEngine()
    const versions = useVersionsStore((s) => s.versions)
    const onCanvasId = useVersionsStore((s) => s.onCanvasVersionId)
    const undoneId = useVersionsStore((s) => s.undoneVersionId)
    const editedSinceId = useVersionsStore((s) => s.editedSinceId)
    const isBusy = useCanvasStore((s) => s.isBusy)

    // Only the latest version can be undone, and only while it is (or was)
    // on the canvas: after an older version was restored, the latest one
    // is restored too
    const latest = versions.at(-1)
    const undoable = !!latest && latest.beforeXml !== undefined
    const value: VersionsSource = {
        versions,
        onCanvasId,
        undoneId,
        editedSinceId,
        isBusy,
        canUndo: undoable && latest.id === onCanvasId,
        canRedo: undoable && latest.id === undoneId,
        restore: restoreVersion,
        // The engine's undo toggles: it redoes a change that is undone
        undo: () => latest && undoVersion(latest.id),
        redo: () => latest && undoVersion(latest.id),
    }

    return <VersionsProvider value={value}>{children}</VersionsProvider>
}
