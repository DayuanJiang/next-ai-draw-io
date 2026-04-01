import { describe, expect, it, vi } from "vitest"
import { createOpenAICompatibleFetch } from "@/lib/openai-compatible-fetch"

describe("createOpenAICompatibleFetch", () => {
    it("converts a success-only validation response into OpenAI chat format", async () => {
        const baseFetch = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
        )

        const fetchWithCompat = createOpenAICompatibleFetch(baseFetch)
        const response = await fetchWithCompat(
            "https://example.com/v1/chat/completions",
            {
                method: "POST",
                body: JSON.stringify({
                    model: "custom-model",
                    messages: [{ role: "user", content: "Say 'OK'" }],
                    max_tokens: 20,
                }),
            },
        )

        const data = await response.json()
        expect(data.choices?.[0]?.message?.content).toBe("OK")
        expect(data.model).toBe("custom-model")
        expect(response.headers.get("x-openai-compat-validation")).toBe(
            "synthetic",
        )
    })

    it("does not modify normal OpenAI-compatible responses", async () => {
        const normalResponse = {
            choices: [
                {
                    message: {
                        role: "assistant",
                        content: "Hello",
                    },
                },
            ],
        }

        const baseFetch = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(normalResponse), {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
        )

        const fetchWithCompat = createOpenAICompatibleFetch(baseFetch)
        const response = await fetchWithCompat(
            "https://example.com/v1/chat/completions",
            {
                method: "POST",
                body: JSON.stringify({
                    model: "custom-model",
                    messages: [{ role: "user", content: "Hello" }],
                }),
            },
        )

        expect(await response.json()).toEqual(normalResponse)
    })
})
