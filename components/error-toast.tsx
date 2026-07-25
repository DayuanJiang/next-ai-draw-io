"use client"

import type React from "react"

interface ErrorToastProps {
    message: React.ReactNode
    onDismiss: () => void
}

export function ErrorToast({ message, onDismiss }: ErrorToastProps) {
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
            e.preventDefault()
            onDismiss()
        }
    }

    return (
        <div
            role="alert"
            aria-live="polite"
            tabIndex={0}
            onClick={onDismiss}
            onKeyDown={handleKeyDown}
            className="flex items-center gap-3 bg-card border border-border/50 px-4 py-3 rounded-xl shadow-sm cursor-pointer hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
        >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-destructive/10 flex-shrink-0">
                <svg
                    className="w-4 h-4 text-destructive"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                    />
                </svg>
            </div>
            <span className="text-sm text-foreground">{message}</span>
        </div>
    )
}
