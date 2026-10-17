import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Workspace } from "@/components/workspace/workspace"
import { getDictionary, hasLocale } from "@/lib/i18n/dictionaries"

export default async function Home({
    params,
}: {
    params: Promise<{ lang: string }>
}) {
    // The layout renders at the same time and cannot stop this page, so an
    // address like /llms.txt is rejected here too (it was a 500)
    const { lang } = await params
    if (!hasLocale(lang)) notFound()
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
