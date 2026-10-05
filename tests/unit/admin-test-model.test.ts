// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The request the admin Test hands to validate-model
const sent = vi.hoisted(() => ({ body: null as any, headers: null as any }))
vi.mock("@/app/api/validate-model/route", () => ({
    POST: async (req: Request) => {
        sent.body = await req.json()
        sent.headers = Object.fromEntries(req.headers)
        return Response.json({ valid: true })
    },
}))
vi.mock("@/lib/admin/auth", () => ({ checkAdminAuth: () => null }))
// The environment's own values, under the panel's settings
const envFallback = vi.hoisted(() => ({ values: {} as Record<string, string> }))
vi.mock("@/lib/admin/settings", () => ({
    loadSettings: () => ({}),
    getEnvFallback: (key: string) => envFallback.values[key] ?? null,
}))

import { POST as testModel } from "@/app/api/admin/test-model/route"

const ENV = [
    "OPENAI_BASE_URL",
    "SGLANG_BASE_URL",
    "AI_GATEWAY_BASE_URL",
    "AZURE_BASE_URL",
    "AZURE_RESOURCE_NAME",
]
const saved: Record<string, string | undefined> = {}
beforeEach(() => {
    envFallback.values = {}
    for (const k of ENV) {
        saved[k] = process.env[k]
        delete process.env[k]
    }
})
afterEach(() => {
    for (const k of ENV) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
    }
})

const test = (provider: Record<string, unknown>) =>
    testModel(
        new Request("http://localhost/api/admin/test-model", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider: { id: "p1", models: ["m"], ...provider },
                modelId: "m",
            }),
        }),
    )

describe("admin Test of an entry without a URL", () => {
    it("tests the server's <P>_BASE_URL, where chat sends the entry's key", async () => {
        // A server model without baseUrlEnv reads the global variable
        process.env.OPENAI_BASE_URL = "https://operator-proxy.example.com/v1"
        await test({ provider: "openai", apiKey: "panel-key" })
        expect(sent.body.baseUrl).toBe("https://operator-proxy.example.com/v1")
        // The server's own URL, tested without the rules for typed URLs
        expect(sent.body.serverBaseUrl).toBe(true)

        process.env.AI_GATEWAY_BASE_URL = "https://gateway.example.com/v3/ai"
        await test({ provider: "gateway", apiKey: "k" })
        expect(sent.body.baseUrl).toBe("https://gateway.example.com/v3/ai")
    })

    it("keeps the entry's own URL, and none when the server has none", async () => {
        process.env.SGLANG_BASE_URL = "http://gpu-box:8000/v1"
        await test({
            provider: "sglang",
            apiKey: "k",
            baseUrl: "http://other:8000/v1",
        })
        expect(sent.body.baseUrl).toBe("http://other:8000/v1")
        await test({ provider: "deepseek", apiKey: "k" })
        expect(sent.body.baseUrl).toBeUndefined()
    })

    it("does not use Vertex's variable, which the panel writes itself", async () => {
        // Before a save it still holds the entry's previous URL
        process.env.GOOGLE_VERTEX_BASE_URL = "https://old-proxy.example.com"
        try {
            await test({ provider: "vertexai", vertexApiKey: "new-key" })
            expect(sent.body.baseUrl).toBeUndefined()
            // The environment's own URL, which chat uses once it is saved
            envFallback.values.GOOGLE_VERTEX_BASE_URL =
                "https://vertex-proxy.example.com"
            await test({ provider: "vertexai", vertexApiKey: "new-key" })
            expect(sent.body.baseUrl).toBe("https://vertex-proxy.example.com")
            expect(sent.body.serverBaseUrl).toBe(true)
        } finally {
            delete process.env.GOOGLE_VERTEX_BASE_URL
        }
    })

    it("tests Azure set up by resource name where chat goes", async () => {
        process.env.AZURE_RESOURCE_NAME = "team-openai"
        await test({ provider: "azure", apiKey: "k" })
        expect(sent.body.baseUrl).toBe(
            "https://team-openai.openai.azure.com/openai",
        )
        expect(sent.body.serverBaseUrl).toBe(true)
    })

    it("tests Ollama where chat sends the entry's key", async () => {
        // Chat on the saved entry: OLLAMA_BASE_URL of the environment, else
        // the SDK's local default (the Test used to go to Ollama Cloud)
        await test({ provider: "ollama", apiKey: "k" })
        expect(sent.body.baseUrl).toBe("http://127.0.0.1:11434/api")
        expect(sent.body.serverBaseUrl).toBe(true)
        envFallback.values.OLLAMA_BASE_URL = "http://gpu:11434/api"
        await test({ provider: "ollama", apiKey: "k" })
        expect(sent.body.baseUrl).toBe("http://gpu:11434/api")
    })
})
