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
vi.mock("@/lib/admin/settings", () => ({ loadSettings: () => ({}) }))

import { POST as testModel } from "@/app/api/admin/test-model/route"

const ENV = ["OPENAI_BASE_URL", "SGLANG_BASE_URL", "AI_GATEWAY_BASE_URL"]
const saved: Record<string, string | undefined> = {}
beforeEach(() => {
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
})
