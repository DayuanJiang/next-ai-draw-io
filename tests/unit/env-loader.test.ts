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

const KEYS = [
    "T_JSON",
    "T_COMMENT",
    "T_PLAIN",
    "T_DOUBLE",
    "T_QUOTED_COMMENT",
    "T_KEY_COMMENT",
    "T_HASH",
    "T_AFTER",
    "T_JOINED",
]
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

    it("drops a comment that ends with a quote, like dotenv", () => {
        // Expected values checked against dotenv 16.6.1's parse
        dir.path = mkdtempSync(join(tmpdir(), "env-loader-"))
        writeFileSync(
            join(dir.path, ".env"),
            [
                `T_QUOTED_COMMENT="gpt-5" # pick "fast"`,
                `T_KEY_COMMENT="sk-abc" # from "Team A"`,
                `T_AFTER='a' b`,
                `T_JOINED="a"b`,
                // Unquoted: a # without a space before it stays in the value
                // (dotenv would cut it; this loader never did)
                "T_HASH=http://host/#/x",
            ].join("\n"),
        )
        loadEnvFile()
        expect(process.env.T_QUOTED_COMMENT).toBe("gpt-5")
        expect(process.env.T_KEY_COMMENT).toBe("sk-abc")
        expect(process.env.T_AFTER).toBe(`'a' b`)
        expect(process.env.T_JOINED).toBe(`"a"b`)
        expect(process.env.T_HASH).toBe("http://host/#/x")
    })
})
