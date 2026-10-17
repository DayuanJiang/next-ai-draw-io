import type { Metadata } from "next"
import { i18n, type Locale } from "@/lib/i18n/config"

export const SITE_URL = "https://next-ai-drawio.jiang.jp"

export const OG_LOCALE: Record<Locale, string> = {
    en: "en_US",
    zh: "zh_CN",
    ja: "ja_JP",
    "zh-Hant": "zh_HK",
}

// The social card image and its real size
export const OG_IMAGE = { url: "/architecture.png", width: 1696, height: 1084 }

/** A page's URL in every locale; path is "" for the home page or "/about" */
export function localeUrls(path: string): Record<Locale, string> {
    return Object.fromEntries(
        i18n.locales.map((locale) => [locale, `/${locale}${path}`]),
    ) as Record<Locale, string>
}

/**
 * The canonical URL of a page and its hreflang links. x-default is the
 * English page: when it was the URL without a locale (a temporary redirect by
 * the browser's language), Google picked that URL as canonical and left the
 * English pages out of its index.
 */
export function localeAlternates(
    lang: Locale,
    path: string,
): NonNullable<Metadata["alternates"]> {
    return {
        canonical: `/${lang}${path}`,
        languages: { ...localeUrls(path), "x-default": `/en${path}` },
    }
}
