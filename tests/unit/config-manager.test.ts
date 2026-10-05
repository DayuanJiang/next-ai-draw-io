// @vitest-environment node
import {
    existsSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const userData = vi.hoisted(() => ({ dir: "" }))
vi.mock("electron", () => ({
    app: { getPath: () => userData.dir },
    safeStorage: { isEncryptionAvailable: () => false },
}))

// Make the next read of the presets file fail, like a file an antivirus
// scanner holds on Windows
const readFails = vi.hoisted(() => ({ next: false }))
// Make renaming the presets file fail, as when a sync tool holds it
const renameFails = vi.hoisted(() => ({ on: false }))
vi.mock("node:fs", async (importOriginal) => {
    const fs = await importOriginal<typeof import("node:fs")>()
    return {
        ...fs,
        readFileSync: ((...args: Parameters<typeof fs.readFileSync>) => {
            if (readFails.next && String(args[0]).endsWith(".json")) {
                readFails.next = false
                throw Object.assign(new Error("EBUSY: resource busy"), {
                    code: "EBUSY",
                })
            }
            return fs.readFileSync(...args)
        }) as typeof fs.readFileSync,
        renameSync: ((...args: Parameters<typeof fs.renameSync>) => {
            if (renameFails.on && String(args[0]).endsWith(".json")) {
                throw Object.assign(
                    new Error("EPERM: operation not permitted"),
                    {
                        code: "EPERM",
                    },
                )
            }
            return fs.renameSync(...args)
        }) as typeof fs.renameSync,
    }
})

import { createPreset, loadPresets } from "@/electron/main/config-manager"

const presetsFile = () => join(userData.dir, "config-presets.json")

beforeEach(() => {
    userData.dir = mkdtempSync(join(tmpdir(), "config-manager-"))
    readFails.next = false
    renameFails.on = false
})

describe("config presets file", () => {
    it("keeps a file it could not read for now", () => {
        createPreset({ name: "Mine", config: { AI_PROVIDER: "openai" } })

        readFails.next = true
        expect(loadPresets().presets).toEqual([])
        expect(existsSync(presetsFile())).toBe(true)

        // A save based on that empty read must not replace the presets
        readFails.next = true
        expect(() =>
            createPreset({ name: "New", config: { AI_PROVIDER: "openai" } }),
        ).toThrow()
        expect(loadPresets().presets.map((p) => p.name)).toEqual(["Mine"])
    })

    it("saves again once a file it could not read is gone", () => {
        createPreset({ name: "Mine", config: { AI_PROVIDER: "openai" } })
        readFails.next = true
        loadPresets()
        // The user removes the file to start over
        rmSync(presetsFile())
        createPreset({ name: "New", config: { AI_PROVIDER: "openai" } })
        expect(loadPresets().presets.map((p) => p.name)).toEqual(["New"])
    })

    it("keeps a file that is not JSON when it cannot be moved aside", () => {
        writeFileSync(presetsFile(), "{not json")
        renameFails.on = true
        expect(loadPresets().presets).toEqual([])
        // A save based on that empty read must not replace it
        expect(() =>
            createPreset({ name: "New", config: { AI_PROVIDER: "openai" } }),
        ).toThrow()
        expect(readFileSync(presetsFile(), "utf-8")).toBe("{not json")
    })

    it("moves a file that is not JSON aside", () => {
        writeFileSync(presetsFile(), "{not json")
        expect(loadPresets().presets).toEqual([])
        expect(existsSync(presetsFile())).toBe(false)
        expect(
            readdirSync(userData.dir).some((f) =>
                f.startsWith("config-presets.json.corrupt-"),
            ),
        ).toBe(true)
    })
})
