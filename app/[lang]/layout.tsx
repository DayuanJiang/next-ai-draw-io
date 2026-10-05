import { GoogleAnalytics } from "@next/third-parties/google"
import type { Metadata, Viewport } from "next"
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google"
import { notFound } from "next/navigation"
import { DiagramProvider } from "@/contexts/diagram-context"
import { DictionaryProvider } from "@/hooks/use-dictionary"
import type { Locale } from "@/lib/i18n/config"
import { i18n } from "@/lib/i18n/config"
import { getDictionary, hasLocale } from "@/lib/i18n/dictionaries"

import "../globals.css"

const plusJakarta = Plus_Jakarta_Sans({
    variable: "--font-sans",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
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
    const lang = (
        rawLang in { en: 1, zh: 1, ja: 1, "zh-Hant": 1 } ? rawLang : "en"
    ) as Locale

    // Default to English metadata
    const titles: Record<Locale, string> = {
        en: "Next AI Draw.io - AI-Powered Diagram Generator",
        zh: "Next AI Draw.io - AI powered diagram generator",
        ja: "Next AI Draw.io - AI-powered diagram generator",
        "zh-Hant": "Next AI Draw.io - AI 驅動的圖表產生器",
    }

    const descriptions: Record<Locale, string> = {
        en: "Create AWS architecture diagrams, flowcharts, and technical diagrams using AI. Free online tool integrating draw.io with AI assistance for professional diagram creation.",
        zh: "Use AI to create AWS architecture diagrams, flowcharts, and technical diagrams. Free online tool integrated with draw.io and AI assistance for professional diagram creation.",
        ja: "Create AWS architecture diagrams, flowcharts, and technical diagrams using AI. Create professional diagrams with a free online tool that integrates draw.io with an AI assistant.",
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
        metadataBase: new URL("https://next-ai-drawio.jiang.jp"),
        openGraph: {
            title: titles[lang],
            description: descriptions[lang],
            type: "website",
            url: "https://next-ai-drawio.jiang.jp",
            siteName: "Next AI Draw.io",
            locale:
                lang === "zh"
                    ? "zh_CN"
                    : lang === "zh-Hant"
                      ? "zh_HK"
                      : lang === "ja"
                        ? "ja_JP"
                        : "en_US",
            images: [
                {
                    url: "/architecture.png",
                    width: 1200,
                    height: 630,
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
        alternates: {
            languages: {
                en: "/en",
                zh: "/zh",
                ja: "/ja",
                "zh-Hant": "/zh-Hant",
            },
        },
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
        operatingSystem: "Web Browser",
        description:
            "AI-powered diagram generator with targeted XML editing capabilities that integrates with draw.io for creating AWS architecture diagrams, flowcharts, and technical diagrams. Features diagram history, multi-provider AI support, and real-time collaboration.",
        url: "https://next-ai-drawio.jiang.jp",
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
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />
            </head>
            <body
                className={`${plusJakarta.variable} ${jetbrainsMono.variable} antialiased`}
            >
                <DictionaryProvider dictionary={dictionary}>
                    <DiagramProvider>{children}</DiagramProvider>
                </DictionaryProvider>
            </body>
            {process.env.NEXT_PUBLIC_GA_ID && (
                <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
            )}
        </html>
    )
}
