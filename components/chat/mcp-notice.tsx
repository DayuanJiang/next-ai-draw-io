"use client"

import { ArrowUpRight, Terminal, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useDictionary } from "@/hooks/use-dictionary"
import { getAssetUrl } from "@/lib/base-path"
import { STORAGE_KEYS } from "@/lib/storage"
import { cn } from "@/lib/utils"

const MCP_URL =
    "https://github.com/DayuanJiang/next-ai-draw-io/tree/main/packages/mcp-server"

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
    return (
        <video
            src={getAssetUrl("/mcp-promo.mp4")}
            poster={getAssetUrl("/mcp-promo-poster.jpg")}
            autoPlay
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

/** Icon, title and tagline of the MCP server, linking to its README */
function NoticeLink({ className }: { className?: string }) {
    const dict = useDictionary()
    return (
        <a
            href={MCP_URL}
            target="_blank"
            rel="noopener noreferrer"
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
        </a>
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
