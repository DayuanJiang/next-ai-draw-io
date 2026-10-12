/**
 * Tests for the user's instructions.md appended to the drawing guide
 * (src/custom-instructions.ts).
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import {
    CUSTOM_INSTRUCTIONS_FILE,
    customInstructionsDir,
    guideWithCustomInstructions,
    readCustomInstructions,
} from "../src/custom-instructions.ts"
import { DRAWING_GUIDE } from "../src/drawing-guide.ts"

const GUIDE = "# Drawing guide\n\nKeep edges orthogonal."
const tempDir = () => mkdtempSync(join(tmpdir(), "mcp-instructions-"))
const writeRules = (dir: string, text: string) =>
    writeFileSync(join(dir, CUSTOM_INSTRUCTIONS_FILE), text)

describe("readCustomInstructions", () => {
    it("gives an empty string when there is no file", () => {
        const dir = tempDir()
        expect(readCustomInstructions(dir)).toBe("")
        expect(guideWithCustomInstructions(GUIDE, dir)).toBe(GUIDE)
    })

    it("appends the file's content under its own heading", () => {
        const dir = tempDir()
        writeRules(dir, "\nAlways draw in minimal style.\n\n")
        expect(readCustomInstructions(dir)).toBe(
            "Always draw in minimal style.",
        )
        expect(guideWithCustomInstructions(GUIDE, dir)).toBe(
            `${GUIDE}\n\n## Custom Instructions\nAlways draw in minimal style.`,
        )
    })

    it("cuts the content at 5000 characters", () => {
        const dir = tempDir()
        writeRules(dir, "x".repeat(6000))
        expect(readCustomInstructions(dir)).toBe("x".repeat(5000))
    })

    it("gives an empty string when the file cannot be read", () => {
        const dir = tempDir()
        // A folder in place of the file: readFileSync fails with EISDIR
        mkdirSync(join(dir, CUSTOM_INSTRUCTIONS_FILE))
        expect(readCustomInstructions(dir)).toBe("")
        expect(guideWithCustomInstructions(GUIDE, dir)).toBe(GUIDE)
    })

    it("reads the file again on every call", () => {
        const dir = tempDir()
        writeRules(dir, "First rule.")
        expect(readCustomInstructions(dir)).toBe("First rule.")
        writeRules(dir, "Second rule.")
        expect(readCustomInstructions(dir)).toBe("Second rule.")
    })
})

describe("customInstructionsDir", () => {
    it("honours DRAWIO_DATA_DIR", () => {
        const dir = tempDir()
        writeRules(dir, "Use blue fill #dae8fc.")
        vi.stubEnv("DRAWIO_DATA_DIR", dir)
        expect(customInstructionsDir()).toBe(dir)
        expect(guideWithCustomInstructions(GUIDE)).toBe(
            `${GUIDE}\n\n## Custom Instructions\nUse blue fill #dae8fc.`,
        )
    })

    it("expands ~, which JSON configs pass on as it is", () => {
        vi.stubEnv("DRAWIO_DATA_DIR", "~/drawio-saves")
        expect(customInstructionsDir()).toBe(join(homedir(), "drawio-saves"))
    })

    it("falls back to the home folder when DRAWIO_DATA_DIR is off or unset", () => {
        const home = join(homedir(), ".next-ai-drawio")
        vi.stubEnv("DRAWIO_DATA_DIR", "off")
        expect(customInstructionsDir()).toBe(home)
        vi.stubEnv("DRAWIO_DATA_DIR", undefined)
        expect(customInstructionsDir()).toBe(home)
    })
})

describe("DRAWING_GUIDE", () => {
    it("stays within its own budget; instructions.md adds up to 5000 more", () => {
        expect(DRAWING_GUIDE.length).toBeLessThanOrEqual(15000)
    })
})
