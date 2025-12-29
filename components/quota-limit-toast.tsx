"use client"

import { Coffee, Settings, X } from "lucide-react"
import type React from "react"
import { FaGithub } from "react-icons/fa"
import { useDictionary } from "@/hooks/use-dictionary"
import { formatMessage } from "@/lib/i18n/utils"

interface QuotaLimitToastProps {
    type?: "request" | "token"
    used: number
    limit: number
    onDismiss: () => void
    onConfigModel?: () => void
}

export function QuotaLimitToast({
    type = "request",
    used,
    limit,
    onDismiss,
    onConfigModel,
}: QuotaLimitToastProps) {
    const dict = useDictionary()
    const isTokenLimit = type === "token"
    const formatNumber = (n: number) =>
        n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString()

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
                    {isTokenLimit
                        ? dict.quota.tokenLimit
                        : dict.quota.dailyLimit}
                </h3>
                <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-muted text-muted-foreground">
                    {formatMessage(dict.quota.usedOf, {
                        used: formatNumber(used),
                        limit: formatNumber(limit),
                    })}
                </span>
            </div>
            {/* Message */}
            <div className="text-sm text-muted-foreground leading-relaxed mb-4 space-y-2">
                <p>
                    {isTokenLimit
                        ? dict.quota.messageToken
                        : dict.quota.messageApi}
                </p>
                <p
                    dangerouslySetInnerHTML={{
                        __html: formatMessage(dict.quota.doubaoSponsorship, {
                            link: "https://console.volcengine.com/ark/region:ark+cn-beijing/overview?briefPage=0&briefType=introduce&type=new&utm_campaign=doubao&utm_content=aidrawio&utm_medium=github&utm_source=coopensrc&utm_term=project",
                        }),
                    }}
                />
                <p dangerouslySetInnerHTML={{ __html: dict.quota.tip }} />
                <p>{dict.quota.reset}</p>
            </div>{" "}
            {/* Action buttons */}
            <div className="flex items-center gap-2">
                {onConfigModel && (
                    <button
                        type="button"
                        onClick={() => {
                            onConfigModel()
                            onDismiss()
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                        <Settings className="w-3.5 h-3.5" />
                        {dict.quota.configModel}
                    </button>
                )}
                <a
                    href="https://github.com/DayuanJiang/next-ai-draw-io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                >
                    <FaGithub className="w-3.5 h-3.5" />
                    {dict.quota.selfHost}
                </a>
                <a
                    href="https://github.com/sponsors/DayuanJiang"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                >
                    <Coffee className="w-3.5 h-3.5" />
                    {dict.quota.sponsor}
                </a>
            </div>
        </div>
    )
}
