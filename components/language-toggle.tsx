"use client"

import { Globe } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"
import { i18n, type Locale } from "@/lib/i18n/config"

const LABELS: Record<string, string> = {
    en: "EN",
    zh: "中文",
    ja: "日本語",
}

function LanguageToggleInner({ className = "" }: { className?: string }) {
    const router = useRouter()
    const pathname = usePathname() || "/"
    const search = useSearchParams()
    const [open, setOpen] = useState(false)
    const [value, setValue] = useState<Locale>(i18n.defaultLocale)
    const ref = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const seg = pathname.split("/").filter(Boolean)
        const first = seg[0]
        if (first && i18n.locales.includes(first as Locale))
            setValue(first as Locale)
        else setValue(i18n.defaultLocale)
    }, [pathname])

    useEffect(() => {
        function onDoc(e: MouseEvent) {
            if (!ref.current) return
            if (!ref.current.contains(e.target as Node)) setOpen(false)
        }
        if (open) document.addEventListener("mousedown", onDoc)
        return () => document.removeEventListener("mousedown", onDoc)
    }, [open])

    const changeLocale = (lang: string) => {
        const parts = pathname.split("/")
        if (parts.length > 1 && i18n.locales.includes(parts[1] as Locale)) {
            parts[1] = lang
        } else {
            parts.splice(1, 0, lang)
        }
        const newPath = parts.join("/") || "/"
        const searchStr = search?.toString() ? `?${search.toString()}` : ""
        setOpen(false)
        router.push(newPath + searchStr)
    }

    return (
        <div className={`relative inline-flex ${className}`} ref={ref}>
            <button
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((s) => !s)}
                className="p-2 rounded-full hover:bg-accent/20 transition-colors text-muted-foreground"
                aria-label="Change language"
            >
                <Globe className="w-5 h-5" />
            </button>
            {open && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-popover dark:bg-popover text-popover-foreground rounded-xl shadow-md border border-border/30 overflow-hidden z-50">
                    <div className="grid gap-0 divide-y divide-border/30">
                        {i18n.locales.map((loc) => (
                            <button
                                key={loc}
                                onClick={() => changeLocale(loc)}
                                className={`flex items-center gap-2 px-4 py-2 text-sm w-full text-left hover:bg-accent/10 transition-colors ${value === loc ? "bg-accent/10 font-semibold" : ""}`}
                            >
                                <span className="flex-1">
                                    {LABELS[loc] ?? loc}
                                </span>
                                {value === loc && (
                                    <span className="text-xs opacity-70">
                                        ✓
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export default function LanguageToggle({
    className = "",
}: {
    className?: string
}) {
    return (
        <Suspense
            fallback={
                <button
                    className="p-2 rounded-full text-muted-foreground opacity-50"
                    disabled
                >
                    <Globe className="w-5 h-5" />
                </button>
            }
        >
            <LanguageToggleInner className={className} />
        </Suspense>
    )
}
