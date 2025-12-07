"use client"

import {
    Download,
    FileText,
    History,
    Image as ImageIcon,
    LayoutGrid,
    Loader2,
    PenTool,
    Send,
    Trash2,
    X,
} from "lucide-react"
import Image from "next/image"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { ButtonWithTooltip } from "@/components/button-with-tooltip"
import { ErrorToast } from "@/components/error-toast"
import { HistoryDialog } from "@/components/history-dialog"
import { ResetWarningModal } from "@/components/reset-warning-modal"
import { SaveDialog } from "@/components/save-dialog"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useDiagram } from "@/contexts/diagram-context"
import { FilePreviewList } from "./file-preview-list"

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const MAX_FILES = 5

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
        if (file.size > MAX_FILE_SIZE) {
            errors.push(
                `"${file.name}" is ${formatFileSize(file.size)} (exceeds 2MB)`,
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
    showHistory?: boolean
    onToggleHistory?: (show: boolean) => void
    sessionId?: string
    error?: Error | null
    drawioUi?: "min" | "sketch"
    onToggleDrawioUi?: () => void
}

export function ChatInput({
    input,
    status,
    onSubmit,
    onChange,
    onClearChat,
    files = [],
    onFileChange = () => {},
    showHistory = false,
    onToggleHistory = () => {},
    sessionId,
    error = null,
    drawioUi = "min",
    onToggleDrawioUi = () => {},
}: ChatInputProps) {
    const { diagramHistory, saveDiagramToFile } = useDiagram()
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [showClearDialog, setShowClearDialog] = useState(false)
    const [showSaveDialog, setShowSaveDialog] = useState(false)
    const [showThemeWarning, setShowThemeWarning] = useState(false)

    const [pdfInputEnabled, setPdfInputEnabled] = useState(false)
    const [maxFileSize] = useState(5 * 1024 * 1024)
    const [attachments, setAttachments] = useState<File[]>([])
    const [previewUrls, setPreviewUrls] = useState<string[]>([])

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
            )
            showValidationErrors(errors)
            if (validFiles.length > 0) {
                onFileChange([...files, ...validFiles])
            }
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const filesList = Array.from(e.target.files || [])
        if (filesList.length === 0) return

        const validFiles: File[] = []
        const newPreviewUrls: string[] = []
        const errors: string[] = []

        filesList.forEach((file) => {
            const isImage = file.type.startsWith("image/")
            const isPDF = file.type === "application/pdf"

            if (!isImage && !isPDF) {
                errors.push(`${file.name}: Unsupported file type`)
                return
            }

            if (isPDF && !pdfInputEnabled) {
                errors.push(`${file.name}: PDF upload is not enabled`)
                return
            }

            if (file.size > maxFileSize) {
                errors.push(
                    `${file.name}: File size exceeds ${
                        maxFileSize / (1024 * 1024)
                    }MB limit`,
                )
                return
            }

            validFiles.push(file)

            if (isImage) {
                const url = URL.createObjectURL(file)
                newPreviewUrls.push(url)
            } else {
                newPreviewUrls.push("pdf-placeholder")
            }
        })

        if (errors.length > 0) {
            alert(errors.join("\n"))
        }

        const totalAttachments = attachments.length + validFiles.length
        if (totalAttachments > 5) {
            alert("Maximum 5 files can be attached at once")
            return
        }

        setAttachments((prev) => [...prev, ...validFiles])
        setPreviewUrls((prev) => [...prev, ...newPreviewUrls])

        if (e.target) {
            e.target.value = ""
        }
    }

    const removeAttachment = (index: number) => {
        setAttachments((prev) => prev.filter((_, i) => i !== index))
        setPreviewUrls((prev) => {
            const url = prev[index]
            if (url && url !== "pdf-placeholder") {
                URL.revokeObjectURL(url)
            }
            return prev.filter((_, i) => i !== index)
        })
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

    const handleFileButtonClick = () => {
        triggerFileInput()
    }

    useEffect(() => {
        fetch("/api/config")
            .then((res) => res.json())
            .then((data) => setPdfInputEnabled(Boolean(data.pdfInputEnabled)))
            .catch(() => setPdfInputEnabled(false))
    }, [])

    const getAcceptedFileTypes = () => {
        const imageTypes = "image/png,image/jpeg,image/jpg,image/gif,image/webp"
        const pdfType = "application/pdf"
        return pdfInputEnabled ? `${imageTypes},${pdfType}` : imageTypes
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
        const imageFiles = Array.from(droppedFiles).filter((file) =>
            file.type.startsWith("image/"),
        )

        const { validFiles, errors } = validateFiles(imageFiles, files.length)
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
            {/* File/Attachment previews */}
            {attachments.length > 0 && (
                <div className="mb-3 flex gap-2">
                    {attachments.map((file, index) => (
                        <div
                            key={index}
                            className="relative flex-shrink-0 group"
                        >
                            {file.type.startsWith("image/") ? (
                                <Image
                                    src={previewUrls[index]}
                                    alt={`Preview ${index + 1}`}
                                    width={64}
                                    height={64}
                                    className="rounded-lg object-cover border border-gray-200"
                                />
                            ) : (
                                <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 flex flex-col items-center justify-center">
                                    <FileText className="w-6 h-6 text-gray-400" />
                                    <span className="text-xs text-gray-500 mt-1 truncate max-w-full px-1">
                                        PDF
                                    </span>
                                </div>
                            )}

                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                {(file.size / 1024).toFixed(0)}KB
                            </div>

                            <button
                                onClick={() => removeAttachment(index)}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                                type="button"
                                aria-label="Remove attachment"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
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
                    placeholder="Describe your diagram or paste an image..."
                    disabled={isDisabled}
                    aria-label="Chat input"
                    className="min-h-[60px] max-h-[200px] resize-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
                />

                {/* Action bar */}
                <div className="flex items-center justify-between px-3 py-2 border-t border-border/50">
                    {/* Left actions */}
                    <div className="flex items-center gap-1">
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

                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowThemeWarning(true)}
                            tooltipContent={
                                drawioUi === "min"
                                    ? "Switch to Sketch theme"
                                    : "Switch to Minimal theme"
                            }
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                            {drawioUi === "min" ? (
                                <PenTool className="h-4 w-4" />
                            ) : (
                                <LayoutGrid className="h-4 w-4" />
                            )}
                        </ButtonWithTooltip>

                        <Dialog
                            open={showThemeWarning}
                            onOpenChange={setShowThemeWarning}
                        >
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Switch Theme?</DialogTitle>
                                    <DialogDescription>
                                        Switching themes will reload the diagram
                                        editor and clear any unsaved changes.
                                    </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button
                                        variant="outline"
                                        onClick={() =>
                                            setShowThemeWarning(false)
                                        }
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        onClick={() => {
                                            onClearChat()
                                            onToggleDrawioUi()
                                            setShowThemeWarning(false)
                                        }}
                                    >
                                        Switch Theme
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>

                    {/* Right actions */}
                    <div className="flex items-center gap-1">
                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onToggleHistory(true)}
                            disabled={isDisabled || diagramHistory.length === 0}
                            tooltipContent="Diagram history"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
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
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
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

                        <Button
                            onClick={handleFileButtonClick}
                            variant="ghost"
                            size="icon"
                            disabled={status === "streaming"}
                        >
                            {pdfInputEnabled ? (
                                <FileText className="w-5 h-5" />
                            ) : (
                                <ImageIcon className="w-5 h-5" />
                            )}
                        </Button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={getAcceptedFileTypes()}
                            multiple
                            onChange={handleFileChange}
                            className="hidden"
                            aria-label="Upload files"
                        />

                        <div className="w-px h-5 bg-border mx-1" />

                        <Button
                            type="submit"
                            disabled={isDisabled || !input.trim()}
                            size="sm"
                            className="h-8 px-4 rounded-xl font-medium shadow-sm"
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
