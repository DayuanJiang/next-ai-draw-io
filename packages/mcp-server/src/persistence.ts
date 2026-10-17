/**
 * Auto-save of each session's latest diagram as a plain .drawio file, so a
 * diagram survives the MCP process (hosts start a new one when a
 * conversation is resumed). Like the web app's IndexedDB sessions
 * (lib/session-storage.ts): saved 1 second after the last change, at most
 * 50 kept. The session's History (the XML of its last 20 versions and who
 * made each, without the thumbnails) is saved next to it as
 * <session-id>.history.json.
 */

import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { contentFingerprint } from "./edit-gate.ts"
import type { HistorySource } from "./history.ts"
import { log } from "./logger.ts"
import { BLANK_MXFILE, hasCells } from "./pages.ts"

// The blank page the browser shows before any drawing (page names count:
// empty pages the user named or added are kept)
const isBlank = (xml: string) =>
    !hasCells(xml) &&
    contentFingerprint(xml) === contentFingerprint(BLANK_MXFILE)

const DELAY_MS = 1000
const MAX_FILES = 50

/** A History entry as the file keeps it */
export interface SavedHistoryEntry {
    xml: string
    source?: HistorySource
}

const SOURCES: readonly string[] = [
    "user",
    "recover",
    "restore",
    "load",
    "add_page",
]
const isSource = (v: unknown): v is HistorySource =>
    typeof v === "string" && SOURCES.includes(v)

/** Expand a leading ~ to the home directory (shells do this, MCP hosts don't). */
export function expandHome(p: string): string {
    if (p === "~") return homedir()
    if (p.startsWith("~/") || p.startsWith("~\\")) return homedir() + p.slice(1)
    return p
}

/** DRAWIO_DATA_DIR, default ~/.next-ai-drawio; "off" disables saving. */
export function defaultDataDir(): string | null {
    const dir = process.env.DRAWIO_DATA_DIR
    if (dir === "off") return null
    return dir ? expandHome(dir) : join(homedir(), ".next-ai-drawio")
}

/** The file surely does not exist (not merely out of reach) */
function isGone(path: string): boolean {
    try {
        statSync(path)
        return false
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT"
    }
}

export class Autosaver {
    private pending = new Map<
        string,
        { xml: string; timer: ReturnType<typeof setTimeout> }
    >()

    constructor(
        private dir: string | null,
        private delayMs = DELAY_MS,
        private maxFiles = MAX_FILES,
        // The session's History entries, saved next to its diagram
        private history: (
            sessionId: string,
        ) => { id: number; xml: string; source?: HistorySource }[] = () => [],
    ) {}

    /** Path of a session's file, or null when saving is off. */
    pathFor(sessionId: string): string | null {
        return this.dir ? join(this.dir, `${sessionId}.drawio`) : null
    }

    /** Path of a session's History file, or null when saving is off. */
    historyPathFor(sessionId: string): string | null {
        return this.dir ? join(this.dir, `${sessionId}.history.json`) : null
    }

    /** The session's saved History entries, oldest first. */
    loadHistory(sessionId: string): SavedHistoryEntry[] {
        const path = this.historyPathFor(sessionId)
        if (!path) return []
        try {
            const entries: unknown = JSON.parse(readFileSync(path, "utf-8"))
            if (!Array.isArray(entries)) return []
            const result: SavedHistoryEntry[] = []
            for (const e of entries) {
                // Files of earlier versions hold the XML strings alone
                if (typeof e === "string") {
                    result.push({ xml: e })
                } else if (e && typeof e.xml === "string") {
                    result.push({
                        xml: e.xml,
                        ...(isSource(e.source) && { source: e.source }),
                    })
                } else {
                    return []
                }
            }
            return result
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                log.warn(`Could not read the saved History ${path}: ${error}`)
            }
            return []
        }
    }

    /** The folder the files are saved in, or null when saving is off. */
    dataDir(): string | null {
        return this.dir
    }

    /**
     * Every file a session can resume (start_session's own files and
     * hand-named ones such as mcp-notes.drawio), newest first. Empty when
     * saving is off or the folder does not exist yet.
     */
    list(): { sessionId: string; path: string; savedAt: Date }[] {
        return this.files(/^mcp-[a-z0-9-]{1,64}\.drawio$/).map((file) => ({
            sessionId: file.name.slice(0, -".drawio".length),
            path: file.path,
            savedAt: file.mtime,
        }))
    }

    /** The files in the folder whose name matches, newest first */
    private files(pattern: RegExp) {
        const dir = this.dir
        if (!dir || !existsSync(dir)) return []
        return readdirSync(dir)
            .filter((name) => pattern.test(name))
            .map((name) => {
                const path = join(dir, name)
                return { name, path, mtime: statSync(path).mtime }
            })
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
    }

    // Saved files that could not be read back: never written over, since
    // the session then shows something else than what they hold. Cleared
    // once the file is read, or is surely gone (a folder without permission
    // also makes a file look missing).
    private unreadable = new Set<string>()

    /** The session's saved diagram, or null. */
    load(sessionId: string): string | null {
        const path = this.pathFor(sessionId)
        if (!path) return null
        try {
            const xml = readFileSync(path, "utf-8")
            this.unreadable.delete(path)
            return xml
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                this.unreadable.delete(path)
                return null
            }
            log.warn(`Could not read the saved diagram ${path}: ${error}`)
            this.unreadable.add(path)
            return null
        }
    }

    schedule(sessionId: string, xml: string): void {
        if (!this.dir) return
        const previous = this.pending.get(sessionId)
        if (previous) clearTimeout(previous.timer)
        const timer = setTimeout(() => this.write(sessionId), this.delayMs)
        timer.unref()
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
        if (this.unreadable.has(path)) {
            // Deleted meanwhile: nothing left to protect
            if (isGone(path)) {
                this.unreadable.delete(path)
            } else {
                log.warn(
                    `Not saving ${path}: it could not be read, so it may hold work this session does not show`,
                )
                return
            }
        }
        try {
            const isNew = !existsSync(path)
            // A blank page the browser shows before any drawing: nothing to
            // keep (unless the diagram was cleared before its first save)
            if (
                isNew &&
                isBlank(entry.xml) &&
                this.history(sessionId).every((e) => isBlank(e.xml))
            )
                return
            mkdirSync(this.dir, { recursive: true })
            // Write to a temporary file first so a crash never leaves half a file
            writeFileSync(`${path}.tmp`, entry.xml, "utf-8")
            renameSync(`${path}.tmp`, path)
            this.writeHistory(sessionId)
            if (isNew) this.removeOldest()
        } catch (error) {
            log.warn(`Auto-save failed for ${path}: ${error}`)
        }
    }

    // What each session's History file holds (entry count and last id):
    // draw.io autosaves often, and the file is only rewritten when the
    // entries changed
    private historyKeys = new Map<string, string>()

    // Saved with the diagram, after the same delay, so the History entry
    // that follows every tool write is included. The thumbnails are left
    // out (large); the History grid shows the entry's number instead. Who
    // made an entry goes with it: the shell's cards tell a clear of the
    // canvas from a restore of one by it.
    private writeHistory(sessionId: string): void {
        const path = this.historyPathFor(sessionId)
        const entries = this.history(sessionId)
        if (!path || entries.length === 0) return
        const key = `${entries.length}:${entries[entries.length - 1].id}`
        if (this.historyKeys.get(sessionId) === key) return
        try {
            const saved: SavedHistoryEntry[] = entries.map((e) => ({
                xml: e.xml,
                ...(e.source && { source: e.source }),
            }))
            const json = JSON.stringify(saved)
            writeFileSync(`${path}.tmp`, json, "utf-8")
            renameSync(`${path}.tmp`, path)
            this.historyKeys.set(sessionId, key)
        } catch (error) {
            log.warn(`Saving the History failed for ${path}: ${error}`)
        }
    }

    private removeOldest(): void {
        // Only our own session files (mcp-<time in base 36>-<random>, made
        // by start_session): DRAWIO_DATA_DIR may be a folder that also holds
        // the user's diagrams
        const own = this.files(/^mcp-[0-9a-z]{8}-[0-9a-z]{1,6}\.drawio$/)
        for (const { name, path } of own.slice(this.maxFiles)) {
            unlinkSync(path)
            // Its History goes with it (there may be none), and is written
            // again if the session saves once more
            rmSync(path.replace(/\.drawio$/, ".history.json"), { force: true })
            this.historyKeys.delete(name.slice(0, -".drawio".length))
        }
    }
}
