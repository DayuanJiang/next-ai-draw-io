import Link from "next/link"
import { GitHubIcon } from "@/components/icons/github"
import { BrandMark } from "@/components/workspace/brand-mark"
import type { Locale } from "@/lib/i18n/config"
import { githubStars } from "./github-stars"
import { LanguageMenu } from "./language-menu"
import { SiteMenu } from "./site-menu"
import { GITHUB_URL, SITE_TEXTS } from "./site-texts"
import { ThemeToggle } from "./theme-toggle"

type Page = "mcp" | "gallery" | "docs"

/** The bar at the top of the site pages, the same on each */
export async function SiteHeader({
    lang,
    current,
}: {
    lang: Locale
    current?: Page
}) {
    const t = SITE_TEXTS[lang].nav
    const stars = await githubStars()
    const pages: { page: Page; label: string }[] = [
        { page: "mcp", label: t.mcp },
        { page: "gallery", label: t.gallery },
        { page: "docs", label: t.docs },
    ]
    const starCount =
        stars === null
            ? null
            : new Intl.NumberFormat(lang, {
                  notation: "compact",
                  maximumFractionDigits: 1,
              }).format(stars)
    return (
        <header className="relative mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-3 md:px-8">
            <Link
                href={`/${lang}/about`}
                className="flex shrink-0 items-center gap-2.5"
            >
                <BrandMark className="size-7" />
                <span className="text-[15px] font-semibold tracking-[-0.01em]">
                    Next AI Draw.io
                </span>
            </Link>
            {/* Below 1024 px the text links move into the menu */}
            <nav className="flex items-center gap-1 text-[14px] text-muted-foreground lg:gap-6">
                {pages.map(({ page, label }) => (
                    <Link
                        key={page}
                        href={`/${lang}/${page}`}
                        className={`whitespace-nowrap hover:text-foreground max-lg:hidden ${current === page ? "font-medium text-foreground" : ""}`}
                        aria-current={current === page ? "page" : undefined}
                    >
                        {label}
                    </Link>
                ))}
                <div className="flex items-center gap-1">
                    <a
                        href={GITHUB_URL}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-foreground/[0.07] hover:text-foreground max-lg:hidden"
                        aria-label="GitHub"
                    >
                        <GitHubIcon className="size-4" />
                        {starCount !== null && (
                            <span className="tabular-nums">{starCount}</span>
                        )}
                    </a>
                    <LanguageMenu lang={lang} label={t.language} />
                    <ThemeToggle />
                </div>
                <Link
                    href={`/${lang}`}
                    className="rounded-lg bg-foreground px-3.5 py-2 font-medium whitespace-nowrap text-background max-lg:hidden"
                >
                    {t.openEditor}
                </Link>
                <SiteMenu label={t.menu}>
                    {pages.map(({ page, label }) => (
                        <Link
                            key={page}
                            href={`/${lang}/${page}`}
                            className={`flex items-center gap-2.5 border-b border-border py-3 ${current === page ? "font-medium" : ""}`}
                            aria-current={current === page ? "page" : undefined}
                        >
                            {label}
                        </Link>
                    ))}
                    <a
                        href={GITHUB_URL}
                        className="flex items-center gap-2.5 border-b border-border py-3"
                    >
                        <GitHubIcon className="size-4" />
                        GitHub
                        {starCount !== null && (
                            <span className="text-muted-foreground tabular-nums">
                                {starCount}
                            </span>
                        )}
                    </a>
                    <Link
                        href={`/${lang}`}
                        className="mt-4 block rounded-lg bg-foreground px-4 py-2.5 text-center font-medium text-background"
                    >
                        {t.openEditor}
                    </Link>
                </SiteMenu>
            </nav>
        </header>
    )
}
