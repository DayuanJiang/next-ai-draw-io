import { isToolUIPart, type UIMessage } from "ai"
import {
    AlertCircle,
    BookmarkPlus,
    Check,
    ChevronDown,
    Copy,
    FileCode,
    FileText,
    Link,
    Pencil,
    RotateCcw,
    SquareDashedMousePointer,
    ThumbsDown,
    ThumbsUp,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { toast } from "sonner"
import { Reasoning } from "@/components/ai-elements/reasoning"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { TemplateFormDialog } from "@/components/chat/TemplateFormDialog"
import type { ToolPartLike } from "@/components/chat/types"
import { ValidationCard } from "@/components/chat/ValidationCard"
import Image from "@/components/image-with-basepath"
import { useDictionary } from "@/hooks/use-dictionary"
import { getApiEndpoint } from "@/lib/base-path"
import { type ChatMessageMetadata, noticeOf } from "@/lib/chat-message"
import { useCopy } from "@/lib/clipboard"
import { formatMessage } from "@/lib/i18n/utils"
import { cn } from "@/lib/utils"
import { isSendKey, useSettingsStore } from "@/stores/settings-store"
import { useUiStore } from "@/stores/ui-store"
import { useChatEngine } from "./chat-engine"
import {
    getMessageTextContent,
    getUserOriginalText,
    splitTextIntoFileSections,
    type TextSection,
} from "./message-text"
import { ReplyUsageNote } from "./reply-usage"
import { ToolActivity } from "./tool-activity"

function ActionButton({
    label,
    onClick,
    active,
    children,
}: {
    label: string
    onClick: () => void
    active?: boolean
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className={cn(
                "inline-flex size-7 items-center justify-center rounded-lg text-faint transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-3.5",
                active && "text-foreground",
            )}
        >
            {children}
        </button>
    )
}

/** Copies a message's text, with a short "copied" state */
function CopyButton({ text }: { text: string }) {
    const dict = useDictionary()
    const { copied, copy } = useCopy(() =>
        toast.error(dict.chat.failedToCopyDetail),
    )
    return (
        <ActionButton
            label={copied ? dict.chat.copied : dict.chat.copyResponse}
            onClick={() => copy(text)}
        >
            {copied ? <Check /> : <Copy />}
        </ActionButton>
    )
}

function AttachedSection({ section }: { section: TextSection }) {
    const [open, setOpen] = useState(false)
    const dict = useDictionary()
    const Icon =
        section.fileType === "pdf"
            ? FileText
            : section.fileType === "url"
              ? Link
              : FileCode
    const chars =
        section.charCount && section.charCount >= 1000
            ? `${(section.charCount / 1000).toFixed(1)}k`
            : section.charCount
    return (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation()
                    setOpen((v) => !v)
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent"
            >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                    {section.filename}
                </span>
                <span className="shrink-0 text-[11px] text-faint">
                    {chars} {dict.file.chars}
                </span>
                <ChevronDown
                    className={cn(
                        "size-3.5 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180",
                    )}
                />
            </button>
            {open && (
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap border-t border-border px-2.5 py-2 text-xs text-muted-foreground scrollbar-thin">
                    {section.content}
                </pre>
            )}
        </div>
    )
}

function MessageText({ text }: { text: string }) {
    const sections = splitTextIntoFileSections(text)
    return (
        <div className="space-y-2">
            {sections.map((section, index) =>
                section.type === "text" ? (
                    <div
                        key={index}
                        className={cn(
                            "prose prose-sm max-w-none break-words text-[14px] leading-relaxed text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                            "prose-p:my-1.5 prose-pre:bg-surface-2 prose-pre:text-foreground prose-code:before:content-none prose-code:after:content-none dark:prose-invert",
                        )}
                    >
                        <ReactMarkdown>{section.content}</ReactMarkdown>
                    </div>
                ) : (
                    <AttachedSection key={index} section={section} />
                ),
            )}
        </div>
    )
}

function UserMessage({
    message,
    index,
    isLast,
}: {
    message: UIMessage
    index: number
    isLast: boolean
}) {
    const dict = useDictionary()
    const engine = useChatEngine()
    const sendShortcut = useSettingsStore((s) => s.sendShortcut)
    const [editing, setEditing] = useState(false)
    const [editText, setEditText] = useState("")
    const [saveTemplate, setSaveTemplate] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const text = getMessageTextContent(message)
    const canEdit = isLast && !engine.isBusy

    useEffect(() => {
        if (editing) textareaRef.current?.focus()
    }, [editing])

    const startEdit = () => {
        if (!canEdit) return
        setEditText(getUserOriginalText(message))
        setEditing(true)
    }
    const submitEdit = async () => {
        if (!editText.trim()) return
        // Kept open, with its text, when it could not go now
        if (await engine.editMessage(index, editText.trim())) setEditing(false)
    }

    if (editing) {
        return (
            <div className="ml-6 flex flex-col gap-2">
                <textarea
                    ref={textareaRef}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={Math.min(editText.split("\n").length + 1, 6)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") setEditing(false)
                        // The send key of the message box; not an Enter
                        // that picks an IME candidate
                        else if (
                            !e.nativeEvent.isComposing &&
                            e.keyCode !== 229 &&
                            isSendKey(e, sendShortcut)
                        ) {
                            e.preventDefault()
                            submitEdit()
                        }
                    }}
                    className="w-full resize-none rounded-xl border border-foreground/20 bg-card px-3 py-2.5 text-sm outline-none focus:shadow-[0_0_0_4px_var(--accent)]"
                />
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="h-7 rounded-lg px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        {dict.common.cancel}
                    </button>
                    <button
                        type="button"
                        onClick={submitEdit}
                        disabled={!editText.trim()}
                        className="h-7 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-40"
                    >
                        {dict.chat.saveAndSubmit}
                    </button>
                </div>
            </div>
        )
    }

    const images = message.parts.filter((p) => p.type === "file") as {
        url: string
    }[]
    // The shapes that were selected when it was sent
    const selected =
        (message.metadata as ChatMessageMetadata | undefined)?.selectedCells ??
        []
    const selectionLabel =
        selected.length === 1
            ? formatMessage(dict.selection.one, {
                  label:
                      selected[0].label ||
                      (selected[0].isEdge
                          ? dict.selection.connector
                          : dict.selection.shape),
              })
            : formatMessage(dict.selection.many, { count: selected.length })

    return (
        <div className="group/message flex items-start justify-end gap-1">
            <div className="mt-1 flex shrink-0 items-center transition-opacity [@media(hover:hover)]:opacity-0 group-hover/message:opacity-100 focus-within:opacity-100">
                {canEdit && (
                    <ActionButton
                        label={dict.chat.editMessage}
                        onClick={startEdit}
                    >
                        <Pencil />
                    </ActionButton>
                )}
                <CopyButton text={text} />
                <ActionButton
                    label={dict.templates.saveAsTemplate}
                    onClick={() => setSaveTemplate(true)}
                >
                    <BookmarkPlus />
                </ActionButton>
            </div>
            <div
                className={cn(
                    "min-w-0 max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-3.5 py-2.5",
                    canEdit &&
                        "cursor-pointer transition-colors hover:bg-interactive-active",
                )}
                role={canEdit ? "button" : undefined}
                tabIndex={canEdit ? 0 : undefined}
                onClick={(e) => {
                    // Not for a link or an attachment's toggle inside, nor
                    // when text was selected to copy it
                    const target = e.target as Element
                    if (target.closest("a, button")) return
                    if (window.getSelection()?.toString()) return
                    startEdit()
                }}
                onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (canEdit && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault()
                        startEdit()
                    }
                }}
                title={canEdit ? dict.chat.clickToEdit : undefined}
            >
                {selected.length > 0 && (
                    <div className="mb-2 flex" data-testid="sent-selection">
                        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-marker-soft px-2 py-1 text-xs font-medium text-marker-ink">
                            <SquareDashedMousePointer className="size-3.5 shrink-0" />
                            <span className="truncate">{selectionLabel}</span>
                        </span>
                    </div>
                )}
                {images.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                        {images.map((image, i) => (
                            <Image
                                key={i}
                                src={image.url}
                                width={96}
                                height={72}
                                alt={dict.chat.attachedImage}
                                className="h-[72px] w-24 rounded-lg border border-border bg-white object-cover"
                            />
                        ))}
                    </div>
                )}
                {text && <MessageText text={text} />}
            </div>
            {saveTemplate && (
                <TemplateFormDialog
                    open
                    onOpenChange={(open) => !open && setSaveTemplate(false)}
                    onSuccess={() => setSaveTemplate(false)}
                    initialPrompt={getUserOriginalText(message)}
                />
            )}
        </div>
    )
}

function AssistantMessage({
    message,
    index,
    isLastMessage,
    isLastAssistant,
}: {
    message: UIMessage
    index: number
    isLastMessage: boolean
    isLastAssistant: boolean
}) {
    const dict = useDictionary()
    // The thinking header in the page language; while streaming, duration
    // is the seconds so far
    const thinkingMessage = (isStreaming: boolean, duration?: number) => {
        if (isStreaming || duration === 0) {
            return (
                <Shimmer duration={1}>
                    {isStreaming && duration
                        ? formatMessage(dict.reasoning.thinkingFor, {
                              duration,
                          })
                        : dict.reasoning.thinking}
                </Shimmer>
            )
        }
        if (duration === undefined) return <p>{dict.reasoning.thoughtBrief}</p>
        return (
            <p>
                {duration === 1
                    ? dict.reasoning.thoughtForOne
                    : dict.reasoning.thoughtFor.replace(
                          "{duration}",
                          String(duration),
                      )}
            </p>
        )
    }
    const engine = useChatEngine()
    const [feedback, setFeedback] = useState<"good" | "bad" | null>(null)
    const isRestored = engine.loadedMessageIdsRef.current.has(message.id)
    const parts = message.parts
    const isCachedExample = parts.some((p: any) =>
        p.toolCallId?.startsWith("cached-"),
    )
    const text = getMessageTextContent(message)
    // None on cached examples and on answers saved before it was recorded
    const usage = (message.metadata as ChatMessageMetadata | undefined)?.usage

    const submitFeedback = async (value: "good" | "bad") => {
        if (feedback === value) {
            setFeedback(null)
            return
        }
        setFeedback(value)
        try {
            await fetch(getApiEndpoint("/api/log-feedback"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messageId: message.id,
                    feedback: value,
                    sessionId: engine.langfuseSessionId,
                }),
            })
        } catch (error) {
            console.error("Failed to log feedback:", error)
            toast.error(dict.errors.failedToRecordFeedback)
            setFeedback(null)
        }
    }

    // Text parts with nothing shown between them render together (a step
    // boundary of an automatic retry shows nothing), and so do reasoning
    // parts (one row for a run of them); tools render in place
    const blocks: {
        kind: "text" | "tool" | "reasoning"
        index: number
        texts: string[]
    }[] = []
    parts.forEach((part, partIndex) => {
        const last = blocks[blocks.length - 1]
        if (part.type === "reasoning") {
            const text = (part as { text: string }).text
            if (last?.kind === "reasoning") last.texts.push(text)
            else
                blocks.push({
                    kind: "reasoning",
                    index: partIndex,
                    texts: [text],
                })
        } else if (isToolUIPart(part))
            blocks.push({ kind: "tool", index: partIndex, texts: [] })
        else if (part.type === "text") {
            const text = (part as { text: string }).text
            if (last?.kind === "text") last.texts.push(text)
            else blocks.push({ kind: "text", index: partIndex, texts: [text] })
        }
    })
    // Seconds of each reasoning row, by the index of its first part
    const savedSeconds = (
        message.metadata as
            | { reasoningSeconds?: Record<number, number> }
            | undefined
    )?.reasoningSeconds
    const measuredSeconds = engine.reasoningSecondsRef.current

    return (
        <div className="group/message space-y-2.5">
            {blocks.map((block, blockIndex) => {
                const part = parts[block.index]
                if (block.kind === "reasoning") {
                    // Streams until anything else comes after it
                    const isStreamingReasoning =
                        engine.status === "streaming" &&
                        isLastMessage &&
                        blockIndex === blocks.length - 1
                    return (
                        <Reasoning
                            key={`r-${block.index}`}
                            className="w-full"
                            isStreaming={isStreamingReasoning}
                            defaultOpen={!isRestored}
                            getThinkingMessage={thinkingMessage}
                            initialDuration={
                                savedSeconds?.[block.index] ??
                                measuredSeconds.get(message.id)?.[block.index]
                            }
                            onDuration={(seconds) =>
                                measuredSeconds.set(message.id, {
                                    ...measuredSeconds.get(message.id),
                                    [block.index]: seconds,
                                })
                            }
                        >
                            {block.texts.filter(Boolean).join("\n\n")}
                        </Reasoning>
                    )
                }
                if (block.kind === "tool") {
                    const toolPart = part as unknown as ToolPartLike
                    const validationState =
                        engine.validationStates[toolPart.toolCallId]
                    return (
                        <div key={`t-${block.index}`} className="space-y-2">
                            <ToolActivity
                                part={toolPart}
                                isLastMessage={isLastMessage}
                            />
                            {toolPart.type === "tool-display_diagram" &&
                                validationState && (
                                    <ValidationCard
                                        state={validationState}
                                        onImproveWithSuggestions={
                                            engine.improveWithSuggestions
                                        }
                                    />
                                )}
                        </div>
                    )
                }
                const run = block.texts.join("\n")
                if (!run.trim()) return null
                return <MessageText key={`x-${block.index}`} text={run} />
            })}

            {!(engine.isBusy && isLastMessage) && (
                <div className="-ml-1.5 flex items-center transition-opacity [@media(hover:hover)]:opacity-0 group-hover/message:opacity-100 focus-within:opacity-100">
                    {text && <CopyButton text={text} />}
                    {isLastAssistant && !isCachedExample && (
                        <ActionButton
                            label={dict.chat.regenerate}
                            onClick={() => engine.regenerate(index)}
                        >
                            <RotateCcw />
                        </ActionButton>
                    )}
                    <ActionButton
                        label={dict.chat.goodResponse}
                        active={feedback === "good"}
                        onClick={() => submitFeedback("good")}
                    >
                        <ThumbsUp
                            className={cn(
                                feedback === "good" && "fill-current",
                            )}
                        />
                    </ActionButton>
                    <ActionButton
                        label={dict.chat.badResponse}
                        active={feedback === "bad"}
                        onClick={() => submitFeedback("bad")}
                    >
                        <ThumbsDown
                            className={cn(feedback === "bad" && "fill-current")}
                        />
                    </ActionButton>
                    {usage && <ReplyUsageNote usage={usage} />}
                </div>
            )}
        </div>
    )
}

/**
 * A failed request: what to do in the text color, the provider's own words
 * below it, and the action that can fix it first
 */
function ErrorNotice({
    text,
    openModelConfig,
    onOpenModelConfig,
    onRetry,
}: {
    text: string
    openModelConfig: boolean
    onOpenModelConfig: () => void
    onRetry?: () => void
}) {
    const dict = useDictionary()
    // Provider errors are "hint\n\nprovider message"
    const split = text.indexOf("\n\n")
    const headline = split >= 0 ? text.slice(0, split) : text
    const detail = split >= 0 ? text.slice(split + 2).trim() : ""
    const button =
        "inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium"
    return (
        <div
            role="alert"
            className="rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-[13px]"
        >
            <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-line break-words font-medium text-foreground">
                        {headline}
                    </p>
                    {detail && (
                        <p className="mt-1 whitespace-pre-line break-words text-xs text-muted-foreground">
                            {detail}
                        </p>
                    )}
                    {(openModelConfig || onRetry) && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                            {openModelConfig && (
                                <button
                                    type="button"
                                    onClick={onOpenModelConfig}
                                    className={cn(
                                        button,
                                        "bg-primary text-primary-foreground hover:opacity-90",
                                    )}
                                >
                                    {dict.errors.llm.openModelSettings}
                                </button>
                            )}
                            {onRetry && (
                                <button
                                    type="button"
                                    onClick={onRetry}
                                    className={cn(
                                        button,
                                        "border border-border bg-card text-foreground hover:bg-accent",
                                    )}
                                    data-testid="retry-button"
                                >
                                    <RotateCcw className="size-3.5" />
                                    {dict.chat.retry}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// Nothing new on screen for this long while answering: say it is still at work
const QUIET_MS = 5000

/**
 * Seconds since the answer began, and whether it has shown nothing new
 * (`signature` unchanged) for QUIET_MS; ticks each second while busy. Some
 * providers send a drawing only once it is complete (GPT-6 Luna on Bedrock),
 * so the chat can sit still for minutes while the model writes it.
 */
function useAnswerClock(busy: boolean, signature: string) {
    const [startedAt, setStartedAt] = useState(0)
    const [changedAt, setChangedAt] = useState(0)
    const [now, setNow] = useState(0)
    useEffect(() => {
        setStartedAt(busy ? Date.now() : 0)
        if (!busy) return
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [busy])
    // Runs on each new signature: that is the change
    useEffect(() => {
        setChangedAt(Date.now())
    }, [signature])
    return {
        seconds: startedAt
            ? Math.max(0, Math.round((now - startedAt) / 1000))
            : 0,
        quiet: busy && startedAt > 0 && now - changedAt >= QUIET_MS,
    }
}

export function MessageList() {
    const dict = useDictionary()
    const openSettings = useUiStore((s) => s.openSettings)
    const engine = useChatEngine()
    const { messages } = engine
    const endRef = useRef<HTMLDivElement>(null)
    const prevCountRef = useRef(0)
    const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Keep the newest message in view; jump instantly on bulk loads
    useEffect(() => {
        if (!endRef.current || messages.length === 0) return
        const prev = prevCountRef.current
        prevCountRef.current = messages.length
        if (prev === 0 || messages.length - prev > 1) {
            endRef.current.scrollIntoView({ behavior: "instant", block: "end" })
            return
        }
        if (!throttleRef.current) {
            endRef.current.scrollIntoView({ behavior: "smooth", block: "end" })
            throttleRef.current = setTimeout(() => {
                throttleRef.current = null
                endRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "end",
                })
            }, 150)
        }
    }, [messages])

    // A notice (a failed request) is an assistant message without an answer
    const lastAssistantIndex = messages.findLastIndex(
        (m) => m.role === "assistant" && !noticeOf(m),
    )
    const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user")

    // What the answer shows last. A reasoning row and a drawing on its way
    // have their own progress; after a plan sentence or a finished tool the
    // model can work silently, and then the row below shows the time so far.
    const last = messages[messages.length - 1]
    const lastPart = last?.parts?.at(-1)
    const lastTool =
        lastPart && isToolUIPart(lastPart)
            ? (lastPart as unknown as ToolPartLike)
            : undefined
    const clock = useAnswerClock(
        engine.isBusy,
        [
            messages.length,
            last?.parts?.length,
            lastPart?.type === "text" ? lastPart.text.length : 0,
            lastTool?.state,
            lastTool?.input?.xml?.length,
            lastTool?.input?.operations?.length,
        ].join(":"),
    )
    const silentWork =
        engine.isBusy &&
        clock.quiet &&
        last?.role === "assistant" &&
        !noticeOf(last) &&
        lastPart?.type !== "reasoning" &&
        lastTool?.state !== "input-streaming" &&
        lastTool?.state !== "input-available"

    return (
        <div className="space-y-4 px-4 pt-4 pb-2">
            {messages.map((message, index) => {
                const isRestored = engine.loadedMessageIdsRef.current.has(
                    message.id,
                )
                const notice = noticeOf(message)
                return (
                    <div
                        key={message.id}
                        className={cn(!isRestored && "animate-message-in")}
                    >
                        {message.role === "user" ? (
                            <UserMessage
                                message={message}
                                index={index}
                                isLast={index === lastUserIndex}
                            />
                        ) : notice ? (
                            <ErrorNotice
                                text={notice.text}
                                openModelConfig={!!notice.openModelConfig}
                                onOpenModelConfig={() =>
                                    openSettings(
                                        "models",
                                        notice.providerId
                                            ? { providerId: notice.providerId }
                                            : "list",
                                    )
                                }
                                onRetry={
                                    index === messages.length - 1 &&
                                    !engine.isBusy &&
                                    lastUserIndex >= 0
                                        ? engine.retryLastMessage
                                        : undefined
                                }
                            />
                        ) : (
                            <AssistantMessage
                                message={message}
                                index={index}
                                isLastMessage={index === messages.length - 1}
                                isLastAssistant={index === lastAssistantIndex}
                            />
                        )}
                    </div>
                )
            })}
            {engine.status === "submitted" &&
                messages[messages.length - 1]?.role === "user" && (
                    <div className="px-1 text-[13px]" aria-live="polite">
                        <Shimmer as="span">{dict.reasoning.thinking}</Shimmer>
                    </div>
                )}
            {silentWork && (
                <div className="px-1 text-[13px]" data-testid="silent-work">
                    <Shimmer as="span">
                        {formatMessage(dict.chat.drawingElapsed, {
                            seconds: clock.seconds,
                        })}
                    </Shimmer>
                </div>
            )}
            <div ref={endRef} />
        </div>
    )
}
