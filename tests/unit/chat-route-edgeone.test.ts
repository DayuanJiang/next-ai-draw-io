// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/dynamo-quota-manager", () => ({
    isQuotaEnabled: () => false,
    checkAndIncrementRequest: async () => ({ allowed: true }),
    recordTokenUsage: async () => {},
}))

import { POST as chat } from "@/app/api/chat/route"

const calls: Array<{ url: string; headers: Headers }> = []

beforeEach(() => {
    vi.stubEnv("AI_PROVIDER", undefined)
    vi.stubEnv("AI_MODEL", undefined)
    calls.length = 0
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit) => {
            calls.push({ url: String(url), headers: new Headers(init.headers) })
            throw new Error("no network in tests")
        }),
    )
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("EdgeOne as a server model", () => {
    it("calls the site's Edge AI function with the cookies", async () => {
        // An admin panel or ai-models.json provider: the client sends the
        // provider name's slug, not "edgeone"
        vi.stubEnv(
            "AI_MODELS_CONFIG",
            JSON.stringify({
                providers: [
                    {
                        name: "Edge Pages",
                        provider: "edgeone",
                        models: ["@tx/deepseek-ai/deepseek-v3-0324"],
                    },
                ],
            }),
        )
        const res = await chat(
            new Request("http://localhost/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-ai-provider": "edge-pages",
                    "x-selected-model-id":
                        "server:edge-pages:@tx/deepseek-ai/deepseek-v3-0324",
                    cookie: "eo_token=t; eo_time=1",
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
        expect(calls[0]?.url).toBe(
            "http://localhost/api/edgeai/chat/completions",
        )
        expect(calls[0]?.headers.get("cookie")).toBe("eo_token=t; eo_time=1")
    })
})

const send = (headers: Record<string, string>) =>
    chat(
        new Request("http://localhost/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
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
    ).then((r) => r.text())

describe("EdgeOne endpoints", () => {
    it("works when the deployment names EdgeOne only in AI_PROVIDER", async () => {
        vi.stubEnv("AI_PROVIDER", "edgeone")
        vi.stubEnv("AI_MODEL", "@tx/deepseek-ai/deepseek-v3-0324")
        await send({})
        expect(calls[0]?.url).toBe(
            "http://localhost/api/edgeai/chat/completions",
        )
    })

    it("always calls the site's own function, whatever URL the request names", async () => {
        // Another host would get the user's EdgeOne cookies
        await send({
            "x-ai-provider": "edgeone",
            "x-ai-model": "@tx/deepseek-ai/deepseek-v3-0324",
            "x-ai-base-url": "https://elsewhere.example/api/edgeai",
            cookie: "eo_token=t",
        })
        expect(calls[0]?.url).toBe(
            "http://localhost/api/edgeai/chat/completions",
        )
    })

    it("calls the function at the site root, also with a base path", async () => {
        vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/draw")
        await send({
            "x-ai-provider": "edgeone",
            "x-ai-model": "@tx/deepseek-ai/deepseek-v3-0324",
        })
        expect(calls[0]?.url).toBe(
            "http://localhost/api/edgeai/chat/completions",
        )
    })
})

describe("the EdgeOne endpoint's origin", () => {
    it("takes the browser's Origin for the host the request was addressed to", async () => {
        vi.stubEnv("AI_PROVIDER", "edgeone")
        vi.stubEnv("AI_MODEL", "@tx/deepseek-ai/deepseek-v3-0324")
        // Behind a proxy the request URL is internal; Origin names the site
        await send({ origin: "https://draw.example", host: "draw.example" })
        expect(calls[0]?.url).toBe(
            "https://draw.example/api/edgeai/chat/completions",
        )
    })

    it("ignores another site's Origin, so the cookies stay on this site", async () => {
        vi.stubEnv("AI_PROVIDER", "edgeone")
        vi.stubEnv("AI_MODEL", "@tx/deepseek-ai/deepseek-v3-0324")
        await send({
            origin: "https://attacker.example",
            host: "localhost",
            cookie: "eo_token=t",
        })
        expect(calls[0]?.url).toBe(
            "http://localhost/api/edgeai/chat/completions",
        )
    })
})
