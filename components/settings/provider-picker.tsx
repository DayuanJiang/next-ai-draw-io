import { ChevronRight, Search } from "lucide-react"
import { useState } from "react"
import { ProviderLogo } from "@/components/provider-logo"
import { SettingsHeader } from "@/components/settings/settings-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useDictionary } from "@/hooks/use-dictionary"
import { filterProviderGroups, PROVIDER_NOTE_KEYS } from "@/lib/provider-setup"
import { PROVIDER_INFO, type ProviderName } from "@/lib/types/model-config"

/** Every provider in groups, with a search; picking one adds it */
export function ProviderPicker({
    added,
    onPick,
    onBack,
}: {
    /** Provider types the user has already added */
    added: ProviderName[]
    onPick: (provider: ProviderName) => void
    onBack: () => void
}) {
    const dict = useDictionary()
    const t = dict.modelConfig
    const [query, setQuery] = useState("")
    const groups = filterProviderGroups(query)
    const groupLabels: Record<string, string> = {
        vendors: t.groupVendors,
        aggregators: t.groupAggregators,
        cloud: t.groupCloud,
        selfHosted: t.groupSelfHosted,
    }
    const notes = t as Record<string, string>

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <SettingsHeader>
                <button
                    type="button"
                    onClick={onBack}
                    className="rounded text-muted-foreground hover:text-foreground"
                >
                    {t.models}
                </button>
                <ChevronRight className="size-3.5 text-muted-foreground/60" />
                <h2
                    className="font-semibold outline-none"
                    tabIndex={-1}
                    data-page-title
                >
                    {t.addProvider}
                </h2>
            </SettingsHeader>
            <div className="px-6 pb-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        // The page is opened to search it
                        autoFocus
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => {
                            // Enter that confirms an IME candidate picks nothing
                            if (
                                e.nativeEvent.isComposing ||
                                e.keyCode === 229
                            ) {
                                return
                            }
                            // Enter picks the first match
                            const first = groups[0]?.providers[0]
                            if (e.key === "Enter" && query.trim() && first) {
                                e.preventDefault()
                                onPick(first)
                            }
                        }}
                        placeholder={t.searchProviders}
                        aria-label={t.searchProviders}
                        className="h-10 w-full rounded-xl border border-border bg-background pr-3 pl-9 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/20"
                    />
                </div>
            </div>
            <ScrollArea className="min-h-0 flex-1">
                <div className="px-6 pb-6">
                    {groups.length === 0 && (
                        <p className="py-8 text-center text-[13px] text-muted-foreground">
                            {t.noProvidersFound}
                        </p>
                    )}
                    {groups.map((group) => (
                        <section key={group.id} className="mb-3.5">
                            <h3 className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                                {groupLabels[group.id]}
                            </h3>
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2">
                                {group.providers.map((provider) => {
                                    const noteKey = PROVIDER_NOTE_KEYS[provider]
                                    const note = [
                                        noteKey && notes[noteKey],
                                        added.includes(provider) && t.added,
                                    ]
                                        .filter(Boolean)
                                        .join(" · ")
                                    return (
                                        <button
                                            key={provider}
                                            type="button"
                                            onClick={() => onPick(provider)}
                                            data-testid={`pick-provider-${provider}`}
                                            className="flex h-[46px] min-w-0 items-center gap-2.5 rounded-xl border border-border px-3 text-left transition-colors hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <ProviderLogo
                                                provider={provider}
                                                className="shrink-0"
                                            />
                                            <span className="min-w-0 leading-tight">
                                                <span
                                                    className="block truncate text-[12.5px] font-medium"
                                                    title={
                                                        PROVIDER_INFO[provider]
                                                            .label
                                                    }
                                                >
                                                    {
                                                        PROVIDER_INFO[provider]
                                                            .label
                                                    }
                                                </span>
                                                {note && (
                                                    <span className="block truncate text-[11px] text-muted-foreground">
                                                        {note}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            </ScrollArea>
        </div>
    )
}
