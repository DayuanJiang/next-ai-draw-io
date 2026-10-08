"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { useDictionary } from "@/hooks/use-dictionary"
import { cn } from "@/lib/utils"

export type ExportFormat = "drawio" | "png" | "svg" | "xmlsvg"

interface SaveDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSave: (filename: string, format: ExportFormat) => void
    defaultFilename: string
}

export function SaveDialog({
    open,
    onOpenChange,
    onSave,
    defaultFilename,
}: SaveDialogProps) {
    const dict = useDictionary()
    const [filename, setFilename] = useState(defaultFilename)
    const [format, setFormat] = useState<ExportFormat>("drawio")

    // The default name each time the dialog opens; a chat title that comes
    // while it is open (the chat is saved meanwhile) keeps what was typed
    const wasOpenRef = useRef(false)
    useEffect(() => {
        if (open && !wasOpenRef.current) setFilename(defaultFilename)
        wasOpenRef.current = open
    }, [open, defaultFilename])

    const handleSave = () => {
        const finalFilename = filename.trim() || defaultFilename
        onSave(finalFilename, format)
        onOpenChange(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Enter that picks an IME candidate (Safari: keyCode 229)
        if (e.nativeEvent.isComposing || e.keyCode === 229) return
        if (e.key === "Enter") {
            e.preventDefault()
            handleSave()
        }
    }

    const FORMAT_OPTIONS = [
        {
            value: "drawio" as const,
            label: dict.save.formats.drawio,
            hint: dict.save.hints.drawio,
            extension: ".drawio",
        },
        {
            value: "png" as const,
            label: dict.save.formats.png,
            hint: dict.save.hints.png,
            extension: ".png",
        },
        {
            value: "svg" as const,
            label: dict.save.formats.svg,
            hint: dict.save.hints.svg,
            extension: ".svg",
        },
        {
            value: "xmlsvg" as const,
            label: dict.save.formats.xmlsvg,
            hint: dict.save.hints.xmlsvg,
            extension: ".drawio.svg",
        },
    ]

    const currentFormat = FORMAT_OPTIONS.find((f) => f.value === format)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{dict.save.title}</DialogTitle>
                    <DialogDescription>
                        {dict.save.description}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div
                        role="radiogroup"
                        aria-label={dict.save.format}
                        className="grid grid-cols-2 gap-2"
                    >
                        {FORMAT_OPTIONS.map((opt) => (
                            // biome-ignore lint/a11y/useSemanticElements: styled radio tile
                            <button
                                key={opt.value}
                                type="button"
                                role="radio"
                                aria-checked={format === opt.value}
                                onClick={() => setFormat(opt.value)}
                                className={cn(
                                    "rounded-lg border border-border p-3 text-left transition-colors hover:border-foreground/30",
                                    format === opt.value &&
                                        "border-foreground bg-accent",
                                )}
                            >
                                <span className="block text-[13px] font-medium text-foreground">
                                    {opt.label}
                                </span>
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {opt.hint}
                                </span>
                            </button>
                        ))}
                    </div>
                    <div className="space-y-2">
                        <label
                            htmlFor="export-filename"
                            className="text-sm font-medium"
                        >
                            {dict.save.filename}
                        </label>
                        {/* One field: the name, then its extension */}
                        <div className="flex h-9 items-center overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring/40">
                            <input
                                id="export-filename"
                                value={filename}
                                onChange={(e) => setFilename(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={dict.save.filenamePlaceholder}
                                autoFocus
                                onFocus={(e) => e.target.select()}
                                className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                            />
                            <span className="shrink-0 pr-3 text-sm text-muted-foreground">
                                {currentFormat?.extension || ".drawio"}
                            </span>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        {dict.common.cancel}
                    </Button>
                    <Button onClick={handleSave}>
                        {dict.workspace.export}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
