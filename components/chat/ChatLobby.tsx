"use client"

import {
    ChevronDown,
    ChevronUp,
    MessageSquare,
    Search,
    Trash2,
    X,
} from "lucide-react"
import { useState } from "react"
import ExamplePanel from "@/components/chat-example-panel"
import Image from "@/components/image-with-basepath"
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

interface SessionMetadata {
    id: string
    title: string
    updatedAt: number
    thumbnailDataUrl?: string
}

interface ChatLobbyProps {
    sessions: SessionMetadata[]
    onSelectSession: (id: string) => void
    onDeleteSession?: (id: string) => void
    setInput: (input: string) => void
    setFiles: (files: File[]) => void
    dict: {
        sessionHistory?: {
            recentChats?: string
            searchPlaceholder?: string
            noResults?: string
            justNow?: string
            deleteTitle?: string
            deleteDescription?: string
        }
        examples?: {
            quickExamples?: string
        }
        common: {
            delete: string
            cancel: string
        }
    }
}

// Helper to format session date
function formatSessionDate(
    timestamp: number,
    dict?: { justNow?: string },
): string {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

    if (diffMins < 1) return dict?.justNow || "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`

    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    })
}

export function ChatLobby({
    sessions,
    onSelectSession,
    onDeleteSession,
    setInput,
    setFiles,
    dict,
}: ChatLobbyProps) {
    // Track whether examples section is expanded (collapsed by default when there's history)
    const [examplesExpanded, setExamplesExpanded] = useState(false)
    // Delete confirmation dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)
    // Search filter for history
    const [searchQuery, setSearchQuery] = useState("")

    const hasHistory = sessions.length > 0

    if (!hasHistory) {
        // Show full examples when no history
        return <ExamplePanel setInput={setInput} setFiles={setFiles} />
    }

    // Show history + collapsible examples when there are sessions
    return (
        <div className="py-6 px-2 animate-fade-in">
            {/* Recent Chats Section */}
            <div className="mb-6">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 mb-3">
                    {dict.sessionHistory?.recentChats || "Recent Chats"}
                </p>
                {/* Search Bar */}
                <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={
                            dict.sessionHistory?.searchPlaceholder ||
                            "Search chats..."
                        }
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border/60 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted transition-colors"
                        >
                            <X className="w-3 h-3 text-muted-foreground" />
                        </button>
                    )}
                </div>
                <div className="space-y-2">
                    {sessions
                        .filter((session) =>
                            session.title
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase()),
                        )
                        .map((session) => (
                            // biome-ignore lint/a11y/useSemanticElements: Cannot use button - has nested delete button which causes hydration error
                            <div
                                key={session.id}
                                role="button"
                                tabIndex={0}
                                className="group w-full flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card hover:bg-accent/50 hover:border-primary/30 transition-all duration-200 cursor-pointer text-left"
                                onClick={() => onSelectSession(session.id)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault()
                                        onSelectSession(session.id)
                                    }
                                }}
                            >
                                {session.thumbnailDataUrl ? (
                                    <div className="w-12 h-12 shrink-0 rounded-lg border bg-white overflow-hidden">
                                        <Image
                                            src={session.thumbnailDataUrl}
                                            alt=""
                                            width={48}
                                            height={48}
                                            className="object-contain w-full h-full"
                                        />
                                    </div>
                                ) : (
                                    <div className="w-12 h-12 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                                        <MessageSquare className="w-5 h-5 text-primary" />
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium truncate">
                                        {session.title}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {formatSessionDate(
                                            session.updatedAt,
                                            dict.sessionHistory,
                                        )}
                                    </div>
                                </div>
                                {onDeleteSession && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setSessionToDelete(session.id)
                                            setDeleteDialogOpen(true)
                                        }}
                                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                                        title={dict.common.delete}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                    {sessions.filter((s) =>
                        s.title
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase()),
                    ).length === 0 &&
                        searchQuery && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                {dict.sessionHistory?.noResults ||
                                    "No chats found"}
                            </p>
                        )}
                </div>
            </div>

            {/* Collapsible Examples Section */}
            <div className="border-t border-border/50 pt-4">
                <button
                    type="button"
                    onClick={() => setExamplesExpanded(!examplesExpanded)}
                    className="w-full flex items-center justify-between px-1 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
                >
                    <span>
                        {dict.examples?.quickExamples || "Quick Examples"}
                    </span>
                    {examplesExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                    ) : (
                        <ChevronDown className="w-4 h-4" />
                    )}
                </button>
                {examplesExpanded && (
                    <div className="mt-2">
                        <ExamplePanel
                            setInput={setInput}
                            setFiles={setFiles}
                            minimal
                        />
                    </div>
                )}
            </div>

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
                            onClick={() => {
                                if (sessionToDelete && onDeleteSession) {
                                    onDeleteSession(sessionToDelete)
                                }
                                setDeleteDialogOpen(false)
                                setSessionToDelete(null)
                            }}
                            className="border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-400"
                        >
                            {dict.common.delete}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
