import { extractFromHtml } from "@extractus/article-extractor"
import { NextResponse } from "next/server"
import TurndownService from "turndown"
import { checkAccessCode, rejectCrossSite } from "@/lib/access-code"
import { readLimitedBody } from "@/lib/read-limited-body"
import { blockedUrlReason, publicOnlyDispatcher } from "@/lib/ssrf-protection"

const MAX_CONTENT_LENGTH = 150000 // Match PDF limit
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const EXTRACT_TIMEOUT_MS = 15000
const MAX_REDIRECTS = 5
const USER_AGENT = "Mozilla/5.0 (compatible; NextAIDrawio/1.0)"

// Detect the page's charset so non-UTF-8 pages (Shift_JIS/GBK/EUC/Big5, common
// on CJK sites) are decoded correctly. Response.text() always assumes UTF-8 and
// would produce mojibake; the article-extractor library does the same detection
// only when it fetches the page itself, and the page is fetched here.
function detectCharset(
    contentType: string | null,
    buffer: ArrayBuffer,
    html: boolean,
): string {
    // 1. HTTP Content-Type header charset (most authoritative). HTTP allows
    // the value in quotes, which TextDecoder would not know as a label.
    const headerCharset = contentType
        ?.match(/charset=["']?([^;"']+)/i)?.[1]
        ?.trim()
    // 2. <meta charset> / <meta http-equiv> in the first bytes of an HTML
    // document. In plain text or Markdown such a tag is part of the text
    // (an HTML example), not the file's encoding.
    const head = html
        ? new TextDecoder("utf-8").decode(buffer.slice(0, 4096))
        : ""
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

// A failure the user can act on carries a `code`, and the numbers that go
// with it: the page shows its own text for the code (dict.url.errors), in
// its language. `error` is for other callers and the logs.
export async function POST(req: Request) {
    const crossSite = rejectCrossSite(req)
    if (crossSite) return crossSite
    const accessError = checkAccessCode(req)
    if (accessError) return accessError

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

        // Fetch the page ourselves so we control redirect handling. The
        // article-extractor library follows redirects internally and ignores a
        // `redirect` option, which would let a public URL 302 to an internal
        // host and bypass the SSRF check. Redirects (http to https, an added
        // slash, a www host) are followed here one hop at a time, and every
        // hop's address is checked like the first.
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
            controller.abort()
        }, EXTRACT_TIMEOUT_MS)

        // The page's address after its redirects
        let pageUrl = url
        let body: string
        // Plain text and Markdown (a raw README, an RFC) are the content as
        // they are; the article extractor reads HTML only
        let plainText: boolean
        try {
            let response: Response
            for (let hop = 0; ; hop++) {
                // SSRF protection: parse-url has no use case for fetching
                // internal hosts, so private URLs are always rejected.
                // ALLOW_PRIVATE_URLS only governs LLM provider baseUrl
                // overrides (validate-model, chat).
                const blocked = await blockedUrlReason(pageUrl)
                if (blocked) {
                    return NextResponse.json(
                        blocked === "unresolved"
                            ? {
                                  error: "Could not find this website",
                                  code: "not_found",
                              }
                            : {
                                  error: "Cannot access private/internal URLs",
                                  code: "private",
                              },
                        { status: 400 },
                    )
                }
                // The dispatcher refuses a name that resolves to a private
                // address when the socket opens, after the check above passed
                response = await fetch(pageUrl, {
                    headers: { "User-Agent": USER_AGENT },
                    redirect: "manual",
                    signal: controller.signal,
                    dispatcher: publicOnlyDispatcher,
                } as RequestInit)
                const location = response.headers.get("location")
                if (
                    response.status < 300 ||
                    response.status >= 400 ||
                    !location
                ) {
                    break
                }
                if (hop === MAX_REDIRECTS) {
                    return NextResponse.json(
                        { error: "Too many redirects" },
                        { status: 400 },
                    )
                }
                pageUrl = new URL(location, pageUrl).toString()
            }

            const contentType = response.headers.get("content-type")
            if (contentType?.includes("application/pdf")) {
                return NextResponse.json(
                    {
                        error: "PDF URLs are not supported. Please download and upload the PDF file directly",
                        code: "pdf",
                    },
                    { status: 422 },
                )
            }

            if (!response.ok) {
                return NextResponse.json(
                    {
                        error: `The website answered with status ${response.status}`,
                        code: "http_error",
                        status: response.status,
                    },
                    { status: 400 },
                )
            }

            const buffer = await readLimitedBody(response, MAX_RESPONSE_BYTES)
            if (!buffer) {
                return NextResponse.json(
                    {
                        error: `Page exceeds the ${MAX_RESPONSE_BYTES / 1024 / 1024} MB download limit`,
                        code: "too_large",
                        limit: MAX_RESPONSE_BYTES / 1024 / 1024,
                    },
                    { status: 413 },
                )
            }
            plainText = /^text\/(plain|markdown)\b/i.test(contentType ?? "")
            const charset = detectCharset(contentType, buffer, !plainText)
            body = new TextDecoder(charset).decode(buffer)
        } catch (err: any) {
            if (err?.name === "AbortError") {
                return NextResponse.json(
                    {
                        error: "Timed out while fetching URL content",
                        code: "timeout",
                    },
                    { status: 504 },
                )
            }
            return NextResponse.json(
                { error: "Could not fetch URL content" },
                { status: 400 },
            )
        } finally {
            clearTimeout(timeoutId)
            // Ends a download left unread (too large, PDF, error status);
            // a body already read is not affected
            controller.abort()
        }

        let title: string | undefined
        let markdown: string | undefined
        if (plainText) {
            // The file's name
            title = new URL(pageUrl).pathname.split("/").pop()
            markdown = body
        } else {
            // extractFromHtml throws (not returns null) on empty/non-HTML
            // bodies, so a parse error is the no-content case as well.
            const article = await extractFromHtml(body, pageUrl).catch(
                () => null,
            )
            if (article?.content) {
                // Convert HTML to Markdown
                const turndownService = new TurndownService({
                    headingStyle: "atx",
                    codeBlockStyle: "fenced",
                })

                // Remove unwanted elements before conversion
                turndownService.remove([
                    "script",
                    "style",
                    "iframe",
                    "noscript",
                ])

                title = article.title
                markdown = turndownService.turndown(article.content)
            }
        }

        if (!markdown?.trim()) {
            return NextResponse.json(
                {
                    error: "Could not extract content from URL",
                    code: "no_content",
                },
                { status: 400 },
            )
        }

        // Check content length
        if (markdown.length > MAX_CONTENT_LENGTH) {
            return NextResponse.json(
                {
                    error: `Content exceeds ${MAX_CONTENT_LENGTH / 1000}k character limit (${(markdown.length / 1000).toFixed(1)}k chars)`,
                    code: "too_long",
                    limit: MAX_CONTENT_LENGTH / 1000,
                    size: (markdown.length / 1000).toFixed(1),
                },
                { status: 400 },
            )
        }

        return NextResponse.json({
            title: title || "Untitled",
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
