"use client"

import { ArrowUpRight, Terminal, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useDictionary } from "@/hooks/use-dictionary"
import { usePathLocale } from "@/hooks/use-path-locale"
import { getAssetUrl } from "@/lib/base-path"
import { STORAGE_KEYS } from "@/lib/storage"
import { cn } from "@/lib/utils"

/**
 * Whether the user closed the MCP notice once. Starts as closed so the server
 * render and the first client render agree; the stored choice is read after
 * mount.
 */
function useVideoClosed() {
    const [closed, setClosed] = useState(true)
    useEffect(() => {
        setClosed(localStorage.getItem(STORAGE_KEYS.mcpVideoClosed) === "true")
    }, [])
    const close = () => {
        localStorage.setItem(STORAGE_KEYS.mcpVideoClosed, "true")
        setClosed(true)
    }
    return [closed, close] as const
}

function PromoVideo({ className }: { className?: string }) {
    const video = useRef<HTMLVideoElement>(null)
    // Plays by itself only when the system does not ask for reduced motion
    useEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return
        }
        video.current?.play().catch(() => {})
    }, [])
    return (
        <video
            ref={video}
            src={getAssetUrl("/mcp-promo.mp4")}
            poster={getAssetUrl("/mcp-promo-poster.jpg")}
            muted
            loop
            playsInline
            controls
            preload="metadata"
            className={cn("aspect-video w-full rounded-lg bg-black", className)}
            data-testid="mcp-video"
        />
    )
}

function CloseButton({ onClick }: { onClick: () => void }) {
    const dict = useDictionary()
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={dict.common.close}
            title={dict.common.close}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            data-testid="mcp-video-close"
        >
            <X className="size-4" />
        </button>
    )
}

/** Icon, title and tagline of the MCP server, linking to the site's MCP page */
function NoticeLink({ className }: { className?: string }) {
    const dict = useDictionary()
    const lang = usePathLocale()
    return (
        <Link
            href={`/${lang}/mcp`}
            target="_blank"
            // A new tab loads the page itself: nothing to prefetch
            prefetch={false}
            className={cn("group flex min-w-0 items-center gap-3", className)}
        >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/20">
                <Terminal className="size-4 text-purple-500" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground transition-colors group-hover:text-purple-500">
                    {dict.examples.mcpServer}
                </span>
                <span className="block text-xs leading-relaxed text-balance text-muted-foreground">
                    {dict.examples.mcpTagline}
                </span>
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-purple-500" />
        </Link>
    )
}

const cardClass =
    "w-full rounded-xl border border-purple-500/20 bg-gradient-to-r from-purple-500/10 to-blue-500/10"

/**
 * MCP server notice on the start screen: the card with the promo video. Once
 * the user closes it, it does not come back.
 */
export function McpNotice({ className }: { className?: string }) {
    const [closed, close] = useVideoClosed()
    if (closed) return null
    return (
        <div
            className={cn(cardClass, "p-3", className)}
            data-testid="mcp-notice"
        >
            <div className="flex items-center gap-2 pl-1">
                <NoticeLink className="flex-1" />
                <CloseButton onClick={close} />
            </div>
            <PromoVideo className="mt-3" />
        </div>
    )
}
