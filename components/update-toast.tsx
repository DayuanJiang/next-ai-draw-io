"use client"

import type React from "react"

interface UpdateToastAvailableProps {
    variant: "download"
    version: string
    onDownload: () => void
    onDismiss: () => void
}

interface UpdateToastManualProps {
    variant: "manual"
    version: string
    url: string
    onDismiss: () => void
}

interface UpdateToastDownloadingProps {
    variant: "downloading"
    percent: number
    onDismiss: () => void
}

type UpdateToastProps =
    | UpdateToastAvailableProps
    | UpdateToastManualProps
    | UpdateToastDownloadingProps

export function UpdateToast(props: UpdateToastProps) {
    const { variant, onDismiss } = props

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
            className="flex items-center gap-3 bg-card border border-border/50 px-4 py-3 rounded-xl shadow-sm"
        >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 flex-shrink-0">
                <svg
                    className="w-4 h-4 text-primary"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
            </div>

            <div className="flex-1 min-w-0">
                {variant === "downloading" ? (
                    <span className="text-sm text-foreground">
                        Downloading update... {Math.round(props.percent)}%
                    </span>
                ) : (
                    <span className="text-sm text-foreground">
                        Version {props.version} is available
                    </span>
                )}
            </div>

            {variant === "download" && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        props.onDownload()
                    }}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex-shrink-0"
                >
                    Download
                </button>
            )}

            {variant === "manual" && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        window.open(props.url, "_blank")
                    }}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex-shrink-0"
                >
                    Download
                </button>
            )}

            <button
                type="button"
                onClick={onDismiss}
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                aria-label="Dismiss"
            >
                <svg
                    className="w-4 h-4"
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
            </button>
        </div>
    )
}
