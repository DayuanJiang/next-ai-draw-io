import { match as matchLocale } from "@formatjs/intl-localematcher"
import Negotiator from "negotiator"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { i18n } from "./lib/i18n/config"

// Taiwan, Hong Kong and Macau write Traditional Chinese
const TRADITIONAL_CHINESE = /^zh-(hant|tw|hk|mo)\b/i

function getLocale(request: NextRequest): string {
    // Negotiator expects plain object so we need to transform headers
    const negotiatorHeaders: Record<string, string> = {}
    request.headers.forEach((value, key) => {
        negotiatorHeaders[key] = value
    })

    // @ts-expect-error locales are readonly
    const locales: string[] = i18n.locales

    // The browser's languages in order of preference. Negotiator would match
    // zh-TW to zh if given the locales, so map Traditional Chinese first and
    // let intl-localematcher pick the locale.
    const languages = new Negotiator({ headers: negotiatorHeaders })
        .languages()
        .filter(isLanguageTag)
        .map((language) =>
            TRADITIONAL_CHINESE.test(language) ? "zh-Hant" : language,
        )

    return matchLocale(languages, locales, i18n.defaultLocale)
}

// intl-localematcher throws on a malformed tag, and "*" is not a tag
function isLanguageTag(language: string): boolean {
    try {
        Intl.getCanonicalLocales(language)
        return true
    } catch {
        return false
    }
}

export function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname

    if (pathname.startsWith("/api/")) {
        // With ORIGIN_SECRET set, API calls must come through the CDN that
        // adds this header. A call straight to the origin could fake the
        // CLIENT_IP_HEADER and get a fresh quota for every made-up IP.
        const secret = process.env.ORIGIN_SECRET
        if (secret && request.headers.get("x-origin-secret") !== secret) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
        return
    }

    // Skip static files and Next.js internals
    if (
        pathname.startsWith("/_next/") ||
        pathname.startsWith("/drawio") ||
        pathname.includes("/favicon") ||
        /\.(.*)$/.test(pathname)
    ) {
        return
    }

    // Check if there is any supported locale in the pathname
    const pathnameIsMissingLocale = i18n.locales.every(
        (locale) =>
            !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`,
    )

    // Redirect if there is no locale
    if (pathnameIsMissingLocale) {
        const locale = getLocale(request)

        // Redirect to localized path. Cloning nextUrl keeps the basePath
        // (NEXT_PUBLIC_BASE_PATH) and query string, which
        // new URL("/...", request.url) would drop.
        const url = request.nextUrl.clone()
        url.pathname = `/${locale}${pathname}`
        // A page is only ever at its localized path, so say so with a
        // permanent redirect; with a temporary one, search engines keep the
        // path without a locale as the page's address. The home page stays
        // temporary: it is the entry point that picks the visitor's language.
        return NextResponse.redirect(url, pathname === "/" ? 307 : 308)
    }
}

export const config = {
    // API routes (for ORIGIN_SECRET), and pages without `/_next/` assets
    matcher: [
        "/api/:path*",
        "/((?!api|_next/static|_next/image|favicon.ico).*)",
    ],
}
