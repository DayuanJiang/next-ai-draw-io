"use client"

import { Brain, ChevronDown, ChevronUp } from "lucide-react"
import * as React from "react"
import { cn } from "@/lib/utils"

interface ReasoningProps extends React.HTMLAttributes<HTMLDivElement> {
    isStreaming?: boolean
    children: React.ReactNode
}

const Reasoning = React.memo(
    React.forwardRef<HTMLDivElement, ReasoningProps>(
        ({ className, isStreaming = false, children, ...props }, ref) => {
            // Use false as initial state to avoid hydration mismatch
            const [open, setOpen] = React.useState(false)
            const userToggledRef = React.useRef(false)
            const isMountedRef = React.useRef(false)

            React.useEffect(() => {
                isMountedRef.current = true
                if (isStreaming) {
                    // Auto-open when streaming starts (only on client)
                    setOpen(true)
                    userToggledRef.current = false
                }
                // Don't auto-close when streaming finishes - let user control it manually
            }, [isStreaming])

            const handleOpenChange = React.useCallback((newOpen: boolean) => {
                setOpen(newOpen)
                userToggledRef.current = true
            }, [])

            // Memoize children props to avoid unnecessary re-renders
            const childrenProps = React.useMemo(
                () => ({
                    open,
                    onOpenChange: handleOpenChange,
                    isStreaming,
                }),
                [open, handleOpenChange, isStreaming],
            )

            return (
                <div
                    ref={ref}
                    className={cn(
                        "my-3 rounded-xl border border-border/60 bg-muted/30 overflow-hidden",
                        className,
                    )}
                    {...props}
                >
                    {React.Children.map(children, (child) => {
                        if (React.isValidElement(child)) {
                            return React.cloneElement(
                                child,
                                childrenProps as any,
                            )
                        }
                        return child
                    })}
                </div>
            )
        },
    ),
)
Reasoning.displayName = "Reasoning"

interface ReasoningTriggerProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    title?: string
    isStreaming?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
    getThinkingMessage?: (
        isStreaming: boolean,
        duration?: number,
    ) => React.ReactNode
}

const ReasoningTrigger = React.memo(
    React.forwardRef<HTMLButtonElement, ReasoningTriggerProps>(
        (
            {
                className,
                title,
                isStreaming = false,
                open = false,
                onOpenChange,
                getThinkingMessage,
                ...props
            },
            ref,
        ) => {
            const [duration, setDuration] = React.useState(0)
            const startTimeRef = React.useRef<number | null>(null)
            const intervalRef = React.useRef<NodeJS.Timeout | null>(null)

            React.useEffect(() => {
                if (open) {
                    startTimeRef.current = Date.now()
                    setDuration(0)
                    // Update less frequently to reduce re-renders
                    intervalRef.current = setInterval(() => {
                        if (startTimeRef.current) {
                            setDuration(
                                Math.floor(
                                    (Date.now() - startTimeRef.current) / 1000,
                                ),
                            )
                        }
                    }, 2000) // Update every 2 seconds instead of 1
                    return () => {
                        if (intervalRef.current) {
                            clearInterval(intervalRef.current)
                        }
                    }
                } else {
                    startTimeRef.current = null
                    setDuration(0)
                    if (intervalRef.current) {
                        clearInterval(intervalRef.current)
                    }
                }
            }, [open])

            // Memoize display text to avoid recalculating on every render
            const displayText = React.useMemo(() => {
                return getThinkingMessage
                    ? getThinkingMessage(isStreaming, duration)
                    : title ||
                          (isStreaming
                              ? `Thinking... ${duration > 0 ? `(${duration}s)` : ""}`
                              : "Show reasoning")
            }, [getThinkingMessage, isStreaming, duration, title])

            const handleClick = React.useCallback(() => {
                onOpenChange?.(!open)
            }, [onOpenChange, open])

            return (
                <div className="flex items-center justify-between px-4 py-3 bg-muted/50">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                            <Brain className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground/80">
                            {displayText}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {isStreaming && (
                            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        )}
                        {!isStreaming && open && (
                            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                Complete
                            </span>
                        )}
                        <button
                            ref={ref}
                            type="button"
                            onClick={handleClick}
                            className={cn(
                                "p-1 rounded hover:bg-muted transition-colors",
                                className,
                            )}
                            aria-expanded={open}
                            {...props}
                        >
                            {open ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                        </button>
                    </div>
                </div>
            )
        },
    ),
)
ReasoningTrigger.displayName = "ReasoningTrigger"

interface ReasoningContentProps extends React.HTMLAttributes<HTMLDivElement> {
    open?: boolean
    children: React.ReactNode
}

const ReasoningContent = React.memo(
    React.forwardRef<HTMLDivElement, ReasoningContentProps>(
        ({ className, open = false, children, ...props }, ref) => {
            // FIX: Change from HTMLDivElement to HTMLPreElement
            const contentRef = React.useRef<HTMLPreElement>(null)
            const scrollContainerRef = React.useRef<HTMLDivElement>(null)

            // Auto-scroll to bottom only when content changes and is streaming
            React.useEffect(() => {
                if (open && scrollContainerRef.current) {
                    // Use requestAnimationFrame for smooth scrolling
                    requestAnimationFrame(() => {
                        if (scrollContainerRef.current) {
                            scrollContainerRef.current.scrollTop =
                                scrollContainerRef.current.scrollHeight
                        }
                    })
                }
            }, [open, children])

            if (!open) return null

            return (
                <div
                    ref={ref}
                    className={cn(
                        "border-t border-border/40 bg-muted/20 transition-all duration-200",
                        className,
                    )}
                    {...props}
                >
                    <div className="px-4 py-3">
                        <div
                            ref={scrollContainerRef}
                            className="overflow-x-auto overflow-y-auto max-h-48 scrollbar-thin"
                        >
                            {/* FIX: This ref is now correctly typed for HTMLPreElement */}
                            <pre
                                ref={contentRef}
                                className="whitespace-pre-wrap break-words text-[11px] text-muted-foreground font-mono leading-relaxed break-all"
                            >
                                {children}
                            </pre>
                        </div>
                    </div>
                </div>
            )
        },
    ),
)
ReasoningContent.displayName = "ReasoningContent"

export { Reasoning, ReasoningTrigger, ReasoningContent }
