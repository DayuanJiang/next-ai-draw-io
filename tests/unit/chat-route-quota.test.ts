// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Quota on, and every check answers that the daily limit is used up, unless
// a test allows its request
const quota = vi.hoisted(() => ({
    checks: 0,
    // Each check: its limits, and the follow-up requests a counted request
    // allows ("follow-up" for the check of a follow-up request itself)
    calls: [] as Array<{ limits: unknown; followUps: unknown }>,
    allowed: false,
    // The tokens recorded for each step
    recorded: [] as number[],
}))
vi.mock("@/lib/dynamo-quota-manager", () => {
    const check = (limits: unknown, followUps: unknown) => {
        quota.checks++
        quota.calls.push({ limits, followUps })
        if (quota.allowed) return { allowed: true }
        return {
            allowed: false,
            error: "Daily limit reached",
            type: "request",
            used: 10,
            limit: 10,
        }
    }
    return {
        isQuotaEnabled: () => true,
        checkAndIncrementRequest: async (
            _user: string,
            limits: unknown,
            _increment?: number,
            followUps?: number,
        ) => check(limits, followUps),
        checkFollowUpRequest: async (_user: string, limits: unknown) =>
            check(limits, "follow-up"),
        recordTokenUsage: async (_user: string, tokens: number) => {
            quota.recorded.push(tokens)
        },
    }
})

// No DNS in tests: only loopback addresses are private
vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async (url: string) =>
        /^https?:\/\/(127\.0\.0\.1|localhost)\b/.test(url),
}))

import { POST as chat } from "@/app/api/chat/route"

beforeEach(() => {
    vi.stubEnv("AI_PROVIDER", "openai")
    vi.stubEnv("AI_MODEL", "gpt-5.5")
    vi.stubEnv("OPENAI_API_KEY", "server-key")
    quota.checks = 0
    quota.calls = []
    quota.allowed = false
    quota.recorded = []
    // No request may reach a provider
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
            throw new Error("no network in tests")
        }),
    )
})

afterEach(() => {
    vi.unstubAllGlobals()
})

const FIRST_MESSAGE: Record<string, unknown> = {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text: "Draw two boxes" }],
}

const send = (headers: Record<string, string>, messages = [FIRST_MESSAGE]) =>
    chat(
        new Request("http://localhost/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-forwarded-for": "203.0.113.7",
                ...headers,
            },
            body: JSON.stringify({ messages, xml: "" }),
        }),
    )

describe("chat quota", () => {
    it("allows a user message five follow-up requests, and checks a request that ends with the assistant's message as one", async () => {
        const limits = { requests: 10, tokens: 200000, tpm: 20000 }
        await send({ "x-ai-provider": "openai" })
        // What the browser sends by itself after a diagram was cut off
        await send({ "x-ai-provider": "openai" }, [
            FIRST_MESSAGE,
            {
                id: "a1",
                role: "assistant",
                parts: [
                    {
                        type: "tool-display_diagram",
                        toolCallId: "call-1",
                        state: "output-error",
                        input: { xml: "<mxCell" },
                        errorText: "The output was cut off",
                    },
                ],
            },
        ])
        expect(quota.calls).toEqual([
            { limits, followUps: 5 },
            { limits, followUps: "follow-up" },
        ])
    })

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
        vi.stubEnv("AI_PROVIDER", "ollama")
        vi.stubEnv("AI_MODEL", "llama3.2")
        vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.internal:11434/api")
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
        vi.stubEnv("NEXT_AI_DRAWIO_DESKTOP", "1")
        const res = await send({
            "x-ai-provider": "ollama",
            "x-ai-base-url": "http://127.0.0.1:11434/api",
            "x-ai-model": "llama3.2",
        })
        expect(res.status).not.toBe(429)
        expect(quota.checks).toBe(0)
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

describe("the tokens a step counts", () => {
    it("counts input read from the prompt cache at a tenth", async () => {
        quota.allowed = true
        // The second turn of a real chat with GPT-6 Luna: 7,078 input
        // tokens, 6,094 of them read from the cache, and 212 output
        const events = [
            {
                id: "c1",
                choices: [
                    {
                        index: 0,
                        delta: { role: "assistant", content: "Done." },
                        finish_reason: null,
                    },
                ],
            },
            {
                id: "c1",
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
                usage: {
                    prompt_tokens: 7078,
                    completion_tokens: 212,
                    prompt_tokens_details: { cached_tokens: 6094 },
                },
            },
        ]
        const body = `${events
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join("")}data: [DONE]\n\n`
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(body, {
                        headers: { "content-type": "text/event-stream" },
                    }),
            ),
        )
        // The server's own network: counted
        const res = await send({
            "x-ai-provider": "glm",
            "x-ai-base-url": "http://127.0.0.1:9000/v1",
            "x-ai-api-key": "dummy",
            "x-ai-model": "glm-5",
        })
        await res.text()
        // In full it was 7,290. Now 984 uncached input, 212 output and
        // 609 for the 6,094 cache reads
        expect(quota.recorded).toEqual([1805])
    })
})

describe("request checks", () => {
    it("refuses an AWS region that is not a region name", async () => {
        vi.stubEnv("AI_PROVIDER", "bedrock")
        vi.stubEnv("AI_MODEL", "amazon.nova-lite-v1:0")
        const res = await send({
            "x-aws-region": "us-east-1.attacker.example/",
        })
        expect(res.status).toBe(400)
        expect(await res.text()).toMatch(/Invalid AWS region/)
        expect(fetch).not.toHaveBeenCalled()
    })

    it("refuses messages that are not UI messages", async () => {
        const res = await chat(
            new Request("http://localhost/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [{ id: "u1", role: "user", text: "no parts" }],
                    xml: "",
                }),
            }),
        )
        expect(res.status).toBe(400)
        expect(fetch).not.toHaveBeenCalled()
    })
})

describe("server model allowlist", () => {
    it("runs AI_MODEL only on the server's AI_PROVIDER", async () => {
        // Another provider's server key must not run it
        vi.stubEnv("AI_GATEWAY_API_KEY", "server-gateway-key")
        const res = await send({
            "x-ai-provider": "gateway",
            "x-ai-model": "gpt-5.5",
        })
        expect(res.status).toBe(400)
        expect(await res.text()).toMatch(/not available on this server/)
        expect(quota.checks).toBe(0)
    })
})
