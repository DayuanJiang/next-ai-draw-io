import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ToolCallCard } from "@/components/chat/ToolCallCard"

const dict = {
    tools: { complete: "Complete" },
    chat: { copied: "c", failedToCopy: "f", copyResponse: "r" },
}
const base = {
    expandedTools: {},
    setExpandedTools: () => {},
    onCopy: () => {},
    copiedToolCallId: null,
    copyFailedToolCallId: null,
    dict,
}

/**
 * What the tool-call card shows in the chat.
 *
 * Both diagram tools happen to name their argument `operations`, but the items have
 * different shapes: edit_diagram sends `operation`/`cell_id`/`new_xml` patches, while
 * restructure_diagram sends `op`/`id` structural steps. The card used to dispatch on
 * "does an operations key exist", so a restructure call was rendered as edit patches and
 * every row printed a blank `cell_id:` label with nothing after it.
 */
describe("ToolCallCard", () => {
    it("shows restructure_diagram operations, not blank cell_id rows", () => {
        const { container } = render(
            <ToolCallCard
                {...base}
                part={{
                    type: "tool-restructure_diagram",
                    toolCallId: "t1",
                    state: "output-available",
                    input: {
                        operations: [
                            { op: "set_page", aspect: 0.8 },
                            {
                                op: "add_container",
                                id: "page",
                                label: "",
                                dir: "col",
                                class: "gap-4",
                            },
                            {
                                op: "add_box",
                                id: "mast",
                                parent: "page",
                                label: "Title",
                                role: "banner",
                            },
                            {
                                op: "add_graph",
                                id: "g",
                                nodes: [{ id: "a" }, { id: "b" }],
                                edges: [{ source: "a", target: "b" }],
                            },
                        ],
                    },
                    output: 'Diagram updated.\n\npage: col (wrapper)\n  mast: box "Title"',
                }}
            />,
        )
        const text = container.textContent ?? ""
        // The bug: every row printed "cell_id:" with nothing after it.
        expect(text).not.toContain("cell_id:")
        // Operation names and ids are visible.
        for (const s of [
            "set_page",
            "add_container",
            "add_box",
            "add_graph",
            "page",
            "mast",
        ])
            expect(text).toContain(s)
        // Arguments are summarised.
        expect(text).toContain("class=gap-4")
        expect(text).toContain("2 nodes, 1 edge")
        // The tool's own answer is shown, not thrown away.
        expect(text).toContain("Diagram updated.")
        // And it has a readable name.
        expect(text).toContain("Build Diagram")
    })

    it("still renders edit_diagram patches the old way", () => {
        const { container } = render(
            <ToolCallCard
                {...base}
                part={{
                    type: "tool-edit_diagram",
                    toolCallId: "t2",
                    state: "output-available",
                    input: {
                        operations: [
                            {
                                operation: "update",
                                cell_id: "3",
                                new_xml: '<mxCell id="3"/>',
                            },
                        ],
                    },
                }}
            />,
        )
        const text = container.textContent ?? ""
        expect(text).toContain("cell_id: 3")
        expect(text).toContain("update")
    })
})

/**
 * Streaming: the tool input arrives character by character.
 *
 * The card renders on every frame of that, so it is handed JSON that has been repaired
 * mid-flight — an operation may be `{}`, have a half-typed name, or be a hole in the array.
 * The first version of the restructure renderer read `op.op.startsWith(...)` and crashed the
 * whole message with "Cannot read properties of undefined". These cases are what the earlier
 * tests missed by only ever passing complete input.
 */
describe("ToolCallCard while the input is still streaming", () => {
    const partial = (operations: unknown[]) => ({
        type: "tool-restructure_diagram",
        toolCallId: "s1",
        state: "input-streaming",
        input: { operations },
    })

    it("renders an operation with no name yet", () => {
        const { container } = render(
            <ToolCallCard {...base} part={partial([{}]) as never} />,
        )
        expect(container.textContent).toContain("…")
    })

    it("renders a half-typed operation name", () => {
        const { container } = render(
            <ToolCallCard
                {...base}
                part={partial([{ op: "add_contai" }]) as never}
            />,
        )
        expect(container.textContent).toContain("add_contai")
    })

    it("survives a hole in the array", () => {
        // A repaired JSON array can have missing entries, which arrive as undefined.
        const { container } = render(
            <ToolCallCard
                {...base}
                part={
                    partial([
                        { op: "set_page", aspect: 0.8 },
                        undefined,
                        null,
                        { op: "add_box", id: "a", label: "A" },
                    ]) as never
                }
            />,
        )
        const text = container.textContent ?? ""
        expect(text).toContain("set_page")
        expect(text).toContain("add_box")
    })

    it("survives an operation whose fields are half-formed", () => {
        const { container } = render(
            <ToolCallCard
                {...base}
                part={
                    partial([
                        { op: "add_graph", id: "g", nodes: undefined },
                        { op: "add_box", label: null },
                        { op: 42 },
                    ]) as never
                }
            />,
        )
        expect(container.textContent).toContain("add_graph")
    })

    it("edit_diagram's renderer survives the same partial input", () => {
        const { container } = render(
            <ToolCallCard
                {...base}
                part={
                    {
                        type: "tool-edit_diagram",
                        toolCallId: "s2",
                        state: "input-streaming",
                        input: {
                            operations: [
                                {},
                                { operation: "upda" },
                                undefined,
                                { operation: "update", cell_id: "3" },
                            ],
                        },
                    } as never
                }
            />,
        )
        const text = container.textContent ?? ""
        expect(text).toContain("cell_id: 3")
        // Exactly one label, for the one entry that has an id — a half-formed entry must
        // not print a bare "cell_id:" with nothing after it, which is the original bug.
        expect(text.match(/cell_id:/g)).toHaveLength(1)
    })
})
