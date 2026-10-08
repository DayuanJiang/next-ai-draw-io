import type { ChangeSummary } from "@/lib/diagram-diff"
import { formatMessage } from "@/lib/i18n/utils"

type VersionDict = Record<string, string>

const PARTS: [keyof ChangeSummary, string][] = [
    ["shapesAdded", "shapesAdded"],
    ["edgesAdded", "edgesAdded"],
    ["shapesChanged", "shapesChanged"],
    ["edgesChanged", "edgesChanged"],
    ["shapesRemoved", "shapesRemoved"],
    ["edgesRemoved", "edgesRemoved"],
]

/**
 * "Added 2 shapes, changed 1 connector". Each dictionary entry has a
 * singular (...One) and plural (...Other) form; languages without plurals
 * use the same text for both.
 */
export function describeChanges(
    summary: ChangeSummary,
    t: VersionDict,
): string {
    const pieces = PARTS.filter(([field]) => summary[field] > 0).map(
        ([field, key]) => {
            const count = summary[field]
            const template = count === 1 ? t[`${key}One`] : t[`${key}Other`]
            return formatMessage(template ?? "", { count })
        },
    )
    if (pieces.length === 0) return t.noChanges ?? ""
    const text = pieces.join(t.listSeparator ?? ", ")
    // Sentence case for scripts with letter case
    return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "3 shapes, 1 connector": what a diagram drawn from scratch holds */
export function describeTotals(summary: ChangeSummary, t: VersionDict): string {
    const count = (n: number, key: string) =>
        formatMessage((n === 1 ? t[`${key}One`] : t[`${key}Other`]) ?? "", {
            count: n,
        })
    return formatMessage(t.totals ?? "", {
        shapes: count(summary.shapesAdded, "shapesTotal"),
        edges: count(summary.edgesAdded, "edgesTotal"),
    })
}
