"use client"

import { type CSSProperties, type ElementType, memo, useMemo } from "react"
import { cn } from "@/lib/utils"

export type TextShimmerProps = {
    children: string
    as?: ElementType
    className?: string
    duration?: number
    spread?: number
}

const ShimmerComponent = ({
    children,
    as: Component = "p",
    className,
    duration = 2,
    spread = 2,
}: TextShimmerProps) => {
    const dynamicSpread = useMemo(
        () => (children?.length ?? 0) * spread,
        [children, spread],
    )

    return (
        <Component
            className={cn(
                "animate-shimmer relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
                "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
                className,
            )}
            style={
                {
                    "--spread": `${dynamicSpread}px`,
                    "--shimmer-duration": `${duration}s`,
                    backgroundImage:
                        "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
                } as CSSProperties
            }
        >
            {children}
        </Component>
    )
}

export const Shimmer = memo(ShimmerComponent)
