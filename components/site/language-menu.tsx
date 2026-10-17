"use client"

import { Check, Globe } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"
import { i18n, type Locale } from "@/lib/i18n/config"
import { LANGUAGE_NAMES } from "./site-texts"

/** The same page in another language, from the header */
export function LanguageMenu({
    lang,
    label,
}: {
    lang: Locale
    /** For screen readers and the tooltip */
    label: string
}) {
    const [open, setOpen] = useState(false)
    const menu = useRef<HTMLDivElement>(null)
    const button = useRef<HTMLButtonElement>(null)
    const listId = useId()
    // The page without its locale, "/about" for "/zh/about"
    const rest = usePathname().replace(/^\/[^/]+/, "")

    // Close on a click outside or Escape
    useEffect(() => {
        if (!open) return
        const close = (event: MouseEvent | KeyboardEvent) => {
            if (event instanceof KeyboardEvent && event.key !== "Escape") return
            if (
                event instanceof MouseEvent &&
                menu.current?.contains(event.target as Node)
            ) {
                return
            }
            setOpen(false)
            // Escape may close the list while one of its links has focus
            if (event instanceof KeyboardEvent) button.current?.focus()
        }
        document.addEventListener("mousedown", close)
        document.addEventListener("keydown", close)
        return () => {
            document.removeEventListener("mousedown", close)
            document.removeEventListener("keydown", close)
        }
    }, [open])

    return (
        <div ref={menu} className="relative">
            <button
                ref={button}
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="rounded-lg p-2 hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-foreground/[0.07] aria-expanded:text-foreground"
                aria-label={label}
                title={label}
                aria-expanded={open}
                aria-controls={listId}
            >
                <Globe className="size-[18px]" />
            </button>
            {/* A list of links that Tab moves through, not a menu with arrow
                keys */}
            {open && (
                <div
                    id={listId}
                    className="absolute top-full right-0 z-20 mt-1.5 w-40 rounded-xl border border-border bg-card p-1 shadow-[0_12px_32px_-12px_rgba(20,24,29,0.35)]"
                >
                    {i18n.locales.map((locale) => (
                        <Link
                            key={locale}
                            href={`/${locale}${rest}`}
                            hrefLang={locale}
                            lang={locale}
                            onClick={() => setOpen(false)}
                            className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[13.5px] hover:bg-muted ${locale === lang ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            aria-current={locale === lang ? "page" : undefined}
                        >
                            {LANGUAGE_NAMES[locale]}
                            {locale === lang && <Check className="size-3.5" />}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
