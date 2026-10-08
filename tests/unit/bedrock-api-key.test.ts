// @vitest-environment node
// The real Bedrock SDK, with the server's own AWS keys in the environment
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getAIModel } from "@/lib/ai-providers"

const prompt = [
    { role: "user" as const, content: [{ type: "text" as const, text: "hi" }] },
]
let sent: string[] = []

beforeEach(() => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIASERVERKEY")
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "server-secret")
    vi.stubEnv("AWS_BEARER_TOKEN_BEDROCK", "")
    sent = []
    vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
        sent.push(new Headers(init?.headers).get("authorization") ?? "")
        return new Response("{}", { status: 400 })
    })
})
afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
})

const run = async (apiKey: string) => {
    const { model } = getAIModel({
        provider: "bedrock",
        modelId: "amazon.nova-lite-v1:0",
        apiKey,
        awsRegion: "us-east-1",
    })
    await (model as any).doGenerate({ prompt }).catch(() => {})
}

describe("a Bedrock API key from the user", () => {
    it("never lets the request fall back to the server's AWS keys", async () => {
        // The SDK drops a key of spaces
        await run("   ")
        expect(sent.some((auth) => auth.includes("AKIASERVERKEY"))).toBe(false)
    })

    it("is sent as the bearer token", async () => {
        await run("user-key")
        expect(sent).toEqual(["Bearer user-key"])
    })
})
