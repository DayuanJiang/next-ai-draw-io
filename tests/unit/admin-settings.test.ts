import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
    _resetForTests,
    applyToEnv,
    getEnvFallback,
    getValueSource,
    isSettingsWritable,
    loadSettings,
    saveSettings,
} from "@/lib/admin/settings"

let tmpDir: string

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-settings-"))
    process.env.SETTINGS_FILE = path.join(tmpDir, "settings.json")
    _resetForTests()
})

afterEach(() => {
    _resetForTests()
    delete process.env.SETTINGS_FILE
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.TEST_ADMIN_VAR
})

describe("loadSettings", () => {
    it("returns empty object when file does not exist", () => {
        expect(loadSettings()).toEqual({})
    })

    it("reads values from the settings file", () => {
        fs.writeFileSync(
            process.env.SETTINGS_FILE!,
            JSON.stringify({ version: 1, values: { TEST_ADMIN_VAR: "abc" } }),
        )
        expect(loadSettings()).toEqual({ TEST_ADMIN_VAR: "abc" })
    })

    it("drops non-string values from a corrupted file", () => {
        fs.writeFileSync(
            process.env.SETTINGS_FILE!,
            JSON.stringify({
                version: 1,
                values: {
                    GOOD: "ok",
                    NUM: 5,
                    OBJ: { nested: true },
                    ARR: [1, 2],
                    NULL: null,
                },
            }),
        )
        expect(loadSettings()).toEqual({ GOOD: "ok" })
    })

    it("returns empty object when values is null", () => {
        fs.writeFileSync(
            process.env.SETTINGS_FILE!,
            JSON.stringify({ version: 1, values: null }),
        )
        expect(loadSettings()).toEqual({})
    })

    it("returns empty object when values is an array (no numeric keys)", () => {
        fs.writeFileSync(
            process.env.SETTINGS_FILE!,
            JSON.stringify({ version: 1, values: ["a", "b"] }),
        )
        // Without the Array.isArray guard this would yield { "0": "a", ... }
        expect(loadSettings()).toEqual({})
    })
})

describe("applyToEnv / saveSettings", () => {
    it("overlays file values onto process.env", () => {
        saveSettings({ TEST_ADMIN_VAR: "from-file" })
        expect(process.env.TEST_ADMIN_VAR).toBe("from-file")
    })

    it("file value wins over pre-existing env value", () => {
        process.env.TEST_ADMIN_VAR = "from-env"
        saveSettings({ TEST_ADMIN_VAR: "from-file" })
        expect(process.env.TEST_ADMIN_VAR).toBe("from-file")
    })

    it("deleting a key restores the original env value", () => {
        process.env.TEST_ADMIN_VAR = "from-env"
        saveSettings({ TEST_ADMIN_VAR: "from-file" })
        saveSettings({ TEST_ADMIN_VAR: null })
        expect(process.env.TEST_ADMIN_VAR).toBe("from-env")
    })

    it("deleting a key unsets env when there was no original value", () => {
        saveSettings({ TEST_ADMIN_VAR: "from-file" })
        saveSettings({ TEST_ADMIN_VAR: null })
        expect(process.env.TEST_ADMIN_VAR).toBeUndefined()
    })

    it("persists across cache reset (file round-trip)", () => {
        saveSettings({ TEST_ADMIN_VAR: "persisted" })
        _resetForTests()
        applyToEnv()
        expect(process.env.TEST_ADMIN_VAR).toBe("persisted")
    })
})

describe("getValueSource / getEnvFallback", () => {
    it("reports file source when key is in settings", () => {
        saveSettings({ TEST_ADMIN_VAR: "x" })
        expect(getValueSource("TEST_ADMIN_VAR")).toBe("file")
    })

    it("reports env source when only env is set", () => {
        process.env.TEST_ADMIN_VAR = "from-env"
        applyToEnv()
        expect(getValueSource("TEST_ADMIN_VAR")).toBe("env")
    })

    it("reports default when neither is set", () => {
        expect(getValueSource("TEST_ADMIN_VAR")).toBe("default")
    })

    it("returns the shadowed env value as fallback", () => {
        process.env.TEST_ADMIN_VAR = "from-env"
        saveSettings({ TEST_ADMIN_VAR: "from-file" })
        expect(getEnvFallback("TEST_ADMIN_VAR")).toBe("from-env")
    })
})

describe("isSettingsWritable", () => {
    it("returns true for a writable temp dir", () => {
        expect(isSettingsWritable()).toBe(true)
    })

    it("returns false for an unwritable path", () => {
        _resetForTests()
        process.env.SETTINGS_FILE = "/nonexistent-root-dir/settings.json"
        expect(isSettingsWritable()).toBe(false)
    })
})

describe("settings file on disk", () => {
    it("writes valid JSON with restrictive permissions", () => {
        saveSettings({ TEST_ADMIN_VAR: "secret" })
        const filePath = process.env.SETTINGS_FILE!
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"))
        expect(parsed).toEqual({
            version: 1,
            values: { TEST_ADMIN_VAR: "secret" },
        })
        const mode = fs.statSync(filePath).mode & 0o777
        expect(mode).toBe(0o600)
    })
})
