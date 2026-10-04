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

import { POST as chat } from "@/app/api/chat/route"

const ENV = ["AI_PROVIDER", "AI_MODEL", "OPENAI_API_KEY"]
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
})
