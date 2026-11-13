import { isToolUIPart, type UIMessage } from "ai"
import {
    AlertCircle,
    BookmarkPlus,
    Check,
    ChevronDown,
    Copy,
    FileCode,
    FileText,
    Flag,
    Link,
    Pencil,
    RotateCcw,
    SquareDashedMousePointer,
    ThumbsDown,
    ThumbsUp,
    X,
} from "lucide-react"
import { memo, useEffect, useRef, useState } from "react"
import ReactMarkdown, { type Options } from "react-markdown"
import remarkGfm from "remark-gfm"
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
    withoutToolCallMarker,
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
function CopyButton({ text, label }: { text: string; label: string }) {
    const dict = useDictionary()
    const { copied, copy } = useCopy(() =>
        toast.error(dict.chat.failedToCopyDetail),
    )
    return (
        <ActionButton
            label={copied ? dict.chat.copied : label}
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

// Tables, strikethrough and bare links, as models write them. A single "~"
// stays as typed: it also stands for "about" ("~200 px")
const MARKDOWN_PLUGINS: Options["remarkPlugins"] = [
    [remarkGfm, { singleTilde: false }],
]

const MARKDOWN_COMPONENTS: Options["components"] = {
    // A table wider than the panel scrolls sideways in its own box
    table: ({ node: _node, ...props }) => (
        <div className="overflow-x-auto">
            <table {...props} />
        </div>
    ),
    // A picture shows as a link to it. As a picture, the browser would
    // request whatever address the model wrote, and text hidden in an
    // attached page or file can make it put the conversation into that
    // address. (Markdown gives the address as text; the check is for the
    // type, which also allows a Blob.)
    img: ({ src, alt }) =>
        typeof src === "string" ? <a href={src}>{alt || src}</a> : null,
}

// Memoized: the list renders again on each streamed chunk and each key typed
// in the message box, and a message whose text is the same would parse its
// Markdown again
const MessageText = memo(function MessageText({
    text,
    typed,
}: {
    text: string
    /** The user's own text: its lines stay as typed */
    typed?: boolean
}) {
    const sections = splitTextIntoFileSections(text)
    return (
        <div className="space-y-2">
            {sections.map((section, index) =>
                section.type === "text" ? (
                    <div
                        key={index}
                        className={cn(
                            "prose prose-sm max-w-none break-words text-[14px] leading-relaxed text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
                            "prose-p:my-1.5 prose-table:my-2 prose-pre:bg-surface-2 prose-pre:text-foreground prose-code:before:content-none prose-code:after:content-none dark:prose-invert",
                            // Markdown joins the lines of a paragraph into
                            // one; a request typed on several lines
                            // (Shift+Enter) keeps them
                            typed && "[&_p]:whitespace-pre-line",
                        )}
                    >
                        <ReactMarkdown
                            remarkPlugins={MARKDOWN_PLUGINS}
                            components={MARKDOWN_COMPONENTS}
                        >
                            {section.content}
                        </ReactMarkdown>
                    </div>
                ) : (
                    <AttachedSection key={index} section={section} />
                ),
            )}
        </div>
    )
})

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
                {/* The typed text, as the edit box and "Save as template"
                    take it; the text of attached files stays out */}
                <CopyButton
                    text={getUserOriginalText(message)}
                    label={dict.chat.copyMessage}
                />
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
                {text && <MessageText text={text} typed />}
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
    answerStartedAt,
}: {
    message: UIMessage
    index: number
    isLastMessage: boolean
    isLastAssistant: boolean
    /** When the request of the answer on its way went out; 0 without one */
    answerStartedAt: number
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
    // None on cached examples and on answers saved before it was recorded
    const usage = (message.metadata as ChatMessageMetadata | undefined)?.usage

    // After a thumbs down: asking why, then thanks once sent
    const [reasonsStep, setReasonsStep] = useState<"ask" | "thanks" | null>(
        null,
    )
    useEffect(() => {
        if (reasonsStep !== "thanks") return
        const timer = setTimeout(() => setReasonsStep(null), 3000)
        return () => clearTimeout(timer)
    }, [reasonsStep])

    // Votes in order of the clicks, also across a remount (another chat
    // and back): each replaces the answer's score
    const postFeedback = (
        value: "good" | "bad",
        why?: { reasons: FeedbackReason[]; note: string },
    ): Promise<boolean> => {
        const run = (feedbackQueues.get(message.id) ?? Promise.resolve()).then(
            () => sendFeedback(value, why),
        )
        feedbackQueues.set(message.id, run)
        return run
    }
    // Bumped on each click, so an answer that comes back late changes
    // nothing the user has done since
    const voteSeqRef = useRef(0)

    const sendFeedback = async (
        value: "good" | "bad",
        why?: { reasons: FeedbackReason[]; note: string },
    ): Promise<boolean> => {
        try {
            const res = await fetch(getApiEndpoint("/api/log-feedback"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messageId: message.id,
                    feedback: value,
                    sessionId: engine.langfuseSessionId,
                    traceId: (message.metadata as ChatMessageMetadata)?.traceId,
                    ...why,
                }),
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return true
        } catch (error) {
            console.error("Failed to log feedback:", error)
            toast.error(dict.errors.failedToRecordFeedback)
            return false
        }
    }

    const submitFeedback = async (value: "good" | "bad") => {
        const seq = ++voteSeqRef.current
        setReasonsStep(null)
        if (feedback === value) {
            setFeedback(null)
            return
        }
        setFeedback(value)
        if (value === "bad") setReasonsStep("ask")
        const sent = await postFeedback(value)
        if (!sent && voteSeqRef.current === seq) {
            setFeedback(null)
            setReasonsStep(null)
        }
    }

    const submitReasons = async (reasons: FeedbackReason[], note: string) => {
        // Also a click: a failed vote before it leaves the form alone
        const seq = ++voteSeqRef.current
        const sent = await postFeedback("bad", { reasons, note })
        if (sent && voteSeqRef.current === seq) setReasonsStep("thanks")
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
            const text = withoutToolCallMarker((part as { text: string }).text)
            if (last?.kind === "text") last.texts.push(text)
            else blocks.push({ kind: "text", index: partIndex, texts: [text] })
        }
    })
    // The answer's text as shown, for its copy button
    const text = blocks
        .filter((block) => block.kind === "text")
        .flatMap((block) => block.texts)
        .join("\n")
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
                            // The first thing of the answer: the model
                            // has been thinking since the request went
                            // out. Claude on Bedrock sends its thinking
                            // only when it is over, minutes later.
                            startedAt={
                                blockIndex === 0 ? answerStartedAt : undefined
                            }
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
                <div
                    className={cn(
                        "-ml-1.5 flex items-center transition-opacity [@media(hover:hover)]:opacity-0 group-hover/message:opacity-100 focus-within:opacity-100",
                        // Always under the latest answer; elsewhere while its
                        // question shows the vote it is about
                        (isLastAssistant || reasonsStep) &&
                            "[@media(hover:hover)]:opacity-100",
                    )}
                >
                    {text && (
                        <CopyButton
                            text={text}
                            label={dict.chat.copyResponse}
                        />
                    )}
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
            {reasonsStep === "ask" && (
                <FeedbackReasons
                    onSubmit={submitReasons}
                    onClose={() => setReasonsStep(null)}
                />
            )}
            {reasonsStep === "thanks" && (
                <p
                    className="px-1 text-[13px] text-muted-foreground"
                    aria-live="polite"
                >
                    {dict.feedback.thanks}
                </p>
            )}
        </div>
    )
}

const FEEDBACK_REASONS = [
    ["wrong-diagram", "wrongDiagram"],
    ["messy-layout", "messyLayout"],
    ["ignored-request", "ignoredRequest"],
    ["too-slow", "tooSlow"],
] as const

type FeedbackReason = (typeof FEEDBACK_REASONS)[number][0]

// The last vote request of each answer, by message id
const feedbackQueues = new Map<string, Promise<boolean>>()

/** Below an answer voted down: why, by a few choices and a line of text */
function FeedbackReasons({
    onSubmit,
    onClose,
}: {
    onSubmit: (reasons: FeedbackReason[], note: string) => Promise<void>
    onClose: () => void
}) {
    const dict = useDictionary()
    const [picked, setPicked] = useState<FeedbackReason[]>([])
    const [note, setNote] = useState("")
    const [sending, setSending] = useState(false)
    const canSend = (picked.length > 0 || note.trim() !== "") && !sending

    const send = async () => {
        if (!canSend) return
        setSending(true)
        await onSubmit(picked, note.trim())
        setSending(false)
    }

    return (
        <div
            className="space-y-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-[13px]"
            data-testid="feedback-reasons"
        >
            <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-foreground">
                    {dict.feedback.question}
                </p>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={dict.common.close}
                    title={dict.common.close}
                    className="inline-flex size-6 items-center justify-center rounded-md text-faint hover:bg-accent hover:text-foreground"
                >
                    <X className="size-3.5" />
                </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_REASONS.map(([reason, key]) => {
                    const on = picked.includes(reason)
                    return (
                        <button
                            key={reason}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                                setPicked((current) =>
                                    on
                                        ? current.filter((r) => r !== reason)
                                        : [...current, reason],
                                )
                            }
                            className={cn(
                                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                                on
                                    ? "border-primary bg-primary/10 text-foreground"
                                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                        >
                            {dict.feedback[key]}
                        </button>
                    )
                })}
            </div>
            <div className="flex gap-2">
                <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                            e.preventDefault()
                            void send()
                        }
                    }}
                    placeholder={dict.feedback.notePlaceholder}
                    aria-label={dict.feedback.notePlaceholder}
                    maxLength={1000}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring"
                />
                <button
                    type="button"
                    onClick={() => void send()}
                    disabled={!canSend}
                    className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    data-testid="feedback-send"
                >
                    {dict.feedback.send}
                </button>
            </div>
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
    onReport,
}: {
    text: string
    openModelConfig: boolean
    onOpenModelConfig: () => void
    onRetry?: () => void
    /** None on errors the user can fix in settings */
    onReport?: () => void
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
                    {(openModelConfig || onRetry || onReport) && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
                            {onReport && (
                                <button
                                    type="button"
                                    onClick={onReport}
                                    className={cn(
                                        button,
                                        "text-muted-foreground hover:bg-accent hover:text-foreground",
                                    )}
                                    data-testid="report-button"
                                >
                                    <Flag className="size-3.5" />
                                    {dict.report.button}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

/**
 * The user stopped the answer: said in the page's language, in the muted
 * text of a stopped call, with Retry
 */
function StoppedNotice({ onRetry }: { onRetry?: () => void }) {
    const dict = useDictionary()
    return (
        <div
            className="flex items-center gap-2.5 px-1 text-[13px] text-muted-foreground"
            data-testid="stopped-notice"
        >
            {dict.versions.stopped}
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-accent"
                    data-testid="retry-button"
                >
                    <RotateCcw className="size-3.5" />
                    {dict.chat.retry}
                </button>
            )}
        </div>
    )
}

// Nothing new on screen for this long while answering: say it is still at
// work. Short, because GPT-6 Luna and DeepSeek on Bedrock go quiet after
// their plan sentence in every answer (the drawing comes in one piece 5 to
// 20 seconds later), and longer than the pauses inside a streamed text.
const QUIET_MS = 2000

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
        startedAt,
        seconds: startedAt
            ? Math.max(0, Math.round((now - startedAt) / 1000))
            : 0,
        quiet: busy && startedAt > 0 && now - changedAt >= QUIET_MS,
    }
}

export function MessageList() {
    const dict = useDictionary()
    const openSettings = useUiStore((s) => s.openSettings)
    const openProblemReport = useUiStore((s) => s.openProblemReport)
    const engine = useChatEngine()
    const { messages } = engine
    const endRef = useRef<HTMLDivElement>(null)
    const prevCountRef = useRef(0)
    const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Whether the list follows the answer as it grows; off from when the
    // user scrolls up to read something earlier until they are back at the
    // end
    const followRef = useRef(true)

    useEffect(() => {
        // The chat panel's scroll area
        const scroller = endRef.current?.closest(".overflow-y-auto")
        if (!scroller) return
        // The user takes the list: the wheel or trackpad turned up, a
        // finger on it, or the scrollbar grabbed (a press on the area
        // itself: everything else in it is its content). These inputs
        // tell it, because the browser also moves the list up on its own
        // when the content changes.
        const take = (event: Event) => {
            if (event instanceof WheelEvent && event.deltaY >= 0) {
                // A turn down that reaches the end follows again at once:
                // when its smooth scroll arrives, the answer may have
                // grown past the place it was heading for
                const { scrollTop, scrollHeight, clientHeight } = scroller
                if (scrollHeight - scrollTop - clientHeight < event.deltaY) {
                    followRef.current = true
                }
                return
            }
            if (event.type === "pointerdown" && event.target !== scroller) {
                return
            }
            // At the top there is nowhere to go
            if (scroller.scrollTop === 0) return
            // A smooth scroll to the end may be on its way and would bring
            // the list back: an instant one to where it is now ends it.
            // Only at this first step: later it would cut short the
            // wheel's own smooth scroll.
            if (followRef.current) {
                scroller.scrollTo({ top: scroller.scrollTop })
            }
            followRef.current = false
        }
        // Page Up, the up arrow and Home scroll the list too, once it was
        // clicked. The key is pressed on the page and does not say what
        // it scrolls: the user takes the list when it moves up right
        // after one.
        let upKeyAt = Number.NEGATIVE_INFINITY
        const onKeyDown = (event: KeyboardEvent) => {
            if (!["PageUp", "ArrowUp", "Home"].includes(event.key)) return
            upKeyAt = event.timeStamp
            // (As above: ends a smooth scroll to the end on its way)
            if (followRef.current) {
                scroller.scrollTo({ top: scroller.scrollTop })
            }
        }
        // Scrolled back down to the end: follow again
        let lastTop = scroller.scrollTop
        const onScroll = (event: Event) => {
            const { scrollTop, scrollHeight, clientHeight } = scroller
            if (scrollTop < lastTop && event.timeStamp - upKeyAt < 500) {
                followRef.current = false
            } else if (
                scrollTop > lastTop &&
                scrollHeight - scrollTop - clientHeight < 80
            ) {
                followRef.current = true
            }
            lastTop = scrollTop
        }
        const takes = ["wheel", "touchmove", "pointerdown"]
        for (const name of takes) {
            scroller.addEventListener(name, take, { passive: true })
        }
        scroller.addEventListener("scroll", onScroll, { passive: true })
        document.addEventListener("keydown", onKeyDown)
        return () => {
            for (const name of takes) scroller.removeEventListener(name, take)
            scroller.removeEventListener("scroll", onScroll)
            document.removeEventListener("keydown", onKeyDown)
        }
    }, [])

    // Keep the newest message in view; jump instantly on bulk loads
    useEffect(() => {
        if (!endRef.current || messages.length === 0) return
        const prev = prevCountRef.current
        prevCountRef.current = messages.length
        if (prev === 0 || messages.length - prev > 1) {
            endRef.current.scrollIntoView({ behavior: "instant", block: "end" })
            return
        }
        // A question just went out (sent, edited, regenerated, retried):
        // it comes into view and its answer is followed
        if (messages.at(-1)?.role === "user") followRef.current = true
        if (!followRef.current) return
        if (!throttleRef.current) {
            endRef.current.scrollIntoView({ behavior: "smooth", block: "end" })
            throttleRef.current = setTimeout(() => {
                throttleRef.current = null
                if (!followRef.current) return
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

    // For screen readers, when the answer ends: what its last drawing did,
    // as its version card says, or that the answer is complete. Empty while
    // it streams (so the next answer's sentence is a change, which is read),
    // after Stop, and on an error card, which is an alert of its own.
    const drawing =
        last?.role === "assistant"
            ? last.parts.findLast(
                  (part) =>
                      (part.type === "tool-display_diagram" ||
                          part.type === "tool-edit_diagram") &&
                      part.state === "output-available",
              )
            : undefined
    const answerOutcome =
        engine.isBusy ||
        last?.role !== "assistant" ||
        noticeOf(last) ||
        engine.stoppedRef.current
            ? ""
            : drawing?.type === "tool-edit_diagram"
              ? dict.versions.edited
              : drawing
                ? dict.versions.created
                : dict.chat.answerComplete

    return (
        <div className="space-y-4 px-4 pt-4 pb-2">
            <div className="sr-only" aria-live="polite">
                {answerOutcome}
            </div>
            {messages.map((message, index) => {
                const isRestored = engine.loadedMessageIdsRef.current.has(
                    message.id,
                )
                const notice = noticeOf(message)
                // On the newest notice: it sends the last question again
                const onRetry =
                    index === messages.length - 1 &&
                    !engine.isBusy &&
                    lastUserIndex >= 0
                        ? engine.retryLastMessage
                        : undefined
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
                        ) : notice?.stopped ? (
                            <StoppedNotice onRetry={onRetry} />
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
                                onRetry={onRetry}
                                onReport={
                                    notice.openModelConfig || notice.accessCode
                                        ? undefined
                                        : () =>
                                              openProblemReport({
                                                  kind: "chat-error",
                                                  message: notice.text,
                                                  // None on cards saved
                                                  // before they kept them
                                                  actions: notice.actions ?? [],
                                              })
                                }
                            />
                        ) : (
                            <AssistantMessage
                                message={message}
                                index={index}
                                isLastMessage={index === messages.length - 1}
                                answerStartedAt={clock.startedAt}
                                // Of the newest question: when that one
                                // got no answer (it failed or was stopped
                                // at once), Regenerate under the answer
                                // before it would drop the question
                                isLastAssistant={
                                    index === lastAssistantIndex &&
                                    index > lastUserIndex
                                }
                            />
                        )}
                    </div>
                )
            })}
            {engine.status === "submitted" &&
                messages[messages.length - 1]?.role === "user" && (
                    // The seconds show it is alive: a model can think for
                    // minutes before its first output. A screen reader
                    // reads the row once; the seconds stay silent.
                    <div
                        className="px-1 text-[13px]"
                        aria-live={clock.seconds ? "off" : "polite"}
                    >
                        <Shimmer as="span">
                            {clock.seconds
                                ? formatMessage(dict.reasoning.thinkingFor, {
                                      duration: clock.seconds,
                                  })
                                : dict.reasoning.thinking}
                        </Shimmer>
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
