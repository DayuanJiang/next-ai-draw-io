// @vitest-environment node
import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET, PUT } from "@/app/api/admin/providers/route"
import { _resetForTests } from "@/lib/admin/settings"

let tmpDir: string

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-providers-route-"))
    vi.stubEnv("SETTINGS_FILE", path.join(tmpDir, "settings.json"))
    vi.stubEnv("ADMIN_PASSWORD", "pw")
    vi.stubEnv("AI_MODELS_CONFIG_PATH", path.join(tmpDir, "none.json"))
    _resetForTests()
})

afterEach(() => {
    _resetForTests()
    // Written by the panel default's save, not stubbed by a test
    delete process.env.AI_MODEL
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

const headers = { "x-admin-password": "pw" }

async function saveDefaultPanelProvider() {
    const res = await PUT(
        new Request("http://localhost/api/admin/providers", {
            method: "PUT",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
                providers: [
                    {
                        id: "p1",
                        provider: "openai",
                        apiKey: "sk-test",
                        models: ["gpt-panel"],
                        isDefault: true,
                    },
                ],
            }),
        }),
    )
    expect(res.status).toBe(200)
}

async function envHasDefaultModel(): Promise<boolean> {
    const res = await GET(
        new Request("http://localhost/api/admin/providers", { headers }),
    )
    return (await res.json()).envHasDefaultModel
}

describe("envHasDefaultModel", () => {
    it("is true when .env sets AI_MODEL, even after a panel default", async () => {
        vi.stubEnv("AI_MODEL", "gpt-env")
        expect(await envHasDefaultModel()).toBe(true)
        await saveDefaultPanelProvider()
        expect(await envHasDefaultModel()).toBe(true)
    })

    it("ignores the AI_MODEL the panel default writes", async () => {
        await saveDefaultPanelProvider()
        expect(process.env.AI_MODEL).toBe("gpt-panel")
        expect(await envHasDefaultModel()).toBe(false)
    })
})
