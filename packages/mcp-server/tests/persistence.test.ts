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
    utimesSync,
    writeFileSync,
} from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { installDomPolyfill } from "../src/dom.ts"
import { Autosaver, defaultDataDir } from "../src/persistence.ts"

beforeAll(() => {
    installDomPolyfill()
})

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
        saver.schedule("mcp-mgd0a1b4-new789", DIAGRAM)
        saver.flush()
        expect(readdirSync(dir).sort()).toEqual([
            "mcp-mgd0a1b3-mid456.drawio",
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
        saver.schedule("mcp-x", DIAGRAM)
        saver.flush()
    })
})

describe("defaultDataDir", () => {
    const original = process.env.DRAWIO_DATA_DIR
    afterEach(() => {
        if (original === undefined) delete process.env.DRAWIO_DATA_DIR
        else process.env.DRAWIO_DATA_DIR = original
    })

    it("reads DRAWIO_DATA_DIR, where off disables saving", () => {
        process.env.DRAWIO_DATA_DIR = "off"
        expect(defaultDataDir()).toBeNull()
        process.env.DRAWIO_DATA_DIR = "/tmp/x"
        expect(defaultDataDir()).toBe("/tmp/x")
        delete process.env.DRAWIO_DATA_DIR
        expect(defaultDataDir()).toMatch(/\.next-ai-drawio$/)
    })

    it("expands ~, which JSON configs pass on as it is", () => {
        process.env.DRAWIO_DATA_DIR = "~/drawio-saves"
        expect(defaultDataDir()).toBe(join(homedir(), "drawio-saves"))
    })
})
