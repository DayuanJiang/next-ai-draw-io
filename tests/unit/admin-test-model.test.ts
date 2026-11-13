// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

// What the admin Test hands to testModelConnection
const sent = vi.hoisted(() => ({
    body: null as any,
    trusted: null as any,
    serverCredentials: null as any,
}))
vi.mock("@/lib/test-model-connection", () => ({
    testModelConnection: async (
        _req: Request,
        body: any,
        trusted: boolean,
        serverCredentials: boolean,
    ) => {
        Object.assign(sent, { body, trusted, serverCredentials })
        return Response.json({ valid: true })
    },
}))
vi.mock("@/lib/admin/auth", () => ({ checkAdminAuth: () => null }))
// The environment's own values, under the panel's settings
const envFallback = vi.hoisted(() => ({ values: {} as Record<string, string> }))
// The settings file: no saved admin providers unless a test saves one
const saved = vi.hoisted(() => ({ values: {} as Record<string, string> }))
vi.mock("@/lib/admin/settings", () => ({
    loadSettings: () => saved.values,
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
beforeEach(() => {
    envFallback.values = {}
    saved.values = {}
    sent.body = null
    for (const k of ENV) vi.stubEnv(k, undefined)
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
        expect(sent.trusted).toBe(true)

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
        vi.stubEnv("GOOGLE_VERTEX_BASE_URL", "https://old-proxy.example.com")
        await test({ provider: "vertexai", vertexApiKey: "new-key" })
        expect(sent.body.baseUrl).toBeUndefined()
        // The environment's own URL, which chat uses once it is saved
        envFallback.values.GOOGLE_VERTEX_BASE_URL =
            "https://vertex-proxy.example.com"
        await test({ provider: "vertexai", vertexApiKey: "new-key" })
        expect(sent.body.baseUrl).toBe("https://vertex-proxy.example.com")
        expect(sent.trusted).toBe(true)
    })

    it("tests Azure set up by resource name where chat goes", async () => {
        process.env.AZURE_RESOURCE_NAME = "team-openai"
        await test({ provider: "azure", apiKey: "k" })
        expect(sent.body.baseUrl).toBe(
            "https://team-openai.openai.azure.com/openai",
        )
        expect(sent.trusted).toBe(true)
    })

    it("tests Ollama where chat sends the entry's key", async () => {
        // Chat on the saved entry: OLLAMA_BASE_URL of the environment, else
        // the SDK's local default (the Test used to go to Ollama Cloud)
        await test({ provider: "ollama", apiKey: "k" })
        expect(sent.body.baseUrl).toBe("http://127.0.0.1:11434/api")
        expect(sent.trusted).toBe(true)
        envFallback.values.OLLAMA_BASE_URL = "http://gpu:11434/api"
        await test({ provider: "ollama", apiKey: "k" })
        expect(sent.body.baseUrl).toBe("http://gpu:11434/api")
    })
})

describe("admin Test of an entry without credentials of its own", () => {
    it("may run on the server's, as chat on the entry does", async () => {
        // The environment's key of that provider
        envFallback.values.OPENAI_API_KEY = "sk-env"
        await test({ provider: "openai" })
        expect(sent.serverCredentials).toBe(true)
        // Bedrock has no key variable: the server's IAM role
        await test({ provider: "bedrock", awsRegion: "us-east-2" })
        expect(sent.serverCredentials).toBe(true)
    })

    it("needs a key when the server has none for that provider", async () => {
        await test({ provider: "openai" })
        expect(sent.serverCredentials).toBe(false)
    })

    it("needs its own key at a URL of its own", async () => {
        // The server's key must not go to a URL that was just typed
        envFallback.values.OPENAI_API_KEY = "sk-env"
        await test({ provider: "openai", baseUrl: "https://other.example/v1" })
        expect(sent.serverCredentials).toBe(false)
        // The entry's URL is the deployment's own, as the server's is
        expect(sent.trusted).toBe(true)
    })
})

describe("admin Test of a saved entry whose key is kept", () => {
    // What the panel sends for a key that was not typed again
    const marker = { isSet: true, hint: "…0001" }
    beforeEach(() => {
        saved.values = {
            ADMIN_PROVIDERS: JSON.stringify([
                {
                    id: "p1",
                    provider: "openai",
                    apiKey: "sk-stored-secret-0001",
                    baseUrl: "https://api.openai.com/v1",
                    models: ["m"],
                },
            ]),
        }
    })

    it("tests the stored key at the saved base URL", async () => {
        await test({
            provider: "openai",
            apiKey: marker,
            baseUrl: "https://api.openai.com/v1",
        })
        expect(sent.body.apiKey).toBe("sk-stored-secret-0001")
    })

    it("asks for the key again at another base URL, and says why", async () => {
        const res = await test({
            provider: "openai",
            apiKey: marker,
            baseUrl: "https://elsewhere.example/v1",
        })
        expect(res.status).toBe(400)
        expect(await res.json()).toEqual({
            valid: false,
            error: 'The base URL of "OpenAI" changed. Enter its key again.',
        })
        // The stored key went nowhere
        expect(sent.body).toBeNull()
    })
})
