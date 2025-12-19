"use client"

import {
    Download,
    History,
    Image as ImageIcon,
    Loader2,
    Send,
    Trash2,
} from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { ButtonWithTooltip } from "@/components/button-with-tooltip"
import { ErrorToast } from "@/components/error-toast"
import { HistoryDialog } from "@/components/history-dialog"
import { ResetWarningModal } from "@/components/reset-warning-modal"
import { SaveDialog } from "@/components/save-dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { useDiagram } from "@/contexts/diagram-context"
import { isPdfFile, isTextFile } from "@/lib/pdf-utils"
import { FilePreviewList } from "./file-preview-list"

const MAX_IMAGE_SIZE = 2 * 1024 * 1024 // 2MB
const MAX_FILES = 5

function isValidFileType(file: File): boolean {
    return file.type.startsWith("image/") || isPdfFile(file) || isTextFile(file)
}

function formatFileSize(bytes: number): string {
    const mb = bytes / 1024 / 1024
    if (mb < 0.01) return `${(bytes / 1024).toFixed(0)}KB`
    return `${mb.toFixed(2)}MB`
}

function showErrorToast(message: React.ReactNode) {
    toast.custom(
        (t) => (
            <ErrorToast message={message} onDismiss={() => toast.dismiss(t)} />
        ),
        { duration: 5000 },
    )
}

interface ValidationResult {
    validFiles: File[]
    errors: string[]
}

function validateFiles(
    newFiles: File[],
    existingCount: number,
    imageSupported: boolean,
): ValidationResult {
    const errors: string[] = []
    const validFiles: File[] = []

    const availableSlots = MAX_FILES - existingCount

    if (availableSlots <= 0) {
        errors.push(`Maximum ${MAX_FILES} files allowed`)
        return { validFiles, errors }
    }

    for (const file of newFiles) {
        if (validFiles.length >= availableSlots) {
            errors.push(`Only ${availableSlots} more file(s) allowed`)
            break
        }
        if (
            !isValidFileType(file) ||
            (!imageSupported && file.type.startsWith("image/"))
        ) {
            errors.push(`"${file.name}" is not a supported file type`)
            continue
        }
        // Only check size for images (PDFs/text files are extracted client-side, so file size doesn't matter)
        const isExtractedFile = isPdfFile(file) || isTextFile(file)
        if (!isExtractedFile && file.size > MAX_IMAGE_SIZE) {
            const maxSizeMB = MAX_IMAGE_SIZE / 1024 / 1024
            errors.push(
                `"${file.name}" is ${formatFileSize(file.size)} (exceeds ${maxSizeMB}MB)`,
            )
        } else {
            validFiles.push(file)
        }
    }

    return { validFiles, errors }
}

function showValidationErrors(errors: string[]) {
    if (errors.length === 0) return

    if (errors.length === 1) {
        showErrorToast(
            <span className="text-muted-foreground">{errors[0]}</span>,
        )
    } else {
        showErrorToast(
            <div className="flex flex-col gap-1">
                <span className="font-medium">
                    {errors.length} files rejected:
                </span>
                <ul className="text-muted-foreground text-xs list-disc list-inside">
                    {errors.slice(0, 3).map((err) => (
                        <li key={err}>{err}</li>
                    ))}
                    {errors.length > 3 && (
                        <li>...and {errors.length - 3} more</li>
                    )}
                </ul>
            </div>,
        )
    }
}

interface ChatInputProps {
    input: string
    status: "submitted" | "streaming" | "ready" | "error"
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
    onClearChat: () => void
    files?: File[]
    onFileChange?: (files: File[]) => void
    pdfData?: Map<
        File,
        { text: string; charCount: number; isExtracting: boolean }
    >
    showHistory?: boolean
    onToggleHistory?: (show: boolean) => void
    sessionId?: string
    error?: Error | null
    minimalStyle?: boolean
    onMinimalStyleChange?: (value: boolean) => void
    imageSupported?: boolean
}

export function ChatInput({
    input,
    status,
    onSubmit,
    onChange,
    onClearChat,
    files = [],
    onFileChange = () => {},
    pdfData = new Map(),
    showHistory = false,
    onToggleHistory = () => {},
    sessionId,
    error = null,
    minimalStyle = false,
    onMinimalStyleChange = () => {},
    imageSupported = true,
}: ChatInputProps) {
    const {
        diagramHistory,
        saveDiagramToFile,
        showSaveDialog,
        setShowSaveDialog,
    } = useDiagram()
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [showClearDialog, setShowClearDialog] = useState(false)

    // Allow retry when there's an error (even if status is still "streaming" or "submitted")
    const isDisabled =
        (status === "streaming" || status === "submitted") && !error

    const adjustTextareaHeight = useCallback(() => {
        const textarea = textareaRef.current
        if (textarea) {
            textarea.style.height = "auto"
            textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
        }
    }, [])

    // Handle programmatic input changes (e.g., setInput("") after form submission)
    useEffect(() => {
        adjustTextareaHeight()
    }, [input, adjustTextareaHeight])

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e)
        adjustTextareaHeight()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault()
            const form = e.currentTarget.closest("form")
            if (form && input.trim() && !isDisabled) {
                form.requestSubmit()
            }
        }
    }

    const handlePaste = async (e: React.ClipboardEvent) => {
        if (isDisabled) return

        const items = e.clipboardData.items
        const imageItems = Array.from(items).filter((item) =>
            item.type.startsWith("image/"),
        )

        if (imageItems.length > 0) {
            const imageFiles = (
                await Promise.all(
                    imageItems.map(async (item, index) => {
                        const file = item.getAsFile()
                        if (!file) return null
                        return new File(
                            [file],
                            `pasted-image-${Date.now()}-${index}.${file.type.split("/")[1]}`,
                            { type: file.type },
                        )
                    }),
                )
            ).filter((f): f is File => f !== null)

            const { validFiles, errors } = validateFiles(
                imageFiles,
                files.length,
                imageSupported,
            )
            showValidationErrors(errors)
            if (validFiles.length > 0) {
                onFileChange([...files, ...validFiles])
            }
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = Array.from(e.target.files || [])
        const { validFiles, errors } = validateFiles(
            newFiles,
            files.length,
            imageSupported,
        )
        showValidationErrors(errors)
        if (validFiles.length > 0) {
            onFileChange([...files, ...validFiles])
        }
        // Reset input so same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const handleRemoveFile = (fileToRemove: File) => {
        onFileChange(files.filter((file) => file !== fileToRemove))
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const triggerFileInput = () => {
        fileInputRef.current?.click()
    }

    const handleDragOver = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        if (isDisabled) return

        const droppedFiles = e.dataTransfer.files
        const supportedFiles = Array.from(droppedFiles).filter((file) =>
            isValidFileType(file),
        )

        const { validFiles, errors } = validateFiles(
            supportedFiles,
            files.length,
            imageSupported,
        )
        showValidationErrors(errors)
        if (validFiles.length > 0) {
            onFileChange([...files, ...validFiles])
        }
    }

    const handleClear = () => {
        onClearChat()
        setShowClearDialog(false)
    }

    return (
        <form
            onSubmit={onSubmit}
            className={`w-full transition-all duration-200 ${
                isDragging
                    ? "ring-2 ring-primary ring-offset-2 rounded-2xl"
                    : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* File previews */}
            {files.length > 0 && (
                <div className="mb-3">
                    <FilePreviewList
                        files={files}
                        onRemoveFile={handleRemoveFile}
                        pdfData={pdfData}
                    />
                </div>
            )}

            {/* Input container */}
            <div className="relative rounded-2xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all duration-200">
                <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="Describe your diagram or upload a file..."
                    disabled={isDisabled}
                    aria-label="Chat input"
                    className="min-h-[60px] max-h-[200px] resize-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
                />

                {/* Action bar */}
                <div className="flex items-center justify-between px-3 py-2 border-t border-border/50 bg-muted/20 rounded-b-2xl">
                    {/* Left actions */}
                    <div className="flex items-center gap-1 overflow-x-hidden">
                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowClearDialog(true)}
                            tooltipContent="Clear conversation"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                            <Trash2 className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <ResetWarningModal
                            open={showClearDialog}
                            onOpenChange={setShowClearDialog}
                            onClear={handleClear}
                        />

                        <HistoryDialog
                            showHistory={showHistory}
                            onToggleHistory={onToggleHistory}
                        />

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors">
                                    <Switch
                                        id="minimal-style"
                                        checked={minimalStyle}
                                        onCheckedChange={onMinimalStyleChange}
                                        className="scale-75 data-[state=checked]:bg-primary"
                                    />
                                    <label
                                        htmlFor="minimal-style"
                                        className={`text-xs cursor-pointer select-none font-medium ${
                                            minimalStyle
                                                ? "text-primary"
                                                : "text-muted-foreground"
                                        }`}
                                    >
                                        {minimalStyle ? "Minimal" : "Styled"}
                                    </label>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                                Use minimal for faster generation (no colors)
                            </TooltipContent>
                        </Tooltip>
                    </div>

                    {/* Right actions */}
                    <div className="flex items-center gap-1 overflow-hidden justify-end">
                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onToggleHistory(true)}
                            disabled={isDisabled || diagramHistory.length === 0}
                            tooltipContent="Diagram history"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <History className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowSaveDialog(true)}
                            disabled={isDisabled}
                            tooltipContent="Save diagram"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <Download className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <SaveDialog
                            open={showSaveDialog}
                            onOpenChange={setShowSaveDialog}
                            onSave={(filename, format) =>
                                saveDiagramToFile(filename, format, sessionId)
                            }
                            defaultFilename={`diagram-${new Date()
                                .toISOString()
                                .slice(0, 10)}`}
                        />

                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={triggerFileInput}
                            disabled={isDisabled}
                            tooltipContent={
                                imageSupported
                                    ? "Upload file (image, PDF, text)"
                                    : "Upload file (PDF, text)"
                            }
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ImageIcon className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileChange}
                            accept="image/*,.pdf,application/pdf,text/*,.md,.markdown,.json,.csv,.xml,.yaml,.yml,.toml"
                            multiple
                            disabled={isDisabled}
                        />

                        <div className="w-px h-5 bg-border mx-1" />

                        <Button
                            type="submit"
                            disabled={
                                isDisabled ||
                                (!input.trim() && files.length === 0)
                            }
                            size="sm"
                            className={`h-8 px-4 rounded-xl font-medium shadow-sm transition-all duration-300 ${
                                input.trim() || files.length > 0
                                    ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105"
                                    : "bg-muted text-muted-foreground opacity-70"
                            }`}
                            aria-label={
                                isDisabled ? "Sending..." : "Send message"
                            }
                        >
                            {isDisabled ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <Send className="h-4 w-4 mr-1.5" />
                                    Send
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </form>
    )
}
