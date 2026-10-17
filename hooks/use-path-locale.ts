"use client"

import { usePathname } from "next/navigation"
import { i18n, type Locale } from "@/lib/i18n/config"

/** The locale at the start of the address, for links to the site pages */
export function usePathLocale(): Locale {
    const first = usePathname().split("/")[1] ?? ""
    return (i18n.locales as readonly string[]).includes(first)
        ? (first as Locale)
        : i18n.defaultLocale
}
