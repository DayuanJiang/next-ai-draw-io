"use client"

import { Bookmark, FileText, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { useDictionary } from "@/hooks/use-dictionary"
import {
    getAllTemplates,
    sortTemplates,
    type Template,
} from "@/lib/template-storage"

interface TemplatePanelProps {
    setInput: (input: string) => void
}

function formatLastUsed(timestamp: number, neverUsedText: string): string {
    if (!timestamp) return neverUsedText
    const now = Date.now()
    const diffMs = now - timestamp
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return new Date(timestamp).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    })
}

export function TemplatePanel({ setInput }: TemplatePanelProps) {
    const dict = useDictionary()
    const [templates, setTemplates] = useState<Template[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let mounted = true
        getAllTemplates().then((result) => {
            if (mounted) {
                setTemplates(sortTemplates(result))
                setLoading(false)
            }
        })
        return () => {
            mounted = false
        }
    }, [])

    // Empty state: no templates
    if (!loading && templates.length === 0) {
        return (
            <div className="py-6 px-2 animate-fade-in">
                <div className="text-center mb-6">
                    <h2 className="text-lg font-semibold text-foreground mb-2">
                        {dict.templates.title}
                    </h2>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                        {dict.templates.subtitle}
                    </p>
                </div>
                <div className="flex flex-col items-center justify-center py-8 px-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                        <FileText className="w-8 h-8 text-primary/60" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">
                        {dict.templates.emptyTitle}
                    </p>
                    <p className="text-xs text-muted-foreground text-center max-w-[240px] mb-4">
                        {dict.templates.emptyDescription}
                    </p>
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                        onClick={() => {
                            // For now, create a template prompt placeholder
                            // Full creation flow will be implemented in US-004
                            setInput("")
                        }}
                    >
                        <Plus className="w-4 h-4" />
                        {dict.templates.createFirst}
                    </button>
                </div>
            </div>
        )
    }

    // Template list
    return (
        <div className="py-6 px-2 animate-fade-in">
            <div className="text-center mb-6">
                <h2 className="text-lg font-semibold text-foreground mb-2">
                    {dict.templates.title}
                </h2>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    {dict.templates.subtitle}
                </p>
            </div>

            <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                    {dict.templates.myTemplates}
                </p>

                <div className="grid gap-2">
                    {loading
                        ? // Loading skeleton
                          Array.from({ length: 3 }).map((_, i) => (
                              <div
                                  key={`skeleton-${String(i)}`}
                                  className="w-full p-4 rounded-xl border border-border/60 bg-card animate-pulse"
                              >
                                  <div className="flex items-start gap-3">
                                      <div className="w-9 h-9 rounded-lg bg-muted shrink-0" />
                                      <div className="flex-1 space-y-2">
                                          <div className="h-4 bg-muted rounded w-2/3" />
                                          <div className="h-3 bg-muted rounded w-1/2" />
                                      </div>
                                  </div>
                              </div>
                          ))
                        : templates.map((template) => (
                              <button
                                  key={template.id}
                                  type="button"
                                  onClick={() => setInput(template.prompt)}
                                  className="group w-full text-left p-4 rounded-xl border border-border/60 bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 hover:shadow-sm"
                              >
                                  <div className="flex items-start gap-3">
                                      <div
                                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                                              template.pinned
                                                  ? "bg-primary/20 group-hover:bg-primary/25"
                                                  : "bg-primary/10 group-hover:bg-primary/15"
                                          }`}
                                      >
                                          <FileText className="w-4 h-4 text-primary" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2">
                                              <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                                                  {template.title}
                                              </h3>
                                              {template.pinned && (
                                                  <Bookmark className="w-3 h-3 text-primary fill-primary shrink-0" />
                                              )}
                                          </div>
                                          {template.description && (
                                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                                  {template.description}
                                              </p>
                                          )}
                                          <div className="flex items-center gap-3 mt-1.5">
                                              {template.runCount > 0 ? (
                                                  <span className="text-[11px] text-muted-foreground">
                                                      {dict.templates.usedCount.replace(
                                                          "{count}",
                                                          String(
                                                              template.runCount,
                                                          ),
                                                      )}
                                                  </span>
                                              ) : (
                                                  <span className="text-[11px] text-muted-foreground">
                                                      {dict.templates.neverUsed}
                                                  </span>
                                              )}
                                              <span className="text-[11px] text-muted-foreground">
                                                  {formatLastUsed(
                                                      template.lastUsedAt,
                                                      dict.templates.neverUsed,
                                                  )}
                                              </span>
                                              {template.tags &&
                                                  template.tags.length > 0 && (
                                                      <span className="text-[11px] text-muted-foreground truncate">
                                                          {template.tags
                                                              .slice(0, 3)
                                                              .join(", ")}
                                                      </span>
                                                  )}
                                          </div>
                                      </div>
                                  </div>
                              </button>
                          ))}
                </div>
            </div>
        </div>
    )
}
