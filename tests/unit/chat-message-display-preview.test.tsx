import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import en from "@/lib/i18n/dictionaries/en.json"

const page = (cells: string) =>
    `<mxfile><diagram id="p" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`
const box = (id: string) =>
    `<mxCell id="${id}" value="${id}" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>`

// The first edit's result is loaded (the ref has it); the chartXML state
// has not caught up yet
const BEFORE_FIRST_EDIT = page(box("a"))
const AFTER_FIRST_EDIT = page(box("a") + box("b"))

vi.mock("@/contexts/diagram-context", () => ({
    useDiagram: () => ({
        chartXML: BEFORE_FIRST_EDIT,
        chartXMLRef: { current: AFTER_FIRST_EDIT },
        loadDiagram: vi.fn(() => null),
    }),
}))
vi.mock("@/hooks/use-dictionary", () => ({ useDictionary: () => en }))

import { ChatMessageDisplay } from "@/components/chat-message-display"

// jsdom has no layout
Element.prototype.scrollIntoView = () => {}

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
        render(
            <ChatMessageDisplay
                messages={messages}
                setInput={() => {}}
                setFiles={() => {}}
                processedToolCallsRef={{ current: new Set() }}
                editDiagramOriginalXmlRef={editDiagramOriginalXmlRef}
                status="streaming"
            />,
        )
        expect(editDiagramOriginalXmlRef.current.get("edit-2")).toBe(
            AFTER_FIRST_EDIT,
        )
    })
})
