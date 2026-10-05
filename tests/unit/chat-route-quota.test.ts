// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Quota on, and every check answers that the daily limit is used up
const quota = vi.hoisted(() => ({ checks: 0 }))
vi.mock("@/lib/dynamo-quota-manager", () => ({
    isQuotaEnabled: () => true,
    checkAndIncrementRequest: async () => {
        quota.checks++
        return {
            allowed: false,
            error: "Daily limit reached",
            type: "request",
            used: 10,
            limit: 10,
        }
    },
    recordTokenUsage: async () => {},
}))

// No DNS in tests: only loopback addresses are private
vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async (url: string) =>
        /^https?:\/\/(127\.0\.0\.1|localhost)\b/.test(url),
}))

import { POST as chat } from "@/app/api/chat/route"

const ENV = [
    "AI_PROVIDER",
    "AI_MODEL",
    "OPENAI_API_KEY",
    "OLLAMA_BASE_URL",
    "OLLAMA_API_KEY",
    "AI_GATEWAY_API_KEY",
    "ALLOW_PRIVATE_URLS",
]
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
    for (const k of ENV) saved[k] = process.env[k]
    process.env.AI_PROVIDER = "openai"
    process.env.AI_MODEL = "gpt-5.5"
    process.env.OPENAI_API_KEY = "server-key"
    quota.checks = 0
    // No request may reach a provider
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
            throw new Error("no network in tests")
        }),
    )
})

afterEach(() => {
    for (const k of ENV) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
    }
    vi.unstubAllGlobals()
})

const send = (headers: Record<string, string>) =>
    chat(
        new Request("http://localhost/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-forwarded-for": "203.0.113.7",
                ...headers,
            },
            body: JSON.stringify({
                messages: [
                    {
                        id: "u1",
                        role: "user",
                        parts: [{ type: "text", text: "Draw two boxes" }],
                    },
                ],
                xml: "",
            }),
        }),
    )

describe("chat quota", () => {
    it("counts a request whose key header the provider never reads", async () => {
        // OpenAI ignores the AWS key, so this runs on the server's key
        const res = await send({
            "x-ai-provider": "openai",
            "x-aws-access-key-id": "x",
        })
        expect(res.status).toBe(429)
        expect(quota.checks).toBe(1)
    })

    it("does not count a request on the user's own key", async () => {
        const res = await send({
            "x-ai-provider": "openai",
            "x-ai-api-key": "user-key",
            "x-ai-model": "gpt-5.5",
        })
        expect(res.status).not.toBe(429)
        expect(quota.checks).toBe(0)
    })

    it("counts the server's keyless Ollama and EdgeOne", async () => {
        process.env.AI_PROVIDER = "ollama"
        process.env.AI_MODEL = "llama3.2"
        process.env.OLLAMA_BASE_URL = "http://ollama.internal:11434/api"
        expect((await send({})).status).toBe(429)
        expect(
            (
                await send({
                    "x-ai-provider": "edgeone",
                    "x-ai-model": "@tx/deepseek-ai/deepseek-v3-0324",
                })
            ).status,
        ).toBe(429)
        expect(quota.checks).toBe(2)
    })

    it("counts EdgeOne with a key header it never reads", async () => {
        const res = await send({
            "x-ai-provider": "edgeone",
            "x-ai-api-key": "ignored",
            "x-ai-model": "@tx/deepseek-ai/deepseek-v3-0324",
        })
        expect(res.status).toBe(429)
        expect(quota.checks).toBe(1)
    })

    it("counts Ollama at a private address, the server's network", async () => {
        const res = await send({
            "x-ai-provider": "ollama",
            "x-ai-base-url": "http://127.0.0.1:11434/api",
            "x-ai-model": "llama3.2",
        })
        expect(res.status).toBe(429)
        expect(quota.checks).toBe(1)
    })

    it("counts the server's network whatever key header comes along", async () => {
        // A keyless Ollama or a local SGLang ignores a dummy key
        for (const headers of [
            {
                "x-ai-provider": "ollama",
                "x-ai-base-url": "http://127.0.0.1:11434/api",
                "x-ai-api-key": "dummy",
                "x-ai-model": "llama3.2",
            },
            {
                "x-ai-provider": "openai",
                "x-ai-base-url": "http://127.0.0.1:30000/v1",
                "x-ai-api-key": "dummy",
                "x-ai-model": "m",
            },
        ]) {
            expect((await send(headers)).status).toBe(429)
        }
        expect(quota.checks).toBe(2)
    })

    it("does not count a provider that never uses the base URL header", async () => {
        // Bedrock on the user's own AWS keys goes to AWS, whatever the
        // leftover base URL says (with a key header too, so the request gets
        // past the custom URL check to the quota decision)
        const res = await send({
            "x-ai-provider": "bedrock",
            "x-ai-model": "amazon.nova-lite-v1:0",
            "x-ai-base-url": "http://127.0.0.1:8080",
            "x-ai-api-key": "leftover",
            "x-aws-access-key-id": "id",
            "x-aws-secret-access-key": "secret",
            "x-aws-region": "us-east-1",
        })
        expect(res.status).not.toBe(429)
        expect(quota.checks).toBe(0)
    })

    it("counts EdgeOne even with a base URL header", async () => {
        const res = await send({
            "x-ai-provider": "edgeone",
            "x-ai-model": "@tx/deepseek-ai/deepseek-v3-0324",
            "x-ai-base-url": "https://this-site.example/api/edgeai",
        })
        expect(res.status).toBe(429)
        expect(quota.checks).toBe(1)
    })

    it("never counts in the desktop app, where every endpoint is the user's", async () => {
        process.env.NEXT_AI_DRAWIO_DESKTOP = "1"
        try {
            const res = await send({
                "x-ai-provider": "ollama",
                "x-ai-base-url": "http://127.0.0.1:11434/api",
                "x-ai-model": "llama3.2",
            })
            expect(res.status).not.toBe(429)
            expect(quota.checks).toBe(0)
        } finally {
            delete process.env.NEXT_AI_DRAWIO_DESKTOP
        }
    })

    it("does not count Ollama on the user's own server", async () => {
        const res = await send({
            "x-ai-provider": "ollama",
            "x-ai-base-url": "https://ollama.example.com/api",
            "x-ai-model": "llama3.2",
        })
        expect(res.status).not.toBe(429)
        expect(quota.checks).toBe(0)
    })
})

describe("request checks", () => {
    it("refuses an AWS region that is not a region name", async () => {
        process.env.AI_PROVIDER = "bedrock"
        process.env.AI_MODEL = "amazon.nova-lite-v1:0"
        const res = await send({
            "x-aws-region": "us-east-1.attacker.example/",
        })
        expect(res.status).toBe(400)
        expect(await res.text()).toMatch(/Invalid AWS region/)
        expect(fetch).not.toHaveBeenCalled()
    })
})

describe("server model allowlist", () => {
    it("runs AI_MODEL only on the server's AI_PROVIDER", async () => {
        // Another provider's server key must not run it
        process.env.AI_GATEWAY_API_KEY = "server-gateway-key"
        const res = await send({
            "x-ai-provider": "gateway",
            "x-ai-model": "gpt-5.5",
        })
        expect(res.status).toBe(400)
        expect(await res.text()).toMatch(/not available on this server/)
        expect(quota.checks).toBe(0)
    })
})
