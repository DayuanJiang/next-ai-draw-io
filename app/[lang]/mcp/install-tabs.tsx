"use client"

import { useState } from "react"
import { CopyCommand } from "@/components/site/copy-command"
import { Inline } from "@/components/site/inline"

export type InstallTab = {
    id: string
    label: string
    /** Notes and code, in order */
    items: ({ note: string } | { code: string })[]
}

/** The install steps of each MCP client, one tab at a time */
export function InstallTabs({
    tabs,
    labels,
}: {
    tabs: InstallTab[]
    labels: { copy: string; copied: string }
}) {
    const [current, setCurrent] = useState(tabs[0].id)
    const tab = tabs.find((t) => t.id === current) ?? tabs[0]
    return (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div
                role="tablist"
                className="flex gap-1 overflow-x-auto border-b border-border bg-canvas px-2 pt-2"
            >
                {tabs.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        id={`install-tab-${t.id}`}
                        aria-selected={t.id === current}
                        aria-controls="install-panel"
                        onClick={() => setCurrent(t.id)}
                        className={`relative shrink-0 rounded-t-lg px-3.5 py-2 text-[13.5px] font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                            t.id === current
                                ? "bg-card text-foreground shadow-[0_1px_0_var(--card)]"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {t.label}
                        {t.id === current && (
                            <span className="absolute inset-x-3 top-0 h-[2px] rounded-full bg-marker" />
                        )}
                    </button>
                ))}
            </div>
            <div
                id="install-panel"
                role="tabpanel"
                aria-labelledby={`install-tab-${tab.id}`}
                className="space-y-3.5 p-5"
            >
                {tab.items.map((item, i) =>
                    "note" in item ? (
                        <p
                            key={i}
                            className="text-[14.5px] leading-relaxed text-muted-foreground"
                        >
                            <Inline text={item.note} />
                        </p>
                    ) : (
                        <CopyCommand
                            key={i}
                            command={item.code}
                            labels={labels}
                            prompt={item.code.startsWith("/") ? "" : "$"}
                        />
                    ),
                )}
            </div>
        </div>
    )
}
