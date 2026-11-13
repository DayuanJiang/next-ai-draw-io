// @vitest-environment node
/**
 * The server's keyless Ollama: a request for provider "ollama" without a
 * key and without a URL goes to OLLAMA_BASE_URL or the local default.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// No DNS in tests: only loopback addresses are private
vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async (url: string) =>
        /^https?:\/\/(127\.0\.0\.1|localhost)\b/.test(url),
}))

import { POST as chat } from "@/app/api/chat/route"

// The URL and model of each request that reached a provider
const calls: Array<{ url: string; model: string }> = []

beforeEach(() => {
    vi.stubEnv("AI_MODELS_CONFIG", undefined)
    vi.stubEnv("OLLAMA_BASE_URL", undefined)
    vi.stubEnv("NEXT_AI_DRAWIO_DESKTOP", undefined)
    calls.length = 0
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
            calls.push({
                url: String(url),
                model: JSON.parse(String(init.body)).model,
            })
            throw new Error("no network in tests")
        }),
    )
})

afterEach(() => {
    vi.unstubAllGlobals()
})

const ask = async (model: string) => {
    const res = await chat(
        new Request("http://localhost/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-ai-provider": "ollama",
                "x-ai-model": model,
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
    await res.text()
    return res.status
}

const LOCAL = "http://127.0.0.1:11434/api/chat"

describe("the server's keyless Ollama", () => {
    it("runs any installed model while private URLs are allowed", async () => {
        vi.stubEnv("ALLOW_PRIVATE_URLS", undefined)
        vi.stubEnv("AI_PROVIDER", "ollama")
        vi.stubEnv("AI_MODEL", "llama3.2")
        await ask("deepseek-r1:70b")
        expect(calls).toEqual([{ url: LOCAL, model: "deepseek-r1:70b" }])
    })

    it("runs only the offered models when private URLs are blocked", async () => {
        vi.stubEnv("ALLOW_PRIVATE_URLS", "false")
        vi.stubEnv("AI_PROVIDER", "ollama")
        vi.stubEnv("AI_MODEL", "llama3.2")
        expect(await ask("deepseek-r1:70b")).toBe(400)
        expect(calls).toEqual([])
        await ask("llama3.2")
        expect(calls).toEqual([{ url: LOCAL, model: "llama3.2" }])
    })

    it("is not reached on a server set up for another provider when private URLs are blocked", async () => {
        vi.stubEnv("ALLOW_PRIVATE_URLS", "false")
        vi.stubEnv("AI_PROVIDER", "openai")
        vi.stubEnv("AI_MODEL", "gpt-5.5")
        vi.stubEnv("OPENAI_API_KEY", "server-key")
        expect(await ask("llama3.2")).toBe(400)
        expect(calls).toEqual([])
    })
})
