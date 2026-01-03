"use client"

import { MessageSquare, MessagesSquare, Plus, Trash2 } from "lucide-react"
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
import { ScrollArea } from "@/components/ui/scroll-area"
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

function formatRelativeDate(timestamp: number): string {
    const now = new Date()
    const date = new Date(timestamp)
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
        return "Today"
    } else if (diffDays === 1) {
        return "Yesterday"
    } else if (diffDays < 7) {
        return `${diffDays} days ago`
    } else {
        return date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        })
    }
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

    const handleSelectSession = (id: string) => {
        onSelectSession(id)
        setOpen(false)
    }

    const handleNewChat = () => {
        onNewChat()
        setOpen(false)
    }

    const handleDeleteClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        setSessionToDelete(id)
        setDeleteDialogOpen(true)
    }

    const handleConfirmDelete = () => {
        if (sessionToDelete) {
            onDeleteSession(sessionToDelete)
        }
        setDeleteDialogOpen(false)
        setSessionToDelete(null)
    }

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
                    className="w-72 p-0"
                    align="start"
                    sideOffset={8}
                >
                    {/* New Chat Button */}
                    <div className="border-b p-2">
                        <Button
                            variant="ghost"
                            className="w-full justify-start gap-2"
                            onClick={handleNewChat}
                        >
                            <Plus className="h-4 w-4" />
                            {dict.sessionHistory?.newChat || "New Chat"}
                        </Button>
                    </div>

                    {/* Sessions List */}
                    <ScrollArea className="max-h-80">
                        {sessions.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                                {dict.sessionHistory?.empty ||
                                    "No chat history yet"}
                            </div>
                        ) : (
                            <div className="p-1">
                                {sessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className={cn(
                                            "group flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 hover:bg-accent",
                                            session.id === currentSessionId &&
                                                "bg-accent",
                                        )}
                                        onClick={() =>
                                            handleSelectSession(session.id)
                                        }
                                    >
                                        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium">
                                                {session.title}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {formatRelativeDate(
                                                    session.updatedAt,
                                                )}
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                                            onClick={(e) =>
                                                handleDeleteClick(e, session.id)
                                            }
                                        >
                                            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </PopoverContent>
            </Popover>

            {/* Delete Confirmation Dialog */}
            <AlertDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
            >
                <AlertDialogContent>
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
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {dict.common.delete}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
