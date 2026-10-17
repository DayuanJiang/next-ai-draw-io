// @vitest-environment node
// The user's own request headers (issue #763): parsed from "Name: value"
// lines, and sent only with the user's own key
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getAIModel } from "@/lib/ai-providers"
import {
    customHeadersOf,
    parseCustomHeaders,
    supportsCustomHeaders,
} from "@/lib/custom-headers"
import { listProviderModels } from "@/lib/provider-models"

describe("parseCustomHeaders", () => {
    it("reads one header per line and skips blank lines", () => {
        expect(
            parseCustomHeaders(
                "username: myApiID\n\n  platform:myPlatform  \n",
            ),
        ).toEqual({
            ok: true,
            headers: { username: "myApiID", platform: "myPlatform" },
        })
        expect(parseCustomHeaders("")).toEqual({ ok: true, headers: {} })
    })

    it("keeps a colon inside the value", () => {
        expect(parseCustomHeaders("X-Ref: a:b:c")).toEqual({
            ok: true,
            headers: { "x-ref": "a:b:c" },
        })
    })

    it("treats names case-insensitively, the last one winning", () => {
        expect(parseCustomHeaders("X-Id: 1\r\nx-id: 2")).toEqual({
            ok: true,
            headers: { "x-id": "2" },
        })
    })

    it("names the first wrong line", () => {
        expect(parseCustomHeaders("a: 1\nno colon")).toEqual({
            ok: false,
            error: "format",
            line: 2,
        })
        expect(parseCustomHeaders(": value")).toMatchObject({
            error: "format",
        })
        expect(parseCustomHeaders("bad name: 1")).toMatchObject({
            error: "name",
        })
        expect(parseCustomHeaders("X-Name: 张伟")).toMatchObject({
            error: "value",
        })
        expect(parseCustomHeaders(`X-Long: ${"a".repeat(1001)}`)).toMatchObject(
            { error: "value" },
        )
        expect(parseCustomHeaders("Content-Length: 5")).toMatchObject({
            error: "reserved",
        })
        const many = Array.from({ length: 21 }, (_, i) => `x-${i}: v`)
        expect(parseCustomHeaders(many.join("\n"))).toEqual({
            ok: false,
            error: "tooMany",
            line: 21,
        })
    })

    it("keeps __proto__ as a plain name", () => {
        const parsed = parseCustomHeaders("__proto__: x")
        expect(parsed.ok && Object.keys(parsed.headers)).toEqual(["__proto__"])
    })

    it("customHeadersOf gives null for none and a message for bad input", () => {
        expect(customHeadersOf(null)).toEqual({ ok: true, headers: null })
        expect(customHeadersOf("  \n ")).toEqual({ ok: true, headers: null })
        expect(customHeadersOf("x: 1\nbad")).toEqual({
            ok: false,
            message: "Invalid custom header on line 2 (format).",
        })
    })

    it("is offered for the OpenAI-style providers only", () => {
        expect(supportsCustomHeaders("custom")).toBe(true)
        expect(supportsCustomHeaders("openai")).toBe(true)
        expect(supportsCustomHeaders("glm")).toBe(true)
        expect(supportsCustomHeaders("anthropic")).toBe(false)
        expect(supportsCustomHeaders("bedrock")).toBe(false)
        expect(supportsCustomHeaders("edgeone")).toBe(false)
    })
})

describe("sending the headers", () => {
    const prompt = [
        {
            role: "user" as const,
            content: [{ type: "text" as const, text: "hi" }],
        },
    ]
    let sent: Headers[] = []
    beforeEach(() => {
        sent = []
        vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
            sent.push(new Headers(init?.headers))
            return new Response("{}", { status: 400 })
        })
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.unstubAllEnvs()
    })

    const run = async (overrides: Parameters<typeof getAIModel>[0]) => {
        const { model } = getAIModel(overrides)
        await (model as any).doGenerate({ prompt }).catch(() => {})
        return sent[0]
    }

    it("go with the user's own key to an OpenAI-compatible endpoint", async () => {
        const headers = await run({
            provider: "custom",
            apiKey: "user-key",
            baseUrl: "https://gateway.example.com/v1",
            modelId: "m",
            customHeaders: { username: "myApiID", platform: "myPlatform" },
        })
        expect(headers.get("authorization")).toBe("Bearer user-key")
        expect(headers.get("username")).toBe("myApiID")
        expect(headers.get("platform")).toBe("myPlatform")
    })

    it("go with the user's own key through the OpenAI SDK", async () => {
        const headers = await run({
            provider: "openai",
            apiKey: "user-key",
            baseUrl: "https://proxy.example.com/v1",
            modelId: "gpt-4o",
            customHeaders: { "x-user": "alice" },
        })
        expect(headers.get("x-user")).toBe("alice")
    })

    it("never go with the server's key", async () => {
        vi.stubEnv("OPENAI_API_KEY", "server-key")
        const headers = await run({
            provider: "openai",
            modelId: "gpt-4o",
            customHeaders: { "x-user": "alice" },
        })
        expect(headers.get("authorization")).toBe("Bearer server-key")
        expect(headers.get("x-user")).toBeNull()
    })

    it("replace the bearer header in a model list, not join it", async () => {
        vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
            sent.push(new Headers(init?.headers))
            return Response.json({ data: [{ id: "m1" }] })
        })
        await listProviderModels("custom", {
            apiKey: "user-key",
            baseUrl: "https://gateway.example.com/v1",
            customHeaders: { authorization: "Token abc", username: "me" },
        })
        expect(sent[0].get("authorization")).toBe("Token abc")
        expect(sent[0].get("username")).toBe("me")
    })
})
