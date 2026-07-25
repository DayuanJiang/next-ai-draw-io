"use client"

import {
    Bookmark,
    Copy,
    Download,
    Edit2,
    FileText,
    Plus,
    Search,
    Trash2,
    Upload,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
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
    exportTemplates,
    getAllTemplates,
    importTemplates,
    incrementClickCount,
    incrementRunCount,
    searchTemplates,
    type Template,
    updateTemplate,
    validateImportData,
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

    try {
        const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
        if (diffMins < 1) return rtf.format(0, "minute")
        if (diffMins < 60) return rtf.format(-diffMins, "minute")
        if (diffHours < 24) return rtf.format(-diffHours, "hour")
        if (diffDays < 7) return rtf.format(-diffDays, "day")
    } catch {
        // Fallback if Intl.RelativeTimeFormat is not available
        if (diffMins < 1) return "<1m ago"
        if (diffMins < 60) return `${diffMins}m ago`
        if (diffHours < 24) return `${diffHours}h ago`
        if (diffDays < 7) return `${diffDays}d ago`
    }

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
    const [searchQuery, setSearchQuery] = useState("")
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [importMessage, setImportMessage] = useState<{
        type: "success" | "error"
        text: string
    } | null>(null)

    const loadTemplates = useCallback(async () => {
        const result = await getAllTemplates()
        setTemplates(result)
        setLoading(false)
    }, [])

    // Filter templates by search query
    const filteredTemplates = searchQuery.trim()
        ? searchTemplates(templates, searchQuery)
        : templates

    useEffect(() => {
        loadTemplates()
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
        const duplicated = await duplicateTemplate(
            template.id,
            dict.templates.copySuffix || "(copy)",
        )
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

    const handleTogglePin = async (template: Template) => {
        const updated = await updateTemplate(template.id, {
            pinned: !template.pinned,
        })
        if (updated) {
            loadTemplates()
        }
    }

    // Handle template card click - send directly or show confirmation
    const handleTemplateClick = async (template: Template) => {
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
        // Increment click count only when actually sending
        await incrementClickCount(template.id)
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

    // Export templates to JSON file
    const handleExport = () => {
        if (templates.length === 0) {
            setImportMessage({
                type: "error",
                text: dict.templates.exportEmpty || "No templates to export",
            })
            return
        }

        try {
            const exportData = exportTemplates(templates)
            const json = JSON.stringify(exportData, null, 2)
            const blob = new Blob([json], { type: "application/json" })
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `templates-${new Date().toISOString().split("T")[0]}.json`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)

            setImportMessage({
                type: "success",
                text: dict.templates.exportSuccess.replace(
                    "{count}",
                    String(templates.length),
                ),
            })
            setTimeout(() => setImportMessage(null), 3000)
        } catch (error) {
            console.error("Failed to export templates:", error)
            setImportMessage({
                type: "error",
                text: `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            })
        }
    }

    // Import templates from JSON file
    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) {
            setImportMessage({
                type: "error",
                text:
                    dict.templates.importNoFile || "Please select a JSON file",
            })
            return
        }

        try {
            const text = await file.text()
            const data = JSON.parse(text)

            // Validate import data
            const validation = validateImportData(data)
            if (!validation.valid) {
                setImportMessage({
                    type: "error",
                    text: dict.templates.importFailed.replace(
                        "{error}",
                        validation.error || "Invalid data",
                    ),
                })
                return
            }

            // Import templates with dedup-append strategy
            const result = await importTemplates(data.templates, templates)

            // Reload template list
            await loadTemplates()

            setImportMessage({
                type: "success",
                text: dict.templates.importSuccess
                    .replace("{imported}", String(result.imported))
                    .replace("{skipped}", String(result.skipped)),
            })
            setTimeout(() => setImportMessage(null), 5000)
        } catch (error) {
            console.error("Failed to import templates:", error)
            setImportMessage({
                type: "error",
                text: dict.templates.importFailed.replace(
                    "{error}",
                    error instanceof Error ? error.message : "Unknown error",
                ),
            })
        } finally {
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = ""
            }
        }
    }

    // Empty state: no templates at all
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
        <div className="py-2 px-2 animate-fade-in">
            <div className="space-y-3">
                {/* Search bar */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={dict.templates.searchPlaceholder}
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border/60 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                    />
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setCreateDialogOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        {dict.templates.createButton}
                    </button>
                    <div className="flex-1" />
                    <button
                        type="button"
                        onClick={handleExport}
                        disabled={templates.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={dict.templates.exportTemplates}
                    >
                        <Download className="w-3.5 h-3.5" />
                        {dict.templates.exportTemplates}
                    </button>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title={dict.templates.importTemplates}
                    >
                        <Upload className="w-3.5 h-3.5" />
                        {dict.templates.importTemplates}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json,.json"
                        onChange={handleImport}
                        className="hidden"
                    />
                </div>

                {/* Import message */}
                {importMessage && (
                    <div
                        className={`text-xs px-3 py-2 rounded-lg ${
                            importMessage.type === "success"
                                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                    >
                        {importMessage.text}
                    </div>
                )}

                <div className="space-y-2">
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
                        : filteredTemplates.length === 0
                          ? // Search empty state
                            !loading && (
                                <div className="flex flex-col items-center justify-center py-6 px-4">
                                    <Search className="w-8 h-8 text-muted-foreground/40 mb-2" />
                                    <p className="text-sm text-muted-foreground text-center">
                                        {dict.templates.searchNoResults}
                                    </p>
                                </div>
                            )
                          : filteredTemplates.map((template) => (
                                // biome-ignore lint/a11y/useSemanticElements: Cannot use button - has nested action buttons which causes hydration error
                                <div
                                    key={template.id}
                                    className="group w-full flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 cursor-pointer text-left"
                                    onClick={() =>
                                        handleTemplateClick(template)
                                    }
                                    onKeyDown={(e) => {
                                        if (
                                            e.key === "Enter" ||
                                            e.key === " "
                                        ) {
                                            e.preventDefault()
                                            handleTemplateClick(template)
                                        }
                                    }}
                                    role="button"
                                    tabIndex={0}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <div className="text-sm font-medium truncate">
                                                {template.title}
                                            </div>
                                            {template.pinned && (
                                                <Bookmark className="w-3 h-3 text-primary fill-primary shrink-0" />
                                            )}
                                        </div>
                                        {template.description && (
                                            <div className="text-xs text-muted-foreground truncate">
                                                {template.description}
                                            </div>
                                        )}
                                    </div>
                                    {/* Actions and stats */}
                                    <div className="relative shrink-0">
                                        <div className="text-[11px] text-muted-foreground whitespace-nowrap group-hover:invisible">
                                            {template.runCount > 0
                                                ? `${dict.templates.usedCount.replace("{count}", String(template.runCount))} · ${formatLastUsed(template.lastUsedAt, dict.templates.neverUsed)}`
                                                : dict.templates.neverUsed}
                                        </div>
                                        <div className="absolute inset-0 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleTogglePin(template)
                                                }}
                                                className={`p-1.5 rounded-lg transition-all ${
                                                    template.pinned
                                                        ? "text-primary hover:text-primary/80 hover:bg-primary/10"
                                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                                }`}
                                                title={
                                                    template.pinned
                                                        ? dict.templates
                                                              .unpin || "Unpin"
                                                        : dict.templates.pin ||
                                                          "Pin"
                                                }
                                            >
                                                <Bookmark
                                                    className={`w-4 h-4 ${template.pinned ? "fill-current" : ""}`}
                                                />
                                            </button>
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
