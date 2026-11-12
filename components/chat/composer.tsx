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
import { TemplateFormDialog } from "@/components/chat/TemplateFormDialog"
import { TemplatePanel } from "@/components/chat/TemplatePanel"
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
import { isTextFile } from "@/lib/pdf-utils"
import { modKey } from "@/lib/platform"
import type { FlattenedModel } from "@/lib/types/model-config"
import { extractUrlContent } from "@/lib/url-utils"
import { cn } from "@/lib/utils"
import { isSendKey, useSettingsStore } from "@/stores/settings-store"
import { useUiStore } from "@/stores/ui-store"
import {
    ATTACHMENT_ACCEPT,
    isDiagramFile,
    isOversizedImage,
    pickedFile,
    readImageTypes,
    shrinkImage,
    validateFiles,
} from "./attachments"
import { useChatEngine } from "./chat-engine"

/**
 * An image sent to a model known not to read images fails with an error
 * that often does not say why (issue #656): say so when one is attached,
 * or when the model changes while one is
 */
async function warnIfNoImageInput(
    attached: File[],
    model: FlattenedModel | undefined,
    dict: any,
) {
    if (!model) return
    if (!attached.some((f) => f.type.startsWith("image/") && !isTextFile(f)))
        return
    const { getModelInfo } = await import("@/lib/model-catalog")
    if (getModelInfo(model.provider, model.modelId)?.images !== false) return
    toast.warning(
        formatMessage(dict.errors.imagesUnsupportedModel, {
            model: model.modelId,
        }),
        { id: "images-unsupported", duration: 8000 },
    )
}

function showValidationErrors(errors: string[], dict: any) {
    if (errors.length === 0) return
    if (errors.length === 1) {
        toast.error(
            <span className="text-muted-foreground">{errors[0]}</span>,
            { duration: 5000 },
        )
        return
    }
    toast.error(
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
        { duration: 5000 },
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
    const focusComposer = useUiStore((s) => s.focusComposer)

    const formRef = useRef<HTMLFormElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [addOpen, setAddOpen] = useState(false)
    const addButtonRef = useRef<HTMLButtonElement>(null)
    // For an item of the add menu that opens a dialog: closing, the dialog
    // gives the focus back to what has it as it opens. The item goes away
    // with the menu, so the menu's button takes the focus first
    const closeAddMenu = () => {
        setAddOpen(false)
        addButtonRef.current?.focus()
    }
    const [templatesOpen, setTemplatesOpen] = useState(false)
    const templatePickedRef = useRef(false)
    const [showUrlDialog, setShowUrlDialog] = useState(false)
    const urlDialogOpenRef = useRef(showUrlDialog)
    urlDialogOpenRef.current = showUrlDialog
    const [isExtractingUrl, setIsExtractingUrl] = useState(false)
    const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)

    const isHero = variant === "hero"
    // Allow a retry when the last request failed, even mid-stream. While
    // the chat is being left, what is typed could not be sent.
    const isDisabled = (isBusy && !error) || engine.isLeaving
    // Sets of added files still being read (addFiles)
    const [filesBeingAdded, setFilesBeingAdded] = useState(0)
    const canSend =
        !isDisabled &&
        !engine.isExtractingAttachments &&
        filesBeingAdded === 0 &&
        !!input.trim()

    const adjustHeight = useCallback(() => {
        const textarea = textareaRef.current
        if (!textarea) return
        textarea.style.height = "auto"
        textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
    }, [])
    useEffect(() => {
        adjustHeight()
    }, [input, adjustHeight])

    // On the start screen an attachment makes the box taller: keep its
    // Send row in view
    const attachmentCount = files.length + urlData.size
    useEffect(() => {
        if (isHero && attachmentCount > 0) {
            formRef.current?.scrollIntoView({ block: "nearest" })
        }
    }, [isHero, attachmentCount])

    // An answer in progress, or leaving the chat (browser back), disables
    // the input the user types in: the browser takes the focus from the
    // input it disables, after this runs. It gets the focus back once
    // enabled, so the next message can be typed at once, unless something
    // else took the focus meanwhile. A press on Stop leaves the focus on
    // that button, which is the disabled Send button by now and loses it
    // to the page a moment later. Text selected in the chat meanwhile (to
    // copy it) stays selected: a focused box would take the selection.
    const refocusRef = useRef(false)
    useLayoutEffect(() => {
        if (isDisabled) {
            if (document.activeElement === textareaRef.current) {
                refocusRef.current = true
            }
            return
        }
        if (!refocusRef.current) return
        refocusRef.current = false
        const active = document.activeElement
        if (
            (active === document.body || formRef.current?.contains(active)) &&
            !window.getSelection()?.toString()
        ) {
            textareaRef.current?.focus()
        }
    }, [isDisabled])

    // Focus requests from elsewhere (new chat, "ask AI" button, ⌘/, the
    // start screen's box once its message is sent). A box that an answer in
    // progress disables takes the focus when the answer ends.
    useEffect(() => {
        if (focusToken === 0 && !autoFocus) return
        if (textareaRef.current?.disabled) {
            refocusRef.current = true
            return
        }
        const timer = setTimeout(() => textareaRef.current?.focus(), 60)
        return () => clearTimeout(timer)
    }, [focusToken, autoFocus])

    const send = () => {
        if (!canSend) return
        // A click on Send takes the focus from the box. Put back here, the
        // box gets it again when the answer ends (above). The start
        // screen's box hands over to the panel's instead.
        if (!isHero) textareaRef.current?.focus()
        engine.submit()
        // The answer shows in the chat panel, whose box takes the focus
        // over for the next message. Not on phones, where a focused box
        // brings up the keyboard: there this box does not focus itself.
        if (isHero && autoFocus) focusComposer()
    }

    const addFiles = async (added: File[]) => {
        // A draw.io file is opened as the diagram, as "Open .drawio file"
        // does; what is typed and attached stays for the next message
        const diagram = added.find(isDiagramFile)
        if (diagram) engine.openDiagramFile(diagram, { keepComposer: true })
        // A file that is attached already is not attached a second time
        const newFiles = added.filter(
            (file) =>
                !isDiagramFile(file) &&
                !files
                    .map(pickedFile)
                    .some(
                        (f) =>
                            f.name === file.name &&
                            f.size === file.size &&
                            f.lastModified === file.lastModified,
                    ),
        )
        if (newFiles.length === 0) return
        // A picture over the size limit (a phone photo, a large screenshot)
        // is scaled down to fit. The attachments can change meanwhile, so
        // from here on they are read from the ref. Until the files are
        // attached the message cannot be sent: it would go without them.
        setFilesBeingAdded((n) => n + 1)
        const read = async () => {
            const sized = await Promise.all(
                newFiles.map((file) =>
                    isOversizedImage(file) ? shrinkImage(file) : file,
                ),
            )
            return { sized, imageTypes: await readImageTypes(sized) }
        }
        // (Also when a file cannot be read: it went away meanwhile)
        const { sized, imageTypes } = await read().finally(() =>
            setFilesBeingAdded((n) => n - 1),
        )
        const attached = filesRef.current
        const { validFiles, errors } = validateFiles(
            sized,
            attached.length,
            dict,
            imageTypes,
        )
        showValidationErrors(errors, dict)
        if (validFiles.length > 0) setFiles([...attached, ...validFiles])
        warnIfNoImageInput(validFiles, selectedModel, dict)
    }

    // A file dragged anywhere over the page goes to the message box: the
    // browser opens a file dropped beside the box in a new tab (Firefox: in
    // place of the app). The canvas is draw.io's own frame and takes the
    // files dropped on it. Set up again on every render, so the handlers
    // see the current attachments.
    useEffect(() => {
        const hasFiles = (e: DragEvent) =>
            e.dataTransfer?.types.includes("Files")
        const onDragOver = (e: DragEvent) => {
            if (!hasFiles(e)) return
            e.preventDefault()
            setIsDragging(true)
        }
        // The drag left the page: out of the window (no related target),
        // or onto the canvas
        const onDragLeave = (e: DragEvent) => {
            if (
                !e.relatedTarget ||
                e.relatedTarget instanceof HTMLIFrameElement
            ) {
                setIsDragging(false)
            }
        }
        const onDrop = (e: DragEvent) => {
            if (!hasFiles(e)) return
            e.preventDefault()
            setIsDragging(false)
            if (!isDisabled) addFiles(Array.from(e.dataTransfer?.files ?? []))
        }
        window.addEventListener("dragover", onDragOver)
        window.addEventListener("dragleave", onDragLeave)
        window.addEventListener("drop", onDrop)
        return () => {
            window.removeEventListener("dragover", onDragOver)
            window.removeEventListener("dragleave", onDragLeave)
            window.removeEventListener("drop", onDrop)
        }
    })

    // Switching to a model that cannot read images while one is attached
    // warns too. The attached files are read from a ref, so attaching is
    // not checked a second time here.
    const selectedModel = modelConfig.models.find(
        (m) => m.id === modelConfig.selectedModelId,
    )
    const filesRef = useRef(files)
    filesRef.current = files
    const checkedModelIdRef = useRef(modelConfig.selectedModelId)
    useEffect(() => {
        if (checkedModelIdRef.current === selectedModel?.id) return
        checkedModelIdRef.current = selectedModel?.id
        warnIfNoImageInput(filesRef.current, selectedModel, dict)
    }, [selectedModel, dict])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Enter that confirms an IME candidate must not send the message
        if (e.nativeEvent.isComposing || e.keyCode === 229) return
        if (isSendKey(e, sendShortcut)) {
            e.preventDefault()
            send()
        }
    }

    const handlePaste = (e: React.ClipboardEvent) => {
        if (isDisabled) return
        const pasted = Array.from(e.clipboardData.files)
        if (pasted.length === 0) return
        // SVG is read as text and keeps its name, as a .drawio.svg must
        const isPicture = (file: File) =>
            file.type.startsWith("image/") && !isTextFile(file)
        // A file copied in the file manager (a PDF, a text file, a .drawio
        // file) comes with its name as text, which stays out of the box. A
        // copied picture can come with text of its own (a spreadsheet's
        // cells), which is pasted as usual.
        if (!pasted.every(isPicture)) e.preventDefault()
        addFiles(
            pasted.map((file, index) =>
                // A picture from the clipboard is always named "image.png"
                isPicture(file)
                    ? new File(
                          [file],
                          `pasted-image-${Date.now()}-${index}.${file.type.split("/")[1]}`,
                          { type: file.type },
                      )
                    : file,
            ),
        )
    }

    // Called by the URL dialog (fromDialog) and by the link offered above
    // the box, which can be read while the dialog is open for another link
    const handleUrlExtract = async (url: string, fromDialog = false) => {
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
            const data = await extractUrlContent(url, dict)
            setUrlData((prev) =>
                prev.has(url) ? new Map(prev).set(url, data) : prev,
            )
            if (fromDialog) setShowUrlDialog(false)
        } catch (err) {
            setUrlData((prev) => {
                const next = new Map(prev)
                next.delete(url)
                return next
            })
            const reason = err instanceof Error ? err.message : dict.url.failed
            // The dialog shows the reason under the address it asked for,
            // where it stays; a dialog closed meanwhile cannot, so a toast
            // does, as for the link offered above the box
            if (!(fromDialog && urlDialogOpenRef.current)) {
                toast.error(
                    <span className="text-muted-foreground">{reason}</span>,
                    { duration: 5000 },
                )
            }
            return reason
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

    // The model cannot open a link that is only typed into the message,
    // and draws from what it knows of the address. The first link that is
    // not attached is offered for reading, as "Extract from URL" does.
    // Chinese and Japanese text and full-width punctuation follow a link
    // without a space, so the link ends where they begin. The punctuation
    // that ends a sentence is not part of it; a closing bracket is, when
    // the link opens it ("/wiki/Raft_(algorithm)").
    const typedLink = input
        .match(/https?:\/\/[^\s<>"'\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]+/g)
        ?.map((link) => {
            while (
                /[.,;:!?\]]$/.test(link) ||
                (link.endsWith(")") &&
                    link.split(")").length > link.split("(").length)
            ) {
                link = link.slice(0, -1)
            }
            return link
        })
        .find((link) => !urlData.has(link))

    return (
        <form
            ref={formRef}
            id={isHero ? "hero-chat-form" : "chat-form"}
            onSubmit={(e) => {
                e.preventDefault()
                send()
            }}
            className={cn(
                "group/composer relative w-full rounded-[14px] border border-border bg-card transition-[border-color,box-shadow] duration-150",
                "focus-within:border-foreground/20 focus-within:shadow-[0_0_0_4px_var(--accent)]",
                isHero &&
                    "scroll-mb-6 rounded-[18px] border-transparent shadow-pop",
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

            {typedLink && (
                <div
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3.5 pt-2.5 text-xs text-muted-foreground"
                    data-testid="typed-link-hint"
                >
                    <Globe className="size-3.5 shrink-0" />
                    <span>{dict.url.typedLinkHint}</span>
                    <button
                        type="button"
                        disabled={isDisabled || isExtractingUrl}
                        onClick={() => handleUrlExtract(typedLink)}
                        className="font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground disabled:opacity-60"
                    >
                        {dict.url.readTypedLink}
                    </button>
                </div>
            )}

            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                    // An attachment alone cannot be sent: the box says what
                    // is missing while Send stays grey
                    attachmentCount > 0
                        ? dict.chat.placeholderAttached
                        : (placeholder ??
                          (chatSelection.length > 0
                              ? dict.selection.placeholder
                              : dict.chat.placeholder))
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
                            ref={addButtonRef}
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
                        // A dialog to screen readers, which read its name
                        aria-label={dict.chat.attach}
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
                                closeAddMenu()
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
                                closeAddMenu()
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
                            {formatMessage(
                                dict.chat.sendKeyHint,
                                sendShortcut === "enter"
                                    ? { send: "↵", newline: "⇧↵" }
                                    : { send: `${modKey}↵`, newline: "↵" },
                            )}
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
                onSubmit={(url) => handleUrlExtract(url, true)}
                isExtracting={isExtractingUrl}
            />
            <TemplateFormDialog
                open={saveTemplateOpen}
                onOpenChange={setSaveTemplateOpen}
                onSuccess={() => setSaveTemplateOpen(false)}
                initialPrompt={input.trim()}
            />
            <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
                <DialogContent
                    className="flex max-h-[80vh] flex-col gap-0 p-0 sm:max-w-lg"
                    onCloseAutoFocus={(e) => {
                        // A picked prompt is edited and sent from the box
                        if (!templatePickedRef.current) return
                        templatePickedRef.current = false
                        e.preventDefault()
                        textareaRef.current?.focus()
                    }}
                >
                    <DialogHeader className="px-5 pt-5 pb-2">
                        <DialogTitle>{dict.templates.myTemplates}</DialogTitle>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 scrollbar-thin">
                        <TemplatePanel
                            currentInput={input}
                            onUseTemplate={(template) => {
                                templatePickedRef.current = true
                                setInput(template.prompt)
                                setTemplatesOpen(false)
                            }}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </form>
    )
}
