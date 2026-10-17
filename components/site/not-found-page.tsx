"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { BrandMark } from "@/components/workspace/brand-mark"
import { i18n, type Locale } from "@/lib/i18n/config"

const TEXTS: Record<
    Locale,
    { title: string; text: string; editor: string; docs: string; home: string }
> = {
    en: {
        title: "This page doesn't exist",
        text: "The link may be old, or the address mistyped.",
        editor: "Open the editor",
        docs: "Docs",
        home: "Home",
    },
    zh: {
        title: "这个页面不存在",
        text: "链接可能已经过期，或者地址输错了。",
        editor: "打开编辑器",
        docs: "文档",
        home: "首页",
    },
    ja: {
        title: "このページは見つかりません",
        text: "リンクが古いか、アドレスが間違っている可能性があります。",
        editor: "エディタを開く",
        docs: "ドキュメント",
        home: "ホーム",
    },
    "zh-Hant": {
        title: "這個頁面不存在",
        text: "連結可能已經過期，或者網址輸入錯誤。",
        editor: "開啟編輯器",
        docs: "文件",
        home: "首頁",
    },
}

/** The site's 404, in the language of the address that was not found */
export function NotFoundPage() {
    // A not-found page gets no route params: the locale is the first segment
    const first = usePathname().split("/")[1] ?? ""
    const lang = (i18n.locales as readonly string[]).includes(first)
        ? (first as Locale)
        : "en"
    const t = TEXTS[lang]
    // The server's title is in English: it cannot know the language
    useEffect(() => {
        document.title = `${t.title} | Next AI Draw.io`
    }, [t.title])
    return (
        <div className="site lp-grid flex min-h-screen items-center justify-center bg-canvas px-6 text-foreground md:px-8">
            <div className="max-w-md text-center">
                <Link
                    href={`/${lang}/about`}
                    className="inline-flex items-center gap-2.5"
                >
                    <BrandMark className="size-7" />
                    <span className="text-[15px] font-semibold">
                        Next AI Draw.io
                    </span>
                </Link>
                <p className="mt-10 font-mono text-[13px] text-muted-foreground">
                    404
                </p>
                <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.025em]">
                    {t.title}
                </h1>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                    {t.text}
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <Link
                        href={`/${lang}`}
                        className="rounded-lg bg-foreground px-4.5 py-2.5 text-[14.5px] font-medium text-background"
                    >
                        {t.editor}
                    </Link>
                    <Link
                        href={`/${lang}/docs`}
                        className="rounded-lg border border-border bg-card px-4.5 py-2.5 text-[14.5px] font-medium hover:bg-muted"
                    >
                        {t.docs}
                    </Link>
                    <Link
                        href={`/${lang}/about`}
                        className="rounded-lg border border-border bg-card px-4.5 py-2.5 text-[14.5px] font-medium hover:bg-muted"
                    >
                        {t.home}
                    </Link>
                </div>
            </div>
        </div>
    )
}
