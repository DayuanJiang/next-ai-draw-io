import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EMPTY_SUMMARY } from "@/lib/diagram-diff"
import en from "@/lib/i18n/dictionaries/en.json"
import { useVersionsStore } from "@/stores/versions-store"

const mocks = vi.hoisted(() => ({
    chartXML: "",
    // The button of the latest toast
    toastAction: () => {},
    // What the hook registered for the AI's committed changes
    commit: null as
        | ((commit: { beforeXml: string; afterXml: string }) => void)
        | null,
    // draw.io's answer to the export of a version's picture
    versionSvg: async (): Promise<string | null> => null,
}))

vi.mock("@/contexts/diagram-context", () => ({
    useDiagram: () => ({
        loadDiagram: vi.fn(),
        getVersionSvg: () => mocks.versionSvg(),
        setCommitHandler: (handler: typeof mocks.commit) => {
            mocks.commit = handler
        },
        chartXML: mocks.chartXML,
        chartXMLRef: { current: mocks.chartXML },
    }),
}))
vi.mock("@/hooks/use-dictionary", () => ({ useDictionary: () => en }))
vi.mock("sonner", () => ({
    toast: {
        success: (
            _text: string,
            options: { action: { onClick: () => void } },
        ) => {
            mocks.toastAction = options.action.onClick
        },
        dismiss: () => {},
    },
}))
vi.mock("@/lib/drawio/editor-bridge", () => ({
    clearHighlights: vi.fn(),
    highlightChangedCells: vi.fn(),
}))

import { useVersions } from "@/components/chat/use-versions"

afterEach(cleanup)

const cell = (id: string, x = 40) =>
    `<mxCell id="${id}" value="${id}" vertex="1" parent="1"><mxGeometry x="${x}" y="40" width="120" height="60" as="geometry"/></mxCell>`
const doc = (cells: string) =>
    `<mxfile><diagram id="p1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`
const A = doc(cell("a"))
const AB = doc(cell("a") + cell("b"))
const ABC = doc(cell("a") + cell("b") + cell("c"))

describe("the version on the canvas", () => {
    beforeEach(() => useVersionsStore.getState().clear())

    it("is found again when Ctrl+Z goes back through hand edits to an older version", () => {
        const store = useVersionsStore.getState()
        const add = (xml: string, beforeXml: string, turnIndex: number) =>
            store.addVersion({
                xml,
                beforeXml,
                turnIndex,
                summary: { ...EMPTY_SUMMARY },
            })
        const first = add(A, "", 0)
        add(ABC, AB, 2)
        mocks.chartXML = ABC
        const { rerender } = renderHook(() =>
            useVersions({
                currentTurnRef: { current: 2 },
                isBusy: false,
                isTurnActive: () => false,
                getChatGeneration: () => 0,
            }),
        )
        // A hand edit: no version on the canvas
        mocks.chartXML = doc(cell("a") + cell("b") + cell("c", 300))
        rerender()
        expect(useVersionsStore.getState().onCanvasVersionId).toBeNull()
        expect(useVersionsStore.getState().undoneVersionId).toBeNull()
        // Undone (past the diagram before the latest change) to the first
        // version's diagram
        mocks.chartXML = A
        rerender()
        expect(useVersionsStore.getState().onCanvasVersionId).toBe(first)
    })

    it("keeps the hand-edit note on its version when a restore is undone", () => {
        const store = useVersionsStore.getState()
        const add = (xml: string, beforeXml: string, turnIndex: number) =>
            store.addVersion({
                xml,
                beforeXml,
                turnIndex,
                summary: { ...EMPTY_SUMMARY },
            })
        const first = add(A, "", 0)
        const second = add(AB, A, 1)
        // The second version, with a shape moved by hand
        const edited = doc(cell("a") + cell("b", 300))
        mocks.chartXML = edited
        const { result, rerender } = renderHook(() =>
            useVersions({
                currentTurnRef: { current: 1 },
                isBusy: false,
                isTurnActive: () => false,
                getChatGeneration: () => 0,
            }),
        )
        expect(useVersionsStore.getState().editedSinceId).toBe(second)

        act(() => result.current.restoreVersion(first))
        mocks.chartXML = A
        rerender()
        expect(useVersionsStore.getState().onCanvasVersionId).toBe(first)

        // Undo in the toast: the hand-edited canvas is back
        act(() => mocks.toastAction())
        mocks.chartXML = edited
        rerender()
        expect(useVersionsStore.getState().onCanvasVersionId).toBeNull()
        expect(useVersionsStore.getState().editedSinceId).toBe(second)
    })
})

describe("a version's picture", () => {
    beforeEach(() => useVersionsStore.getState().clear())

    it("is kept only while the version is still on the canvas when draw.io answers", async () => {
        // The answer comes late, as from a draw.io that is still loading
        let answer = (_svg: string) => {}
        mocks.versionSvg = () =>
            new Promise((resolve) => {
                answer = resolve
            })
        const { result } = renderHook(() =>
            useVersions({
                currentTurnRef: { current: 0 },
                isBusy: false,
                isTurnActive: () => false,
                getChatGeneration: () => 0,
            }),
        )
        const drawn = async (beforeXml: string, afterXml: string) => {
            act(() => mocks.commit?.({ beforeXml, afterXml }))
            // (the picture is asked for in a timeout)
            await new Promise((resolve) => setTimeout(resolve, 0))
            return useVersionsStore.getState().versions.at(-1)?.id as string
        }
        const svgOf = (id: string) =>
            useVersionsStore.getState().versions.find((v) => v.id === id)?.svg

        const first = await drawn("", A)
        await act(async () => answer("data:image/svg+xml,first"))
        expect(svgOf(first)).toBe("data:image/svg+xml,first")

        // Undone before the answer: the picture shows the canvas without
        // the second version's change
        const second = await drawn(A, AB)
        act(() => result.current.undoVersion(second))
        await act(async () => answer("data:image/svg+xml,undone"))
        expect(svgOf(second)).toBe("")
    })
})
