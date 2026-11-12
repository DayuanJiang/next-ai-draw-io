import type { Metadata } from "next"
import { i18n, type Locale } from "@/lib/i18n/config"

export const SITE_URL = "https://next-ai-drawio.jiang.jp"

export const OG_LOCALE: Record<Locale, string> = {
    en: "en_US",
    zh: "zh_CN",
    ja: "ja_JP",
    "zh-Hant": "zh_HK",
}

// The keywords of the editor and of the docs pages, which set none of their
// own
export const KEYWORDS: Record<Locale, string[]> = {
    en: [
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
    zh: [
        "AI 图表生成器",
        "AWS 架构图",
        "流程图制作",
        "draw.io",
        "AI 画图工具",
        "技术图表",
        "图表自动生成",
        "免费图表生成器",
        "在线画图工具",
    ],
    ja: [
        "AI 作図ツール",
        "AWS 構成図",
        "フローチャート 作成",
        "draw.io",
        "AI ダイアグラム生成",
        "技術図",
        "図の自動生成",
        "無料 作図ツール",
        "オンライン 作図",
    ],
    "zh-Hant": [
        "AI 圖表產生器",
        "AWS 架構圖",
        "流程圖製作",
        "draw.io",
        "AI 畫圖工具",
        "技術圖表",
        "圖表自動產生",
        "免費圖表產生器",
        "線上畫圖工具",
    ],
}

// What the app is, for the structured data every page carries; in the
// page's language, which that data names in inLanguage
export const APP_DESCRIPTION: Record<Locale, string> = {
    en: "Draw and edit draw.io diagrams by chatting with an AI: AWS, Azure and GCP architecture diagrams, flowcharts and other technical diagrams on a real draw.io canvas. Every AI change is a version you can compare or restore, and it works with many AI providers. Also available as a desktop app and an MCP server for AI agents.",
    zh: "和 AI 对话，绘制和修改 draw.io 图表：在真正的 draw.io 画布上绘制 AWS、Azure、GCP 架构图、流程图和其他技术图表。AI 的每次修改都是一个可以对比或恢复的版本，并支持多家 AI 服务商。另有桌面应用和供 AI 代理使用的 MCP 服务器。",
    ja: "AI と話しながら draw.io の図を描いて編集できます。AWS、Azure、GCP のアーキテクチャ図、フローチャートなどの技術図を、本物の draw.io キャンバスに描きます。AI の変更はすべて、比較や復元ができるバージョンとして残り、多くの AI プロバイダーに対応しています。デスクトップアプリと、AI エージェント向けの MCP サーバーもあります。",
    "zh-Hant":
        "和 AI 對話，繪製和修改 draw.io 圖表：在真正的 draw.io 畫布上繪製 AWS、Azure、GCP 架構圖、流程圖和其他技術圖表。AI 的每次修改都是一個可以比較或還原的版本，並支援多家 AI 服務商。另有桌面版應用程式和供 AI 代理使用的 MCP 伺服器。",
}

// The social card image and its real size
export const OG_IMAGE = { url: "/architecture.png", width: 1696, height: 1084 }

/** A page's URL in every locale; path is "" for the home page or "/about" */
export function localeUrls(path: string): Record<Locale, string> {
    return Object.fromEntries(
        i18n.locales.map((locale) => [locale, `/${locale}${path}`]),
    ) as Record<Locale, string>
}

/**
 * The canonical URL of a page and its hreflang links. x-default is the
 * English page: when it was the URL without a locale (a temporary redirect by
 * the browser's language), Google picked that URL as canonical and left the
 * English pages out of its index.
 */
export function localeAlternates(
    lang: Locale,
    path: string,
): NonNullable<Metadata["alternates"]> {
    return {
        canonical: `/${lang}${path}`,
        languages: { ...localeUrls(path), "x-default": `/en${path}` },
    }
}
