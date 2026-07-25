"use client"

import { Bookmark, Edit2 } from "lucide-react"
import { useEffect, useState } from "react"
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
import { type Template, updateTemplate } from "@/lib/template-storage"

interface TemplateEditDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    template: Template | null
    onSuccess: () => void
}

export function TemplateEditDialog({
    open,
    onOpenChange,
    template,
    onSuccess,
}: TemplateEditDialogProps) {
    const dict = useDictionary()
    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [prompt, setPrompt] = useState("")
    const [pinned, setPinned] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Populate form when template changes
    useEffect(() => {
        if (template) {
            setTitle(template.title || "")
            setDescription(template.description || "")
            setPrompt(template.prompt || "")
            setPinned(template.pinned || false)
            setError(null)
        }
    }, [template])

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setError(null)
        }
        onOpenChange(newOpen)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!template) return

        const trimmedPrompt = prompt.trim()
        if (!trimmedPrompt) {
            setError(dict.templates.promptRequired)
            return
        }

        setIsSubmitting(true)
        setError(null)

        try {
            const updates: Partial<Omit<Template, "id" | "createdAt">> = {
                prompt: trimmedPrompt,
                title: title.trim() || template.title,
                description: description.trim() || undefined,
                pinned,
            }

            const updated = await updateTemplate(template.id, updates)
            if (updated) {
                onSuccess()
                onOpenChange(false)
            } else {
                setError(dict.templates.updateFailed)
            }
        } catch (err) {
            console.error("Failed to update template:", err)
            setError(dict.templates.updateFailed)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[500px] overflow-hidden">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Edit2 className="w-5 h-5" />
                            {dict.templates.editTitle}
                        </DialogTitle>
                        <DialogDescription>
                            {dict.templates.editDescription}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Prompt field - required */}
                        <div className="space-y-2">
                            <Label
                                htmlFor="edit-prompt"
                                className="text-foreground"
                            >
                                {dict.templates.promptLabel}
                                <span className="text-destructive ml-1">*</span>
                            </Label>
                            <Textarea
                                id="edit-prompt"
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
                                htmlFor="edit-title"
                                className="text-foreground"
                            >
                                {dict.templates.titleLabel}
                            </Label>
                            <Input
                                id="edit-title"
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
                                htmlFor="edit-description"
                                className="text-foreground"
                            >
                                {dict.templates.descriptionLabel}
                            </Label>
                            <Textarea
                                id="edit-description"
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
                                    htmlFor="edit-pinned"
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
                                id="edit-pinned"
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
                                : dict.common.save}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
