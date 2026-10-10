/**
 * The user's own drawing rules, kept in a Markdown file and appended to the
 * drawing guide, like the web app's custom system message
 * (app/api/chat/route.ts). The file is read on every call, so edits apply
 * without restarting the MCP host.
 */

import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { log } from "./logger.ts"
import { expandHome } from "./persistence.ts"

export const CUSTOM_INSTRUCTIONS_FILE = "instructions.md"

// Same cap as the web app's custom system message
const MAX_CHARS = 5000

/**
 * DRAWIO_DATA_DIR, default ~/.next-ai-drawio. "off" only turns auto-save
 * off; this file is merely read, so the default folder is used then.
 */
export function customInstructionsDir(): string {
    const dir = process.env.DRAWIO_DATA_DIR
    return dir && dir !== "off"
        ? expandHome(dir)
        : join(homedir(), ".next-ai-drawio")
}

/** Full path of the instructions file. */
export function customInstructionsPath(dir = customInstructionsDir()): string {
    return join(dir, CUSTOM_INSTRUCTIONS_FILE)
}

let warned = false

/** The file's content, trimmed and capped; "" when there is none. */
export function readCustomInstructions(dir = customInstructionsDir()): string {
    const path = customInstructionsPath(dir)
    try {
        return readFileSync(path, "utf-8").trim().slice(0, MAX_CHARS)
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !warned) {
            warned = true
            log.warn(`Could not read the custom instructions ${path}: ${error}`)
        }
        return ""
    }
}

/** The guide with the user's rules appended under "## Custom Instructions". */
export function guideWithCustomInstructions(
    guide: string,
    dir?: string,
): string {
    const text = readCustomInstructions(dir)
    return text ? `${guide}\n\n## Custom Instructions\n${text}` : guide
}
