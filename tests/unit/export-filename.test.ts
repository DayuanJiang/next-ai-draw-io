import { describe, expect, it } from "vitest"
import { exportFilename } from "@/components/workspace/workspace"

describe("the file name proposed for an export", () => {
    it("has no full stop before the extension's", () => {
        // The title is the first message, often a whole sentence
        expect(
            exportFilename(
                "Replicate this flowchart as a draw.io diagram. Keep every label and arrow.",
            ),
        ).toBe(
            "Replicate this flowchart as a draw.io diagram. Keep every label and arrow",
        )
        expect(exportFilename("ログインの流れを描いてください。")).toBe(
            "ログインの流れを描いてください",
        )
    })

    it("ends a long title at a word", () => {
        const name = exportFilename(
            "Draw a flowchart of a user login: enter email and password, check credentials, if they are wrong show an error",
        )
        expect(name).toBe(
            "Draw a flowchart of a user login- enter email and password, check credentials",
        )
        // A cut title's dots (the chat list adds them) go too
        expect(exportFilename(`${"word ".repeat(30)}...`)).toBe(
            "word ".repeat(16).trim(),
        )
    })

    it("cuts a long title without spaces at 80 characters", () => {
        expect(exportFilename("図".repeat(120))).toBe("図".repeat(80))
    })

    it("is the date without a usable title", () => {
        for (const title of [null, "New Chat", "...", "  "]) {
            expect(exportFilename(title)).toMatch(/^diagram-\d{4}-\d{2}-\d{2}$/)
        }
    })
})
