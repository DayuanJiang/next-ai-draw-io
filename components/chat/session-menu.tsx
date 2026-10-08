import { FileUp, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { useParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { useDictionary } from "@/hooks/use-dictionary"
import { formatRelativeTime } from "@/lib/relative-time"
import { cn } from "@/lib/utils"
import { useChatEngine } from "./chat-engine"

/** Title shown for a session, with the default "New Chat" localized */
export function useSessionTitle(): string {
    const dict = useDictionary()
    const { currentTitle } = useChatEngine()
    return !currentTitle || currentTitle === "New Chat"
        ? dict.workspace.untitled
        : currentTitle
}

/**
 * Popover listing saved diagrams: rename the current one, switch, delete,
 * start a new one or open a file.
 */
export function SessionMenu({
    children,
    align = "start",
    onOpenFile,
}: {
    children: React.ReactNode
    align?: "start" | "center" | "end"
    onOpenFile: () => void
}) {
    const dict = useDictionary()
    const t = dict.sessionHistory
    const params = useParams<{ lang: string }>()
    const engine = useChatEngine()
    const [open, setOpen] = useState(false)
    const title = useSessionTitle()
    const [query, setQuery] = useState("")
    const [renaming, setRenaming] = useState(false)
    const [draftTitle, setDraftTitle] = useState("")
    const [toDelete, setToDelete] = useState<string | null>(null)
    const renameRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!open) {
            setRenaming(false)
            setQuery("")
        }
    }, [open])
    useEffect(() => {
        if (renaming) renameRef.current?.select()
    }, [renaming])

    // The title as the list shows it
    const shownTitle = (title: string) =>
        title === "New Chat" ? dict.workspace.untitled : title
    const sessions = engine.sessions.filter((s) =>
        shownTitle(s.title).toLowerCase().includes(query.trim().toLowerCase()),
    )

    const commitRename = async () => {
        const next = draftTitle.trim()
        setRenaming(false)
        if (next && next !== title) await engine.renameSession(next)
    }

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>{children}</PopoverTrigger>
                <PopoverContent
                    align={align}
                    className="flex max-h-[min(560px,80vh)] w-[340px] flex-col overflow-hidden rounded-xl p-0 shadow-pop"
                >
                    <div className="border-b border-border p-3">
                        {renaming ? (
                            <input
                                ref={renameRef}
                                value={draftTitle}
                                onChange={(e) => setDraftTitle(e.target.value)}
                                onBlur={commitRename}
                                onKeyDown={(e) => {
                                    // Enter that picks an IME candidate
                                    // (Safari: keyCode 229)
                                    if (
                                        e.nativeEvent.isComposing ||
                                        e.keyCode === 229
                                    ) {
                                        return
                                    }
                                    if (e.key === "Enter") commitRename()
                                    if (e.key === "Escape") setRenaming(false)
                                }}
                                maxLength={100}
                                aria-label={t.rename}
                                className="h-8 w-full rounded-lg border border-foreground/20 bg-card px-2.5 text-[13px] font-medium outline-none"
                            />
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    setDraftTitle(title)
                                    setRenaming(true)
                                }}
                                className="group/rename flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left hover:bg-accent"
                                data-testid="rename-session"
                            >
                                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                                    {title}
                                </span>
                                <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
                            </button>
                        )}
                        <div className="mt-2 flex gap-1.5">
                            <button
                                type="button"
                                disabled={engine.isBusy}
                                onClick={() => {
                                    setOpen(false)
                                    engine.newChat()
                                }}
                                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
                            >
                                <Plus className="size-3.5" />
                                {dict.nav.newChat}
                            </button>
                            <button
                                type="button"
                                disabled={engine.isBusy}
                                onClick={() => {
                                    setOpen(false)
                                    onOpenFile()
                                }}
                                className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                            >
                                <FileUp className="size-3.5" />
                                {dict.workspace.openFile}
                            </button>
                        </div>
                    </div>

                    {engine.sessions.length > 0 && (
                        <div className="px-3 pt-3">
                            <div className="relative">
                                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={t.searchPlaceholder}
                                    className="h-8 w-full rounded-lg bg-muted pr-2.5 pl-8 text-[13px] outline-none placeholder:text-faint"
                                />
                            </div>
                        </div>
                    )}

                    <div className="min-h-0 flex-1 overflow-y-auto p-1.5 scrollbar-thin">
                        {engine.sessions.length === 0 ? (
                            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                                {t.empty}
                            </p>
                        ) : sessions.length === 0 ? (
                            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                                {t.noResults}
                            </p>
                        ) : (
                            sessions.map((session) => {
                                const isCurrent =
                                    session.id === engine.currentSessionId
                                // The answer being written must stay in its
                                // own chat
                                const locked = engine.isBusy && !isCurrent
                                const choose = () => {
                                    if (locked) return
                                    setOpen(false)
                                    if (!isCurrent) {
                                        engine.selectSession(session.id)
                                    }
                                }
                                return (
                                    // biome-ignore lint/a11y/useSemanticElements: contains the delete button
                                    <div
                                        key={session.id}
                                        role="button"
                                        tabIndex={locked ? -1 : 0}
                                        aria-disabled={locked || undefined}
                                        title={locked ? t.busyHint : undefined}
                                        onClick={choose}
                                        onKeyDown={(e) => {
                                            if (e.target !== e.currentTarget)
                                                return
                                            if (
                                                e.key === "Enter" ||
                                                e.key === " "
                                            ) {
                                                e.preventDefault()
                                                choose()
                                            }
                                        }}
                                        className={cn(
                                            "group/session flex cursor-pointer items-center gap-2.5 rounded-lg p-1.5 hover:bg-accent",
                                            isCurrent && "bg-accent",
                                            locked &&
                                                "cursor-not-allowed opacity-50 hover:bg-transparent",
                                        )}
                                    >
                                        <span className="sheet-light flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
                                            {session.thumbnailDataUrl && (
                                                // biome-ignore lint/performance/noImgElement: data URL thumbnail
                                                <img
                                                    src={
                                                        session.thumbnailDataUrl
                                                    }
                                                    alt=""
                                                    className="max-h-8 max-w-11 object-contain"
                                                />
                                            )}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[13px] text-foreground">
                                                {shownTitle(session.title)}
                                            </span>
                                            <span className="block text-[11px] text-faint">
                                                {formatRelativeTime(
                                                    session.updatedAt,
                                                    params.lang,
                                                    t.justNow,
                                                )}
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            disabled={
                                                isCurrent && engine.isBusy
                                            }
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setToDelete(session.id)
                                            }}
                                            aria-label={t.deleteTitle}
                                            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-faint [@media(hover:hover)]:opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/session:opacity-100 focus-visible:opacity-100"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </button>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </PopoverContent>
            </Popover>

            <AlertDialog
                open={!!toDelete}
                onOpenChange={(o) => !o && setToDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t.deleteDescription}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {dict.common.cancel}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => {
                                if (toDelete) engine.deleteSession(toDelete)
                                setToDelete(null)
                            }}
                        >
                            {dict.common.delete}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
