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
beforeEach(() => {
    for (const k of ENV) vi.stubEnv(k, undefined)
})

afterEach(() => {
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

/** The error the chat panel gets from the stream */
async function streamedError(
    headers: Record<string, string>,
): Promise<{ code: string; message: string }> {
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
    if (!line) throw new Error(`No error event in the stream:\n${text}`)
    const { code, message } = JSON.parse(JSON.parse(line.slice(6)).errorText)
    return { code, message }
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
        expect((await streamedError({})).message).toMatch(
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
        expect((await streamedError({})).message).toMatch(
            /10\.0\.0\.9:11434|fetch failed/,
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
        const { message } = await streamedError({
            "x-ai-provider": "edgeone",
            "x-ai-model": "@tx/deepseek-ai/deepseek-v3-0324",
        })
        expect(message).toMatch(/daily public quota/)
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
        const { code, message } = await streamedError({})
        expect(message).not.toMatch(/org-operator/)
        // A 403 on the server's key gets its own hint and no message
        expect(code).toBe("server_key_forbidden")
        expect(message).toBe("")
    })
})

describe("the output cap", () => {
    it("holds for the server's own keyless endpoints too", async () => {
        vi.stubEnv("MAX_OUTPUT_TOKENS", "8000")
        const sent: string[] = []
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init?: RequestInit) => {
                sent.push(String(init?.body ?? ""))
                return new Response("{}", { status: 400 })
            }),
        )
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

describe("a server model that is gone", () => {
    it("is refused with its own code, before any provider is called", async () => {
        // Its provider was removed or renamed in the admin panel after the
        // page loaded: the request's provider header is the old name's slug
        vi.stubEnv(
            "AI_MODELS_CONFIG",
            JSON.stringify({
                providers: [
                    { name: "New Name", provider: "openai", models: ["m1"] },
                ],
            }),
        )
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        const res = await chat(
            new Request("http://localhost/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-selected-model-id": "server:old-name:m1",
                    "x-ai-provider": "old-name",
                    "x-ai-model": "m1",
                },
                body: JSON.stringify({
                    messages: [
                        {
                            id: "u1",
                            role: "user",
                            parts: [{ type: "text", text: "Draw two boxes" }],
                        },
                    ],
                }),
            }),
        )
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe("server_model_gone")
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

/** A first message, from a page that names no model */
const firstMessage = (headers: Record<string, string> = {}) =>
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
    )

describe("a request that names no model", () => {
    it("runs on the default of the server's model list when there is no AI_MODEL", async () => {
        // A page sends its first message before the list has reached it
        vi.stubEnv(
            "AI_MODELS_CONFIG",
            JSON.stringify({
                providers: [
                    { name: "First", provider: "openai", models: ["m1"] },
                    {
                        name: "Second",
                        provider: "openai",
                        models: ["m2", "m3"],
                        default: true,
                    },
                ],
            }),
        )
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
        const res = await firstMessage()
        await res.text()
        expect(sent).toHaveLength(1)
        expect(JSON.parse(sent[0]).model).toBe("m2")
    })

    it("keeps the model and key of a request that names its model in x-ai-model alone", async () => {
        // A script, on a server whose list has another provider's default
        process.env.AI_PROVIDER = "openai"
        process.env.OPENAI_API_KEY = "server-key"
        vi.stubEnv(
            "AI_MODELS_CONFIG",
            '{"providers":[{"name":"Claude","provider":"anthropic","models":["claude-default"],"default":true}]}',
        )
        const sent: unknown[] = []
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init?: RequestInit) => {
                sent.push([
                    url,
                    new Headers(init?.headers).get("authorization"),
                    JSON.parse(String(init?.body)).model,
                ])
                return new Response('{"error":{"message":"x"}}', {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                })
            }),
        )
        const res = await firstMessage({
            "x-ai-model": "gpt-4o-mini",
            "x-ai-api-key": "sk-user-key",
        })
        await res.text()
        expect(sent).toEqual([
            [
                "https://api.openai.com/v1/responses",
                "Bearer sk-user-key",
                "gpt-4o-mini",
            ],
        ])
    })

    it("says how to choose Bedrock in the part of the error the chat shows", async () => {
        // AWS credentials alone (an instance role, or AWS_ACCESS_KEY_ID)
        // select no provider
        for (const key of Object.keys(process.env)) {
            if (/_API_KEY$|_AUTH_TOKEN$/.test(key)) vi.stubEnv(key, undefined)
        }
        vi.stubEnv("AI_MODELS_CONFIG", "")
        process.env.AI_MODEL = "global.anthropic.claude-sonnet-5-5"
        const res = await firstMessage()
        expect(res.status).toBe(500)
        // The chat shows this text, which the route cuts to 500 characters
        expect((await res.json()).message).toContain("AI_PROVIDER=bedrock")
    })
})
