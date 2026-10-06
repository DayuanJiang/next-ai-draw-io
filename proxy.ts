import { match as matchLocale } from "@formatjs/intl-localematcher"
import Negotiator from "negotiator"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { i18n } from "./lib/i18n/config"

function getLocale(request: NextRequest): string | undefined {
    // Negotiator expects plain object so we need to transform headers
    const negotiatorHeaders: Record<string, string> = {}
    request.headers.forEach((value, key) => {
        negotiatorHeaders[key] = value
    })

    // @ts-expect-error locales are readonly
    const locales: string[] = i18n.locales

    // Use negotiator and intl-localematcher to get best locale
    const languages = new Negotiator({ headers: negotiatorHeaders }).languages(
        locales,
    )

    const locale = matchLocale(languages, locales, i18n.defaultLocale)

    return locale
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
        return NextResponse.redirect(url)
    }
}

export const config = {
    // API routes (for ORIGIN_SECRET), and pages without `/_next/` assets
    matcher: [
        "/api/:path*",
        "/((?!api|_next/static|_next/image|favicon.ico).*)",
    ],
}
