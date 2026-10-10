import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const page = (cells: string) =>
    `<mxfile><diagram id="p" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`
const box = (id: string) =>
    `<mxCell id="${id}" value="${id}" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>`

// The first edit's result is loaded (the ref has it); the chartXML state
// has not caught up yet
const BEFORE_FIRST_EDIT = page(box("a"))
const AFTER_FIRST_EDIT = page(box("a") + box("b"))

const mocks = vi.hoisted(() => ({
    loadDiagram: vi.fn((_xml: string, ..._rest: unknown[]) => null),
}))

vi.mock("@/contexts/diagram-context", () => ({
    useDiagram: () => ({
        chartXML: BEFORE_FIRST_EDIT,
        chartXMLRef: { current: AFTER_FIRST_EDIT },
        loadDiagram: mocks.loadDiagram,
    }),
}))

import { useDiagramStreaming } from "@/components/chat/use-diagram-streaming"

describe("the streaming preview of a second edit", () => {
    it("starts from the first edit's result", () => {
        const editDiagramOriginalXmlRef = { current: new Map<string, string>() }
        const messages = [
            {
                id: "m1",
                role: "assistant",
                parts: [
                    {
                        type: "tool-edit_diagram",
                        toolCallId: "edit-2",
                        state: "input-streaming",
                        input: {
                            operations: [
                                {
                                    operation: "add",
                                    cell_id: "c",
                                    new_xml: box("c"),
                                },
                            ],
                        },
                    },
                ],
            },
        ] as any
        renderHook(() =>
            useDiagramStreaming({
                messages,
                processedToolCallsRef: { current: new Set() },
                editDiagramOriginalXmlRef,
                loadedMessageIdsRef: { current: new Set() },
            }),
        )
        expect(editDiagramOriginalXmlRef.current.get("edit-2")).toBe(
            AFTER_FIRST_EDIT,
        )
    })
})

describe("the streaming preview of display_diagram", () => {
    it("expands the named styles and adds the defaults to the cells so far", () => {
        mocks.loadDiagram.mockClear()
        // A complete definition and cell, then a cell still being written
        const xml = `<mxStyle name="blue" value="fillColor=#dae8fc;strokeColor=#6c8ebf;"/>
<mxCell id="a" value="a" style="rounded=1;blue;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>
<mxCell id="b" value="b" style="blue;" vertex="1" parent="1"><mxGeometry x="0" y="0" wid`
        const messages = [
            {
                id: "m1",
                role: "assistant",
                parts: [
                    {
                        type: "tool-display_diagram",
                        toolCallId: "draw-1",
                        state: "input-streaming",
                        input: { xml },
                    },
                ],
            },
        ] as any
        renderHook(() =>
            useDiagramStreaming({
                messages,
                processedToolCallsRef: { current: new Set() },
                editDiagramOriginalXmlRef: { current: new Map() },
                loadedMessageIdsRef: { current: new Set() },
            }),
        )
        expect(mocks.loadDiagram).toHaveBeenCalledTimes(1)
        const loaded = mocks.loadDiagram.mock.calls[0][0]
        expect(loaded).toContain(
            'style="rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;whiteSpace=wrap;html=1;"',
        )
        expect(loaded).not.toContain("mxStyle")
        expect(loaded).not.toContain('id="b"')
    })
})

describe("the streaming preview of edit_diagram", () => {
    it("adds the default styles to the cell being added, like the final edit", () => {
        mocks.loadDiagram.mockClear()
        const messages = [
            {
                id: "m1",
                role: "assistant",
                parts: [
                    {
                        type: "tool-edit_diagram",
                        toolCallId: "edit-3",
                        state: "input-streaming",
                        input: {
                            operations: [
                                {
                                    operation: "add",
                                    cell_id: "c",
                                    new_xml: box("c").replace(
                                        'vertex="1"',
                                        'style="rounded=1;" vertex="1"',
                                    ),
                                },
                            ],
                        },
                    },
                ],
            },
        ] as any
        renderHook(() =>
            useDiagramStreaming({
                messages,
                processedToolCallsRef: { current: new Set() },
                editDiagramOriginalXmlRef: { current: new Map() },
                loadedMessageIdsRef: { current: new Set() },
            }),
        )
        expect(mocks.loadDiagram).toHaveBeenCalledTimes(1)
        expect(mocks.loadDiagram.mock.calls[0][0]).toContain(
            'style="rounded=1;whiteSpace=wrap;html=1;"',
        )
    })
})
