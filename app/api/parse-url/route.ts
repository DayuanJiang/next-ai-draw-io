import { extractFromHtml } from "@extractus/article-extractor"
import { NextResponse } from "next/server"
import TurndownService from "turndown"
import { isPrivateUrl } from "@/lib/ssrf-protection"

const MAX_CONTENT_LENGTH = 150000 // Match PDF limit
const EXTRACT_TIMEOUT_MS = 15000
const USER_AGENT = "Mozilla/5.0 (compatible; NextAIDrawio/1.0)"

// Detect the page's charset so non-UTF-8 pages (Shift_JIS/GBK/EUC/Big5, common
// on CJK sites) are decoded correctly. Response.text() always assumes UTF-8 and
// would produce mojibake; the article-extractor library does the same detection
// when it fetches the page itself, which we no longer rely on.
function detectCharset(
    contentType: string | null,
    buffer: ArrayBuffer,
): string {
    // 1. HTTP Content-Type header charset (most authoritative).
    const headerCharset = contentType?.match(/charset=([^;]+)/i)?.[1]?.trim()
    // 2. <meta charset> / <meta http-equiv> in the first bytes of the document.
    const head = new TextDecoder("utf-8").decode(buffer.slice(0, 4096))
    const metaCharset =
        head.match(/<meta[^>]+charset=["']?\s*([\w-]+)/i)?.[1] ||
        head.match(/<meta[^>]+content=["'][^"']*charset=([\w-]+)/i)?.[1]
    const charset = (headerCharset || metaCharset || "utf-8").toLowerCase()
    // TextDecoder throws on unknown encoding labels; fall back to UTF-8.
    try {
        new TextDecoder(charset)
        return charset
    } catch {
        return "utf-8"
    }
}

export async function POST(req: Request) {
    try {
        const { url } = await req.json()

        if (!url || typeof url !== "string") {
            return NextResponse.json(
                { error: "URL is required" },
                { status: 400 },
            )
        }

        // Validate URL format
        try {
            new URL(url)
        } catch {
            return NextResponse.json(
                { error: "Invalid URL format" },
                { status: 400 },
            )
        }

        // SSRF protection: parse-url has no use case for fetching internal
        // hosts, so private URLs are always rejected. ALLOW_PRIVATE_URLS only
        // governs LLM provider baseUrl overrides (validate-model, chat).
        if (await isPrivateUrl(url)) {
            return NextResponse.json(
                { error: "Cannot access private/internal URLs" },
                { status: 400 },
            )
        }
        // Fetch the page ourselves so we control redirect handling. The
        // article-extractor library follows redirects internally and ignores a
        // `redirect` option, which would let a public URL 302 to an internal
        // host and bypass the SSRF check above. `redirect: "error"` rejects any
        // redirect outright.
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
            controller.abort()
        }, EXTRACT_TIMEOUT_MS)

        let html: string
        try {
            const response = await fetch(url, {
                headers: { "User-Agent": USER_AGENT },
                redirect: "error",
                signal: controller.signal,
            })

            const contentType = response.headers.get("content-type")
            if (contentType?.includes("application/pdf")) {
                return NextResponse.json(
                    {
                        error: "PDF URLs are not supported. Please download and upload the PDF file directly",
                    },
                    { status: 422 },
                )
            }

            if (!response.ok) {
                return NextResponse.json(
                    { error: "Could not fetch URL content" },
                    { status: 400 },
                )
            }

            const buffer = await response.arrayBuffer()
            const charset = detectCharset(contentType, buffer)
            html = new TextDecoder(charset).decode(buffer)
        } catch (err: any) {
            if (err?.name === "AbortError") {
                return NextResponse.json(
                    { error: "Timed out while fetching URL content" },
                    { status: 504 },
                )
            }
            // Redirects are rejected with a TypeError ("failed to fetch" /
            // "unexpected redirect") when redirect: "error" is set.
            return NextResponse.json(
                { error: "Could not fetch URL content" },
                { status: 400 },
            )
        } finally {
            clearTimeout(timeoutId)
        }

        // extractFromHtml throws (not returns null) on empty/non-HTML bodies,
        // so map any parse error to the same 400 as the no-content case.
        let article: Awaited<ReturnType<typeof extractFromHtml>>
        try {
            article = await extractFromHtml(html, url)
        } catch {
            article = null
        }

        if (!article || !article.content) {
            return NextResponse.json(
                { error: "Could not extract content from URL" },
                { status: 400 },
            )
        }

        // Convert HTML to Markdown
        const turndownService = new TurndownService({
            headingStyle: "atx",
            codeBlockStyle: "fenced",
        })

        // Remove unwanted elements before conversion
        turndownService.remove(["script", "style", "iframe", "noscript"])

        const markdown = turndownService.turndown(article.content)

        // Check content length
        if (markdown.length > MAX_CONTENT_LENGTH) {
            return NextResponse.json(
                {
                    error: `Content exceeds ${MAX_CONTENT_LENGTH / 1000}k character limit (${(markdown.length / 1000).toFixed(1)}k chars)`,
                },
                { status: 400 },
            )
        }

        return NextResponse.json({
            title: article.title || "Untitled",
            content: markdown,
            charCount: markdown.length,
        })
    } catch (error) {
        console.error("URL extraction error:", error)
        return NextResponse.json(
            { error: "Failed to fetch or parse URL content" },
            { status: 500 },
        )
    }
}
