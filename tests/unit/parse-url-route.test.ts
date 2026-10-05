// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { POST as parseUrl } from "@/app/api/parse-url/route"

// Treat every URL as public so no test hits DNS
vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    isPrivateUrl: async () => false,
}))

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("POST /api/parse-url", () => {
    it("stops the download of a page announced as too large", async () => {
        let signal: AbortSignal | undefined
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_url: string, init: RequestInit) => {
                signal = init.signal ?? undefined
                // A body that never ends unless the request is aborted
                return new Response(new ReadableStream(), {
                    headers: {
                        "content-type": "text/html",
                        "content-length": String(50 * 1024 * 1024),
                    },
                })
            }),
        )
        const res = await parseUrl(
            new Request("http://localhost/api/parse-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: "https://example.com/huge" }),
            }),
        )
        expect(res.status).toBe(413)
        expect(signal?.aborted).toBe(true)
    })
})
