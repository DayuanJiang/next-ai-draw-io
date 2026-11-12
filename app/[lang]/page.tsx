import type { Viewport } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Workspace } from "@/components/workspace/workspace"
import { DiagramProvider } from "@/contexts/diagram-context"
import { getDictionary, hasLocale } from "@/lib/i18n/dictionaries"

// The editor fills the window and the canvas has its own zoom, so the page
// around it keeps its size under a pinch
export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

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
                {/* For crawlers; Tab skips a link nobody can see */}
                <Link href={`/${lang}/about`} tabIndex={-1}>
                    {dict.settings.tabAbout}
                </Link>
            </div>
            {/* Around the editor only: the site's pages share the layout
                and stay free of the canvas code this brings */}
            <DiagramProvider>
                {/* The page's main landmark, for screen readers. The
                    workspace reads ?session= from the URL, which needs a
                    Suspense boundary */}
                <main>
                    <Suspense
                        fallback={<div className="fixed inset-0 bg-canvas" />}
                    >
                        <Workspace />
                    </Suspense>
                </main>
            </DiagramProvider>
        </>
    )
}
