"use client"

import { BrainIcon, ChevronDownIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

export type ReasoningProps = {
    className?: string
    isStreaming?: boolean
    /** Open while streaming, then folds once about a second after it ends */
    defaultOpen?: boolean
    /**
     * Seconds so far while streaming, then the seconds it took (undefined
     * when it was not watched)
     */
    getThinkingMessage: (isStreaming: boolean, duration?: number) => ReactNode
    /** The seconds measured before (saved with the message) */
    initialDuration?: number
    onDuration?: (seconds: number) => void
    children: string
}

const AUTO_CLOSE_DELAY = 1000
const MS_IN_S = 1000

export function Reasoning({
    className,
    isStreaming = false,
    defaultOpen = true,
    getThinkingMessage,
    initialDuration,
    onDuration,
    children,
}: ReasoningProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen)
    const [duration, setDuration] = useState(initialDuration)
    const [hasAutoClosed, setHasAutoClosed] = useState(false)
    const [startTime, setStartTime] = useState<number | null>(null)
    const [now, setNow] = useState(() => Date.now())
    const onDurationRef = useRef(onDuration)
    onDurationRef.current = onDuration

    // Track duration when streaming starts and ends
    useEffect(() => {
        if (isStreaming) {
            if (startTime === null) {
                setStartTime(Date.now())
            }
        } else if (startTime !== null) {
            const seconds = Math.ceil((Date.now() - startTime) / MS_IN_S)
            setDuration(seconds)
            setStartTime(null)
            onDurationRef.current?.(seconds)
        }
    }, [isStreaming, startTime])

    // A running count of the seconds while it streams
    useEffect(() => {
        if (!isStreaming) return
        const timer = setInterval(() => setNow(Date.now()), MS_IN_S)
        return () => clearInterval(timer)
    }, [isStreaming])
    const elapsed =
        startTime === null
            ? 0
            : Math.max(0, Math.floor((now - startTime) / MS_IN_S))

    // Auto-close once when streaming ends, after a short delay so the user
    // sees the content
    useEffect(() => {
        if (defaultOpen && !isStreaming && isOpen && !hasAutoClosed) {
            const timer = setTimeout(() => {
                setIsOpen(false)
                setHasAutoClosed(true)
            }, AUTO_CLOSE_DELAY)

            return () => clearTimeout(timer)
        }
    }, [isStreaming, isOpen, defaultOpen, hasAutoClosed])

    return (
        <Collapsible
            className={cn("not-prose mb-4", className)}
            onOpenChange={setIsOpen}
            open={isOpen}
        >
            <CollapsibleTrigger className="flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
                <BrainIcon className="size-4" />
                {getThinkingMessage(
                    isStreaming,
                    isStreaming ? elapsed : duration,
                )}
                <ChevronDownIcon
                    className={cn(
                        "size-4 transition-transform",
                        isOpen ? "rotate-180" : "rotate-0",
                    )}
                />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 text-sm data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 text-muted-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in">
                <div className="whitespace-pre-wrap">{children}</div>
            </CollapsibleContent>
        </Collapsible>
    )
}
