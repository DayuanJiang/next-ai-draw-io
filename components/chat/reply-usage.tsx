import { useLocale } from "@/components/canvas/locale-context"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { useDictionary } from "@/hooks/use-dictionary"
import type { ReplyUsage } from "@/lib/chat-message"
import { formatMessage } from "@/lib/i18n/utils"
import { cn } from "@/lib/utils"

/** Dollars to three significant digits: $0.0373, $1.24 */
function formatUsd(usd: number): string {
    return `$${new Intl.NumberFormat("en-US", {
        maximumSignificantDigits: 3,
    }).format(usd)}`
}

/**
 * An answer's input and output tokens and its time, in the row of buttons
 * under it; pointing at it shows the details and the estimated cost
 */
export function ReplyUsageNote({ usage }: { usage: ReplyUsage }) {
    const t = useDictionary().chat
    const locale = useLocale()
    const exact = new Intl.NumberFormat(locale)
    // Shortened from 10,000 on, to three digits: 10,198 is 1.02万 in
    // Chinese (1万 would read as exactly 10,000)
    const compact = new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumSignificantDigits: 3,
    })
    const short = (tokens: number) =>
        (tokens < 10_000 ? exact : compact).format(tokens)
    const seconds = usage.durationMs / 1000

    // A part of the row above (cache, thinking) only where the provider
    // reported it
    const rows = [
        { label: t.usageInput, tokens: usage.inputTokens },
        { label: t.usageCacheRead, tokens: usage.cacheReadTokens, part: true },
        { label: t.usageOutput, tokens: usage.outputTokens },
        { label: t.usageReasoning, tokens: usage.reasoningTokens, part: true },
    ].filter((row) => !row.part || row.tokens > 0)

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span
                    // Focusable, so the keyboard reaches the details too
                    tabIndex={0}
                    className="ml-1.5 cursor-default rounded text-[11px] tabular-nums text-faint outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="reply-usage"
                >
                    {formatMessage(t.usageSummary, {
                        input: short(usage.inputTokens),
                        output: short(usage.outputTokens),
                        seconds: Math.round(seconds),
                    })}
                </span>
            </TooltipTrigger>
            <TooltipContent
                align="start"
                collisionPadding={12}
                className="border border-border bg-popover text-popover-foreground shadow-md [&>span]:hidden"
            >
                <dl className="grid grid-cols-[auto_auto_auto] gap-x-1.5 gap-y-1 text-xs">
                    {rows.map((row) => (
                        <div key={row.label} className="contents">
                            <dt
                                className={cn(
                                    "pr-3 text-muted-foreground",
                                    row.part && "pl-3",
                                )}
                            >
                                {row.label}
                            </dt>
                            <dd className="text-right tabular-nums">
                                {exact.format(row.tokens)}
                            </dd>
                            <dd className="text-muted-foreground">
                                {t.usageTokenUnit}
                            </dd>
                        </div>
                    ))}
                    <div className="contents">
                        <dt className="pr-3 text-muted-foreground">
                            {t.usageTime}
                        </dt>
                        <dd className="text-right tabular-nums">
                            {seconds.toFixed(1)}
                        </dd>
                        <dd className="text-muted-foreground">
                            {t.usageSecondUnit}
                        </dd>
                    </div>
                    {typeof usage.costUsd === "number" && (
                        <div className="contents">
                            <dt className="pr-3 text-muted-foreground">
                                {t.usageCost}
                            </dt>
                            <dd className="text-right tabular-nums">
                                {formatUsd(usage.costUsd)}
                            </dd>
                            <dd />
                        </div>
                    )}
                </dl>
                {typeof usage.costUsd === "number" && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {t.usageCostNote}
                    </p>
                )}
            </TooltipContent>
        </Tooltip>
    )
}
