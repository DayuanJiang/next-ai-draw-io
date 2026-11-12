// @vitest-environment node
import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PUT } from "@/app/api/admin/settings/route"
import { _resetForTests } from "@/lib/admin/settings"
import { resolveMaxOutputTokens } from "@/lib/output-token-limit"

let tmpDir: string

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-settings-route-"))
    vi.stubEnv("SETTINGS_FILE", path.join(tmpDir, "settings.json"))
    vi.stubEnv("ADMIN_PASSWORD", "pw")
    vi.stubEnv("MAX_OUTPUT_TOKENS", undefined)
    _resetForTests()
})

afterEach(() => {
    _resetForTests()
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

const save = (values: Record<string, string>) =>
    PUT(
        new Request("http://localhost/api/admin/settings", {
            method: "PUT",
            headers: {
                "x-admin-password": "pw",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ values }),
        }),
    )

describe("saving MAX_OUTPUT_TOKENS", () => {
    it("takes the values the chat route uses", async () => {
        for (const value of ["2000", "200000"]) {
            const res = await save({ MAX_OUTPUT_TOKENS: value })
            expect(res.status).toBe(200)
            expect(resolveMaxOutputTokens(null, true)).toBe(Number(value))
        }
    })

    it("refuses a value the chat route would ignore", async () => {
        // Saved, these showed as in effect while chat used the default
        for (const [value, error] of [
            ["200001", "Must be at most 200000"],
            ["300000", "Must be at most 200000"],
            ["12.5", "Must be a whole number"],
        ]) {
            const res = await save({ MAX_OUTPUT_TOKENS: value })
            expect(res.status).toBe(400)
            expect(await res.json()).toEqual({
                errors: { MAX_OUTPUT_TOKENS: error },
            })
        }
        expect(process.env.MAX_OUTPUT_TOKENS).toBeUndefined()
    })

    it("still takes a decimal where the reader does", async () => {
        const res = await save({ TEMPERATURE: "0.7" })
        expect(res.status).toBe(200)
        expect(process.env.TEMPERATURE).toBe("0.7")
    })
})
