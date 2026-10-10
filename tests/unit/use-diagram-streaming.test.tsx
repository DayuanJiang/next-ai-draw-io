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
    // The canvas for a test that needs another one
    canvas: null as string | null,
}))

vi.mock("@/contexts/diagram-context", () => ({
    useDiagram: () => ({
        chartXML: mocks.canvas ?? BEFORE_FIRST_EDIT,
        chartXMLRef: { current: mocks.canvas ?? AFTER_FIRST_EDIT },
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

describe("the streaming preview on the model's page", () => {
    const box2 = (id: string, parent = "1") =>
        `<mxCell id="${id}" value="${id}" vertex="1" parent="${parent}"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>`
    // Page A has an edge "g"; on page B, "g" is a shape on layer "L"
    const twoPages = `<mxfile><diagram id="pa" name="A"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${box2("s")}${box2("t")}<mxCell id="g" edge="1" parent="1" source="s" target="t"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel></diagram><diagram id="pb" name="B"><mxGraphModel><root><mxCell id="0"/><mxCell id="L" parent="0"/>${box2("g", "L")}</root></mxGraphModel></diagram></mxfile>`
    const cellOn = (xml: string, pageId: string, id: string) =>
        new DOMParser()
            .parseFromString(xml, "text/xml")
            .querySelector(`diagram[id="${pageId}"] mxCell[id="${id}"]`)
    const stream = (part: object) =>
        renderHook(() =>
            useDiagramStreaming({
                messages: [
                    { id: "m1", role: "assistant", parts: [part] },
                ] as any,
                processedToolCallsRef: { current: new Set() },
                editDiagramOriginalXmlRef: { current: new Map() },
                loadedMessageIdsRef: { current: new Set() },
                turnPageIdRef: { current: "pb" },
            }),
        )

    it("applies an edit to that page, with its layer and its edges", () => {
        mocks.loadDiagram.mockClear()
        mocks.canvas = twoPages
        try {
            stream({
                type: "tool-edit_diagram",
                toolCallId: "edit-p",
                state: "input-streaming",
                input: {
                    operations: [
                        {
                            operation: "add",
                            cell_id: "c",
                            new_xml:
                                '<mxCell id="c" value="c" x="10" y="10" w="80" h="40"/>',
                        },
                        {
                            operation: "add",
                            cell_id: "d",
                            new_xml:
                                '<mxCell id="d" value="d" parent="g" x="10" y="10" w="80" h="40"/>',
                        },
                    ],
                },
            })
            const loaded = mocks.loadDiagram.mock.calls.at(-1)?.[0] as string
            expect(cellOn(loaded, "pb", "c")?.getAttribute("parent")).toBe("L")
            expect(cellOn(loaded, "pb", "d")?.getAttribute("style")).toContain(
                "whiteSpace=wrap",
            )
            expect(cellOn(loaded, "pa", "c")).toBeNull()
        } finally {
            mocks.canvas = null
        }
    })

    it("draws display_diagram's cells on that page", () => {
        mocks.loadDiagram.mockClear()
        mocks.canvas = twoPages
        try {
            stream({
                type: "tool-display_diagram",
                toolCallId: "draw-p",
                state: "input-streaming",
                input: { xml: box2("n") },
            })
            const loaded = mocks.loadDiagram.mock.calls.at(-1)?.[0] as string
            expect(cellOn(loaded, "pb", "n")).not.toBeNull()
            expect(cellOn(loaded, "pb", "g")).toBeNull()
            expect(cellOn(loaded, "pa", "g")).not.toBeNull()
        } finally {
            mocks.canvas = null
        }
    })
})
