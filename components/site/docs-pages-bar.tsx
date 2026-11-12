"use client"

import { type ReactNode, useEffect, useRef } from "react"

/**
 * The docs' pages below 1024 px: a bar under the header that opens their
 * list. It stays a <details>, which opens without JavaScript; a tap outside,
 * Escape or a tap on one of its links closes it, as with the site menu.
 */
export function DocsPagesBar({ children }: { children: ReactNode }) {
    const details = useRef<HTMLDetailsElement>(null)

    useEffect(() => {
        const close = (event: MouseEvent | KeyboardEvent) => {
            const bar = details.current
            if (!bar?.open) return
            if (event instanceof KeyboardEvent) {
                if (event.key !== "Escape") return
                // Escape may close the list while one of its links has focus
                bar.querySelector("summary")?.focus()
            } else if (bar.contains(event.target as Node)) {
                return
            }
            bar.open = false
        }
        document.addEventListener("mousedown", close)
        document.addEventListener("keydown", close)
        return () => {
            document.removeEventListener("mousedown", close)
            document.removeEventListener("keydown", close)
        }
    }, [])

    return (
        <details
            ref={details}
            onClick={(event) => {
                // Also the page being read and its sections, which load no
                // new page that would start with the list closed
                if ((event.target as Element).closest("a")) {
                    event.currentTarget.open = false
                }
            }}
            className="group sticky top-0 z-20 border-b border-border bg-canvas lg:hidden"
        >
            {children}
        </details>
    )
}
