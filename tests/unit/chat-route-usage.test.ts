// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ChatUIMessage, ReplyUsage } from "@/lib/chat-message"

vi.mock("@/lib/dynamo-quota-manager", () => ({
    isQuotaEnabled: () => false,
    checkAndIncrementRequest: async () => ({ allowed: true }),
    recordTokenUsage: async () => {},
}))

// No DNS in tests: only loopback addresses are private
vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async (url: string) =>
        /^https?:\/\/(127\.0\.0\.1|localhost)\b/.test(url),
}))

import { POST as chat } from "@/app/api/chat/route"

afterEach(() => {
    vi.unstubAllGlobals()
})

const sse = (chunks: object[]) =>
    `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("")}data: [DONE]\n\n`

// A short text answer; usage as an OpenAI-compatible provider reports it
const answer = (usage?: object) =>
    new Response(
        sse([
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
                ...(usage && { usage }),
            },
        ]),
        { headers: { "content-type": "text/event-stream" } },
    )

const user: ChatUIMessage = {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text: "Draw two boxes" }],
}

// The usage the answer stream ends with
const usageOf = async (messages: ChatUIMessage[]) => {
    const res = await chat(
        new Request("http://localhost/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-ai-provider": "glm",
                "x-ai-base-url": "http://127.0.0.1:9000/v1",
                "x-ai-api-key": "dummy",
                "x-ai-model": "glm-5",
            },
            body: JSON.stringify({ messages, xml: "" }),
        }),
    )
    const finish = (await res.text())
        .split("\n")
        .filter((line) => line.startsWith("data: {"))
        .map((line) => JSON.parse(line.slice(6)))
        .find((chunk) => chunk.type === "finish")
    return finish?.messageMetadata?.usage as ReplyUsage | undefined
}

describe("an answer's usage", () => {
    it("comes with the end of the answer", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                answer({
                    prompt_tokens: 1200,
                    completion_tokens: 30,
                    prompt_tokens_details: { cached_tokens: 1000 },
                    completion_tokens_details: { reasoning_tokens: 12 },
                }),
            ),
        )
        const usage = await usageOf([user])
        expect(usage).toMatchObject({
            inputTokens: 1200,
            outputTokens: 30,
            cacheReadTokens: 1000,
            reasoningTokens: 12,
        })
        expect(usage?.durationMs).toBeGreaterThanOrEqual(0)
        // GLM-5 has a price on models.dev
        expect(usage?.costUsd).toBeGreaterThan(0)
    })

    it("adds a later request of the turn to what the answer used before", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                answer({ prompt_tokens: 1200, completion_tokens: 30 }),
            ),
        )
        const before: ReplyUsage = {
            inputTokens: 500,
            outputTokens: 20,
            cacheReadTokens: 400,
            reasoningTokens: 0,
            durationMs: 4000,
        }
        const usage = await usageOf([
            user,
            {
                id: "a1",
                role: "assistant",
                metadata: { usage: before },
                parts: [{ type: "text", text: "Drawing." }],
            },
        ])
        expect(usage).toMatchObject({
            inputTokens: 1700,
            outputTokens: 50,
            cacheReadTokens: 400,
            reasoningTokens: 0,
        })
        expect(usage?.durationMs).toBeGreaterThanOrEqual(4000)
    })

    it("is left out when the provider reports none", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => answer()),
        )
        expect(await usageOf([user])).toBeUndefined()
    })
})
