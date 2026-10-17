"use client"

import { createContext, useContext } from "react"
import type { Locale } from "@/lib/i18n/config"

const LocaleContext = createContext<Locale | null>(null)

/** The page's language; the web layout feeds it from its route param */
export function LocaleProvider({
    locale,
    children,
}: {
    locale: Locale
    children: React.ReactNode
}) {
    return (
        <LocaleContext.Provider value={locale}>
            {children}
        </LocaleContext.Provider>
    )
}

export function useLocale(): Locale {
    const locale = useContext(LocaleContext)
    if (!locale) {
        throw new Error("useLocale must be used within a LocaleProvider")
    }
    return locale
}
