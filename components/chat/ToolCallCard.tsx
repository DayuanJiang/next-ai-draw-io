"use client"

import { Check, ChevronDown, ChevronUp, Copy, Cpu } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"
import { CodeBlock } from "@/components/code-block"
import { isMxCellXmlComplete } from "@/lib/utils"
import type { DiagramOperation, ToolPartLike } from "./types"

interface ToolCallCardProps {
    part: ToolPartLike
    expandedTools: Record<string, boolean>
    setExpandedTools: Dispatch<SetStateAction<Record<string, boolean>>>
    onCopy: (callId: string, text: string, isToolCall: boolean) => void
    copiedToolCallId: string | null
    copyFailedToolCallId: string | null
    dict: {
        tools: { complete: string }
        chat: { copied: string; failedToCopy: string; copyResponse: string }
    }
}

function OperationsDisplay({ operations }: { operations: DiagramOperation[] }) {
    return (
        <div className="space-y-3">
            {operations.map((op, index) => (
                <div
                    key={`${op.operation}-${op.cell_id}-${index}`}
                    className="rounded-lg border border-border/50 overflow-hidden bg-background/50"
                >
                    <div className="px-3 py-1.5 bg-muted/40 border-b border-border/30 flex items-center gap-2">
                        <span
                            className={`text-[10px] font-medium uppercase tracking-wide ${
                                op.operation === "delete"
                                    ? "text-red-600"
                                    : op.operation === "add"
                                      ? "text-green-600"
                                      : "text-blue-600"
                            }`}
                        >
                            {op.operation}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            cell_id: {op.cell_id}
                        </span>
                    </div>
                    {op.new_xml && (
                        <div className="px-3 py-2">
                            <pre className="text-[11px] font-mono text-foreground/80 bg-muted/30 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                                {op.new_xml}
                            </pre>
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}

export function ToolCallCard({
    part,
    expandedTools,
    setExpandedTools,
    onCopy,
    copiedToolCallId,
    copyFailedToolCallId,
    dict,
}: ToolCallCardProps) {
    const callId = part.toolCallId
    const { state, input, output } = part
    // Default to expanded for all states (user can manually collapse if needed)
    const isExpanded = expandedTools[callId] ?? true
    const toolName = part.type?.replace("tool-", "")
    const isCopied = copiedToolCallId === callId

    const toggleExpanded = () => {
        setExpandedTools((prev) => ({
            ...prev,
            [callId]: !isExpanded,
        }))
    }

    const getToolDisplayName = (name: string) => {
        switch (name) {
            case "display_diagram":
                return "Generate Diagram"
            case "edit_diagram":
                return "Edit Diagram"
            case "get_shape_library":
                return "Get Shape Library"
            default:
                return name
        }
    }

    const handleCopy = () => {
        let textToCopy = ""

        if (input && typeof input === "object") {
            if (input.xml) {
                textToCopy = input.xml
            } else if (input.operations && Array.isArray(input.operations)) {
                textToCopy = JSON.stringify(input.operations, null, 2)
            } else if (Object.keys(input).length > 0) {
                textToCopy = JSON.stringify(input, null, 2)
            }
        }

        if (
            output &&
            toolName === "get_shape_library" &&
            typeof output === "string"
        ) {
            textToCopy = output
        }

        if (textToCopy) {
            onCopy(callId, textToCopy, true)
        }
    }

    return (
        <div className="my-3 rounded-xl border border-border/60 bg-muted/30 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-muted/50">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
                        <Cpu className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-sm font-medium text-foreground/80">
                        {getToolDisplayName(toolName)}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {state === "input-streaming" && (
                        <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    )}
                    {state === "output-available" && (
                        <>
                            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                {dict.tools.complete}
                            </span>
                            {isExpanded && (
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className="p-1 rounded hover:bg-muted transition-colors"
                                    title={
                                        copiedToolCallId === callId
                                            ? dict.chat.copied
                                            : copyFailedToolCallId === callId
                                              ? dict.chat.failedToCopy
                                              : dict.chat.copyResponse
                                    }
                                >
                                    {isCopied ? (
                                        <Check className="w-4 h-4 text-green-600" />
                                    ) : (
                                        <Copy className="w-4 h-4 text-muted-foreground" />
                                    )}
                                </button>
                            )}
                        </>
                    )}
                    {state === "output-error" &&
                        (() => {
                            // Check if this is a truncation (incomplete XML) vs real error
                            const isTruncated =
                                (toolName === "display_diagram" ||
                                    toolName === "append_diagram") &&
                                !isMxCellXmlComplete(input?.xml)
                            return isTruncated ? (
                                <span className="text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
                                    Truncated
                                </span>
                            ) : (
                                <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                    Error
                                </span>
                            )
                        })()}
                    {input && Object.keys(input).length > 0 && (
                        <button
                            type="button"
                            onClick={toggleExpanded}
                            className="p-1 rounded hover:bg-muted transition-colors"
                        >
                            {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                        </button>
                    )}
                </div>
            </div>
            {input && isExpanded && (
                <div className="px-4 py-3 border-t border-border/40 bg-muted/20">
                    {typeof input === "object" && input.xml ? (
                        <CodeBlock code={input.xml} language="xml" />
                    ) : typeof input === "object" &&
                      input.operations &&
                      Array.isArray(input.operations) ? (
                        <OperationsDisplay operations={input.operations} />
                    ) : typeof input === "object" &&
                      Object.keys(input).length > 0 ? (
                        <CodeBlock
                            code={JSON.stringify(input, null, 2)}
                            language="json"
                        />
                    ) : null}
                </div>
            )}
            {output &&
                state === "output-error" &&
                (() => {
                    const isTruncated =
                        (toolName === "display_diagram" ||
                            toolName === "append_diagram") &&
                        !isMxCellXmlComplete(input?.xml)
                    return (
                        <div
                            className={`px-4 py-3 border-t border-border/40 text-sm ${isTruncated ? "text-yellow-600" : "text-red-600"}`}
                        >
                            {isTruncated
                                ? "Output truncated due to length limits. Try a simpler request or increase the maxOutputLength."
                                : output}
                        </div>
                    )
                })()}
            {/* Show get_shape_library output on success */}
            {output &&
                toolName === "get_shape_library" &&
                state === "output-available" &&
                isExpanded && (
                    <div className="px-4 py-3 border-t border-border/40">
                        <div className="text-xs text-muted-foreground mb-2">
                            Library loaded (
                            {typeof output === "string" ? output.length : 0}{" "}
                            chars)
                        </div>
                        <pre className="text-xs bg-muted/50 p-2 rounded-md overflow-auto max-h-32 whitespace-pre-wrap">
                            {typeof output === "string"
                                ? output.substring(0, 800) +
                                  (output.length > 800 ? "\n..." : "")
                                : String(output)}
                        </pre>
                    </div>
                )}
        </div>
    )
}
