"use client"

import type React from "react"
import { forwardRef } from "react"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface IconButtonProps extends React.ComponentProps<"button"> {
    label: string
    /** Shown next to the label in the tooltip, e.g. "⌘B" */
    shortcut?: string
    active?: boolean
    tooltipSide?: "top" | "bottom" | "left" | "right"
    size?: "sm" | "md"
}

/** Square icon button with a tooltip; the tooltip text is also its label */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    function IconButton(
        {
            label,
            shortcut,
            active = false,
            tooltipSide = "bottom",
            size = "md",
            className,
            children,
            ...props
        },
        ref,
    ) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        ref={ref}
                        type="button"
                        aria-label={label}
                        aria-pressed={active || undefined}
                        className={cn(
                            "inline-flex shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors",
                            "hover:bg-accent hover:text-foreground",
                            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                            "disabled:pointer-events-none disabled:opacity-35",
                            "[&_svg]:size-4 [&_svg]:stroke-[1.75]",
                            size === "md" ? "size-8" : "size-7",
                            // A tinted tile: solid ink is for the main action
                            active &&
                                "bg-interactive-active text-foreground hover:bg-interactive-active [&_svg]:stroke-2",
                            className,
                        )}
                        {...props}
                    >
                        {children}
                    </button>
                </TooltipTrigger>
                <TooltipContent
                    side={tooltipSide}
                    className="flex items-center gap-2"
                >
                    {label}
                    {shortcut && (
                        <kbd className="font-sans text-[11px] opacity-60">
                            {shortcut}
                        </kbd>
                    )}
                </TooltipContent>
            </Tooltip>
        )
    },
)

/** Thin vertical divider between toolbar groups */
export function ToolbarDivider() {
    return <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
}
