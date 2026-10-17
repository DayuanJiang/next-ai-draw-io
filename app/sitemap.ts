import type { MetadataRoute } from "next"
import { DOCS_NAV, docsPath, loadDoc } from "@/lib/docs"
import { i18n, type Locale } from "@/lib/i18n/config"
import { SITE_URL } from "@/lib/seo"

// Every page in every locale it is written in, each listing its other
// languages. The URLs are the final ones: "/" and "/about" redirect to a
// locale. A docs page shown in another language is left out.
export default function sitemap(): MetadataRoute.Sitemap {
    const pages: { path: string; locales: readonly Locale[] }[] = [
        { path: "", locales: i18n.locales },
        { path: "/about", locales: i18n.locales },
        { path: "/mcp", locales: i18n.locales },
        { path: "/gallery", locales: i18n.locales },
        ...DOCS_NAV.flatMap((group) => group.files).map((file) => ({
            path: docsPath(file),
            locales: i18n.locales.filter(
                (locale) => loadDoc(locale, file).locale === locale,
            ),
        })),
    ]
    return pages.flatMap(({ path, locales }) => {
        const languages = Object.fromEntries(
            locales.map((locale) => [locale, `${SITE_URL}/${locale}${path}`]),
        )
        return locales.map((locale) => ({
            url: languages[locale],
            alternates: { languages },
        }))
    })
}
