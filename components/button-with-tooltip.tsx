import React from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { type VariantProps } from "class-variance-authority";

interface ButtonWithTooltipProps
    extends React.ComponentProps<"button">,
        VariantProps<typeof buttonVariants> {
    tooltipContent: string;
    children: React.ReactNode;
    asChild?: boolean;
}

export function ButtonWithTooltip({
    tooltipContent,
    children,
    ...buttonProps
}: ButtonWithTooltipProps) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button {...buttonProps}>{children}</Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-wrap">{tooltipContent}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
