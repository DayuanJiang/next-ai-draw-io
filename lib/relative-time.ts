/** "3 min ago", "yesterday", or a short date, in the UI language */
export function formatRelativeTime(
    timestamp: number,
    locale: string,
    justNow: string,
): string {
    const diffMs = Date.now() - timestamp
    const minutes = Math.floor(diffMs / 60_000)
    if (minutes < 1) return justNow
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
    if (minutes < 60) return rtf.format(-minutes, "minute")
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return rtf.format(-hours, "hour")
    const days = Math.floor(hours / 24)
    if (days < 7) return rtf.format(-days, "day")
    return new Date(timestamp).toLocaleDateString(locale, {
        month: "short",
        day: "numeric",
    })
}
