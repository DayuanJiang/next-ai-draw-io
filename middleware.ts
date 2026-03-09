import { match as matchLocale } from "@formatjs/intl-localematcher"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { i18n } from "./lib/i18n/config"

// Keep this as middleware.ts for Cloudflare/OpenNext on Next 16.
// proxy.ts currently compiles to the Node.js proxy runtime, which OpenNext Cloudflare rejects.
const zhHantRegions = new Set(["HK", "MO", "TW"])

function normalizeLanguageTag(tag: string): string[] {
    const trimmedTag = tag.trim()
    if (!trimmedTag) {
        return []
    }

    try {
        const locale = new Intl.Locale(trimmedTag)
        const normalizedTags = new Set<string>([trimmedTag])

        if (locale.language === "zh") {
            normalizedTags.add("zh")

            if (
                locale.script?.toLowerCase() === "hant" ||
                (locale.region &&
                    zhHantRegions.has(locale.region.toUpperCase()))
            ) {
                normalizedTags.add("zh-Hant")
            }

            return [...normalizedTags]
        }

        normalizedTags.add(locale.language)
        return [...normalizedTags]
    } catch {
        const [baseTag] = trimmedTag.split("-")
        return baseTag ? [trimmedTag, baseTag] : [trimmedTag]
    }
}

function getPreferredLanguages(request: NextRequest): string[] {
    const acceptLanguage = request.headers.get("accept-language")
    if (!acceptLanguage) {
        return [i18n.defaultLocale]
    }

    return acceptLanguage
        .split(",")
        .map((part) => {
            const [rawTag, ...params] = part.trim().split(";")
            const qValue = params
                .find((param) => param.trim().startsWith("q="))
                ?.split("=")[1]
            const quality = Number(qValue)

            return {
                tag: rawTag?.trim() ?? "",
                quality: Number.isFinite(quality) ? quality : 1,
            }
        })
        .filter(({ tag, quality }) => tag && tag !== "*" && quality > 0)
        .sort((a, b) => b.quality - a.quality)
        .flatMap(({ tag }) => normalizeLanguageTag(tag))
}

function getLocale(request: NextRequest): string {
    // @ts-expect-error locales are readonly
    const locales: string[] = i18n.locales
    return matchLocale(
        getPreferredLanguages(request),
        locales,
        i18n.defaultLocale,
    )
}

export function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname

    if (
        pathname.startsWith("/api/") ||
        pathname.startsWith("/_next/") ||
        pathname.startsWith("/drawio") ||
        pathname.includes("/favicon") ||
        /\.(.*)$/.test(pathname)
    ) {
        return
    }

    const pathnameIsMissingLocale = i18n.locales.every(
        (locale) =>
            !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`,
    )

    if (pathnameIsMissingLocale) {
        const locale = getLocale(request)

        return NextResponse.redirect(
            new URL(
                `/${locale}${pathname.startsWith("/") ? "" : "/"}${pathname}`,
                request.url,
            ),
        )
    }
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
