import "@/components/site/site.css"
import type { Metadata } from "next"
import { NotFoundPage } from "@/components/site/not-found-page"

// A not-found page gets no params, so its title stays in English. Next adds
// "noindex" to it: the layout's "index, follow" and the home page's
// canonical address are not this page's
export const metadata: Metadata = {
    title: "Page not found | Next AI Draw.io",
    robots: null,
    alternates: null,
}

export default function NotFound() {
    return <NotFoundPage />
}
