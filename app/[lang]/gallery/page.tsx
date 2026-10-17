import "@/components/site/site.css"
import type { Metadata } from "next"
import Link from "next/link"
import { Gallery } from "@/components/site/gallery"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import type { Locale } from "@/lib/i18n/config"
import { hasLocale } from "@/lib/i18n/dictionaries"
import { localeAlternates, OG_IMAGE, OG_LOCALE } from "@/lib/seo"
import { TEXTS } from "./texts"

type Props = { params: Promise<{ lang: string }> }

function localeOf(lang: string): Locale {
    return hasLocale(lang) ? lang : "en"
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const locale = localeOf((await params).lang)
    const t = TEXTS[locale]
    return {
        title: `${t.title} | Next AI Draw.io`,
        description: t.description,
        keywords: t.keywords,
        alternates: localeAlternates(locale, "/gallery"),
        openGraph: {
            title: t.title,
            description: t.description,
            type: "website",
            url: `/${locale}/gallery`,
            siteName: "Next AI Draw.io",
            locale: OG_LOCALE[locale],
            images: [{ ...OG_IMAGE, alt: t.title }],
        },
        twitter: {
            card: "summary_large_image",
            title: t.title,
            description: t.description,
            images: [OG_IMAGE.url],
        },
    }
}

export default async function GalleryPage({ params }: Props) {
    const lang = localeOf((await params).lang)
    const t = TEXTS[lang]
    const link =
        "font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"

    return (
        <div className="site min-h-screen bg-canvas text-foreground">
            <div className="lp-grid border-b border-border">
                <SiteHeader lang={lang} current="gallery" />
                <section className="mx-auto max-w-7xl px-5 pt-6 pb-10 md:px-8 md:pt-8 md:pb-12">
                    <h1 className="max-w-[24em] text-[clamp(30px,3vw,40px)] leading-[1.12] font-semibold tracking-[-0.03em] [text-wrap:balance]">
                        {t.h1}
                    </h1>
                    <p className="mt-4 max-w-[46em] text-[15.5px] leading-relaxed text-muted-foreground">
                        {t.lede}
                    </p>
                    <p className="mt-3 max-w-[46em] text-[14px] leading-relaxed text-muted-foreground">
                        {t.note}
                    </p>
                </section>
            </div>

            <main>
                <section className="mx-auto max-w-7xl px-5 py-10 md:px-8 md:py-12">
                    <Gallery lang={lang} />
                </section>

                <section className="border-t border-border bg-card">
                    <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-14">
                        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">
                            {t.tipsHeading}
                        </h2>
                        <div className="mt-6 grid gap-x-12 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
                            {t.tips.map((tip) => (
                                <div key={tip.title}>
                                    <h3 className="text-[15px] font-semibold">
                                        {tip.title}
                                    </h3>
                                    <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
                                        {tip.text}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <p className="mt-8 text-[14.5px] text-muted-foreground">
                            {t.more}
                        </p>
                        <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-[14.5px]">
                            {(
                                [
                                    ["editor", t.moreLinks.editor],
                                    ["aws-architecture", t.moreLinks.aws],
                                    ["flowcharts", t.moreLinks.flowcharts],
                                ] as const
                            ).map(([slug, label]) => (
                                <li key={slug}>
                                    <Link
                                        href={`/${lang}/docs/${slug}`}
                                        className={link}
                                    >
                                        {label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>
            </main>

            <SiteFooter lang={lang} path="/gallery" />
        </div>
    )
}
