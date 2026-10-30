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
import { useParams } from "next/navigation"
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
import { formatRelativeTime } from "@/lib/relative-time"
import {
    deleteTemplate,
    duplicateTemplate,
    exportTemplates,
    getAllTemplates,
    importTemplates,
    incrementRunCount,
    searchTemplates,
    type Template,
    updateTemplate,
    validateImportData,
} from "@/lib/template-storage"
import { TemplateFormDialog } from "./TemplateFormDialog"

interface TemplatePanelProps {
    /** Puts the template's prompt in the message box */
    onUseTemplate: (template: Template) => void
    currentInput?: string
}

export function TemplatePanel({
    onUseTemplate,
    currentInput = "",
}: TemplatePanelProps) {
    const dict = useDictionary()
    const params = useParams<{ lang: string }>()
    const [templates, setTemplates] = useState<Template[]>([])
    const [loading, setLoading] = useState(true)
    const [createDialogOpen, setCreateDialogOpen] = useState(false)
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [templateToEdit, setTemplateToEdit] = useState<Template | null>(null)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [templateToDelete, setTemplateToDelete] = useState<Template | null>(
        null,
    )
    const [confirmReplaceDialogOpen, setConfirmReplaceDialogOpen] =
        useState(false)
    const [templateToUse, setTemplateToUse] = useState<Template | null>(null)
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
            dict.templates.copySuffix,
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

    // A click puts the prompt in the message box, where the user can change
    // it and send it; text already typed there is replaced only on confirm
    const handleTemplateClick = (template: Template) => {
        if (currentInput.trim()) {
            setTemplateToUse(template)
            setConfirmReplaceDialogOpen(true)
            return
        }
        applyTemplate(template)
    }

    const applyTemplate = (template: Template) => {
        setConfirmReplaceDialogOpen(false)
        setTemplateToUse(null)
        onUseTemplate(template)
        void incrementRunCount(template.id)
    }

    const handleConfirmReplace = () => {
        if (templateToUse) applyTemplate(templateToUse)
    }

    const handleCancelReplace = () => {
        setConfirmReplaceDialogOpen(false)
        setTemplateToUse(null)
    }

    // Export templates to JSON file
    const handleExport = () => {
        if (templates.length === 0) {
            setImportMessage({
                type: "error",
                text: dict.templates.exportEmpty,
            })
            return
        }

        const exportData = exportTemplates(templates)
        const json = JSON.stringify(exportData, null, 2)
        const blob = new Blob([json], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        // Local date as YYYY-MM-DD (toISOString would give UTC)
        a.download = `templates-${new Date().toLocaleDateString("sv-SE")}.json`
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
    }

    // Import templates from JSON file
    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) {
            setImportMessage({
                type: "error",
                text: dict.templates.importNoFile,
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

    // Shared by the empty state and the list, so import works in both
    const importInput = (
        <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
            className="hidden"
        />
    )
    const importMessageBox = importMessage && (
        <div
            className={`text-xs px-3 py-2 rounded-lg ${
                importMessage.type === "success"
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
            }`}
        >
            {importMessage.text}
        </div>
    )

    // Empty state: no templates at all
    if (!loading && templates.length === 0) {
        return (
            <div className="py-6 px-2 animate-fade-in">
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
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        <Upload className="w-3.5 h-3.5" />
                        {dict.templates.importTemplates}
                    </button>
                    {importInput}
                    {importMessageBox && (
                        <div className="mt-3">{importMessageBox}</div>
                    )}

                    <TemplateFormDialog
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
                    {importInput}
                </div>

                {/* Import message */}
                {importMessageBox}

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
                                        // Ignore keys bubbling up from the action buttons
                                        if (e.target !== e.currentTarget) return
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
                                                ? `${dict.templates.usedCount.replace("{count}", String(template.runCount))} · ${template.lastUsedAt ? formatRelativeTime(template.lastUsedAt, params.lang, dict.sessionHistory.justNow) : dict.templates.neverUsed}`
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
                                                        ? dict.templates.unpin
                                                        : dict.templates.pin
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
                                                title={dict.templates.duplicate}
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

            <TemplateFormDialog
                open={createDialogOpen}
                onOpenChange={setCreateDialogOpen}
                onSuccess={handleCreateSuccess}
            />

            <TemplateFormDialog
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
                            {dict.templates.deleteTitle}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {dict.templates.deleteDescription}
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

            {/* Confirm Replace Dialog - when there's unsent input */}
            <AlertDialog
                open={confirmReplaceDialogOpen}
                onOpenChange={setConfirmReplaceDialogOpen}
            >
                <AlertDialogContent className="max-w-sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {dict.templates.confirmReplaceTitle}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {dict.templates.confirmReplaceDescription}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleCancelReplace}>
                            {dict.common.cancel}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmReplace}>
                            {dict.templates.confirmReplaceButton}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
