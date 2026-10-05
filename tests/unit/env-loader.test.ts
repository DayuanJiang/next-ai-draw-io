// @vitest-environment node
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const dir = vi.hoisted(() => ({ path: "" }))
vi.mock("electron", () => ({
    app: {
        getPath: (name: string) =>
            name === "exe" ? `${dir.path}/app/exe` : dir.path,
        getAppPath: () => `${dir.path}/app`,
    },
}))

import { loadEnvFile } from "@/electron/main/env-loader"

const KEYS = ["T_JSON", "T_COMMENT", "T_PLAIN", "T_DOUBLE"]
afterEach(() => {
    for (const k of KEYS) delete process.env[k]
})

describe("loadEnvFile", () => {
    it("reads quoted values like dotenv", () => {
        dir.path = mkdtempSync(join(tmpdir(), "env-loader-"))
        writeFileSync(
            join(dir.path, ".env"),
            [
                // An apostrophe inside a single-quoted JSON value
                `T_JSON='{"name":"Team's models"}'`,
                `T_COMMENT="value" # a comment`,
                "T_PLAIN=plain  # a comment",
                `T_DOUBLE="say "hi""`,
            ].join("\n"),
        )
        loadEnvFile()
        expect(process.env.T_JSON).toBe(`{"name":"Team's models"}`)
        expect(process.env.T_COMMENT).toBe("value")
        expect(process.env.T_PLAIN).toBe("plain")
        expect(process.env.T_DOUBLE).toBe(`say "hi"`)
    })
})
