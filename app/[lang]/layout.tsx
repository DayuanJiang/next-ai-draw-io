import { GoogleAnalytics } from "@next/third-parties/google"
import type { Metadata, Viewport } from "next"
import { Instrument_Sans, JetBrains_Mono } from "next/font/google"
import { notFound } from "next/navigation"
import Script from "next/script"
import { LocaleProvider } from "@/components/canvas/locale-context"
import { AppToaster } from "@/components/workspace/app-toaster"
import { DiagramProvider } from "@/contexts/diagram-context"
import { DictionaryProvider } from "@/hooks/use-dictionary"
import type { Locale } from "@/lib/i18n/config"
import { i18n } from "@/lib/i18n/config"
import { getDictionary, hasLocale } from "@/lib/i18n/dictionaries"
import { localeAlternates, OG_IMAGE, OG_LOCALE, SITE_URL } from "@/lib/seo"
import { THEME_INIT_SCRIPT } from "@/stores/settings-store"

import "../globals.css"

const instrumentSans = Instrument_Sans({
    variable: "--font-latin",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
    // Chinese and Japanese text falls through to system fonts, in the
    // order globals.css picks for the page's language
    fallback: [],
})

const jetbrainsMono = JetBrains_Mono({
    variable: "--font-mono",
    subsets: ["latin"],
    weight: ["400", "500"],
})

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

// Generate static params for all locales
export async function generateStaticParams() {
    return i18n.locales.map((locale) => ({ lang: locale }))
}

// Generate metadata per locale
export async function generateMetadata({
    params,
}: {
    params: Promise<{ lang: string }>
}): Promise<Metadata> {
    const { lang: rawLang } = await params
    const lang: Locale = hasLocale(rawLang) ? rawLang : i18n.defaultLocale

    const titles: Record<Locale, string> = {
        en: "Next AI Draw.io - AI-Powered Diagram Generator",
        zh: "Next AI Draw.io - AI 驱动的图表生成器",
        ja: "Next AI Draw.io - AI 搭載ダイアグラム生成ツール",
        "zh-Hant": "Next AI Draw.io - AI 驅動的圖表產生器",
    }

    const descriptions: Record<Locale, string> = {
        en: "Create AWS architecture diagrams, flowcharts, and technical diagrams using AI. Free online tool integrating draw.io with AI assistance for professional diagram creation.",
        zh: "使用 AI 创建 AWS 架构图、流程图和技术图表。免费在线工具，整合 draw.io 与 AI 辅助，轻松创建专业图表。",
        ja: "AI で AWS アーキテクチャ図、フローチャート、技術図を作成。draw.io と AI アシスタントを統合した無料オンラインツールで、プロ品質の図を簡単に作成できます。",
        "zh-Hant":
            "使用 AI 建立 AWS 架構圖、流程圖和技術圖表。免費線上工具整合 draw.io 與 AI 輔助，輕鬆建立專業圖表。",
    }

    return {
        title: titles[lang],
        description: descriptions[lang],
        keywords: [
            "AI diagram generator",
            "AWS architecture",
            "flowchart creator",
            "draw.io",
            "AI drawing tool",
            "technical diagrams",
            "diagram automation",
            "free diagram generator",
            "online diagram maker",
        ],
        authors: [{ name: "Next AI Draw.io" }],
        creator: "Next AI Draw.io",
        publisher: "Next AI Draw.io",
        metadataBase: new URL(SITE_URL),
        openGraph: {
            title: titles[lang],
            description: descriptions[lang],
            type: "website",
            url: `/${lang}`,
            siteName: "Next AI Draw.io",
            locale: OG_LOCALE[lang],
            images: [
                {
                    ...OG_IMAGE,
                    alt: "Next AI Draw.io - AI-powered diagram creation tool",
                },
            ],
        },
        twitter: {
            card: "summary_large_image",
            title: titles[lang],
            description: descriptions[lang],
            images: ["/architecture.png"],
        },
        robots: {
            index: true,
            follow: true,
            googleBot: {
                index: true,
                follow: true,
                "max-video-preview": -1,
                "max-image-preview": "large",
                "max-snippet": -1,
            },
        },
        icons: {
            icon: "/favicon.ico",
        },
        // The home page's; other pages set their own
        alternates: localeAlternates(lang, ""),
    }
}

export default async function RootLayout({
    children,
    params,
}: Readonly<{
    children: React.ReactNode
    params: Promise<{ lang: string }>
}>) {
    const { lang } = await params
    if (!hasLocale(lang)) notFound()
    const validLang = lang as Locale
    const dictionary = await getDictionary(validLang)

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "Next AI Draw.io",
        applicationCategory: "DesignApplication",
        operatingSystem: "Web, Windows, macOS, Linux",
        description:
            "Draw and edit draw.io diagrams by chatting with an AI: AWS, Azure and GCP architecture diagrams, flowcharts and other technical diagrams on a real draw.io canvas. Every AI change is a version you can compare or restore, and it works with many AI providers. Also available as a desktop app and an MCP server for AI agents.",
        url: SITE_URL,
        sameAs: [
            "https://github.com/DayuanJiang/next-ai-draw-io",
            "https://www.npmjs.com/package/@next-ai-drawio/mcp-server",
        ],
        inLanguage: validLang,
        offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
        },
    }

    return (
        <html lang={validLang} suppressHydrationWarning>
            <head>
                {/* Apply dark mode before the first paint (no white flash) */}
                <Script id="theme-init" strategy="beforeInteractive">
                    {THEME_INIT_SCRIPT}
                </Script>
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
            </head>
            <body
                className={`${instrumentSans.variable} ${jetbrainsMono.variable} antialiased`}
            >
                <DictionaryProvider dictionary={dictionary}>
                    <LocaleProvider locale={validLang}>
                        <DiagramProvider>{children}</DiagramProvider>
                    </LocaleProvider>
                    {/* Inside: toasts such as the quota one read the dictionary */}
                    <AppToaster />
                </DictionaryProvider>
            </body>
            {process.env.NEXT_PUBLIC_GA_ID && (
                <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
            )}
        </html>
    )
}
