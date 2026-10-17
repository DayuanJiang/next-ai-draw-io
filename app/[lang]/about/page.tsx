import "@/components/site/site.css"
import { Globe, Monitor, SquareTerminal } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import Image from "@/components/image-with-basepath"
import { ProviderLogo } from "@/components/provider-logo"
import { CopyCommand } from "@/components/site/copy-command"
import { DemoPlayer } from "@/components/site/demo-player"
import { demoTexts } from "@/components/site/demo-texts"
import {
    GALLERY_ITEMS,
    type GalleryItem,
} from "@/components/site/gallery-items"
import { SiteFooter } from "@/components/site/site-footer"
import { SiteHeader } from "@/components/site/site-header"
import {
    GITHUB_URL,
    MCP_INSTALL,
    RELEASES_URL,
    SITE_TEXTS,
} from "@/components/site/site-texts"
import type { Locale } from "@/lib/i18n/config"
import { hasLocale } from "@/lib/i18n/dictionaries"
import { PROVIDER_NAMES, PROVIDERS } from "@/lib/providers"
import { localeAlternates, OG_IMAGE, OG_LOCALE } from "@/lib/seo"
import { TEXTS } from "./texts"

// Five of the gallery's diagrams; the first spans both columns. Their
// prompts stay in English in every language.
const EXAMPLES = [
    "aws-ha",
    "transformer",
    "er-shop",
    "bpmn-expense",
    "journey-map",
].flatMap((id) => GALLERY_ITEMS.filter((item) => item.id === id))

type Props = { params: Promise<{ lang: string }> }

function localeOf(lang: string): Locale {
    return hasLocale(lang) ? lang : "en"
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const locale = localeOf((await params).lang)
    const t = TEXTS[locale]
    // openGraph and twitter replace the layout's whole objects, so the
    // shared fields are repeated here
    return {
        title: t.title,
        description: t.description,
        keywords: t.keywords,
        alternates: localeAlternates(locale, "/about"),
        openGraph: {
            title: t.title,
            description: t.description,
            type: "website",
            url: `/${locale}/about`,
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

export default async function About({ params }: Props) {
    const lang = localeOf((await params).lang)
    const t = TEXTS[lang]
    const site = SITE_TEXTS[lang]
    const demo = await demoTexts(lang)
    const ways = [
        {
            icon: Globe,
            ...t.ways.browser,
            href: `/${lang}`,
        },
        {
            icon: Monitor,
            ...t.ways.desktop,
            href: RELEASES_URL,
        },
        {
            icon: SquareTerminal,
            ...t.ways.agent,
            href: `/${lang}/mcp`,
            command: MCP_INSTALL,
        },
    ]
    const [hero, ...grid] = EXAMPLES

    return (
        <div className="site min-h-screen bg-canvas text-foreground">
            <noscript>
                <style
                    dangerouslySetInnerHTML={{
                        __html: ".lp-demo [data-cell-id] { opacity: 1 !important; }",
                    }}
                />
            </noscript>

            <div className="lp-grid border-b border-border">
                <SiteHeader lang={lang} />
                <section className="mx-auto max-w-7xl px-4 pt-6 pb-10 md:px-8 md:pt-4 md:pb-12">
                    <div className="grid items-end gap-5 px-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-12 md:px-0">
                        <h1 className="text-[clamp(32px,3.6vw,48px)] leading-[1.08] font-semibold tracking-[-0.035em] [text-wrap:balance]">
                            {/* A Chinese headline breaks only after its comma */}
                            {t.h1.split(/(?<=，)/).map((part) => (
                                <span key={part} className="inline-block">
                                    {part}
                                </span>
                            ))}
                        </h1>
                        <div>
                            <p className="max-w-[34em] text-[15.5px] leading-relaxed text-muted-foreground">
                                {t.lede}
                            </p>
                            <div className="mt-5 flex flex-wrap items-center gap-3">
                                {/* The editor has no phone layout: a phone
                                    gets the docs first */}
                                <Link
                                    href={`/${lang}`}
                                    className="rounded-lg bg-foreground px-4.5 py-2.5 text-[14.5px] font-medium text-background max-md:hidden"
                                >
                                    {t.primary}
                                </Link>
                                <Link
                                    href={`/${lang}/docs`}
                                    className="rounded-lg bg-foreground px-4.5 py-2.5 text-[14.5px] font-medium text-background md:hidden"
                                >
                                    {t.phonePrimary}
                                </Link>
                                <Link
                                    href={`/${lang}/mcp`}
                                    className="rounded-lg border border-border bg-card px-4.5 py-2.5 text-[14.5px] font-medium hover:bg-muted"
                                >
                                    {t.secondary}
                                </Link>
                            </div>
                        </div>
                    </div>
                    <div className="mt-8 md:mt-7">
                        <DemoPlayer texts={demo} />
                    </div>
                </section>
            </div>

            <main>
                {/* Three ways to use it */}
                <section className="border-b border-border bg-card">
                    <div className="mx-auto max-w-7xl px-5 pt-12 md:px-8">
                        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">
                            {t.waysHeading}
                        </h2>
                    </div>
                    <div className="mx-auto grid max-w-7xl divide-border px-5 max-lg:divide-y md:px-8 lg:grid-cols-3 lg:divide-x">
                        {ways.map((way) => (
                            <div
                                key={way.title}
                                className="py-8 first:pt-7 lg:px-8 lg:pt-7 lg:pb-12 lg:first:pl-0 lg:last:pr-0"
                            >
                                <span className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-canvas">
                                    <way.icon className="size-[18px]" />
                                </span>
                                <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.01em]">
                                    {way.title}
                                </h3>
                                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                                    {way.text}
                                </p>
                                <div className="mt-5 space-y-3">
                                    {"command" in way && (
                                        <CopyCommand
                                            command={way.command}
                                            labels={site.copy}
                                        />
                                    )}
                                    {/* Link adds the base path to the
                                        site's own pages */}
                                    {way.href.startsWith("/") ? (
                                        <Link
                                            href={way.href}
                                            className="inline-block text-[15px] font-medium underline decoration-border underline-offset-4 hover:decoration-foreground"
                                        >
                                            {way.action}
                                        </Link>
                                    ) : (
                                        <a
                                            href={way.href}
                                            className="inline-block text-[15px] font-medium underline decoration-border underline-offset-4 hover:decoration-foreground"
                                        >
                                            {way.action}
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Examples */}
                <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
                    <h2 className="text-[22px] font-semibold tracking-[-0.02em]">
                        {t.examplesHeading}
                    </h2>
                    <p className="mt-2 text-[15px] text-muted-foreground">
                        {t.examplesIntro}{" "}
                        <Link
                            href={`/${lang}/gallery`}
                            className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                        >
                            {t.examplesMore}
                        </Link>
                    </p>
                    <div className="mt-8 grid gap-5 md:grid-cols-2">
                        <Example example={hero} lang={lang} labels={t} wide />
                        {grid.map((example) => (
                            <Example
                                key={example.id}
                                example={example}
                                lang={lang}
                                labels={t}
                            />
                        ))}
                    </div>
                </section>

                {/* Other features */}
                <section className="border-y border-border bg-card">
                    <div className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
                        <h2 className="text-[22px] font-semibold tracking-[-0.02em]">
                            {t.moreHeading}
                        </h2>
                        <div className="mt-8 grid gap-x-12 gap-y-7 sm:grid-cols-2 md:grid-cols-3 md:gap-y-9">
                            {t.more.map((item, i) => (
                                <div key={item.title}>
                                    <h3 className="text-[15.5px] font-semibold">
                                        {item.title}
                                    </h3>
                                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
                                        {item.text}
                                        {i === t.more.length - 1 && (
                                            <>
                                                {" "}
                                                <Link
                                                    href={`/${lang}/docs/docker`}
                                                    className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
                                                >
                                                    {t.selfHostLink}
                                                </Link>
                                            </>
                                        )}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* AI providers */}
                <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
                    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] md:gap-12">
                        <div>
                            <h2 className="text-[22px] font-semibold tracking-[-0.02em] [text-wrap:balance]">
                                {t.providersHeading}
                            </h2>
                            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                                {t.providersText}
                            </p>
                        </div>
                        <ul className="flex flex-wrap content-start gap-2">
                            {PROVIDER_NAMES.map((name) => (
                                <li
                                    key={name}
                                    className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-[13.5px]"
                                >
                                    <ProviderLogo provider={name} />
                                    {PROVIDERS[name].label}
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* Closing call to action */}
                <section className="lp-grid border-t border-border">
                    <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-5 py-12 md:flex-row md:items-center md:gap-8 md:px-8 md:py-14">
                        <h2 className="text-[24px] font-semibold tracking-[-0.025em] md:text-[26px]">
                            {t.ctaHeading}
                        </h2>
                        <div className="flex items-center gap-3">
                            <Link
                                href={`/${lang}`}
                                className="rounded-lg bg-foreground px-4.5 py-2.5 text-[14.5px] font-medium text-background max-md:hidden"
                            >
                                {t.primary}
                            </Link>
                            <Link
                                href={`/${lang}/docs`}
                                className="rounded-lg bg-foreground px-4.5 py-2.5 text-[14.5px] font-medium text-background md:hidden"
                            >
                                {t.phonePrimary}
                            </Link>
                            <a
                                href={GITHUB_URL}
                                className="rounded-lg border border-border bg-card px-4.5 py-2.5 text-[14.5px] font-medium hover:bg-muted"
                            >
                                GitHub
                            </a>
                        </div>
                    </div>
                </section>
            </main>

            <SiteFooter lang={lang} path="/about" />
        </div>
    )
}

function Example({
    example,
    lang,
    labels,
    wide,
}: {
    example: GalleryItem
    lang: Locale
    labels: { promptLabel: string; modelLabel: string }
    /** The first example spans both columns */
    wide?: boolean
}) {
    return (
        <figure
            className={`overflow-hidden rounded-xl border border-border bg-card ${wide ? "md:col-span-2 md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" : ""}`}
        >
            <div
                className={`lp-grid flex items-center justify-center border-border p-5 md:p-6 ${wide ? "h-[280px] border-b md:h-[420px] md:border-r md:border-b-0" : "h-[240px] border-b md:h-[320px]"}`}
            >
                <Image
                    src={example.src}
                    alt={example.title[lang]}
                    width={480}
                    height={360}
                    className="max-h-full w-auto max-w-full object-contain"
                />
            </div>
            <figcaption
                className={
                    wide ? "self-center px-5 py-4 md:px-8 md:py-6" : "px-5 py-4"
                }
            >
                <h3 className="text-[15.5px] font-semibold">
                    {example.title[lang]}
                </h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">
                        {labels.promptLabel}
                    </span>{" "}
                    <span lang="en">{example.prompt}</span>
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    <span className="font-medium text-foreground">
                        {labels.modelLabel}
                    </span>{" "}
                    {example.model}
                </p>
            </figcaption>
        </figure>
    )
}
