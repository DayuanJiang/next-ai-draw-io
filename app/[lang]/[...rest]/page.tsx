import { notFound } from "next/navigation"

// Any address under a locale that no route matches gets the site's 404
// (app/[lang]/not-found.tsx), inside the locale's layout
export default function Unmatched() {
    notFound()
}
