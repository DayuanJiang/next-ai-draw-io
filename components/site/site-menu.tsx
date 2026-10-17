"use client"

import { Menu, X } from "lucide-react"
import { type ReactNode, useEffect, useId, useRef, useState } from "react"

/** The header's links below 1024 px, in a panel under the header */
export function SiteMenu({
    label,
    children,
}: {
    /** For screen readers and the tooltip */
    label: string
    children: ReactNode
}) {
    const [open, setOpen] = useState(false)
    const menu = useRef<HTMLDivElement>(null)
    const button = useRef<HTMLButtonElement>(null)
    const panelId = useId()

    // Close on a tap outside or Escape, as the language list does
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
        <div ref={menu} className="lg:hidden">
            <button
                ref={button}
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="rounded-lg p-2 hover:bg-foreground/[0.07] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-expanded:bg-foreground/[0.07] aria-expanded:text-foreground"
                aria-label={label}
                title={label}
                aria-expanded={open}
                aria-controls={panelId}
            >
                {open ? (
                    <X className="size-[18px]" />
                ) : (
                    <Menu className="size-[18px]" />
                )}
            </button>
            {open && (
                // A tap on a link closes the panel
                <div
                    id={panelId}
                    onClick={(event) => {
                        if ((event.target as Element).closest("a")) {
                            setOpen(false)
                        }
                    }}
                    className="absolute inset-x-0 top-full z-30 border-y border-border bg-card px-5 pt-2 pb-5 text-[16px] text-foreground shadow-[0_24px_40px_-24px_rgba(20,24,29,0.35)]"
                >
                    {children}
                </div>
            )}
        </div>
    )
}
