"use client"

import { type KeyboardEvent, useRef, useState } from "react"
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
    const list = useRef<HTMLDivElement>(null)
    const tab = tabs.find((t) => t.id === current) ?? tabs[0]
    // Arrow keys, Home and End move between the tabs, as in any tab list
    const onKeyDown = (event: KeyboardEvent) => {
        const index = tabs.findIndex((t) => t.id === current)
        const next =
            event.key === "ArrowRight"
                ? (index + 1) % tabs.length
                : event.key === "ArrowLeft"
                  ? (index - 1 + tabs.length) % tabs.length
                  : event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : -1
        if (next < 0) return
        event.preventDefault()
        setCurrent(tabs[next].id)
        list.current
            ?.querySelector<HTMLButtonElement>(`#install-tab-${tabs[next].id}`)
            ?.focus()
    }
    return (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
            {/* On a phone the tabs scroll sideways; the fade on the right
                shows there are more */}
            <div className="relative">
                <div
                    ref={list}
                    role="tablist"
                    onKeyDown={onKeyDown}
                    className="flex gap-1 overflow-x-auto border-b border-border bg-canvas px-2 pt-2 max-md:pr-10 max-md:[scrollbar-width:none]"
                >
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            id={`install-tab-${t.id}`}
                            aria-selected={t.id === current}
                            tabIndex={t.id === current ? 0 : -1}
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
                <span className="pointer-events-none absolute top-0 right-0 bottom-px w-10 bg-gradient-to-l from-canvas md:hidden" />
            </div>
            <div
                id="install-panel"
                role="tabpanel"
                aria-labelledby={`install-tab-${tab.id}`}
                className="space-y-3.5 p-4 md:p-5"
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
