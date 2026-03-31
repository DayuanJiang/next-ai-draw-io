"use client"

import { Bookmark, Plus } from "lucide-react"
import { useState } from "react"
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
    type TemplateCreateInput,
} from "@/lib/template-storage"

interface TemplateCreateDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
    initialPrompt?: string
}

export function TemplateCreateDialog({
    open,
    onOpenChange,
    onSuccess,
    initialPrompt = "",
}: TemplateCreateDialogProps) {
    const dict = useDictionary()
    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [prompt, setPrompt] = useState(initialPrompt)
    const [tags, setTags] = useState("")
    const [pinned, setPinned] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Reset form when dialog opens
    const handleOpenChange = (newOpen: boolean) => {
        if (newOpen) {
            // Reset form when opening
            setTitle("")
            setDescription("")
            setPrompt(initialPrompt)
            setTags("")
            setPinned(false)
            setError(null)
        }
        onOpenChange(newOpen)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const trimmedPrompt = prompt.trim()
        if (!trimmedPrompt) {
            setError(dict.templates.promptRequired)
            return
        }

        setIsSubmitting(true)
        setError(null)

        try {
            const input: TemplateCreateInput = {
                prompt: trimmedPrompt,
                title: title.trim() || undefined,
                description: description.trim() || undefined,
                tags: tags
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                pinned,
            }

            const template = await createTemplate(input)
            if (template) {
                onSuccess()
                onOpenChange(false)
            } else {
                setError(dict.templates.createFailed)
            }
        } catch (err) {
            console.error("Failed to create template:", err)
            setError(dict.templates.createFailed)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="w-5 h-5" />
                            {dict.templates.createTitle}
                        </DialogTitle>
                        <DialogDescription>
                            {dict.templates.createDescription}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* Prompt field - required */}
                        <div className="space-y-2">
                            <Label htmlFor="prompt" className="text-foreground">
                                {dict.templates.promptLabel}
                                <span className="text-destructive ml-1">*</span>
                            </Label>
                            <Textarea
                                id="prompt"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={dict.templates.promptPlaceholder}
                                className="min-h-[100px] resize-none"
                                required
                            />
                        </div>

                        {/* Title field - optional */}
                        <div className="space-y-2">
                            <Label htmlFor="title" className="text-foreground">
                                {dict.templates.titleLabel}
                            </Label>
                            <Input
                                id="title"
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
                                htmlFor="description"
                                className="text-foreground"
                            >
                                {dict.templates.descriptionLabel}
                            </Label>
                            <Textarea
                                id="description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder={
                                    dict.templates.descriptionPlaceholder
                                }
                                className="min-h-[60px] resize-none"
                            />
                        </div>

                        {/* Tags field - optional */}
                        <div className="space-y-2">
                            <Label htmlFor="tags" className="text-foreground">
                                {dict.templates.tagsLabel}
                            </Label>
                            <Input
                                id="tags"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                placeholder={dict.templates.tagsPlaceholder}
                            />
                            <p className="text-xs text-muted-foreground">
                                {dict.templates.tagsHint}
                            </p>
                        </div>

                        {/* Pinned switch */}
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label
                                    htmlFor="pinned"
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
                                id="pinned"
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
                                : dict.templates.createButton}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
