import "@/components/site/site.css"
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    SquarePen,
    TextAlignStart,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { docsDemos } from "@/components/site/demo-texts"
import { DocMarkdown } from "@/components/site/doc-markdown"
import { DocsToc } from "@/components/site/docs-toc"
import { JsonLd } from "@/components/site/json-ld"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import { GITHUB_URL, SITE_TEXTS } from "@/components/site/site-texts"
import { DOCS_NAV, DOCS_SLUGS, docsPath, fileOfSlug, loadDoc } from "@/lib/docs"
import { i18n, type Locale } from "@/lib/i18n/config"
import { hasLocale } from "@/lib/i18n/dictionaries"
import { OG_IMAGE, OG_LOCALE, SITE_URL } from "@/lib/seo"

const TEXTS: Record<
    Locale,
    {
        docs: string
        onThisPage: string
        edit: string
        previous: string
        next: string
        /** Above a page shown in English */
        inEnglish: string
        /** Above a page shown in Simplified Chinese */
        inSimplified: string
    }
> = {
    en: {
        docs: "Docs",
        onThisPage: "On this page",
        edit: "Edit this page on GitHub",
        previous: "Previous",
        next: "Next",
        inEnglish: "",
        inSimplified: "",
    },
    zh: {
        docs: "文档",
        onThisPage: "本页内容",
        edit: "在 GitHub 上编辑此页",
        previous: "上一页",
        next: "下一页",
        inEnglish: "这一页还没有中文版，下面是英文原文。",
        inSimplified: "",
    },
    ja: {
        docs: "ドキュメント",
        onThisPage: "このページの内容",
        edit: "GitHub でこのページを編集",
        previous: "前へ",
        next: "次へ",
        inEnglish:
            "このページはまだ日本語に翻訳されていないため、英語で表示しています。",
        inSimplified: "",
    },
    "zh-Hant": {
        docs: "文件",
        onThisPage: "本頁內容",
        edit: "在 GitHub 上編輯此頁",
        previous: "上一頁",
        next: "下一頁",
        inEnglish: "這一頁還沒有中文版，以下是英文原文。",
        inSimplified: "這一頁還沒有繁體中文版，以下是簡體中文。",
    },
}

const ORDER = DOCS_NAV.flatMap((group) => group.files)

type Props = { params: Promise<{ lang: string; slug?: string[] }> }

// Unknown pages are not prebuilt: resolve() answers them with the site's 404
export function generateStaticParams() {
    return DOCS_SLUGS.map((slug) => ({ slug: slug ? [slug] : [] }))
}

async function resolve(params: Props["params"]) {
    const { lang: rawLang, slug } = await params
    const lang: Locale = hasLocale(rawLang) ? rawLang : "en"
    const file = slug && slug.length > 1 ? undefined : fileOfSlug(slug?.[0])
    if (!file) notFound()
    return { lang, file, doc: loadDoc(lang, file) }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { file, doc } = await resolve(params)
    const path = docsPath(file)
    // Only the languages the page is written in; a page shown in another
    // language points to that language's page
    const languages = Object.fromEntries(
        i18n.locales
            .filter((locale) => loadDoc(locale, file).locale === locale)
            .map((locale) => [locale, `/${locale}${path}`]),
    )
    const title = `${doc.title} | Next AI Draw.io ${TEXTS[doc.locale].docs}`
    return {
        title,
        description: doc.summary,
        alternates: {
            canonical: `/${doc.locale}${path}`,
            // The English page, as in localeAlternates
            languages: { ...languages, "x-default": `/en${path}` },
        },
        openGraph: {
            title,
            description: doc.summary,
            type: "article",
            url: `/${doc.locale}${path}`,
            siteName: "Next AI Draw.io",
            // The language the text is in, as for the canonical URL
            locale: OG_LOCALE[doc.locale],
            images: [{ ...OG_IMAGE, alt: doc.title }],
        },
        twitter: {
            card: "summary_large_image",
            title,
            description: doc.summary,
            images: [OG_IMAGE.url],
        },
    }
}

export default async function DocsPage({ params }: Props) {
    const { lang, file, doc } = await resolve(params)
    const t = TEXTS[lang]
    const index = ORDER.indexOf(file)
    const previous = index > 0 ? ORDER[index - 1] : undefined
    const next = index < ORDER.length - 1 ? ORDER[index + 1] : undefined
    const group = DOCS_NAV.find((g) => g.files.includes(file))
    const notice =
        doc.locale === lang
            ? ""
            : doc.locale === "en"
              ? t.inEnglish
              : t.inSimplified

    const url = `${SITE_URL}/${doc.locale}${docsPath(file)}`
    const docsHome = `${SITE_URL}/${doc.locale}/docs`
    return (
        <div className="site min-h-screen bg-canvas text-foreground">
            <JsonLd
                data={[
                    {
                        "@context": "https://schema.org",
                        "@type": "TechArticle",
                        headline: doc.title,
                        description: doc.summary,
                        inLanguage: doc.locale,
                        url,
                        isPartOf: {
                            "@type": "WebSite",
                            name: "Next AI Draw.io",
                            url: SITE_URL,
                        },
                    },
                    {
                        "@context": "https://schema.org",
                        "@type": "BreadcrumbList",
                        itemListElement: [
                            {
                                "@type": "ListItem",
                                position: 1,
                                name: t.docs,
                                item: docsHome,
                            },
                            ...(file === "introduction"
                                ? []
                                : [
                                      {
                                          "@type": "ListItem",
                                          position: 2,
                                          name: doc.title,
                                          item: url,
                                      },
                                  ]),
                        ],
                    },
                ]}
            />
            <div className="border-b border-border">
                <SiteHeader lang={lang} current="docs" />
            </div>
            {/* Below 1024 px the pages open from a bar under the header */}
            <details
                key={file}
                className="group sticky top-0 z-20 border-b border-border bg-canvas lg:hidden"
            >
                <summary className="flex cursor-pointer list-none items-center gap-2.5 px-5 py-2.5 text-[14px] md:px-8 [&::-webkit-details-marker]:hidden">
                    <TextAlignStart className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">
                        {doc.title}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[13px] text-muted-foreground">
                        {SITE_TEXTS[lang].nav.pages}
                        <ChevronDown className="size-4 group-open:rotate-180" />
                    </span>
                </summary>
                <nav className="max-h-[70svh] overflow-y-auto border-t border-border px-3 pt-4 pb-2 text-[15px] md:px-6">
                    <PageList lang={lang} file={file} />
                </nav>
            </details>
            {/* Below 1280 px the page's headings give their room to the text */}
            <div className="mx-auto grid max-w-7xl px-5 md:px-8 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[232px_minmax(0,1fr)_208px]">
                {/* Pages */}
                <nav className="sticky top-0 max-h-screen self-start overflow-y-auto py-8 text-[14px] max-lg:hidden">
                    <PageList lang={lang} file={file} />
                </nav>

                {/* The page */}
                <main className="min-w-0 py-7 lg:py-10">
                    <div className="mx-auto max-w-[760px]">
                        {group && (
                            <p className="text-[13px] font-medium text-muted-foreground">
                                {group.group[lang]}
                            </p>
                        )}
                        <h1 className="mt-1.5 text-[28px] leading-tight font-semibold tracking-[-0.025em] md:text-[34px]">
                            {doc.title}
                        </h1>
                        {notice && (
                            <p
                                className="mt-4 rounded-lg bg-muted px-3.5 py-2.5 text-[13.5px] text-muted-foreground"
                                lang={lang}
                            >
                                {notice}
                            </p>
                        )}
                        <article
                            lang={doc.locale}
                            className="docs-body prose mt-6 max-w-none text-[15px] leading-relaxed dark:prose-invert prose-headings:font-semibold prose-headings:tracking-[-0.015em] prose-h2:mt-11 prose-h2:text-[22px] prose-h3:text-[17px] prose-a:font-medium prose-a:underline-offset-4 prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-px prose-code:text-[0.88em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-blockquote:rounded-lg prose-blockquote:border-0 prose-blockquote:bg-muted prose-blockquote:px-4 prose-blockquote:py-0.5 prose-blockquote:font-normal prose-blockquote:not-italic [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none"
                        >
                            <DocMarkdown
                                doc={doc}
                                lang={lang}
                                copyLabels={SITE_TEXTS[lang].copy}
                                demos={await docsDemos(lang)}
                            />
                        </article>
                        <div className="mt-14 grid gap-3 border-t border-border pt-6 sm:grid-cols-2 sm:gap-4">
                            {previous ? (
                                <PageLink
                                    href={`/${lang}${docsPath(previous)}`}
                                    label={t.previous}
                                    title={loadDoc(lang, previous).title}
                                />
                            ) : (
                                <span className="max-sm:hidden" />
                            )}
                            {next && (
                                <PageLink
                                    href={`/${lang}${docsPath(next)}`}
                                    label={t.next}
                                    title={loadDoc(lang, next).title}
                                    forward
                                />
                            )}
                        </div>
                        <a
                            href={`${GITHUB_URL}/edit/main/${doc.repoPath}`}
                            className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] text-muted-foreground hover:text-foreground"
                        >
                            <SquarePen className="size-3.5" />
                            {t.edit}
                        </a>
                    </div>
                </main>

                {/* Headings of the page */}
                <aside className="sticky top-0 hidden max-h-screen self-start overflow-y-auto py-10 text-[13px] xl:block">
                    <DocsToc title={t.onThisPage} headings={doc.headings} />
                </aside>
            </div>
            <SiteFooter lang={lang} path={docsPath(file)} />
        </div>
    )
}

/** The docs' pages, by group */
function PageList({ lang, file }: { lang: Locale; file: string }) {
    return DOCS_NAV.map((g) => (
        <div key={g.group.en} className="mb-6">
            <h2 className="mb-1.5 px-2.5 text-[12.5px] font-semibold text-muted-foreground">
                {g.group[lang]}
            </h2>
            <ul className="space-y-0.5">
                {g.files.map((f) => (
                    <li key={f}>
                        <Link
                            href={`/${lang}${docsPath(f)}`}
                            className={`block rounded-md px-2.5 py-1.5 ${f === file ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            aria-current={f === file ? "page" : undefined}
                        >
                            {loadDoc(lang, f).title}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    ))
}

function PageLink({
    href,
    label,
    title,
    forward,
}: {
    href: string
    label: string
    title: string
    forward?: boolean
}) {
    return (
        <Link
            href={href}
            className={`group rounded-lg border border-border bg-card px-4 py-3 hover:border-foreground/30 ${forward ? "text-right" : ""}`}
        >
            <span
                className={`flex items-center gap-1 text-[12.5px] text-muted-foreground ${forward ? "justify-end" : ""}`}
            >
                {!forward && <ChevronLeft className="size-3.5" />}
                {label}
                {forward && <ChevronRight className="size-3.5" />}
            </span>
            <span className="mt-0.5 block text-[14.5px] font-medium">
                {title}
            </span>
        </Link>
    )
}
