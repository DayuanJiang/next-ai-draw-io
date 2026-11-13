// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { POST as parseUrl } from "@/app/api/parse-url/route"
import { publicOnlyDispatcher } from "@/lib/ssrf-protection"

// Answered by the URL's text, so no test hits DNS
vi.mock("@/lib/ssrf-protection", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ssrf-protection")>()),
    blockedUrlReason: async (url: string) =>
        url.startsWith("http://10.")
            ? "private"
            : url.includes("no-such-host")
              ? "unresolved"
              : null,
}))

afterEach(() => {
    vi.unstubAllGlobals()
})

const post = (url: string) =>
    parseUrl(
        new Request("http://localhost/api/parse-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
        }),
    )

// A page the article extractor accepts
const article = (text = "Readable text of the article. ".repeat(20)) =>
    `<html><head><title>Article</title></head><body><article><h1>Article</h1><p>${text}</p></article></body></html>`

describe("POST /api/parse-url", () => {
    it("connects through the public-only dispatcher (DNS rebinding)", async () => {
        const fetchMock = vi.fn(
            async (_url: string, _init: RequestInit) =>
                new Response(article(), {
                    headers: { "content-type": "text/html" },
                }),
        )
        vi.stubGlobal("fetch", fetchMock)
        const res = await post("https://example.com/article")
        expect(res.status).toBe(200)
        expect(publicOnlyDispatcher).toBeDefined()
        expect(fetchMock.mock.calls[0][1]).toMatchObject({
            dispatcher: publicOnlyDispatcher,
        })
    })

    const redirect = (location: string) =>
        new Response(null, { status: 301, headers: { location } })

    it("follows redirects to the page", async () => {
        // http to https, then an added slash given as a relative address
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(redirect("https://example.com/docs"))
            .mockResolvedValueOnce(redirect("/docs/"))
            .mockResolvedValueOnce(
                new Response(article(), {
                    headers: { "content-type": "text/html" },
                }),
            )
        vi.stubGlobal("fetch", fetchMock)
        const res = await post("http://example.com/docs")
        expect(res.status).toBe(200)
        expect((await res.json()).title).toBe("Article")
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            "http://example.com/docs",
            "https://example.com/docs",
            "https://example.com/docs/",
        ])
    })

    it("refuses a redirect to a private address", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(redirect("http://10.0.0.5/admin"))
        vi.stubGlobal("fetch", fetchMock)
        const res = await post("https://example.com/go")
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe("private")
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("gives up on a page that keeps redirecting", async () => {
        const fetchMock = vi
            .fn()
            .mockImplementation(async () => redirect("https://example.com/a"))
        vi.stubGlobal("fetch", fetchMock)
        const res = await post("https://example.com/a")
        expect(res.status).toBe(400)
        expect((await res.json()).error).toMatch(/redirects/)
        expect(fetchMock).toHaveBeenCalledTimes(6)
    })

    it("tells a host name that does not exist from a private address", async () => {
        vi.stubGlobal("fetch", vi.fn())
        const res = await post("https://no-such-host.example/")
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe("not_found")
        expect(fetch).not.toHaveBeenCalled()
    })

    it("names the cause of a failure with a code and its numbers", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response("gone", { status: 404 })),
        )
        expect(await (await post("https://example.com/gone")).json()).toEqual({
            error: "The website answered with status 404",
            code: "http_error",
            status: 404,
        })

        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(article("long text ".repeat(20000)), {
                        headers: { "content-type": "text/html" },
                    }),
            ),
        )
        expect(
            await (await post("https://example.com/long")).json(),
        ).toMatchObject({ code: "too_long", limit: 150, size: "200.0" })

        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response("<html><body></body></html>", {
                        headers: { "content-type": "text/html" },
                    }),
            ),
        )
        expect(
            await (await post("https://example.com/empty")).json(),
        ).toMatchObject({ code: "no_content" })
    })

    it("reads plain text and Markdown as they are", async () => {
        const readme =
            "# Next AI Draw.io\n\nA *Markdown* file, not a web page.\n"
        for (const type of ["text/plain; charset=utf-8", "text/markdown"]) {
            vi.stubGlobal(
                "fetch",
                vi.fn(
                    async () =>
                        new Response(readme, {
                            headers: { "content-type": type },
                        }),
                ),
            )
            const res = await post("https://raw.example.com/main/README.md")
            expect(await res.json()).toEqual({
                title: "README.md",
                content: readme,
                charCount: readme.length,
            })
        }
    })

    it("does not take a meta tag in a Markdown file for the file's encoding", async () => {
        // A UTF-8 tutorial served without a charset, with an HTML example
        const tutorial =
            '# HTML の書き方\n\n```html\n<meta charset="Shift_JIS">\n```\n\n文字コードを指定します。\n'
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(tutorial, {
                        headers: { "content-type": "text/markdown" },
                    }),
            ),
        )
        const res = await post("https://docs.example.jp/html.md")
        expect((await res.json()).content).toBe(tutorial)
    })

    it("decodes a page whose Content-Type quotes the charset", async () => {
        // The bytes of あ in Shift_JIS, inside an otherwise ASCII page
        const [before, after] = article(
            `MARK${" plus enough text.".repeat(20)}`,
        ).split("MARK")
        const page = Buffer.concat([
            Buffer.from(before),
            Buffer.from([0x82, 0xa0]),
            Buffer.from(after),
        ])
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(page, {
                        headers: {
                            "content-type": 'text/html; charset="Shift_JIS"',
                        },
                    }),
            ),
        )
        const res = await post("https://example.jp/article")
        expect(res.status).toBe(200)
        const { content } = await res.json()
        expect(content).toContain("あ")
        expect(content).not.toContain("\ufffd")
    })

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
        const res = await post("https://example.com/huge")
        expect(res.status).toBe(413)
        expect(await res.json()).toMatchObject({ code: "too_large", limit: 5 })
        expect(signal?.aborted).toBe(true)
    })
})
