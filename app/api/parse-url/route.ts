import { extract } from "@extractus/article-extractor"
import { NextResponse } from "next/server"
import TurndownService from "turndown"

const MAX_CONTENT_LENGTH = 150000 // Match PDF limit
const EXTRACT_TIMEOUT_MS = 15000

// SSRF protection - block private/internal addresses
function isPrivateUrl(urlString: string): boolean {
    try {
        const url = new URL(urlString)
        const hostname = url.hostname.toLowerCase()

        // Block localhost
        if (
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "::1"
        ) {
            return true
        }

        // Block AWS/cloud metadata endpoints
        if (
            hostname === "169.254.169.254" ||
            hostname === "metadata.google.internal"
        ) {
            return true
        }

        // Check for private IPv4 ranges
        const ipv4Match = hostname.match(
            /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
        )
        if (ipv4Match) {
            const [, a, b] = ipv4Match.map(Number)
            if (a === 10) return true // 10.0.0.0/8
            if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
            if (a === 192 && b === 168) return true // 192.168.0.0/16
            if (a === 169 && b === 254) return true // 169.254.0.0/16 (link-local)
            if (a === 127) return true // 127.0.0.0/8 (loopback)
        }

        // Block common internal hostnames
        if (
            hostname.endsWith(".local") ||
            hostname.endsWith(".internal") ||
            hostname.endsWith(".localhost")
        ) {
            return true
        }

        return false
    } catch {
        return true // Invalid URL - block it
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

        // SSRF protection - enabled by default, set ALLOW_PRIVATE_URLS=false to block
        const allowPrivateUrls = process.env.ALLOW_PRIVATE_URLS !== "false"
        if (!allowPrivateUrls && isPrivateUrl(url)) {
            return NextResponse.json(
                { error: "Cannot access private/internal URLs" },
                { status: 400 },
            )
        }

        // Extract article content with timeout to avoid tying up server resources
        const controller = new AbortController()
        const timeoutId = setTimeout(() => {
            controller.abort()
        }, EXTRACT_TIMEOUT_MS)

        let article
        try {
            article = await extract(url, undefined, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; NextAIDrawio/1.0)",
                },
                signal: controller.signal,
            })
        } catch (err: any) {
            if (err?.name === "AbortError") {
                return NextResponse.json(
                    { error: "Timed out while fetching URL content" },
                    { status: 504 },
                )
            }
            throw err
        } finally {
            clearTimeout(timeoutId)
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
