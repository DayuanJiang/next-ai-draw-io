/**
 * Auto-save of each session's latest diagram as a plain .drawio file, so a
 * diagram survives the MCP process (hosts start a new one when a
 * conversation is resumed). Like the web app's IndexedDB sessions
 * (lib/session-storage.ts): saved 1 second after the last change, at most
 * 50 kept. History is not saved.
 */

import {
    existsSync,
    mkdirSync,
    readdirSync,
    renameSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { log } from "./logger.js"

const DELAY_MS = 1000
const MAX_FILES = 50

/** DRAWIO_DATA_DIR, default ~/.next-ai-drawio; "off" disables saving. */
export function defaultDataDir(): string | null {
    const dir = process.env.DRAWIO_DATA_DIR
    if (dir === "off") return null
    return dir || join(homedir(), ".next-ai-drawio")
}

/** Any cell besides the root cells "0" and "1" */
export const hasCells = (xml: string) =>
    /<(mxCell\b[^>]*\bid="(?![01]")|UserObject\b|object\b)/.test(xml)

export class Autosaver {
    private pending = new Map<
        string,
        { xml: string; timer: ReturnType<typeof setTimeout> }
    >()

    constructor(
        private dir: string | null,
        private delayMs = DELAY_MS,
        private maxFiles = MAX_FILES,
    ) {}

    /** Path of a session's file, or null when saving is off. */
    pathFor(sessionId: string): string | null {
        return this.dir ? join(this.dir, `${sessionId}.drawio`) : null
    }

    schedule(sessionId: string, xml: string): void {
        if (!this.dir) return
        const previous = this.pending.get(sessionId)
        if (previous) clearTimeout(previous.timer)
        const timer = setTimeout(() => this.write(sessionId), this.delayMs)
        timer.unref?.()
        this.pending.set(sessionId, { xml, timer })
    }

    /** Write every pending save now (on shutdown). */
    flush(): void {
        for (const [sessionId, { timer }] of this.pending) {
            clearTimeout(timer)
            this.write(sessionId)
        }
    }

    private write(sessionId: string): void {
        const entry = this.pending.get(sessionId)
        this.pending.delete(sessionId)
        const path = this.pathFor(sessionId)
        if (!entry || !this.dir || !path) return
        try {
            const isNew = !existsSync(path)
            // A blank page the browser shows before any drawing: nothing to keep
            if (isNew && !hasCells(entry.xml)) return
            mkdirSync(this.dir, { recursive: true })
            // Write to a temporary file first so a crash never leaves half a file
            writeFileSync(`${path}.tmp`, entry.xml, "utf-8")
            renameSync(`${path}.tmp`, path)
            if (isNew) this.removeOldest()
        } catch (error) {
            log.warn(`Auto-save failed for ${path}: ${error}`)
        }
    }

    private removeOldest(): void {
        if (!this.dir) return
        const dir = this.dir
        // Only our own session files: DRAWIO_DATA_DIR may be a folder
        // that also holds the user's diagrams
        const files = readdirSync(dir)
            .filter((f) => f.startsWith("mcp-") && f.endsWith(".drawio"))
            .map((f) => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime)
        for (const { f } of files.slice(this.maxFiles)) {
            unlinkSync(join(dir, f))
        }
    }
}
