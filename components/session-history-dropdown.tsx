"use client"

import { MessageSquare, MessagesSquare, Plus, Trash2 } from "lucide-react"
import Image from "next/image"
import { useState } from "react"
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
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { useDictionary } from "@/hooks/use-dictionary"
import type { SessionMetadata } from "@/lib/session-storage"
import { cn } from "@/lib/utils"

interface SessionHistoryDropdownProps {
    sessions: SessionMetadata[]
    currentSessionId: string | null
    isLoading: boolean
    onNewChat: () => void
    onSelectSession: (id: string) => void
    onDeleteSession: (id: string) => void
}

type TimeGroup = "today" | "yesterday" | "thisWeek" | "earlier"

interface GroupedSessions {
    group: TimeGroup
    sessions: SessionMetadata[]
}

function getTimeGroup(timestamp: number): TimeGroup {
    const now = new Date()
    const date = new Date(timestamp)
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "today"
    if (diffDays === 1) return "yesterday"
    if (diffDays < 7) return "thisWeek"
    return "earlier"
}

function groupSessionsByDate(sessions: SessionMetadata[]): GroupedSessions[] {
    const groups: Record<TimeGroup, SessionMetadata[]> = {
        today: [],
        yesterday: [],
        thisWeek: [],
        earlier: [],
    }

    for (const session of sessions) {
        const group = getTimeGroup(session.updatedAt)
        groups[group].push(session)
    }

    const order: TimeGroup[] = ["today", "yesterday", "thisWeek", "earlier"]
    return order
        .filter((group) => groups[group].length > 0)
        .map((group) => ({ group, sessions: groups[group] }))
}

function formatSessionDate(timestamp: number): string {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

    if (diffHours < 1) return "Just now"
    if (diffHours < 24) return `${diffHours}h ago`

    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    })
}

export function SessionHistoryDropdown({
    sessions,
    currentSessionId,
    isLoading,
    onNewChat,
    onSelectSession,
    onDeleteSession,
}: SessionHistoryDropdownProps) {
    const dict = useDictionary()
    const [open, setOpen] = useState(false)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)

    const groupedSessions = groupSessionsByDate(sessions)

    const groupLabels: Record<TimeGroup, string> = {
        today: dict.sessionHistory?.today || "Today",
        yesterday: dict.sessionHistory?.yesterday || "Yesterday",
        thisWeek: dict.sessionHistory?.thisWeek || "This Week",
        earlier: dict.sessionHistory?.earlier || "Earlier",
    }

    const handleSelectSession = (id: string) => {
        console.log("[dropdown] handleSelectSession called, id:", id)
        // Close dropdown FIRST to avoid visual flash during session save/switch
        setOpen(false)
        // Small delay to ensure dropdown is closed before state updates
        requestAnimationFrame(() => {
            console.log(
                "[dropdown] requestAnimationFrame firing, calling onSelectSession",
            )
            onSelectSession(id)
        })
    }

    const handleNewChat = () => {
        setOpen(false)
        requestAnimationFrame(() => {
            onNewChat()
        })
    }

    const handleDeleteClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        setSessionToDelete(id)
        setDeleteDialogOpen(true)
    }

    const handleConfirmDelete = async () => {
        if (sessionToDelete) {
            await onDeleteSession(sessionToDelete)
        }
        setDeleteDialogOpen(false)
        setSessionToDelete(null)
    }

    // Calculate animation index across all groups
    let animationIndex = 0

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={isLoading}
                                >
                                    <MessagesSquare className="h-4 w-4" />
                                </Button>
                            </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent>
                            {dict.sessionHistory?.tooltip || "Chat History"}
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>

                <PopoverContent
                    className="w-72 p-0 overflow-hidden"
                    align="end"
                    side="bottom"
                    sideOffset={8}
                    collisionPadding={16}
                >
                    {/* New Chat Button */}
                    <div className="border-b p-2">
                        <Button
                            variant="ghost"
                            className="w-full justify-start gap-2 transition-colors duration-150"
                            onClick={handleNewChat}
                        >
                            <Plus className="h-4 w-4" />
                            {dict.sessionHistory?.newChat || "New Chat"}
                        </Button>
                    </div>

                    {/* Sessions List */}
                    <div className="h-[400px] overflow-y-auto">
                        {sessions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 px-4">
                                <MessagesSquare className="h-10 w-10 text-muted-foreground/50 mb-3" />
                                <p className="text-sm font-medium text-muted-foreground">
                                    {dict.sessionHistory?.empty ||
                                        "No chat history yet"}
                                </p>
                                <p className="text-xs text-muted-foreground/70 mt-1">
                                    {dict.sessionHistory?.emptyHint ||
                                        "Start a conversation to begin"}
                                </p>
                            </div>
                        ) : (
                            <div className="py-1">
                                {groupedSessions.map(
                                    ({ group, sessions: groupSessions }) => (
                                        <div key={group}>
                                            {/* Section Header */}
                                            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground/70 uppercase tracking-wider">
                                                {groupLabels[group]}
                                            </div>
                                            {/* Sessions in group */}
                                            {groupSessions.map((session) => {
                                                const currentIndex =
                                                    animationIndex++
                                                const isActive =
                                                    session.id ===
                                                    currentSessionId
                                                console.log(
                                                    "[dropdown render] session:",
                                                    session.id.slice(-8),
                                                    "title:",
                                                    session.title.slice(0, 20),
                                                    "hasThumbnail:",
                                                    !!session.thumbnailDataUrl,
                                                    "thumbnailLen:",
                                                    session.thumbnailDataUrl
                                                        ?.length || 0,
                                                )
                                                return (
                                                    <div
                                                        key={session.id}
                                                        className={cn(
                                                            "group flex cursor-pointer items-start gap-2 mx-1 rounded-r-md px-2 py-2 transition-all duration-150",
                                                            "animate-in fade-in slide-in-from-top-1",
                                                            isActive
                                                                ? "border-l-2 border-primary bg-primary/5"
                                                                : "border-l-2 border-transparent hover:bg-accent",
                                                        )}
                                                        style={{
                                                            animationDelay: `${currentIndex * 30}ms`,
                                                            animationDuration:
                                                                "150ms",
                                                            animationFillMode:
                                                                "backwards",
                                                        }}
                                                        onClick={() =>
                                                            handleSelectSession(
                                                                session.id,
                                                            )
                                                        }
                                                    >
                                                        {/* Thumbnail or fallback icon - using same pattern as history-dialog */}
                                                        {session.thumbnailDataUrl ? (
                                                            <div className="w-10 h-10 shrink-0 rounded border bg-white overflow-hidden">
                                                                <Image
                                                                    src={
                                                                        session.thumbnailDataUrl
                                                                    }
                                                                    alt=""
                                                                    width={40}
                                                                    height={40}
                                                                    className="object-contain w-full h-full"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <MessageSquare
                                                                className={cn(
                                                                    "mt-0.5 h-4 w-4 shrink-0 transition-colors duration-150",
                                                                    isActive
                                                                        ? "text-primary"
                                                                        : "text-muted-foreground",
                                                                )}
                                                            />
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            <div
                                                                className={cn(
                                                                    "truncate text-sm transition-colors duration-150",
                                                                    isActive
                                                                        ? "font-medium"
                                                                        : "font-normal",
                                                                )}
                                                            >
                                                                {session.title}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground/70">
                                                                {formatSessionDate(
                                                                    session.updatedAt,
                                                                )}
                                                            </div>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className={cn(
                                                                "h-6 w-6 shrink-0 transition-all duration-150",
                                                                "opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0",
                                                            )}
                                                            onClick={(e) =>
                                                                handleDeleteClick(
                                                                    e,
                                                                    session.id,
                                                                )
                                                            }
                                                        >
                                                            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive transition-colors duration-150" />
                                                        </Button>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ),
                                )}
                            </div>
                        )}
                    </div>
                </PopoverContent>
            </Popover>

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
            >
                <AlertDialogContent className="max-w-sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {dict.sessionHistory?.deleteTitle ||
                                "Delete this chat?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {dict.sessionHistory?.deleteDescription ||
                                "This will permanently delete this chat session and its diagram. This action cannot be undone."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {dict.common.cancel}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            className="border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-400"
                        >
                            {dict.common.delete}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
