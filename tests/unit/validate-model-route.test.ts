// @vitest-environment node
import { streamText } from "ai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { POST as validateModel } from "@/app/api/validate-model/route"
import { getAIModel } from "@/lib/ai-providers"

// Treat every URL as public so no test hits DNS
vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async () => false,
}))

afterEach(() => {
    delete process.env.ALLOW_PRIVATE_URLS
    vi.unstubAllGlobals()
})

/** An OpenAI-compatible streaming reply made of the given deltas */
function streamReply(...deltas: object[]) {
    const chunk = (delta: object, finish: string | null) =>
        `data: ${JSON.stringify({
            id: "c1",
            object: "chat.completion.chunk",
            created: 1,
            model: "m",
            choices: [{ index: 0, delta, finish_reason: finish }],
        })}\n\n`
    const body =
        deltas.map((d) => chunk(d, null)).join("") +
        chunk({}, "stop") +
        "data: [DONE]\n\n"
    vi.stubGlobal(
        "fetch",
        vi.fn(
            async () =>
                new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                }),
        ),
    )
}

const testGlm = async () => {
    const res = await validateModel(
        new Request("http://localhost/api/validate-model", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider: "glm",
                apiKey: "key",
                modelId: "glm-5",
            }),
        }),
    )
    return res.json()
}

describe("POST /api/validate-model", () => {
    it("passes when the model calls the test tool", async () => {
        streamReply({
            role: "assistant",
            tool_calls: [
                {
                    index: 0,
                    id: "call_1",
                    type: "function",
                    function: { name: "ping", arguments: "{}" },
                },
            ],
        })
        const data = await testGlm()
        expect(data.valid).toBe(true)
        expect(data.warning).toBeUndefined()
        expect(typeof data.responseTime).toBe("number")
    })

    it("warns when the model answers without a tool call", async () => {
        streamReply({ role: "assistant", content: "OK" })
        const data = await testGlm()
        expect(data.valid).toBe(true)
        expect(data.warning).toMatch(/without calling a tool/)
    })
})

describe("chat requests to a client base URL", () => {
    it("refuse redirects when private URLs are blocked", async () => {
        process.env.ALLOW_PRIVATE_URLS = "false"
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(null, {
                        status: 302,
                        headers: { location: "http://169.254.169.254/" },
                    }),
            ),
        )
        const { model } = getAIModel({
            provider: "glm",
            apiKey: "key",
            baseUrl: "https://attacker.example/v1",
            modelId: "glm-5",
        })
        let error: unknown
        const result = streamText({
            model,
            prompt: "hi",
            maxRetries: 0,
            onError: ({ error: e }) => {
                error = e
            },
        })
        await result.consumeStream()
        expect(String(error)).toMatch(/Redirects are not allowed/)
    })
})
