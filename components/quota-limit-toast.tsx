"use client"

import { Coffee, X } from "lucide-react"
import type React from "react"
import { FaGithub } from "react-icons/fa"

interface QuotaLimitToastProps {
    used: number
    limit: number
    onDismiss: () => void
}

export function QuotaLimitToast({
    used,
    limit,
    onDismiss,
}: QuotaLimitToastProps) {
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault()
            onDismiss()
        }
    }

    return (
        <div
            role="alert"
            aria-live="polite"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            className="relative w-[400px] overflow-hidden rounded-xl border border-border/50 bg-card p-5 shadow-soft animate-message-in"
        >
            {/* Close button */}
            <button
                onClick={onDismiss}
                className="absolute right-3 top-3 p-1.5 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Dismiss"
            >
                <X className="w-4 h-4" />
            </button>

            {/* Title row with icon */}
            <div className="flex items-center gap-2.5 mb-3 pr-6">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                    <Coffee
                        className="w-4 h-4 text-accent-foreground"
                        strokeWidth={2}
                    />
                </div>
                <h3 className="font-semibold text-foreground text-sm">
                    Daily Quota Reached
                </h3>
                <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-muted text-muted-foreground">
                    {used}/{limit}
                </span>
            </div>

            {/* Message */}
            <div className="text-sm text-muted-foreground leading-relaxed mb-4 space-y-2">
                <p>
                    Oops — you've reached the daily API limit for this demo! As
                    an indie developer covering all the API costs myself, I have
                    to set these limits to keep things sustainable.
                </p>
                <p>
                    The good news is that you can self-host the project in
                    seconds on Vercel (it's fully open-source), or if you love
                    it, consider sponsoring to help keep the lights on!
                </p>
                <p>Your limit resets tomorrow. Thanks for understanding!</p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
                <a
                    href="https://github.com/DayuanJiang/next-ai-draw-io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                    <FaGithub className="w-3.5 h-3.5" />
                    Self-host
                </a>
                <a
                    href="https://github.com/sponsors/DayuanJiang"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                >
                    <Coffee className="w-3.5 h-3.5" />
                    Sponsor
                </a>
            </div>
        </div>
    )
}
