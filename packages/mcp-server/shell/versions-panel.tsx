import { useEffect, useRef } from "react"
import { VersionCard } from "@/components/canvas/version-card"
import { useDictionary } from "@/hooks/use-dictionary"
import type { Dictionary } from "@/lib/i18n/dictionaries"
import type { NodeVersion } from "./node-versions-source"

/** What a card says happened: the web app's chat knows the tool that ran,
 * the shell tells from who made the entry and what changed */
export function versionLabel(version: NodeVersion, dict: Dictionary): string {
    if (version.source === "user" || version.source === "recover") {
        return dict.shell.userEdit
    }
    return version.fromScratch ? dict.versions.created : dict.versions.edited
}

/** The version cards, oldest first, as the web app's chat shows them */
export function VersionsPanel({ versions }: { versions: NodeVersion[] }) {
    const dict = useDictionary()
    const listRef = useRef<HTMLDivElement>(null)

    // Keep the newest version in view
    useEffect(() => {
        const el = listRef.current
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    }, [versions.length])

    return (
        <aside
            className="flex w-[340px] shrink-0 flex-col border-l border-border bg-surface-0"
            data-testid="versions-panel"
        >
            <div className="flex h-9 shrink-0 items-center px-3.5 text-xs font-medium text-muted-foreground">
                {dict.versions.strip}
            </div>
            <div
                ref={listRef}
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 scrollbar-thin"
            >
                {versions.map((version, i) => (
                    <VersionCard
                        key={version.id}
                        version={version}
                        isLatest={i === versions.length - 1}
                        label={versionLabel(version, dict)}
                    />
                ))}
            </div>
        </aside>
    )
}
