// @vitest-environment node
import fs from "fs"
import os from "os"
import path from "path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET, PUT } from "@/app/api/admin/providers/route"
import { loadAdminProviders } from "@/lib/admin/providers"
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

describe("saving an entry whose key is kept", () => {
    const save = (entry: object) =>
        PUT(
            new Request("http://localhost/api/admin/providers", {
                method: "PUT",
                headers: { ...headers, "Content-Type": "application/json" },
                body: JSON.stringify({
                    providers: [
                        {
                            id: "p1",
                            provider: "openai",
                            models: ["gpt-panel"],
                            ...entry,
                        },
                    ],
                }),
            }),
        )
    const official = "https://api.openai.com/v1"
    const storedEntry = () => loadAdminProviders()[0]

    it("refuses another base URL until the key is typed again", async () => {
        const first = await save({
            apiKey: "sk-stored-secret-0001",
            baseUrl: official,
        })
        // What the panel sends back for an untouched key
        const marker = (await first.json()).providers[0].apiKey
        expect(marker).toEqual({ isSet: true, hint: "…0001" })

        // The stored key would go to the new host with the next chat
        const moved = await save({
            apiKey: marker,
            baseUrl: "https://elsewhere.example/v1",
        })
        expect(moved.status).toBe(400)
        expect((await moved.json()).error).toBe(
            'The base URL of "OpenAI" changed. Enter its key again.',
        )
        expect(storedEntry().baseUrl).toBe(official)
        expect(process.env.ADMIN_OPENAI_BASE_URL).toBe(official)

        // Other changes keep the key
        const edited = await save({
            apiKey: marker,
            baseUrl: official,
            models: ["gpt-panel", "gpt-more"],
        })
        expect(edited.status).toBe(200)
        expect(storedEntry().apiKey).toBe("sk-stored-secret-0001")

        const retyped = await save({
            apiKey: "sk-typed-again-0002",
            baseUrl: "https://elsewhere.example/v1",
        })
        expect(retyped.status).toBe(200)
        expect(storedEntry()).toMatchObject({
            apiKey: "sk-typed-again-0002",
            baseUrl: "https://elsewhere.example/v1",
        })
    })

    it("lets a Bedrock region change", async () => {
        const first = await save({
            provider: "bedrock",
            awsAccessKeyId: "AKIAIOSFODNN7EXAMPLE",
            awsSecretAccessKey: "secret-access-key-0003",
            awsRegion: "us-east-1",
        })
        const [entry] = (await first.json()).providers
        const res = await save({ ...entry, awsRegion: "eu-west-1" })
        expect(res.status).toBe(200)
        expect(storedEntry()).toMatchObject({
            awsSecretAccessKey: "secret-access-key-0003",
            awsRegion: "eu-west-1",
        })
    })
})

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
