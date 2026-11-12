import { describe, expect, it } from "vitest"
import { extractTitle, type StoredMessage } from "@/lib/session-storage"

const userMessage = (text: string): StoredMessage[] => [
    { id: "u1", role: "user", parts: [{ type: "text", text }] },
]

describe("extractTitle", () => {
    it("leaves out the text of attached files and pages", () => {
        expect(
            extractTitle(
                userMessage(
                    "Draw the method as a flowchart\n\n[PDF: paper.pdf]\nRAG-Lite: retrieval...\n\n[URL: https://example.com]\nTitle: Example\n\nBody",
                ),
            ),
        ).toBe("Draw the method as a flowchart")
        expect(
            extractTitle(userMessage("Summarize\n\n[File: notes.md]\n# Notes")),
        ).toBe("Summarize")
    })

    it('leaves out an attached file whose name has "]" in it', () => {
        expect(
            extractTitle(
                userMessage(
                    "Summarize this paper\n\n[PDF: [2301.00001] Attention.pdf]\nLONG PDF TEXT",
                ),
            ),
        ).toBe("Summarize this paper")
    })

    it("puts the typed text on one line", () => {
        expect(extractTitle(userMessage("Login flow:\n  email,\n  SMS"))).toBe(
            "Login flow: email, SMS",
        )
    })

    it("leaves out the Markdown marks of bold text and headings", () => {
        expect(
            extractTitle(
                userMessage(
                    "Give me a **animated connector** diagram of transformer's architecture",
                ),
            ),
        ).toBe(
            "Give me a animated connector diagram of transformer's architecture",
        )
        expect(
            extractTitle(userMessage("# Login flow\n## Steps: 2 ** 3")),
        ).toBe("Login flow Steps: 2 ** 3")
    })

    it("shortens a long prompt", () => {
        const title = extractTitle(userMessage("a ".repeat(80)))
        expect(title.endsWith("...")).toBe(true)
        expect(title.length).toBeLessThanOrEqual(103)
    })

    it("names a chat without a typed message New Chat", () => {
        expect(extractTitle([])).toBe("New Chat")
        expect(extractTitle(userMessage("   "))).toBe("New Chat")
    })
})
