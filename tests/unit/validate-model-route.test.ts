// @vitest-environment node
import { streamText } from "ai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { POST as testModel } from "@/app/api/admin/test-model/route"
import { POST as validateModel } from "@/app/api/validate-model/route"
import { getAIModel } from "@/lib/ai-providers"

// No saved admin providers
vi.mock("@/lib/admin/settings", () => ({
    loadSettings: () => ({}),
    getEnvFallback: (key: string) => process.env[key] ?? null,
}))

// Every URL is public (no DNS in tests), unless a test says otherwise
const privateUrls = vi.hoisted(() => ({ all: false }))
vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async () => privateUrls.all,
}))

// The quota, off unless a test turns it on; every request is refused
const quota = vi.hoisted(() => ({ enabled: false, checks: 0 }))
vi.mock("@/lib/dynamo-quota-manager", () => ({
    isQuotaEnabled: () => quota.enabled,
    checkAndIncrementRequest: async () => {
        quota.checks++
        return { allowed: false, error: "Daily limit reached" }
    },
}))
vi.mock("@/lib/user-id", () => ({ getUserIdFromRequest: () => "user-1" }))

afterEach(() => {
    quota.enabled = false
    quota.checks = 0
    privateUrls.all = false
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

    it("reports a model that did not answer in time", async () => {
        // The 15 s timeout has fired: the SDK ends the stream with an
        // abort part instead of throwing
        const timedOut = AbortSignal.abort(
            new DOMException("The operation timed out.", "TimeoutError"),
        )
        const timeout = vi
            .spyOn(AbortSignal, "timeout")
            .mockReturnValue(timedOut)
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                throw timedOut.reason
            }),
        )
        try {
            const data = await testGlm()
            expect(data.valid).toBe(false)
            expect(data.code).toBe("timeout")
        } finally {
            timeout.mockRestore()
        }
    })

    it("refuses a key that is not text", async () => {
        // An object is truthy: it would pass as the user's own key while
        // the gateway SDK ignores it and falls back to the server's OIDC
        // token
        const fetchMock = vi.fn()
        vi.stubGlobal("fetch", fetchMock)
        for (const extra of [
            { apiKey: {} },
            { apiKey: ["key"] },
            { apiKey: "key", baseUrl: { href: "https://a.example" } },
        ]) {
            const res = await validateModel(
                new Request("http://localhost/api/validate-model", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        provider: "gateway",
                        modelId: "openai/gpt-4o",
                        ...extra,
                    }),
                }),
            )
            expect(res.status).toBe(400)
        }
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("does not run on the server's keys", async () => {
        vi.stubEnv("OLLAMA_API_KEY", "server-ollama-key")
        const res = await validateModel(
            new Request("http://localhost/api/validate-model", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: "ollama",
                    modelId: "any-cloud-model",
                }),
            }),
        )
        expect(res.status).toBe(400)
        expect((await res.json()).error).toMatch(/API key/)
    })

    it("warns when the model answers without a tool call", async () => {
        streamReply({ role: "assistant", content: "OK" })
        const data = await testGlm()
        expect(data.valid).toBe(true)
        expect(data.warning).toMatch(/without calling a tool/)
    })

    it("warns when the model calls a tool that does not exist", async () => {
        // The SDK passes the call on, marked invalid
        streamReply({
            role: "assistant",
            tool_calls: [
                {
                    index: 0,
                    id: "call_1",
                    type: "function",
                    function: { name: "pong", arguments: "{}" },
                },
            ],
        })
        const data = await testGlm()
        expect(data.valid).toBe(true)
        expect(data.warning).toMatch(/without calling a tool/)
    })
})

describe("chat requests to a client base URL", () => {
    it("refuse redirects when private URLs are blocked", async () => {
        vi.stubEnv("ALLOW_PRIVATE_URLS", "false")
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

describe("testing EdgeOne", () => {
    // The request validate-model sends to the EdgeOne function
    const capture = () => {
        const calls: Array<{ url: string; headers: Headers }> = []
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init?: RequestInit) => {
                calls.push({
                    url: String(url),
                    headers: new Headers(init?.headers),
                })
                throw new Error("no network in tests")
            }),
        )
        return calls
    }

    it("calls the site's own function, also without a base URL", async () => {
        // The admin panel's Test sends none; a relative one cannot be fetched
        const calls = capture()
        await validateModel(
            new Request("http://localhost/api/validate-model", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    origin: "https://draw.example",
                },
                body: JSON.stringify({
                    provider: "edgeone",
                    modelId: "@tx/deepseek-ai/deepseek-v3-0324",
                    baseUrl: "https://elsewhere.example/api/edgeai",
                }),
            }),
        )
        expect(calls[0]?.url).toBe(
            "https://draw.example/api/edgeai/chat/completions",
        )
    })

    it("passes the admin's access code and cookies on", async () => {
        // The EdgeOne function checks the access code too
        vi.stubEnv("ADMIN_PASSWORD", "admin-pw")
        const calls = capture()
        await testModel(
            new Request("http://localhost/api/admin/test-model", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-admin-password": "admin-pw",
                    "x-access-code": "visitor-code",
                    cookie: "eo_token=t",
                    origin: "https://draw.example",
                },
                body: JSON.stringify({
                    provider: {
                        id: "p1",
                        provider: "edgeone",
                        models: ["@tx/deepseek-ai/deepseek-v3-0324"],
                    },
                    modelId: "@tx/deepseek-ai/deepseek-v3-0324",
                }),
            }),
        )
        expect(calls[0]?.url).toBe(
            "https://draw.example/api/edgeai/chat/completions",
        )
        expect(calls[0]?.headers.get("x-access-code")).toBe("visitor-code")
        expect(calls[0]?.headers.get("cookie")).toBe("eo_token=t")
    })
})

describe("the admin Test of the server's own base URL", () => {
    // An admin panel entry without a URL of its own
    const adminTest = () =>
        testModel(
            new Request("http://localhost/api/admin/test-model", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-admin-password": "admin-pw",
                },
                body: JSON.stringify({
                    provider: {
                        id: "p1",
                        provider: "openai",
                        apiKey: "panel-key",
                        models: ["gpt-5.5"],
                    },
                    modelId: "gpt-5.5",
                }),
            }),
        )
    // A user naming the same address in the Settings dialog
    const userTest = () =>
        validateModel(
            new Request("http://localhost/api/validate-model", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: "openai",
                    apiKey: "panel-key",
                    modelId: "gpt-5.5",
                    baseUrl: "http://10.0.0.5:8000/v1",
                }),
            }),
        )

    it("tests it as chat uses it: an internal address is allowed", async () => {
        // ALLOW_PRIVATE_URLS=false guards URLs users type, not the server's
        vi.stubEnv("ALLOW_PRIVATE_URLS", "false")
        vi.stubEnv("OPENAI_BASE_URL", "http://10.0.0.5:8000/v1")
        vi.stubEnv("ADMIN_PASSWORD", "admin-pw")
        privateUrls.all = true
        streamReply({ role: "assistant", content: "OK" })
        const admin = await (await adminTest()).json()
        expect(admin.valid).toBe(true)
        // A user typing the same address is still refused
        const other = await userTest()
        expect(other.status).toBe(400)
    })
})

describe("the admin panel's Test button", () => {
    it("works when access codes are set", async () => {
        // The admin password stands in for the visitor access code
        vi.stubEnv("ACCESS_CODE_LIST", "visitor-code")
        vi.stubEnv("ADMIN_PASSWORD", "admin-pw")
        streamReply({ role: "assistant", content: "OK" })
        const res = await testModel(
            new Request("http://localhost/api/admin/test-model", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-admin-password": "admin-pw",
                },
                body: JSON.stringify({
                    provider: {
                        id: "p1",
                        provider: "glm",
                        apiKey: "key",
                        models: ["glm-5"],
                    },
                    modelId: "glm-5",
                }),
            }),
        )
        expect(res.status).toBe(200)
        expect((await res.json()).valid).toBe(true)
    })
})

describe("the Test on the deployment's own endpoints", () => {
    const test = (body: object) =>
        validateModel(
            new Request("http://localhost/api/validate-model", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ modelId: "m", ...body }),
            }),
        )

    it("counts as a chat request with the quota on", async () => {
        quota.enabled = true
        // EdgeOne, and a model server on the server's network with a dummy key
        const edgeone = await test({ provider: "edgeone" })
        expect(edgeone.status).toBe(429)
        privateUrls.all = true
        const internal = await test({
            provider: "openai",
            apiKey: "x",
            baseUrl: "http://10.0.0.5:8000/v1",
        })
        expect(internal.status).toBe(429)
        expect(quota.checks).toBe(2)
    })

    it("does not count a user's own endpoint", async () => {
        quota.enabled = true
        streamReply({ role: "assistant", content: "OK" })
        const res = await test({
            provider: "openai",
            apiKey: "user-key",
            baseUrl: "https://api.example.com/v1",
        })
        expect(res.status).toBe(200)
        expect(quota.checks).toBe(0)
    })
})

describe("POST /api/validate-model with an unknown provider", () => {
    const send = (body: object) =>
        validateModel(
            new Request("http://localhost/api/validate-model", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ modelId: "m", ...body }),
            }),
        )

    it("refuses a name that is not a provider, with or without a key", async () => {
        for (const body of [
            { provider: "nope", apiKey: "k" },
            { provider: "nope" },
            // A prototype property is not a provider either
            { provider: "toString", apiKey: "k" },
        ]) {
            const res = await send(body)
            expect(res.status).toBe(400)
            const { error } = await res.json()
            expect(error).toMatch(/^Invalid provider: /)
        }
    })
})
