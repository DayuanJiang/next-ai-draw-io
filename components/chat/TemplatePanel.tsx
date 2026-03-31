"use client"

import { Bookmark, Copy, Edit2, FileText, Plus, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useDictionary } from "@/hooks/use-dictionary"
import {
    deleteTemplate,
    duplicateTemplate,
    getAllTemplates,
    incrementClickCount,
    incrementRunCount,
    sortTemplates,
    type Template,
} from "@/lib/template-storage"
import { TemplateCreateDialog } from "./TemplateCreateDialog"
import { TemplateEditDialog } from "./TemplateEditDialog"

interface TemplatePanelProps {
    setInput: (input: string) => void
    onSendTemplate?: (template: Template) => void
    currentInput?: string
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

export function TemplatePanel({
    setInput,
    onSendTemplate,
    currentInput = "",
}: TemplatePanelProps) {
    const dict = useDictionary()
    const [templates, setTemplates] = useState<Template[]>([])
    const [loading, setLoading] = useState(true)
    const [createDialogOpen, setCreateDialogOpen] = useState(false)
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [templateToEdit, setTemplateToEdit] = useState<Template | null>(null)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [templateToDelete, setTemplateToDelete] = useState<Template | null>(
        null,
    )
    const [confirmSendDialogOpen, setConfirmSendDialogOpen] = useState(false)
    const [templateToSend, setTemplateToSend] = useState<Template | null>(null)

    const loadTemplates = useCallback(async () => {
        const result = await getAllTemplates()
        setTemplates(sortTemplates(result))
        setLoading(false)
    }, [])

    useEffect(() => {
        let mounted = true
        loadTemplates().then(() => {
            if (!mounted) return
        })
        return () => {
            mounted = false
        }
    }, [loadTemplates])

    const handleCreateSuccess = () => {
        loadTemplates()
    }

    const handleEditSuccess = () => {
        loadTemplates()
    }

    const handleEdit = (template: Template) => {
        setTemplateToEdit(template)
        setEditDialogOpen(true)
    }

    const handleDuplicate = async (template: Template) => {
        const duplicated = await duplicateTemplate(template.id)
        if (duplicated) {
            loadTemplates()
        }
    }

    const handleDeleteClick = (template: Template) => {
        setTemplateToDelete(template)
        setDeleteDialogOpen(true)
    }

    const handleDeleteConfirm = async () => {
        if (!templateToDelete) return
        const success = await deleteTemplate(templateToDelete.id)
        if (success) {
            loadTemplates()
        }
        setDeleteDialogOpen(false)
        setTemplateToDelete(null)
    }

    // Handle template card click - send directly or show confirmation
    const handleTemplateClick = async (template: Template) => {
        // Always increment click count when user interacts with template
        await incrementClickCount(template.id)

        // If there's unsent content in the input, show confirmation dialog
        if (currentInput.trim()) {
            setTemplateToSend(template)
            setConfirmSendDialogOpen(true)
            return
        }

        // No unsent content, send directly
        await sendTemplate(template)
    }

    // Actually send the template
    const sendTemplate = async (template: Template) => {
        if (onSendTemplate) {
            // Increment run count and update lastUsedAt
            await incrementRunCount(template.id)
            // Reload to show updated stats
            loadTemplates()
            // Call the send callback
            onSendTemplate(template)
        } else {
            // Fallback: just fill the input if no send callback provided
            setInput(template.prompt)
        }
        setConfirmSendDialogOpen(false)
        setTemplateToSend(null)
    }

    // Handle confirmation dialog - user confirmed to send template
    const handleConfirmSend = async () => {
        if (!templateToSend) return
        await sendTemplate(templateToSend)
    }

    // Handle cancel - close dialog without sending
    const handleCancelSend = () => {
        setConfirmSendDialogOpen(false)
        setTemplateToSend(null)
    }

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
                        onClick={() => setCreateDialogOpen(true)}
                    >
                        <Plus className="w-4 h-4" />
                        {dict.templates.createFirst}
                    </button>

                    <TemplateCreateDialog
                        open={createDialogOpen}
                        onOpenChange={setCreateDialogOpen}
                        onSuccess={handleCreateSuccess}
                    />
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
                <div className="flex items-center justify-between px-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {dict.templates.myTemplates}
                    </p>
                    <button
                        type="button"
                        onClick={() => setCreateDialogOpen(true)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                    >
                        <Plus className="w-3 h-3" />
                        {dict.templates.createButton}
                    </button>
                </div>

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
                              // biome-ignore lint/a11y/useSemanticElements: Cannot use button - has nested action buttons which causes hydration error
                              <div
                                  key={template.id}
                                  className="group w-full text-left p-4 rounded-xl border border-border/60 bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 hover:shadow-sm cursor-pointer"
                                  onClick={() => handleTemplateClick(template)}
                                  onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault()
                                          handleTemplateClick(template)
                                      }
                                  }}
                                  role="button"
                                  tabIndex={0}
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
                                      <div className="flex-1 min-w-0">
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
                                      {/* Actions - visible on hover */}
                                      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                          <button
                                              type="button"
                                              onClick={(e) => {
                                                  e.stopPropagation()
                                                  handleEdit(template)
                                              }}
                                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                                              title={dict.common.edit}
                                          >
                                              <Edit2 className="w-4 h-4" />
                                          </button>
                                          <button
                                              type="button"
                                              onClick={(e) => {
                                                  e.stopPropagation()
                                                  handleDuplicate(template)
                                              }}
                                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                                              title={
                                                  dict.templates.duplicate ||
                                                  "Duplicate"
                                              }
                                          >
                                              <Copy className="w-4 h-4" />
                                          </button>
                                          <button
                                              type="button"
                                              onClick={(e) => {
                                                  e.stopPropagation()
                                                  handleDeleteClick(template)
                                              }}
                                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                                              title={dict.common.delete}
                                          >
                                              <Trash2 className="w-4 h-4" />
                                          </button>
                                      </div>
                                  </div>
                              </div>
                          ))}
                </div>
            </div>

            <TemplateCreateDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                onSuccess={handleCreateSuccess}
            />

            <TemplateEditDialog
                open={editDialogOpen}
                onOpenChange={setEditDialogOpen}
                template={templateToEdit}
                onSuccess={handleEditSuccess}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
            >
                <AlertDialogContent className="max-w-sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {dict.templates.deleteTitle ||
                                "Delete this template?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {dict.templates.deleteDescription ||
                                "This will permanently delete this template. This action cannot be undone."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {dict.common.cancel}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            className="border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-400"
                        >
                            {dict.common.delete}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Confirm Send Dialog - when there's unsent input */}
            <AlertDialog
                open={confirmSendDialogOpen}
                onOpenChange={setConfirmSendDialogOpen}
            >
                <AlertDialogContent className="max-w-sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {dict.templates.confirmSendTitle ||
                                "Replace current input?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {dict.templates.confirmSendDescription ||
                                "You have unsent content in the input. Sending this template will replace it."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleCancelSend}>
                            {dict.common.cancel}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmSend}>
                            {dict.templates.confirmSendButton ||
                                "Send Template"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
