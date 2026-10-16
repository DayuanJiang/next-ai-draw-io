import type { MetadataRoute } from "next"
import { i18n } from "@/lib/i18n/config"
import { localeUrls, SITE_URL } from "@/lib/seo"

// Every page in every locale, each listing its other languages. The URLs are
// the final ones: "/" and "/about" redirect to a locale.
export default function sitemap(): MetadataRoute.Sitemap {
    return ["", "/about"].flatMap((path) => {
        const languages = Object.fromEntries(
            Object.entries(localeUrls(path)).map(([locale, url]) => [
                locale,
                `${SITE_URL}${url}`,
            ]),
        )
        return i18n.locales.map((locale) => ({
            url: languages[locale],
            alternates: { languages },
        }))
    })
}
