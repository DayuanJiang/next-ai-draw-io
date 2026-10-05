// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST as parseUrl } from "@/app/api/parse-url/route"
import { POST as validateDiagram } from "@/app/api/validate-diagram/route"
import { POST as validateModel } from "@/app/api/validate-model/route"
import { POST as verifyAccessCode } from "@/app/api/verify-access-code/route"
import { checkAccessCode } from "@/lib/access-code"

// Treat every URL as public so no test hits DNS
vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async () => false,
}))

function post(path: string, body: unknown, accessCode?: string): Request {
    return new Request(`http://localhost${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(accessCode ? { "x-access-code": accessCode } : {}),
        },
        body: JSON.stringify(body),
    })
}

beforeEach(() => {
    process.env.ACCESS_CODE_LIST = "secret, other"
})

afterEach(() => {
    delete process.env.ACCESS_CODE_LIST
    delete process.env.ALLOW_PRIVATE_URLS
    vi.unstubAllGlobals()
})

describe("checkAccessCode", () => {
    it("passes when no access codes are configured", () => {
        delete process.env.ACCESS_CODE_LIST
        expect(checkAccessCode(post("/x", {}))).toBeNull()
    })

    it("rejects a missing or wrong code and accepts a listed one", () => {
        expect(checkAccessCode(post("/x", {}))?.status).toBe(401)
        expect(checkAccessCode(post("/x", {}, "nope"))?.status).toBe(401)
        expect(checkAccessCode(post("/x", {}, "other"))).toBeNull()
    })
})

describe("routes that spend server resources require the access code", () => {
    it("parse-url", async () => {
        const res = await parseUrl(
            post("/api/parse-url", { url: "https://example.com" }),
        )
        expect(res.status).toBe(401)
    })

    it("validate-diagram", async () => {
        const res = await validateDiagram(
            post("/api/validate-diagram", {
                imageData: "data:image/png;base64,AAAA",
            }),
        )
        expect(res.status).toBe(401)
    })

    it("validate-model", async () => {
        const res = await validateModel(
            post("/api/validate-model", {
                provider: "openai",
                apiKey: "sk",
                modelId: "m",
            }),
        )
        expect(res.status).toBe(401)
    })

    it("verify-access-code", async () => {
        const bad = await verifyAccessCode(post("/api/verify-access-code", {}))
        expect(bad.status).toBe(401)
        expect((await bad.json()).valid).toBe(false)

        const good = await verifyAccessCode(
            post("/api/verify-access-code", {}, "secret"),
        )
        expect((await good.json()).valid).toBe(true)
    })
})

describe("size limits", () => {
    it("parse-url stops reading a body over the download limit", async () => {
        const chunk = new Uint8Array(1024 * 1024)
        let sent = 0
        const body = new ReadableStream<Uint8Array>({
            pull(controller) {
                sent++
                controller.enqueue(chunk)
            },
        })
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(body, {
                        headers: { "content-type": "text/html" },
                    }),
            ),
        )

        const res = await parseUrl(
            post("/api/parse-url", { url: "https://example.com" }, "secret"),
        )
        expect(res.status).toBe(413)
        expect(sent).toBeLessThan(10)
    })

    it("validate-diagram rejects oversized image data", async () => {
        const imageData = `data:image/png;base64,${"A".repeat(6 * 1024 * 1024)}`
        const res = await validateDiagram(
            post("/api/validate-diagram", { imageData }, "secret"),
        )
        expect(res.status).toBe(413)
    })
})

describe("validate-model redirects", () => {
    it("refuses redirects when private URLs are blocked", async () => {
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

        const res = await validateModel(
            post(
                "/api/validate-model",
                {
                    provider: "openai",
                    apiKey: "sk",
                    modelId: "m",
                    baseUrl: "https://attacker.example/v1",
                },
                "secret",
            ),
        )
        const data = await res.json()
        expect(data.valid).toBe(false)
        expect(data.error).toMatch(/Redirects are not allowed/)
        expect(fetch).toHaveBeenCalledTimes(1)
    })
})
