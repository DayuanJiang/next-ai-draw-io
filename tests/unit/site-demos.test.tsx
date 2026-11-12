import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { DemoPlayer, type DemoTexts } from "@/components/site/demo-player"
import { McpDemo } from "@/components/site/mcp-demo"

// jsdom's SVG paths have no getTotalLength, like the browser that reported
// "t.getTotalLength is not a function" on the About page: the demos threw
// before their first step and never played

const EDITOR: DemoTexts = {
    replay: "Replay",
    steps: [
        { title: "Generate", text: "The AI draws what you describe" },
        { title: "Edit by hand", text: "Drag shapes as in draw.io" },
        { title: "Edit with AI", text: "Select a shape, ask for a change" },
        { title: "Version history", text: "Go back to any earlier version" },
    ],
    prompts: { draw: "Draw a serverless API", cache: "Add a cache" },
    replies: { draw: "A serverless API.", cache: "Added a cache." },
    drawing: "Drawing",
    changing: "Changing",
    placeholder: "Describe your diagram",
    selected: "Selected: DynamoDB",
    versions: {
        created: "Drew the diagram",
        edited: "Changed the diagram",
        undo: "Undo change",
        restoreV1: "Restore v1",
        restoreV2: "Restore v2",
        editedSince: "Edited by hand since",
        drawSummary: "6 shapes, 5 connectors",
        cacheSummary: "Added 1 shape",
    },
}

beforeEach(() => {
    // In view at once, and with reduced motion a demo plays without waits
    vi.stubGlobal(
        "IntersectionObserver",
        class {
            constructor(
                private seen: (entries: { isIntersecting: boolean }[]) => void,
            ) {}
            observe() {
                this.seen([{ isIntersecting: true }])
            }
            disconnect() {}
        },
    )
    vi.stubGlobal("matchMedia", () => ({ matches: true }))
})

afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

it("the MCP demo plays where a connector's length cannot be measured", async () => {
    render(
        <McpDemo
            texts={{
                prompt: "Draw this project's architecture",
                intro: "I'll read the code first.",
                done: "The diagram is in the preview.",
                replay: "Replay",
            }}
        />,
    )
    // Shown once the demo has played to its end
    expect(await screen.findByRole("button", { name: "Replay" })).toBeTruthy()
})

it("the editor demo plays where a connector's length cannot be measured", async () => {
    render(<DemoPlayer texts={EDITOR} scene={0} />)
    expect(await screen.findByRole("button", { name: "Replay" })).toBeTruthy()
})
