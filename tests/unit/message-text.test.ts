import type { UIMessage } from "ai"
import { describe, expect, it } from "vitest"
import {
    APPENDED_FILE_SECTIONS_PATTERN,
    getUserOriginalText,
    splitTextIntoFileSections,
    withoutToolCallMarker,
} from "@/components/chat/message-text"

const userMessage = (text: string) =>
    ({ id: "u1", role: "user", parts: [{ type: "text", text }] }) as UIMessage

describe("attached files in a message's text", () => {
    it("splits the typed text from the attached files and pages", () => {
        const text =
            "Summarize\n\n[PDF: paper.pdf]\nRAG-Lite: retrieval\n\n[File: notes.md]\n# Notes\n\n[URL: https://example.com/a]\nTitle: Example\n\nBody"
        expect(getUserOriginalText(userMessage(text))).toBe("Summarize")
        expect(
            splitTextIntoFileSections(text).map((s) => [
                s.type,
                s.filename ?? s.content,
                s.fileType,
            ]),
        ).toEqual([
            ["text", "Summarize", undefined],
            ["file", "paper.pdf", "pdf"],
            ["file", "notes.md", "text"],
            ["url", "https://example.com/a", "url"],
        ])
    })

    it('reads a name with "]" in it', () => {
        for (const [kind, name] of [
            ["PDF", "[2301.00001] Attention.pdf"],
            ["File", "report[1].txt"],
            ["URL", "https://example.com/list?filter[name]=x"],
        ]) {
            const text = `Summarize this\n\n[${kind}: ${name}]\nThe text [1] of it\n\n[File: b.md]\nSecond`
            expect(getUserOriginalText(userMessage(text))).toBe(
                "Summarize this",
            )
            const sections = splitTextIntoFileSections(text)
            expect(sections.map((s) => s.filename ?? s.content)).toEqual([
                "Summarize this",
                name,
                "b.md",
            ])
            expect(sections[1].content).toBe("The text [1] of it")
            // What an edited message keeps after its new text
            expect(text.match(APPENDED_FILE_SECTIONS_PATTERN)?.[0]).toBe(
                text.slice("Summarize this".length),
            )
        }
    })
})

describe("withoutToolCallMarker", () => {
    it("drops the marker DeepSeek on Bedrock ends its text with", () => {
        // As it came in the stream: the bars are the fullwidth U+FF5C
        const bar = String.fromCharCode(0xff5c)
        expect(
            withoutToolCallMarker(
                `All parts in one view.\n\n<${bar}DSML${bar}function_calls`,
            ),
        ).toBe("All parts in one view.")
        const plain = "Use a | b, or <b>DSML</b>."
        expect(withoutToolCallMarker(plain)).toBe(plain)
    })
})
