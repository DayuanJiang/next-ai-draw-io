// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// No DNS in tests: only loopback addresses are private
vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async (url: string) =>
        /^https?:\/\/(127\.0\.0\.1|localhost)\b/.test(url),
}))

import { POST as chat } from "@/app/api/chat/route"

const ENV = [
    "AI_PROVIDER",
    "AI_MODEL",
    "OPENAI_API_KEY",
    "OLLAMA_BASE_URL",
    "OLLAMA_API_KEY",
    "NEXT_AI_DRAWIO_DESKTOP",
]
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
    for (const k of ENV) saved[k] = process.env[k]
    for (const k of ENV) delete process.env[k]
})

afterEach(() => {
    for (const k of ENV) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
    }
    vi.unstubAllGlobals()
})

/** Every provider request answers with this status and text */
const providerAnswers = (status: number, body: string) =>
    vi.stubGlobal(
        "fetch",
        vi.fn(
            async () =>
                new Response(body, {
                    status,
                    headers: { "Content-Type": "application/json" },
                }),
        ),
    )

/** The error text the chat panel gets from the stream */
async function streamedError(headers: Record<string, string>) {
    const res = await chat(
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
    )
    const text = await res.text()
    const line = text.split("\n").find((l) => l.includes('"type":"error"'))
    return line ? JSON.parse(JSON.parse(line.slice(6)).errorText).message : ""
}

describe("provider error texts in the stream", () => {
    it("shows the user's own local Ollama error in the desktop app", async () => {
        process.env.NEXT_AI_DRAWIO_DESKTOP = "1"
        process.env.AI_PROVIDER = "ollama"
        process.env.AI_MODEL = "llama3"
        // Ollama is not running
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw Object.assign(new TypeError("fetch failed"), {
                    cause: new Error("connect ECONNREFUSED 127.0.0.1:11434"),
                })
            }),
        )
        expect(await streamedError({})).toMatch(
            /127\.0\.0\.1:11434|fetch failed/,
        )
        // The SDK retries a refused connection twice, waiting between
    }, 20_000)

    it("shows the server's keyless Ollama error on the web too", async () => {
        // No key, no money involved; round three hid this text
        process.env.AI_PROVIDER = "ollama"
        process.env.AI_MODEL = "llama3"
        process.env.OLLAMA_BASE_URL = "http://ollama.internal:11434/api"
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw Object.assign(new TypeError("fetch failed"), {
                    cause: new Error("connect ECONNREFUSED 10.0.0.9:11434"),
                })
            }),
        )
        expect(await streamedError({})).not.toBe(
            "The provider returned an error.",
        )
    }, 20_000)

    it("shows EdgeOne's own daily quota explanation", async () => {
        // The function answers 429, which the SDK retries with a wait;
        // the status does not decide whether the text is shown
        providerAnswers(
            400,
            JSON.stringify({
                error: {
                    message:
                        "The daily public quota has been exhausted. After deployment, you can enjoy a personal daily exclusive quota.",
                },
            }),
        )
        expect(
            await streamedError({
                "x-ai-provider": "edgeone",
                "x-ai-model": "@tx/deepseek-ai/deepseek-v3-0324",
            }),
        ).toMatch(/daily public quota/)
    })

    it("hides the provider's text on the server's own key", async () => {
        process.env.AI_PROVIDER = "openai"
        process.env.AI_MODEL = "gpt-5.5"
        process.env.OPENAI_API_KEY = "server-key"
        providerAnswers(
            403,
            JSON.stringify({
                error: { message: "Organization org-operator is suspended" },
            }),
        )
        const message = await streamedError({})
        expect(message).not.toMatch(/org-operator/)
        // A 403 on the server's key gets its own hint and no message
        expect(message).toBe("")
    })
})

describe("the output cap", () => {
    it("holds for the server's own keyless endpoints too", async () => {
        process.env.MAX_OUTPUT_TOKENS = "8000"
        const sent: string[] = []
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init?: RequestInit) => {
                sent.push(String(init?.body ?? ""))
                return new Response("{}", { status: 400 })
            }),
        )
        try {
            const res = await chat(
                new Request("http://localhost/api/chat", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-ai-provider": "ollama",
                        "x-ai-base-url": "http://127.0.0.1:11434/api",
                        "x-ai-model": "llama3",
                        "x-max-output-tokens": "200000",
                    },
                    body: JSON.stringify({
                        messages: [
                            {
                                id: "u1",
                                role: "user",
                                parts: [{ type: "text", text: "Draw" }],
                            },
                        ],
                        xml: "",
                    }),
                }),
            )
            await res.text()
            expect(sent[0]).toContain('"max_output_tokens":8000')
        } finally {
            delete process.env.MAX_OUTPUT_TOKENS
        }
    })
})

describe("a tool call that never got its result", () => {
    it("is left out of the prompt instead of failing every later message", async () => {
        // Stop while the screenshot check ran left display_diagram without
        // a result, and the chat was saved like that
        process.env.AI_PROVIDER = "openai"
        process.env.AI_MODEL = "gpt-5.5"
        process.env.OPENAI_API_KEY = "server-key"
        const sent: string[] = []
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init?: RequestInit) => {
                sent.push(String(init?.body ?? ""))
                return new Response(
                    JSON.stringify({ error: { message: "x" } }),
                    {
                        status: 400,
                        headers: { "Content-Type": "application/json" },
                    },
                )
            }),
        )
        const res = await chat(
            new Request("http://localhost/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [
                        {
                            id: "u1",
                            role: "user",
                            parts: [{ type: "text", text: "Draw a box" }],
                        },
                        {
                            id: "a1",
                            role: "assistant",
                            parts: [
                                {
                                    type: "tool-display_diagram",
                                    toolCallId: "call-without-result",
                                    state: "input-available",
                                    input: { xml: "<mxCell/>" },
                                },
                            ],
                        },
                        {
                            id: "u2",
                            role: "user",
                            parts: [{ type: "text", text: "Make it red" }],
                        },
                    ],
                    xml: "",
                }),
            }),
        )
        await res.text()
        // The request reached the model, without the unanswered call
        expect(sent).toHaveLength(1)
        expect(sent[0]).toContain("Make it red")
        expect(sent[0]).not.toContain("call-without-result")
    })
})
