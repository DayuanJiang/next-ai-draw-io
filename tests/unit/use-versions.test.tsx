import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EMPTY_SUMMARY } from "@/lib/diagram-diff"
import en from "@/lib/i18n/dictionaries/en.json"
import { useVersionsStore } from "@/stores/versions-store"

const mocks = vi.hoisted(() => ({ chartXML: "" }))

vi.mock("@/contexts/diagram-context", () => ({
    useDiagram: () => ({
        loadDiagram: vi.fn(),
        getVersionSvg: vi.fn(),
        setCommitHandler: vi.fn(),
        chartXML: mocks.chartXML,
        chartXMLRef: { current: mocks.chartXML },
    }),
}))
vi.mock("@/hooks/use-dictionary", () => ({ useDictionary: () => en }))
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
})
