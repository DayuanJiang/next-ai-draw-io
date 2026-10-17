/**
 * Tests for the per-session .drawio auto-save (src/persistence.ts).
 */

import {
    chmodSync,
    existsSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    utimesSync,
    writeFileSync,
} from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import type { HistorySource } from "../src/history.ts"
import { Autosaver, defaultDataDir } from "../src/persistence.ts"

const DIAGRAM = `<mxfile><diagram id="p" name="P"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" vertex="1" parent="1"/></root></mxGraphModel></diagram></mxfile>`
const BLANK = `<mxfile><diagram id="page-1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const tempDir = () => mkdtempSync(join(tmpdir(), "mcp-autosave-"))

describe("Autosaver", () => {
    it("writes the latest XML once changes settle", async () => {
        const dir = tempDir()
        const saver = new Autosaver(dir, 30)
        saver.schedule("mcp-a", DIAGRAM.replace('id="a"', 'id="first"'))
        saver.schedule("mcp-a", DIAGRAM)
        const path = saver.pathFor("mcp-a") as string
        expect(existsSync(path)).toBe(false)
        await sleep(80)
        expect(readFileSync(path, "utf-8")).toBe(DIAGRAM)
        expect(readdirSync(dir)).toEqual(["mcp-a.drawio"])
    })

    it("saves a new document of empty pages the user named", async () => {
        const dir = tempDir()
        const saver = new Autosaver(dir, 10)
        const emptyPage = (name: string) =>
            `<diagram id="${name}" name="${name}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram>`
        const pages = `<mxfile>${emptyPage("Planning")}${emptyPage("Notes")}</mxfile>`
        saver.schedule("mcp-pages", pages)
        saver.flush()
        expect(
            readFileSync(saver.pathFor("mcp-pages") as string, "utf-8"),
        ).toBe(pages)
    })

    it("skips a blank page that was never saved, but saves clearing a diagram", async () => {
        const dir = tempDir()
        const saver = new Autosaver(dir, 10)
        saver.schedule("mcp-blank", BLANK)
        await sleep(40)
        expect(existsSync(saver.pathFor("mcp-blank") as string)).toBe(false)

        saver.schedule("mcp-b", DIAGRAM)
        saver.flush()
        saver.schedule("mcp-b", BLANK)
        saver.flush()
        expect(readFileSync(saver.pathFor("mcp-b") as string, "utf-8")).toBe(
            BLANK,
        )
    })

    it("keeps only the newest session files and never touches other files", () => {
        const dir = tempDir()
        const saver = new Autosaver(dir, 10, 2)
        // Session ids look like mcp-<time in base 36>-<random>
        const ids = [
            "mine",
            "mcp-notes",
            "mcp-system-design-v2",
            "mcp-mgd0a1b2-old123",
            "mcp-mgd0a1b3-mid456",
        ]
        for (const [i, id] of ids.entries()) {
            writeFileSync(join(dir, `${id}.drawio`), DIAGRAM)
            utimesSync(join(dir, `${id}.drawio`), 1000 + i, 1000 + i)
        }
        // A session's History file goes with its diagram
        writeFileSync(join(dir, "mcp-mgd0a1b2-old123.history.json"), "[]")
        writeFileSync(join(dir, "mcp-mgd0a1b3-mid456.history.json"), "[]")
        saver.schedule("mcp-mgd0a1b4-new789", DIAGRAM)
        saver.flush()
        expect(readdirSync(dir).sort()).toEqual([
            "mcp-mgd0a1b3-mid456.drawio",
            "mcp-mgd0a1b3-mid456.history.json",
            "mcp-mgd0a1b4-new789.drawio",
            "mcp-notes.drawio",
            "mcp-system-design-v2.drawio",
            "mine.drawio",
        ])
    })

    it("reads a session's saved diagram back", () => {
        const saver = new Autosaver(tempDir(), 10)
        expect(saver.load("mcp-none")).toBeNull()
        saver.schedule("mcp-back", DIAGRAM)
        saver.flush()
        expect(saver.load("mcp-back")).toBe(DIAGRAM)
        expect(new Autosaver(null).load("mcp-back")).toBeNull()
    })

    it("never replaces a saved file it could not read", () => {
        const saver = new Autosaver(tempDir(), 10)
        saver.schedule("mcp-locked", DIAGRAM)
        saver.flush()
        const path = saver.pathFor("mcp-locked") as string
        chmodSync(path, 0o000)
        try {
            expect(saver.load("mcp-locked")).toBeNull()
            // The blank page shown instead must not overwrite the diagram
            saver.schedule("mcp-locked", BLANK)
            saver.flush()
        } finally {
            chmodSync(path, 0o644)
        }
        expect(readFileSync(path, "utf-8")).toBe(DIAGRAM)
    })

    it("saves again once the file was read, or is gone", () => {
        const saver = new Autosaver(tempDir(), 10)
        saver.schedule("mcp-fixed", DIAGRAM)
        saver.flush()
        const path = saver.pathFor("mcp-fixed") as string
        chmodSync(path, 0o000)
        expect(saver.load("mcp-fixed")).toBeNull()
        // Permissions fixed; the session is recreated and reads the file
        chmodSync(path, 0o644)
        expect(saver.load("mcp-fixed")).toBe(DIAGRAM)
        const edited = DIAGRAM.replace('id="a"', 'id="b"')
        saver.schedule("mcp-fixed", edited)
        saver.flush()
        expect(readFileSync(path, "utf-8")).toBe(edited)

        // A file that could not be read and was then deleted protects
        // nothing any more
        chmodSync(path, 0o000)
        expect(saver.load("mcp-fixed")).toBeNull()
        chmodSync(path, 0o644)
        rmSync(path)
        expect(saver.load("mcp-fixed")).toBeNull()
        saver.schedule("mcp-fixed", DIAGRAM)
        saver.flush()
        expect(readFileSync(path, "utf-8")).toBe(DIAGRAM)
    })

    it("saves again when the unreadable file is deleted during the session", () => {
        const saver = new Autosaver(tempDir(), 10)
        saver.schedule("mcp-live", DIAGRAM)
        saver.flush()
        const path = saver.pathFor("mcp-live") as string
        chmodSync(path, 0o000)
        expect(saver.load("mcp-live")).toBeNull()
        // The session goes on (load is not called again); the user removes
        // the broken file
        chmodSync(path, 0o644)
        rmSync(path)
        saver.schedule("mcp-live", DIAGRAM)
        saver.flush()
        expect(readFileSync(path, "utf-8")).toBe(DIAGRAM)
    })

    it("keeps protecting a file it cannot even look at", () => {
        // A folder without permission makes the file look missing; it is not
        const dir = tempDir()
        const saver = new Autosaver(dir, 10)
        saver.schedule("mcp-hidden", DIAGRAM)
        saver.flush()
        const path = saver.pathFor("mcp-hidden") as string
        chmodSync(path, 0o000)
        expect(saver.load("mcp-hidden")).toBeNull()
        chmodSync(dir, 0o000)
        try {
            expect(saver.load("mcp-hidden")).toBeNull()
        } finally {
            chmodSync(dir, 0o755)
        }
        chmodSync(path, 0o644)
        saver.schedule("mcp-hidden", BLANK)
        saver.flush()
        expect(readFileSync(path, "utf-8")).toBe(DIAGRAM)
    })

    it("does nothing when saving is off", () => {
        const saver = new Autosaver(null)
        expect(saver.pathFor("mcp-x")).toBeNull()
        expect(saver.historyPathFor("mcp-x")).toBeNull()
        expect(saver.loadHistory("mcp-x")).toEqual([])
        saver.schedule("mcp-x", DIAGRAM)
        saver.flush()
    })

    it("lists every session file newest first, hand-named ones included", () => {
        const dir = tempDir()
        const saver = new Autosaver(dir, 10)
        const names = [
            "mcp-mgd0a1b2-old123.drawio",
            "mine.drawio",
            "mcp-notes.drawio",
            "mcp-readme.txt",
            "mcp-mgd0a1b3-new456.drawio",
        ]
        for (const [i, name] of names.entries()) {
            writeFileSync(join(dir, name), DIAGRAM)
            utimesSync(join(dir, name), 1000 + i, 1000 + i)
        }
        expect(saver.dataDir()).toBe(dir)
        expect(saver.list()).toEqual([
            {
                sessionId: "mcp-mgd0a1b3-new456",
                path: join(dir, "mcp-mgd0a1b3-new456.drawio"),
                savedAt: new Date(1004 * 1000),
            },
            {
                sessionId: "mcp-notes",
                path: join(dir, "mcp-notes.drawio"),
                savedAt: new Date(1002 * 1000),
            },
            {
                sessionId: "mcp-mgd0a1b2-old123",
                path: join(dir, "mcp-mgd0a1b2-old123.drawio"),
                savedAt: new Date(1000 * 1000),
            },
        ])
    })

    it("lists nothing when saving is off or the folder does not exist", () => {
        const off = new Autosaver(null)
        expect(off.dataDir()).toBeNull()
        expect(off.list()).toEqual([])
        expect(new Autosaver(join(tempDir(), "missing")).list()).toEqual([])
    })
})

describe("Autosaver History", () => {
    const V1 = DIAGRAM.replace('id="a"', 'id="v1"')
    const V2 = DIAGRAM.replace('id="a"', 'id="v2"')
    const V3 = DIAGRAM.replace('id="a"', 'id="v3"')
    // One session's History entries, as history.ts keeps them (the saver
    // leaves the thumbnails out)
    const withHistory = (
        dir: string,
        entries: { id: number; xml: string; source?: HistorySource }[],
    ) => new Autosaver(dir, 30, 50, () => entries)

    it("saves the XML of the History entries next to the diagram", async () => {
        const dir = tempDir()
        const entries = [
            { id: 0, xml: V1 },
            { id: 1, xml: V2 },
        ]
        const saver = withHistory(dir, entries)
        const path = saver.historyPathFor("mcp-h") as string
        expect(path).toBe(join(dir, "mcp-h.history.json"))
        saver.schedule("mcp-h", V2)
        expect(existsSync(path)).toBe(false)
        await sleep(80)
        expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual([
            { xml: V1 },
            { xml: V2 },
        ])
        expect(saver.loadHistory("mcp-h")).toEqual([{ xml: V1 }, { xml: V2 }])
        expect(readdirSync(dir).sort()).toEqual([
            "mcp-h.drawio",
            "mcp-h.history.json",
        ])
    })

    it("saves a diagram cleared before its first save, with its History", () => {
        const dir = tempDir()
        const saver = withHistory(dir, [{ id: 0, xml: V1 }])
        saver.schedule("mcp-cleared", BLANK)
        saver.flush()
        expect(
            readFileSync(saver.pathFor("mcp-cleared") as string, "utf-8"),
        ).toBe(BLANK)
        expect(saver.loadHistory("mcp-cleared")).toEqual([{ xml: V1 }])
    })

    it("still skips a blank page whose History holds only blank pages", () => {
        const dir = tempDir()
        const saver = withHistory(dir, [{ id: 0, xml: BLANK }])
        saver.schedule("mcp-empty", BLANK)
        saver.flush()
        expect(readdirSync(dir)).toEqual([])
    })

    it("writes the History again after the cap removed it", () => {
        const dir = tempDir()
        const entries = [{ id: 0, xml: V1 }]
        const saver = new Autosaver(dir, 10, 1, () => entries)
        const old = "mcp-aaaaaaaa-old"
        saver.schedule(old, V1)
        saver.flush()
        utimesSync(saver.pathFor(old) as string, 1000, 1000)
        // A newer session pushes the old one out
        saver.schedule("mcp-aaaaaaab-new", V1)
        saver.flush()
        expect(existsSync(saver.historyPathFor(old) as string)).toBe(false)
        // The old session is still open and saves again, History unchanged
        saver.schedule(old, V1)
        saver.flush()
        expect(saver.loadHistory(old)).toEqual([{ xml: V1 }])
    })

    it("rewrites the History file only when the entries changed", () => {
        const dir = tempDir()
        const entries = [{ id: 0, xml: V1 }]
        const saver = withHistory(dir, entries)
        saver.schedule("mcp-same", V1)
        saver.flush()
        const path = saver.historyPathFor("mcp-same") as string
        utimesSync(path, 1000, 1000)
        const old = statSync(path).mtimeMs

        // draw.io's own autosave of an unchanged diagram
        saver.schedule("mcp-same", V1)
        saver.flush()
        expect(statSync(path).mtimeMs).toBe(old)

        entries.push({ id: 1, xml: V2 })
        saver.schedule("mcp-same", V2)
        saver.flush()
        expect(statSync(path).mtimeMs).not.toBe(old)
        expect(saver.loadHistory("mcp-same")).toEqual([
            { xml: V1 },
            { xml: V2 },
        ])

        // The circular buffer dropped the oldest entry: same length, new id
        entries.shift()
        entries.push({ id: 2, xml: V3 })
        saver.schedule("mcp-same", V3)
        saver.flush()
        expect(saver.loadHistory("mcp-same")).toEqual([
            { xml: V2 },
            { xml: V3 },
        ])
    })

    it("writes no History file while there are no entries", () => {
        const dir = tempDir()
        const saver = withHistory(dir, [])
        saver.schedule("mcp-empty", DIAGRAM)
        saver.flush()
        expect(readdirSync(dir)).toEqual(["mcp-empty.drawio"])
    })

    it("reads [] for a missing or malformed History file", () => {
        const dir = tempDir()
        const saver = new Autosaver(dir, 10)
        const path = saver.historyPathFor("mcp-bad") as string
        expect(saver.loadHistory("mcp-bad")).toEqual([])
        for (const content of [
            "{not json",
            '{"a":1}',
            "[1, 2]",
            '"x"',
            '[{"source":"user"}]',
        ]) {
            writeFileSync(path, content)
            expect(saver.loadHistory("mcp-bad")).toEqual([])
        }
    })

    it("reads the History files of earlier versions, which hold the XML alone", () => {
        const dir = tempDir()
        const saver = new Autosaver(dir, 10)
        writeFileSync(
            saver.historyPathFor("mcp-old") as string,
            JSON.stringify([V1, V2]),
        )
        expect(saver.loadHistory("mcp-old")).toEqual([{ xml: V1 }, { xml: V2 }])
    })

    it("keeps who made each entry, so the shell's cards look the same after a restart", () => {
        // A clear of the canvas and a restore of it: without the source, the
        // restored copy would show as a second clear
        const dir = tempDir()
        const saver = withHistory(dir, [
            { id: 0, xml: V1 },
            { id: 1, xml: BLANK, source: "user" },
            { id: 2, xml: V2, source: "restore" },
            { id: 3, xml: V1, source: "recover" },
            { id: 4, xml: V2, source: "load" },
            { id: 5, xml: V1, source: "add_page" },
        ])
        saver.schedule("mcp-who", V1)
        saver.flush()
        expect(saver.loadHistory("mcp-who")).toEqual([
            { xml: V1 },
            { xml: BLANK, source: "user" },
            { xml: V2, source: "restore" },
            { xml: V1, source: "recover" },
            { xml: V2, source: "load" },
            { xml: V1, source: "add_page" },
        ])
        // A source the server does not know is left out
        writeFileSync(
            saver.historyPathFor("mcp-who") as string,
            JSON.stringify([{ xml: V1, source: "robot" }]),
        )
        expect(saver.loadHistory("mcp-who")).toEqual([{ xml: V1 }])
    })
})

describe("defaultDataDir", () => {
    it("reads DRAWIO_DATA_DIR, where off disables saving", () => {
        vi.stubEnv("DRAWIO_DATA_DIR", "off")
        expect(defaultDataDir()).toBeNull()
        vi.stubEnv("DRAWIO_DATA_DIR", "/tmp/x")
        expect(defaultDataDir()).toBe("/tmp/x")
        vi.stubEnv("DRAWIO_DATA_DIR", undefined)
        expect(defaultDataDir()).toMatch(/\.next-ai-drawio$/)
    })

    it("expands ~, which JSON configs pass on as it is", () => {
        vi.stubEnv("DRAWIO_DATA_DIR", "~/drawio-saves")
        expect(defaultDataDir()).toBe(join(homedir(), "drawio-saves"))
    })
})
