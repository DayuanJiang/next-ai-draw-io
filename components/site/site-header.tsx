import Link from "next/link"
import { GitHubIcon } from "@/components/icons/github"
import { BrandMark } from "@/components/workspace/brand-mark"
import type { Locale } from "@/lib/i18n/config"
import { githubStars } from "./github-stars"
import { LanguageMenu } from "./language-menu"
import { GITHUB_URL, SITE_TEXTS } from "./site-texts"
import { ThemeToggle } from "./theme-toggle"

/** The bar at the top of the landing, MCP and docs pages */
export async function SiteHeader({
    lang,
    current,
    wide,
}: {
    lang: Locale
    current?: "docs" | "mcp"
    /** The docs use the whole width */
    wide?: boolean
}) {
    const t = SITE_TEXTS[lang].nav
    const stars = await githubStars()
    const link = (page: "docs" | "mcp") =>
        `hover:text-foreground ${current === page ? "font-medium text-foreground" : ""}`
    return (
        <header
            className={`mx-auto flex items-center justify-between gap-6 px-8 py-3 ${wide ? "max-w-[1440px]" : "max-w-7xl"}`}
        >
            <Link
                href={`/${lang}/about`}
                className="flex shrink-0 items-center gap-2.5"
            >
                <BrandMark className="size-7" />
                <span className="text-[15px] font-semibold tracking-[-0.01em]">
                    Next AI Draw.io
                </span>
            </Link>
            <nav className="flex items-center gap-6 text-[14px] text-muted-foreground">
                <Link
                    href={`/${lang}/docs`}
                    className={link("docs")}
                    aria-current={current === "docs" ? "page" : undefined}
                >
                    {t.docs}
                </Link>
                <Link
                    href={`/${lang}/mcp`}
                    className={link("mcp")}
                    aria-current={current === "mcp" ? "page" : undefined}
                >
                    {t.mcp}
                </Link>
                <div className="flex items-center gap-1">
                    <a
                        href={GITHUB_URL}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted hover:text-foreground"
                        aria-label="GitHub"
                    >
                        <GitHubIcon className="size-4" />
                        {stars !== null && (
                            <span className="tabular-nums">
                                {new Intl.NumberFormat(lang, {
                                    notation: "compact",
                                    maximumFractionDigits: 1,
                                }).format(stars)}
                            </span>
                        )}
                    </a>
                    <LanguageMenu lang={lang} label={t.language} />
                    <ThemeToggle />
                </div>
                <Link
                    href={`/${lang}`}
                    className="rounded-lg bg-foreground px-3.5 py-2 font-medium text-background"
                >
                    {t.openEditor}
                </Link>
            </nav>
        </header>
    )
}
