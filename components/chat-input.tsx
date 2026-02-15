"use client"

import {
    Download,
    History,
    Image as ImageIcon,
    Link,
    Loader2,
    Send,
    Square,
} from "lucide-react"
import type React from "react"
import {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react"
import { toast } from "sonner"
import { ButtonWithTooltip } from "@/components/button-with-tooltip"
import { ErrorToast } from "@/components/error-toast"
import { HistoryDialog } from "@/components/history-dialog"
import { ModelSelector } from "@/components/model-selector"
import { SaveDialog } from "@/components/save-dialog"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { UrlInputDialog } from "@/components/url-input-dialog"
import { useDiagram } from "@/contexts/diagram-context"
import { useDictionary } from "@/hooks/use-dictionary"
import { formatMessage } from "@/lib/i18n/utils"
import { isPdfFile, isTextFile } from "@/lib/pdf-utils"
import { STORAGE_KEYS } from "@/lib/storage"
import type { FlattenedModel } from "@/lib/types/model-config"
import { extractUrlContent, type UrlData } from "@/lib/url-utils"
import { isRealDiagram } from "@/lib/utils"
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
    dict: any,
): ValidationResult {
    const errors: string[] = []
    const validFiles: File[] = []

    const availableSlots = MAX_FILES - existingCount

    if (availableSlots <= 0) {
        errors.push(formatMessage(dict.errors.maxFiles, { max: MAX_FILES }))
        return { validFiles, errors }
    }

    for (const file of newFiles) {
        if (validFiles.length >= availableSlots) {
            errors.push(
                formatMessage(dict.errors.onlyMoreAllowed, {
                    slots: availableSlots,
                }),
            )
            break
        }
        if (!isValidFileType(file)) {
            errors.push(
                formatMessage(dict.errors.unsupportedType, { name: file.name }),
            )
            continue
        }
        // Only check size for images (PDFs/text files are extracted client-side, so file size doesn't matter)
        const isExtractedFile = isPdfFile(file) || isTextFile(file)
        if (!isExtractedFile && file.size > MAX_IMAGE_SIZE) {
            const maxSizeMB = MAX_IMAGE_SIZE / 1024 / 1024
            errors.push(
                formatMessage(dict.errors.fileExceeds, {
                    name: file.name,
                    size: formatFileSize(file.size),
                    max: maxSizeMB,
                }),
            )
        } else {
            validFiles.push(file)
        }
    }

    return { validFiles, errors }
}

function showValidationErrors(errors: string[], dict: any) {
    if (errors.length === 0) return

    if (errors.length === 1) {
        showErrorToast(
            <span className="text-muted-foreground">{errors[0]}</span>,
        )
    } else {
        showErrorToast(
            <div className="flex flex-col gap-1">
                <span className="font-medium">
                    {formatMessage(dict.errors.filesRejected, {
                        count: errors.length,
                    })}
                </span>
                <ul className="text-muted-foreground text-xs list-disc list-inside">
                    {errors.slice(0, 3).map((err) => (
                        <li key={err}>{err}</li>
                    ))}
                    {errors.length > 3 && (
                        <li>
                            {formatMessage(dict.errors.andMore, {
                                count: errors.length - 3,
                            })}
                        </li>
                    )}
                </ul>
            </div>,
        )
    }
}

export interface ChatInputRef {
    focus: () => void
}

interface ChatInputProps {
    input: string
    status: "submitted" | "streaming" | "ready" | "error"
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
    onStop?: () => void
    files?: File[]
    onFileChange?: (files: File[]) => void
    pdfData?: Map<
        File,
        { text: string; charCount: number; isExtracting: boolean }
    >
    urlData?: Map<string, UrlData>
    onUrlChange?: (data: Map<string, UrlData>) => void

    sessionId?: string
    error?: Error | null
    // Model selector props
    models?: FlattenedModel[]
    selectedModelId?: string
    onModelSelect?: (modelId: string | undefined) => void
    onConfigureModels?: () => void
    showUnvalidatedModels?: boolean
    // Focus control props
    shouldFocus?: boolean
    onFocused?: () => void
}

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(
    function ChatInput(
        {
            input,
            status,
            onSubmit,
            onChange,
            onStop,
            files = [],
            onFileChange = () => {},
            pdfData = new Map(),
            urlData,
            onUrlChange,
            sessionId,
            error = null,
            models = [],
            selectedModelId,
            onModelSelect = () => {},
            onConfigureModels,
            showUnvalidatedModels = false,
            shouldFocus = false,
            onFocused,
        },
        ref,
    ) {
        const dict = useDictionary()
        const {
            chartXML,
            diagramHistory,
            saveDiagramToFile,
            showSaveDialog,
            setShowSaveDialog,
        } = useDiagram()

        const textareaRef = useRef<HTMLTextAreaElement>(null)
        const fileInputRef = useRef<HTMLInputElement>(null)
        const [isDragging, setIsDragging] = useState(false)

        // Expose focus method via ref
        useImperativeHandle(ref, () => ({
            focus: () => {
                textareaRef.current?.focus()
            },
        }))

        // Focus the textarea when shouldFocus becomes true
        // Use setTimeout to ensure focus happens after drawio iframe settles
        useEffect(() => {
            if (shouldFocus) {
                const timer = setTimeout(() => {
                    textareaRef.current?.focus()
                    onFocused?.()
                }, 150)
                return () => clearTimeout(timer)
            }
        }, [shouldFocus, onFocused])

        const [showHistory, setShowHistory] = useState(false)
        const [showUrlDialog, setShowUrlDialog] = useState(false)
        const [isExtractingUrl, setIsExtractingUrl] = useState(false)
        const [sendShortcut, setSendShortcut] = useState("ctrl-enter")
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

        // Load send shortcut preference from localStorage and listen for changes
        useEffect(() => {
            const stored = localStorage.getItem(STORAGE_KEYS.sendShortcut)
            if (stored) setSendShortcut(stored)

            const handleChange = (e: CustomEvent<string>) =>
                setSendShortcut(e.detail)
            window.addEventListener(
                "sendShortcutChange",
                handleChange as EventListener,
            )
            return () =>
                window.removeEventListener(
                    "sendShortcutChange",
                    handleChange as EventListener,
                )
        }, [])

        const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            onChange(e)
            adjustTextareaHeight()
        }

        const handleKeyDown = (e: React.KeyboardEvent) => {
            const shouldSend =
                sendShortcut === "enter"
                    ? e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.ctrlKey &&
                      !e.metaKey
                    : (e.metaKey || e.ctrlKey) && e.key === "Enter"

            if (shouldSend) {
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
                    dict,
                )
                showValidationErrors(errors, dict)
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
                dict,
            )
            showValidationErrors(errors, dict)
            if (validFiles.length > 0) {
                onFileChange([...files, ...validFiles])
            }

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
                dict,
            )
            showValidationErrors(errors, dict)
            if (validFiles.length > 0) {
                onFileChange([...files, ...validFiles])
            }
        }

        const handleUrlExtract = async (url: string) => {
            if (!onUrlChange) return

            setIsExtractingUrl(true)

            try {
                const existing = urlData
                    ? new Map(urlData)
                    : new Map<string, UrlData>()
                existing.set(url, {
                    url,
                    title: url,
                    content: "",
                    charCount: 0,
                    isExtracting: true,
                })
                onUrlChange(existing)

                const data = await extractUrlContent(url)

                const newUrlData = new Map(existing)
                newUrlData.set(url, data)
                onUrlChange(newUrlData)

                setShowUrlDialog(false)
            } catch (error) {
                // Remove the URL from the data map on error
                const newUrlData = urlData
                    ? new Map(urlData)
                    : new Map<string, UrlData>()
                newUrlData.delete(url)
                onUrlChange(newUrlData)
                showErrorToast(
                    <span className="text-muted-foreground">
                        {error instanceof Error
                            ? error.message
                            : "Failed to extract URL content"}
                    </span>,
                )
            } finally {
                setIsExtractingUrl(false)
            }
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
                {/* File & URL previews */}
                {(files.length > 0 || (urlData && urlData.size > 0)) && (
                    <div className="mb-3">
                        <FilePreviewList
                            files={files}
                            onRemoveFile={handleRemoveFile}
                            pdfData={pdfData}
                            urlData={urlData}
                            onRemoveUrl={
                                onUrlChange
                                    ? (url) => {
                                          const next = new Map(urlData)
                                          next.delete(url)
                                          onUrlChange(next)
                                      }
                                    : undefined
                            }
                        />
                    </div>
                )}
                <div className="relative rounded-2xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all duration-200">
                    <Textarea
                        ref={textareaRef}
                        value={input}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder={dict.chat.placeholder}
                        disabled={isDisabled}
                        aria-label="Chat input"
                        className="min-h-[60px] max-h-[200px] resize-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60 scrollbar-thin"
                    />

                    <div className="flex items-center justify-end gap-1 px-3 py-2 border-t border-border/50">
                        <div className="flex items-center gap-1 overflow-x-hidden">
                            <ButtonWithTooltip
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowHistory(true)}
                                disabled={
                                    isDisabled || diagramHistory.length === 0
                                }
                                tooltipContent={dict.chat.diagramHistory}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            >
                                <History className="h-4 w-4" />
                            </ButtonWithTooltip>

                            <ButtonWithTooltip
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowSaveDialog(true)}
                                disabled={
                                    isDisabled || !isRealDiagram(chartXML)
                                }
                                tooltipContent={dict.chat.saveDiagram}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            >
                                <Download className="h-4 w-4" />
                            </ButtonWithTooltip>

                            <ButtonWithTooltip
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={triggerFileInput}
                                disabled={isDisabled}
                                tooltipContent={dict.chat.uploadFile}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            >
                                <ImageIcon className="h-4 w-4" />
                            </ButtonWithTooltip>

                            {onUrlChange && (
                                <ButtonWithTooltip
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowUrlDialog(true)}
                                    disabled={isDisabled}
                                    tooltipContent={dict.chat.ExtractURL}
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                >
                                    <Link className="h-4 w-4" />
                                </ButtonWithTooltip>
                            )}

                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileChange}
                                accept="image/*,.pdf,application/pdf,text/*,.md,.markdown,.json,.csv,.xml,.yaml,.yml,.toml"
                                multiple
                                disabled={isDisabled}
                            />
                        </div>
                        <ModelSelector
                            models={models}
                            selectedModelId={selectedModelId}
                            onSelect={onModelSelect}
                            onConfigure={onConfigureModels}
                            disabled={isDisabled}
                            showUnvalidatedModels={showUnvalidatedModels}
                        />
                        <div className="w-px h-5 bg-border mx-1" />
                        {(status === "streaming" || status === "submitted") &&
                        onStop ? (
                            <Button
                                type="button"
                                onClick={onStop}
                                size="sm"
                                variant="destructive"
                                className="h-8 w-8 p-0 rounded-xl shadow-sm"
                                aria-label={dict.chat.stopGeneration}
                            >
                                <Square className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                disabled={isDisabled || !input.trim()}
                                size="sm"
                                className="h-8 px-4 rounded-xl font-medium shadow-sm"
                                aria-label={dict.chat.send}
                            >
                                <Send className="h-4 w-4 mr-1.5" />
                                {dict.chat.send}
                            </Button>
                        )}
                    </div>
                </div>
                <HistoryDialog
                    showHistory={showHistory}
                    onToggleHistory={setShowHistory}
                />
                <SaveDialog
                    open={showSaveDialog}
                    onOpenChange={setShowSaveDialog}
                    onSave={(filename, format) =>
                        saveDiagramToFile(
                            filename,
                            format,
                            sessionId,
                            dict.save.savedSuccessfully,
                        )
                    }
                    defaultFilename={`diagram-${new Date()
                        .toISOString()
                        .slice(0, 10)}`}
                />
                {onUrlChange && (
                    <UrlInputDialog
                        open={showUrlDialog}
                        onOpenChange={setShowUrlDialog}
                        onSubmit={handleUrlExtract}
                        isExtracting={isExtractingUrl}
                    />
                )}
            </form>
        )
    },
)
