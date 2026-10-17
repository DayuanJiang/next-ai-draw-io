import Link from "next/link"
import { Suspense } from "react"
import { Workspace } from "@/components/workspace/workspace"
import type { Locale } from "@/lib/i18n/config"
import { getDictionary } from "@/lib/i18n/dictionaries"

export default async function Home({
    params,
}: {
    params: Promise<{ lang: string }>
}) {
    // The layout has already rejected unknown locales
    const lang = (await params).lang as Locale
    const dict = await getDictionary(lang)
    return (
        <>
            {/* The workspace renders only in the browser, so the server's
                HTML is otherwise empty for crawlers that do not run
                JavaScript. Visually hidden; it repeats the start screen. */}
            <div className="sr-only">
                <h1>Next AI Draw.io</h1>
                <p>{dict.lobby.lede}</p>
                <Link href={`/${lang}/about`}>{dict.settings.tabAbout}</Link>
            </div>
            {/* The workspace reads ?session= from the URL, which needs a
                Suspense boundary */}
            <Suspense fallback={<div className="fixed inset-0 bg-canvas" />}>
                <Workspace />
            </Suspense>
        </>
    )
}
