"use client"

import type React from "react"
import { forwardRef } from "react"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface ButtonTooltipProps {
    label: string
    /** Shown next to the label in the tooltip, e.g. "⌘B" */
    shortcut?: string
    side?: "top" | "bottom" | "left" | "right"
    /** The button the tooltip is for */
    children: React.ReactElement
}

/** The header buttons' tooltip: the label, then its shortcut */
export function ButtonTooltip({
    label,
    shortcut,
    side = "bottom",
    children,
}: ButtonTooltipProps) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side={side} className="flex items-center gap-2">
                {label}
                {shortcut && (
                    <kbd className="font-sans text-[11px] opacity-60">
                        {shortcut}
                    </kbd>
                )}
            </TooltipContent>
        </Tooltip>
    )
}

/** The look of a square icon button, also for a link that looks like one */
export const iconButtonClass = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors",
    "hover:bg-accent hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-35",
    "[&_svg]:size-4 [&_svg]:stroke-[1.75]",
)

interface IconButtonProps extends React.ComponentProps<"button"> {
    label: string
    /** Shown next to the label in the tooltip, e.g. "⌘B" */
    shortcut?: string
    tooltipSide?: "top" | "bottom" | "left" | "right"
}

/** Square icon button with a tooltip; the tooltip text is also its label */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    function IconButton(
        {
            label,
            shortcut,
            tooltipSide = "bottom",
            className,
            children,
            ...props
        },
        ref,
    ) {
        return (
            <ButtonTooltip label={label} shortcut={shortcut} side={tooltipSide}>
                <button
                    ref={ref}
                    type="button"
                    aria-label={label}
                    className={cn(iconButtonClass, className)}
                    {...props}
                >
                    {children}
                </button>
            </ButtonTooltip>
        )
    },
)
