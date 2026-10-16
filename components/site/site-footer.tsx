import Link from "next/link"
import { BrandMark } from "@/components/workspace/brand-mark"
import { i18n, type Locale } from "@/lib/i18n/config"
import {
    GITHUB_URL,
    LANGUAGE_NAMES,
    NPM_URL,
    RELEASES_URL,
    SITE_TEXTS,
    SPONSOR_URL,
} from "./site-texts"

/**
 * The links at the bottom of the site pages. `path` is the page without
 * its locale ("/about"), for the language links.
 */
export function SiteFooter({ lang, path }: { lang: Locale; path: string }) {
    const t = SITE_TEXTS[lang].footer
    const columns = [
        {
            title: t.product,
            links: [
                { label: t.editor, href: `/${lang}` },
                { label: t.desktop, href: RELEASES_URL },
                { label: t.mcp, href: `/${lang}/mcp` },
                { label: t.docs, href: `/${lang}/docs` },
            ],
        },
        {
            title: t.project,
            links: [
                { label: t.github, href: GITHUB_URL },
                { label: t.npm, href: NPM_URL },
                { label: t.issues, href: `${GITHUB_URL}/issues` },
            ],
        },
    ]
    return (
        <footer className="border-t border-border bg-canvas">
            <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] gap-10 px-8 pt-12 pb-10">
                <div>
                    <Link
                        href={`/${lang}/about`}
                        className="flex items-center gap-2.5"
                    >
                        <BrandMark className="size-6" />
                        <span className="text-[14.5px] font-semibold">
                            Next AI Draw.io
                        </span>
                    </Link>
                    <p className="mt-3 max-w-[30ch] text-[13.5px] leading-relaxed text-muted-foreground">
                        {t.tagline}
                    </p>
                </div>
                {columns.map((column) => (
                    <div key={column.title}>
                        <h2 className="text-[13px] font-semibold">
                            {column.title}
                        </h2>
                        <ul className="mt-3 space-y-2 text-[13.5px] text-muted-foreground">
                            {column.links.map((item) => (
                                <li key={item.href}>
                                    <a
                                        href={item.href}
                                        className="hover:text-foreground"
                                    >
                                        {item.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
                <div>
                    <h2 className="text-[13px] font-semibold">{t.support}</h2>
                    <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
                        {t.sponsorText}{" "}
                        <a
                            href={SPONSOR_URL}
                            className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                        >
                            {t.sponsor}
                        </a>
                    </p>
                    <p className="mt-2 text-[13.5px] text-muted-foreground">
                        {t.contact}
                    </p>
                </div>
            </div>
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 border-t border-border px-8 py-5 text-[12.5px] text-muted-foreground">
                <span>{t.license}</span>
                <nav className="flex gap-4">
                    {i18n.locales.map((locale) => (
                        <Link
                            key={locale}
                            href={`/${locale}${path}`}
                            hrefLang={locale}
                            lang={locale}
                            className={
                                locale === lang
                                    ? "text-foreground"
                                    : "hover:text-foreground"
                            }
                            aria-current={locale === lang ? "page" : undefined}
                        >
                            {LANGUAGE_NAMES[locale]}
                        </Link>
                    ))}
                </nav>
            </div>
        </footer>
    )
}
