import {
    ArrowUp,
    BookMarked,
    BookmarkPlus,
    Globe,
    Paperclip,
    Plus,
    Square,
    SquareDashedMousePointer,
    X,
} from "lucide-react"
import type React from "react"
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react"
import { toast } from "sonner"
import { TemplateCreateDialog } from "@/components/chat/TemplateCreateDialog"
import { TemplatePanel } from "@/components/chat/TemplatePanel"
import { ErrorToast } from "@/components/error-toast"
import { FilePreviewList } from "@/components/file-preview-list"
import { ModelSelector } from "@/components/model-selector"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { UrlInputDialog } from "@/components/url-input-dialog"
import { IconButton } from "@/components/workspace/icon-button"
import { useDictionary } from "@/hooks/use-dictionary"
import { formatMessage } from "@/lib/i18n/utils"
import { modKey } from "@/lib/platform"
import { extractUrlContent } from "@/lib/url-utils"
import { cn } from "@/lib/utils"
import { useSettingsStore } from "@/stores/settings-store"
import { useUiStore } from "@/stores/ui-store"
import { ATTACHMENT_ACCEPT, validateFiles } from "./attachments"
import { useChatEngine } from "./chat-engine"

function showErrorToast(message: React.ReactNode) {
    toast.custom(
        (t) => (
            <ErrorToast message={message} onDismiss={() => toast.dismiss(t)} />
        ),
        { duration: 5000 },
    )
}

function showValidationErrors(errors: string[], dict: any) {
    if (errors.length === 0) return
    if (errors.length === 1) {
        showErrorToast(
            <span className="text-muted-foreground">{errors[0]}</span>,
        )
        return
    }
    showErrorToast(
        <div className="flex flex-col gap-1">
            <span className="font-medium">
                {formatMessage(dict.errors.filesRejected, {
                    count: errors.length,
                })}
            </span>
            <ul className="list-inside list-disc text-xs text-muted-foreground">
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

function MenuItem({
    icon,
    children,
    onClick,
    disabled,
    disabledHint,
}: {
    icon: React.ReactNode
    children: React.ReactNode
    onClick: () => void
    disabled?: boolean
    /** Why the item can't be used now, shown under it while disabled */
    disabledHint?: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="group/item flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-accent disabled:pointer-events-none [&_svg]:mt-px [&_svg]:size-4 [&_svg]:text-muted-foreground"
        >
            <span className="contents group-disabled/item:[&>svg]:opacity-40">
                {icon}
            </span>
            <span className="min-w-0">
                <span className="block group-disabled/item:opacity-40">
                    {children}
                </span>
                {disabled && disabledHint && (
                    <span className="block text-xs text-muted-foreground">
                        {disabledHint}
                    </span>
                )}
            </span>
        </button>
    )
}

/**
 * The message box: text, attachments, the selected shapes, the model picker
 * and send/stop. `variant="hero"` is the large box on the start screen.
 */
export function Composer({
    variant = "panel",
    placeholder,
    autoFocus = false,
}: {
    variant?: "panel" | "hero"
    placeholder?: string
    autoFocus?: boolean
}) {
    const dict = useDictionary()
    const engine = useChatEngine()
    const {
        input,
        setInput,
        files,
        setFiles,
        pdfData,
        urlData,
        setUrlData,
        isBusy,
        error,
        chatSelection,
        dismissSelection,
        modelConfig,
    } = engine
    const sendShortcut = useSettingsStore((s) => s.sendShortcut)
    const openSettings = useUiStore((s) => s.openSettings)
    const focusToken = useUiStore((s) => s.focusComposerToken)

    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [addOpen, setAddOpen] = useState(false)
    const [templatesOpen, setTemplatesOpen] = useState(false)
    const [showUrlDialog, setShowUrlDialog] = useState(false)
    const [isExtractingUrl, setIsExtractingUrl] = useState(false)
    const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)

    const isHero = variant === "hero"
    // Allow a retry when the last request failed, even mid-stream. While
    // the chat is being left, what is typed could not be sent.
    const isDisabled = (isBusy && !error) || engine.isLeaving
    const canSend =
        !isDisabled && !engine.isExtractingAttachments && !!input.trim()

    const adjustHeight = useCallback(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.style.height = "auto"
        textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
    }, [])
    useEffect(() => {
        adjustHeight()
    }, [input, adjustHeight])

    // Focus requests from elsewhere (new chat, "ask AI" button, ⌘/)
    useEffect(() => {
        if (focusToken === 0 && !autoFocus) return
        const timer = setTimeout(() => textareaRef.current?.focus(), 60)
        return () => clearTimeout(timer)
    }, [focusToken, autoFocus])

    // The chat is left while the user types (browser back): the browser
    // takes the focus from the input it disables, after this runs. It gets
    // the focus back once enabled, unless something else took it meanwhile.
    const refocusRef = useRef(false)
    const isLeaving = engine.isLeaving
    useLayoutEffect(() => {
        if (isDisabled) {
            if (isLeaving && document.activeElement === textareaRef.current) {
                refocusRef.current = true
            }
            return
        }
        if (!refocusRef.current) return
        refocusRef.current = false
        if (document.activeElement === document.body) {
            textareaRef.current?.focus()
        }
    }, [isDisabled, isLeaving])

    const addFiles = (newFiles: File[]) => {
        const { validFiles, errors } = validateFiles(
            newFiles,
            files.length,
            dict,
        )
        showValidationErrors(errors, dict)
        if (validFiles.length > 0) setFiles([...files, ...validFiles])
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Enter that confirms an IME candidate must not send the message
        if (e.nativeEvent.isComposing || e.keyCode === 229) return
        const shouldSend =
            sendShortcut === "enter"
                ? e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey
                : (e.metaKey || e.ctrlKey) && e.key === "Enter"
        if (shouldSend) {
            e.preventDefault()
            if (canSend) engine.submit()
        }
    }

    const handlePaste = async (e: React.ClipboardEvent) => {
        if (isDisabled) return
        const imageItems = Array.from(e.clipboardData.items).filter((item) =>
            item.type.startsWith("image/"),
        )
        if (imageItems.length === 0) return
        const imageFiles = imageItems
            .map((item, index) => {
                const file = item.getAsFile()
                if (!file) return null
                return new File(
                    [file],
                    `pasted-image-${Date.now()}-${index}.${file.type.split("/")[1]}`,
                    { type: file.type },
                )
            })
            .filter((f): f is File => f !== null)
        addFiles(imageFiles)
    }

    const handleUrlExtract = async (url: string) => {
        setIsExtractingUrl(true)
        // Functional updates, so a removal or send made while extracting is
        // not overwritten when the request finishes
        try {
            setUrlData((prev) =>
                new Map(prev).set(url, {
                    url,
                    title: url,
                    content: "",
                    charCount: 0,
                    isExtracting: true,
                }),
            )
            const data = await extractUrlContent(url)
            setUrlData((prev) =>
                prev.has(url) ? new Map(prev).set(url, data) : prev,
            )
            setShowUrlDialog(false)
        } catch (err) {
            setUrlData((prev) => {
                const next = new Map(prev)
                next.delete(url)
                return next
            })
            showErrorToast(
                <span className="text-muted-foreground">
                    {err instanceof Error ? err.message : dict.url.failed}
                </span>,
            )
        } finally {
            setIsExtractingUrl(false)
        }
    }

    const selectionLabel =
        chatSelection.length === 1
            ? formatMessage(dict.selection.one, {
                  label:
                      chatSelection[0].label ||
                      (chatSelection[0].isEdge
                          ? dict.selection.connector
                          : dict.selection.shape),
              })
            : formatMessage(dict.selection.many, {
                  count: chatSelection.length,
              })

    const hasChips =
        chatSelection.length > 0 || files.length > 0 || urlData.size > 0

    return (
        <form
            id={isHero ? "hero-chat-form" : "chat-form"}
            onSubmit={(e) => {
                e.preventDefault()
                if (canSend) engine.submit()
            }}
            onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
            }}
            onDragLeave={(e) => {
                e.preventDefault()
                setIsDragging(false)
            }}
            onDrop={(e) => {
                e.preventDefault()
                setIsDragging(false)
                if (!isDisabled) addFiles(Array.from(e.dataTransfer.files))
            }}
            className={cn(
                "group/composer relative w-full rounded-[14px] border border-border bg-card transition-[border-color,box-shadow] duration-150",
                "focus-within:border-foreground/20 focus-within:shadow-[0_0_0_4px_var(--accent)]",
                isHero && "rounded-[18px] border-transparent shadow-pop",
                isDragging &&
                    "border-foreground/30 shadow-[0_0_0_4px_var(--marker-soft)]",
            )}
        >
            {hasChips && (
                <div className="flex flex-wrap items-center gap-1.5 px-2.5 pt-2.5">
                    {chatSelection.length > 0 && (
                        <span
                            className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-marker-soft py-1 pr-1 pl-2 text-xs font-medium text-marker-ink"
                            data-testid="selection-chip"
                        >
                            <SquareDashedMousePointer className="size-3.5 shrink-0" />
                            <span className="truncate">{selectionLabel}</span>
                            <button
                                type="button"
                                onClick={dismissSelection}
                                aria-label={dict.selection.remove}
                                className="rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
                            >
                                <X className="size-3" />
                            </button>
                        </span>
                    )}
                    {(files.length > 0 || urlData.size > 0) && (
                        // A short window keeps room for the buttons below
                        <div className="max-h-[min(176px,22vh)] w-full overflow-y-auto scrollbar-thin">
                            <FilePreviewList
                                files={files}
                                onRemoveFile={(file) =>
                                    setFiles(files.filter((f) => f !== file))
                                }
                                pdfData={pdfData}
                                urlData={urlData}
                                onRemoveUrl={(url) =>
                                    setUrlData((prev) => {
                                        const next = new Map(prev)
                                        next.delete(url)
                                        return next
                                    })
                                }
                            />
                        </div>
                    )}
                </div>
            )}

            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                    placeholder ??
                    (chatSelection.length > 0
                        ? dict.selection.placeholder
                        : dict.chat.placeholder)
                }
                disabled={isDisabled}
                aria-label={dict.chat.inputLabel}
                data-testid="chat-input"
                rows={isHero ? 3 : 2}
                className={cn(
                    // A short window keeps room for the buttons below
                    "block max-h-[min(220px,30vh)] w-full resize-none bg-transparent text-foreground outline-none placeholder:text-faint scrollbar-thin disabled:opacity-60",
                    isHero
                        ? "min-h-[84px] px-[18px] pt-4 pb-1 text-[15px] leading-relaxed"
                        : "min-h-[52px] px-3.5 pt-3 pb-1 text-sm",
                )}
            />

            <div
                className={cn(
                    "flex items-center gap-0.5",
                    isHero ? "px-2.5 pt-1 pb-2.5" : "px-1.5 pt-0.5 pb-1.5",
                )}
            >
                <Popover open={addOpen} onOpenChange={setAddOpen}>
                    <PopoverTrigger asChild>
                        <IconButton
                            label={dict.chat.attach}
                            tooltipSide="top"
                            disabled={isDisabled}
                            data-testid="composer-add"
                        >
                            <Plus />
                        </IconButton>
                    </PopoverTrigger>
                    <PopoverContent
                        side="top"
                        align="start"
                        className="w-64 p-1"
                    >
                        <MenuItem
                            icon={<Paperclip />}
                            onClick={() => {
                                setAddOpen(false)
                                fileInputRef.current?.click()
                            }}
                        >
                            {dict.chat.uploadFile}
                        </MenuItem>
                        <MenuItem
                            icon={<Globe />}
                            onClick={() => {
                                setAddOpen(false)
                                setShowUrlDialog(true)
                            }}
                        >
                            {dict.chat.ExtractURL}
                        </MenuItem>
                        <MenuItem
                            icon={<BookmarkPlus />}
                            disabled={!input.trim()}
                            disabledHint={dict.templates.saveDisabledHint}
                            onClick={() => {
                                setAddOpen(false)
                                setSaveTemplateOpen(true)
                            }}
                        >
                            {dict.templates.saveAsTemplate}
                        </MenuItem>
                    </PopoverContent>
                </Popover>
                <IconButton
                    label={dict.templates.myTemplates}
                    tooltipSide="top"
                    disabled={isDisabled}
                    onClick={() => setTemplatesOpen(true)}
                >
                    <BookMarked />
                </IconButton>

                <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1">
                    <ModelSelector
                        models={modelConfig.models}
                        selectedModelId={modelConfig.selectedModelId}
                        onSelect={modelConfig.setSelectedModelId}
                        onConfigure={() => openSettings("models")}
                        onAddProvider={() => openSettings("models", "picker")}
                        disabled={isDisabled}
                    />
                    {!isBusy && input.trim() && (
                        <kbd
                            className="hidden shrink-0 font-sans text-[11px] text-faint sm:inline"
                            aria-hidden
                        >
                            {sendShortcut === "enter" ? "↵" : `${modKey}↵`}
                        </kbd>
                    )}
                    {isBusy ? (
                        <button
                            type="button"
                            onClick={engine.stop}
                            aria-label={dict.chat.stopGeneration}
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-foreground text-background transition-opacity hover:opacity-85"
                        >
                            <Square className="size-3 fill-current" />
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={!canSend}
                            aria-label={dict.chat.send}
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground transition-[opacity,background-color] hover:opacity-90 disabled:bg-muted disabled:text-faint"
                        >
                            <ArrowUp className="size-4 stroke-[2.25]" />
                        </button>
                    )}
                </div>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={ATTACHMENT_ACCEPT}
                data-testid="attachment-input"
                multiple
                disabled={isDisabled}
                onChange={(e) => {
                    addFiles(Array.from(e.target.files || []))
                    e.target.value = ""
                }}
            />

            <UrlInputDialog
                open={showUrlDialog}
                onOpenChange={setShowUrlDialog}
                onSubmit={handleUrlExtract}
                isExtracting={isExtractingUrl}
            />
            <TemplateCreateDialog
                open={saveTemplateOpen}
                onOpenChange={setSaveTemplateOpen}
                onSuccess={() => setSaveTemplateOpen(false)}
                initialPrompt={input.trim()}
            />
            <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
                <DialogContent className="flex max-h-[80vh] flex-col gap-0 p-0 sm:max-w-lg">
                    <DialogHeader className="px-5 pt-5 pb-2">
                        <DialogTitle>{dict.templates.myTemplates}</DialogTitle>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 scrollbar-thin">
                        <TemplatePanel
                            setInput={(value) => {
                                setInput(value)
                                setTemplatesOpen(false)
                            }}
                            currentInput={input}
                            onSendTemplate={(template) => {
                                setTemplatesOpen(false)
                                return engine.sendTemplate(template.prompt)
                            }}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </form>
    )
}
