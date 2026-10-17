"use client"

import { Bookmark, Edit2, Plus } from "lucide-react"
import { useEffect, useId, useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useDictionary } from "@/hooks/use-dictionary"
import {
    createTemplate,
    type Template,
    updateTemplate,
} from "@/lib/template-storage"

interface TemplateFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
    /** The template to edit; without one the dialog creates a new template */
    template?: Template | null
    initialPrompt?: string
}

// One form for creating and editing a template
export function TemplateFormDialog({
    open,
    onOpenChange,
    onSuccess,
    template,
    initialPrompt = "",
}: TemplateFormDialogProps) {
    const dict = useDictionary()
    const id = useId()
    const isEdit = !!template
    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [prompt, setPrompt] = useState("")
    const [pinned, setPinned] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Fill the form each time the dialog opens, dropping cancelled edits
    useEffect(() => {
        if (!open) return
        setTitle(template?.title || "")
        setDescription(template?.description || "")
        setPrompt(template ? template.prompt || "" : initialPrompt)
        setPinned(template?.pinned || false)
        setError(null)
    }, [open, template, initialPrompt])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        // React submit events bubble through the portal; keep them away from
        // the chat form this dialog may be rendered in
        e.stopPropagation()

        const trimmedPrompt = prompt.trim()
        if (!trimmedPrompt) {
            setError(dict.templates.promptRequired)
            return
        }

        setIsSubmitting(true)
        setError(null)

        const failed = isEdit
            ? dict.templates.updateFailed
            : dict.templates.createFailed
        try {
            const fields = {
                prompt: trimmedPrompt,
                description: description.trim() || undefined,
                pinned,
            }
            // An emptied title keeps the old one when editing; a new template
            // gets a default title from its prompt
            const result = template
                ? await updateTemplate(template.id, {
                      ...fields,
                      title: title.trim() || template.title,
                  })
                : await createTemplate({
                      ...fields,
                      title: title.trim() || undefined,
                  })
            if (result) {
                onSuccess()
                onOpenChange(false)
            } else {
                setError(failed)
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] overflow-hidden">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {isEdit ? (
                                <Edit2 className="w-5 h-5" />
                            ) : (
                                <Plus className="w-5 h-5" />
                            )}
                            {isEdit
                                ? dict.templates.editTitle
                                : dict.templates.createTitle}
                        </DialogTitle>
                        <DialogDescription>
                            {isEdit
                                ? dict.templates.editDescription
                                : dict.templates.createDescription}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Prompt field - required */}
                        <div className="space-y-2">
                            <Label
                                htmlFor={`${id}-prompt`}
                                className="text-foreground"
                            >
                                {dict.templates.promptLabel}
                                <span className="text-destructive ml-1">*</span>
                            </Label>
                            <Textarea
                                id={`${id}-prompt`}
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={dict.templates.promptPlaceholder}
                                className="min-h-[100px] resize-none break-words"
                                required
                            />
                        </div>

                        {/* Title field - optional */}
                        <div className="space-y-2">
                            <Label
                                htmlFor={`${id}-title`}
                                className="text-foreground"
                            >
                                {dict.templates.titleLabel}
                            </Label>
                            <Input
                                id={`${id}-title`}
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={dict.templates.titlePlaceholder}
                            />
                            <p className="text-xs text-muted-foreground">
                                {dict.templates.titleHint}
                            </p>
                        </div>

                        {/* Description field - optional */}
                        <div className="space-y-2">
                            <Label
                                htmlFor={`${id}-description`}
                                className="text-foreground"
                            >
                                {dict.templates.descriptionLabel}
                            </Label>
                            <Textarea
                                id={`${id}-description`}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder={
                                    dict.templates.descriptionPlaceholder
                                }
                                className="min-h-[60px] resize-none"
                            />
                        </div>

                        {/* Pinned switch */}
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label
                                    htmlFor={`${id}-pinned`}
                                    className="flex items-center gap-2 text-foreground"
                                >
                                    <Bookmark className="w-4 h-4" />
                                    {dict.templates.pinnedLabel}
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    {dict.templates.pinnedHint}
                                </p>
                            </div>
                            <Switch
                                id={`${id}-pinned`}
                                checked={pinned}
                                onCheckedChange={setPinned}
                            />
                        </div>

                        {/* Error message */}
                        {error && (
                            <p className="text-sm text-destructive">{error}</p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                        >
                            {dict.common.cancel}
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting
                                ? dict.common.loading
                                : isEdit
                                  ? dict.common.save
                                  : dict.templates.createButton}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
