// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

const quota = vi.hoisted(() => ({ recorded: [] as number[] }))
vi.mock("@/lib/dynamo-quota-manager", () => ({
    isQuotaEnabled: () => true,
    checkAndIncrementRequest: async () => ({ allowed: true }),
    recordTokenUsage: async (_ip: string, tokens: number) => {
        quota.recorded.push(tokens)
    },
}))

// No DNS in tests: only loopback addresses are private
vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async (url: string) =>
        /^https?:\/\/(127\.0\.0\.1|localhost)\b/.test(url),
}))

import { POST as chat } from "@/app/api/chat/route"

afterEach(() => {
    quota.recorded = []
    vi.unstubAllGlobals()
})

const sse = (chunks: object[], end = true) =>
    chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") +
    (end ? "data: [DONE]\n\n" : "")

describe("a request stopped after a finished step", () => {
    it("counts that step's tokens", async () => {
        // Step 1 asks for a shape library (run on the server) and reports
        // its usage; step 2 never ends, and the user stops
        let call = 0
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init?: RequestInit) => {
                call++
                if (call === 1) {
                    return new Response(
                        sse([
                            {
                                id: "c1",
                                choices: [
                                    {
                                        index: 0,
                                        delta: {
                                            role: "assistant",
                                            tool_calls: [
                                                {
                                                    index: 0,
                                                    id: "call_1",
                                                    type: "function",
                                                    function: {
                                                        name: "get_shape_library",
                                                        arguments:
                                                            '{"library":"aws4"}',
                                                    },
                                                },
                                            ],
                                        },
                                        finish_reason: null,
                                    },
                                ],
                            },
                            {
                                id: "c1",
                                choices: [
                                    {
                                        index: 0,
                                        delta: {},
                                        finish_reason: "tool_calls",
                                    },
                                ],
                                usage: {
                                    prompt_tokens: 1200,
                                    completion_tokens: 30,
                                },
                            },
                        ]),
                        { headers: { "content-type": "text/event-stream" } },
                    )
                }
                // Never ends, until the request is aborted (as fetch does)
                const body = new ReadableStream({
                    start(controller) {
                        init?.signal?.addEventListener("abort", () =>
                            controller.error(
                                new DOMException("aborted", "AbortError"),
                            ),
                        )
                    },
                })
                return new Response(body, {
                    headers: { "content-type": "text/event-stream" },
                })
            }),
        )
        const stop = new AbortController()
        const res = await chat(
            new Request("http://localhost/api/chat", {
                method: "POST",
                signal: stop.signal,
                headers: {
                    "Content-Type": "application/json",
                    "x-forwarded-for": "203.0.113.7",
                    // The server's own network: counted
                    "x-ai-provider": "glm",
                    "x-ai-base-url": "http://127.0.0.1:9000/v1",
                    "x-ai-api-key": "dummy",
                    "x-ai-model": "glm-5",
                },
                body: JSON.stringify({
                    messages: [
                        {
                            id: "u1",
                            role: "user",
                            parts: [{ type: "text", text: "Draw AWS" }],
                        },
                    ],
                    xml: "",
                }),
            }),
        )
        const reader = res.body?.getReader()
        // Read until the second step has started
        await vi.waitFor(() => expect(call).toBe(2), { timeout: 3000 })
        stop.abort()
        // The answer stream ends; the SDK handles the stop as it is read
        while (
            reader &&
            !(await reader.read().catch(() => ({ done: true }))).done
        ) {
            // drain
        }
        await vi.waitFor(() => expect(quota.recorded).toEqual([1230]))
    })
})
