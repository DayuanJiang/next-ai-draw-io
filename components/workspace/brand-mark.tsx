"use client"

import { getAssetUrl } from "@/lib/base-path"
import { cn } from "@/lib/utils"

/** The app icon in a rounded tile; the icon has its own white tile, so dark mode uses it too */
export function BrandMark({ className }: { className?: string }) {
    return (
        <span
            className={cn(
                "relative inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-card",
                className,
            )}
        >
            {/* biome-ignore lint/performance/noImgElement: tiny static icon */}
            <img
                src={getAssetUrl("/favicon-192x192.png")}
                alt=""
                className="size-full object-contain"
            />
        </span>
    )
}
