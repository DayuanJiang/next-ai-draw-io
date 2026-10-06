import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ToolInputDetails } from "@/components/chat/tool-activity"

afterEach(cleanup)

describe("ToolInputDetails", () => {
    it("shows streamed operations without crashing on broken entries", () => {
        // A partly streamed or invalid edit_diagram input
        const operations = [
            null,
            { operation: {} },
            { operation: "add", cell_id: {} },
            // JSON can hold an object that does not turn into text
            JSON.parse('{"operation":"add","cell_id":{"toString":null}}'),
            { operation: "add", cell_id: "2", new_xml: {} },
            { operation: "update", cell_id: "3", new_xml: '<mxCell id="3"/>' },
        ]
        const { container } = render(
            <ToolInputDetails
                part={
                    {
                        type: "tool-edit_diagram",
                        toolCallId: "t1",
                        state: "input-streaming",
                        input: { operations },
                    } as any
                }
            />,
        )
        expect(container.textContent).toContain("update3")
        expect(container.textContent).toContain('<mxCell id="3"/>')
    })

    it("ignores an xml input that is not text", () => {
        const { container } = render(
            <ToolInputDetails
                part={
                    {
                        type: "tool-display_diagram",
                        toolCallId: "t2",
                        state: "input-streaming",
                        input: { xml: { broken: true } },
                    } as any
                }
            />,
        )
        expect(container.textContent).toContain("broken")
    })
})
