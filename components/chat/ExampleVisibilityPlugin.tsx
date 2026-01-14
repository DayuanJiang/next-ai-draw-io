"use client"

import { ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import ExamplePanel from "@/components/chat-example-panel"

interface ExampleVisibilityPluginProps {
    setInput: (input: string) => void
    setFiles: (files: File[]) => void
    dict: {
        examples?: {
            quickExamples?: string
        }
    }
}

export function ExampleVisibilityPlugin({
    setInput,
    setFiles,
    dict,
}: ExampleVisibilityPluginProps) {
    const [isExpanded, setIsExpanded] = useState(false)

    return (
        <div className="border-t border-border/50 pt-4">
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-1 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
                <span>{dict.examples?.quickExamples || "Quick Examples"}</span>
                {isExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                ) : (
                    <ChevronDown className="w-4 h-4" />
                )}
            </button>
            {isExpanded && (
                <div className="mt-2 text-left">
                    <ExamplePanel
                        setInput={setInput}
                        setFiles={setFiles}
                        minimal
                    />
                </div>
            )}
        </div>
    )
}
