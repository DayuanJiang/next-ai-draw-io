import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ToolCallCard } from "@/components/chat/ToolCallCard"

afterEach(cleanup)

const dict = {
    tools: { complete: "Complete" },
    chat: { copied: "Copied", failedToCopy: "Failed", copyResponse: "Copy" },
}

describe("ToolCallCard", () => {
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
            <ToolCallCard
                part={
                    {
                        type: "tool-edit_diagram",
                        toolCallId: "t1",
                        state: "input-streaming",
                        input: { operations },
                    } as any
                }
                expandedTools={{ t1: true }}
                setExpandedTools={() => {}}
                onCopy={() => {}}
                copiedToolCallId={null}
                copyFailedToolCallId={null}
                dict={dict}
            />,
        )
        expect(container.textContent).toContain("cell_id: 3")
        expect(container.textContent).toContain('<mxCell id="3"/>')
    })
})
