import type { RefObject } from "react"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { useDiagram } from "@/contexts/diagram-context"
import { useDictionary } from "@/hooks/use-dictionary"
import { diffDiagrams, isSameDocument } from "@/lib/diagram-diff"
import { clearHighlights, highlightCells } from "@/lib/drawio/editor-bridge"
import { formatMessage } from "@/lib/i18n/utils"
import { BLANK_MXFILE } from "@/packages/mcp-server/src/pages.ts"
import { useVersionsStore } from "@/stores/versions-store"

interface UseVersionsParams {
    /** Index of the user message whose turn is running */
    currentTurnRef: RefObject<number>
    isBusy: boolean
    /** Live busy state, for the restore toast's Undo that runs later */
    isTurnActive: () => boolean
    /** Changes when another chat comes on screen */
    getChatGeneration: () => number
}

/**
 * Turns every committed AI change into a version (card in the chat), marks
 * the changed shapes on the canvas, and restores or undoes versions.
 */
export function useVersions({
    currentTurnRef,
    isBusy,
    isTurnActive,
    getChatGeneration,
}: UseVersionsParams) {
    const dict = useDictionary()
    // chartXML changes with hand edits, undo and loads; the ref is the
    // document on the canvas now
    const {
        loadDiagram,
        getVersionSvg,
        setCommitHandler,
        chartXML,
        chartXMLRef,
    } = useDiagram()
    // A restore commits too; that path must not add a version
    const restoringRef = useRef(false)

    // Registered once: re-registering on every render would leave a gap
    // (effect cleanups run before the streaming hook commits). The handler
    // only reads refs and stable functions.
    useEffect(() => {
        setCommitHandler(({ beforeXml, afterXml, toolCallId }) => {
            if (restoringRef.current) return
            const { summary, touchedIds, fromScratch } = diffDiagrams(
                beforeXml,
                afterXml,
            )
            const id = useVersionsStore.getState().addVersion({
                xml: afterXml,
                beforeXml,
                turnIndex: currentTurnRef.current,
                toolCallId,
                summary,
                fromScratch,
            })
            // Mark what changed, unless the whole diagram is new
            if (!fromScratch) {
                setTimeout(() => {
                    const marker = getComputedStyle(document.documentElement)
                        .getPropertyValue("--marker")
                        .trim()
                    highlightCells(touchedIds, marker || "#ffd84d")
                }, 60)
            }
            // The picture is of the canvas: take it right away, before a
            // newer version can be on it; once one is, this one gets none
            // rather than the newer one's
            const isNewest = () =>
                useVersionsStore.getState().versions.at(-1)?.id === id
            setTimeout(async () => {
                const svg = isNewest() ? await getVersionSvg() : null
                useVersionsStore
                    .getState()
                    .updateVersion(id, { svg: svg && isNewest() ? svg : "" })
            }, 0)
        })
        return () => setCommitHandler(null)
    }, [])

    // A version is on the canvas (or its change undone) while the canvas
    // holds that XML. Hand edits, Ctrl+Z or a new page end it, with an
    // external draw.io too; Ctrl+Z or redo can also bring the latest version
    // (or the diagram before it) back. Checked once an answer is done: its
    // previews change the canvas on the way.
    useEffect(() => {
        if (isBusy || isTurnActive() || !chartXML) return
        const store = useVersionsStore.getState()
        const id = store.onCanvasVersionId ?? store.undoneVersionId
        const version = store.versions.find((v) => v.id === id)
        if (version) {
            const shown =
                id === store.onCanvasVersionId
                    ? version.xml
                    : version.beforeXml || BLANK_MXFILE
            if (isSameDocument(shown, chartXML)) return
            // Its Undo would also take the changes made since away
            toast.dismiss("version-restored")
        }
        const latest = store.versions.at(-1)
        if (latest && isSameDocument(latest.xml, chartXML)) {
            store.setOnCanvas(latest.id)
        } else if (
            latest?.beforeXml !== undefined &&
            isSameDocument(latest.beforeXml || BLANK_MXFILE, chartXML)
        ) {
            store.setUndone(latest.id)
        } else {
            store.clearCanvasFlags()
        }
    }, [chartXML, isBusy])

    const apply = (xml: string) => {
        restoringRef.current = true
        try {
            loadDiagram(xml, true, "commit")
        } finally {
            restoringRef.current = false
        }
        clearHighlights()
    }

    const restoreVersion = (versionId: string) => {
        if (isTurnActive()) return
        const store = useVersionsStore.getState()
        const index = store.versions.findIndex((v) => v.id === versionId)
        if (index < 0) return
        // The canvas before the restore, to go back to it: a multi-page
        // document is loaded in full, which Ctrl+Z cannot undo
        const before = chartXMLRef.current
        const wasOnCanvas = store.onCanvasVersionId
        const wasUndone = store.undoneVersionId
        const generation = getChatGeneration()
        apply(store.versions[index].xml)
        store.setOnCanvas(versionId)
        toast.success(
            formatMessage(dict.versions.restoredVersion, {
                n: store.versions[index].number,
            }),
            {
                id: "version-restored",
                duration: 8000,
                action: {
                    label: dict.versions.undoRestore,
                    onClick: () => {
                        // Another chat is on screen, or an answer is
                        // changing the canvas: the old canvas is not theirs
                        if (!before || isTurnActive()) return
                        if (getChatGeneration() !== generation) return
                        apply(before)
                        const now = useVersionsStore.getState()
                        if (wasUndone) now.setUndone(wasUndone)
                        else if (wasOnCanvas) now.setOnCanvas(wasOnCanvas)
                    },
                },
            },
        )
    }

    /** Undo the change of the latest version, or redo it when undone */
    const undoVersion = (versionId: string) => {
        if (isTurnActive()) return
        const store = useVersionsStore.getState()
        const version = store.versions.find((v) => v.id === versionId)
        if (!version) return
        if (store.undoneVersionId === versionId) {
            apply(version.xml)
            store.setOnCanvas(versionId)
            return
        }
        if (version.beforeXml === undefined) return
        apply(version.beforeXml || BLANK_MXFILE)
        store.setUndone(versionId)
    }

    return { restoreVersion, undoVersion }
}
