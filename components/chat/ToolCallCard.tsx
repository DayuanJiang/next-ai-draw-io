"use client"

import { Check, ChevronDown, ChevronUp, Copy, Cpu } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"
import { CodeBlock } from "@/components/code-block"
import { isMxCellXmlComplete } from "@/lib/utils"
import type {
    DiagramOperation,
    StructureOperation,
    ToolPartLike,
} from "./types"

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

/**
 * Colour an operation by what it does to the diagram: removes, adds, or changes.
 *
 * Takes an unknown rather than a string because this renders DURING streaming: the tool
 * input arrives character by character, so an operation is briefly `{}` or `{"op": "add_c`
 * before it is whole. A missing name is the normal mid-stream state, not an error.
 */
function opColour(op: unknown): string {
    if (typeof op !== "string") return "text-muted-foreground"
    if (op === "delete" || op === "remove" || op === "unlink" || op === "clear")
        return "text-red-600"
    if (op.startsWith("add") || op === "link") return "text-green-600"
    return "text-blue-600"
}

/**
 * The arguments worth showing beside an operation's name.
 *
 * A whitelist rather than "everything except op and id", because some operations carry a
 * whole nested graph (add_graph's nodes and edges) and dumping that turns one line into a
 * screenful. The excluded keys are summarised instead.
 */
const SHOWN_KEYS = [
    "label",
    "name",
    "parent",
    "dir",
    "class",
    "role",
    "group",
    "shape",
    "cols",
    "lanes",
    "aspect",
    "source",
    "target",
    "title",
] as const

function summarise(op: StructureOperation | undefined | null): string {
    if (!op || typeof op !== "object") return ""
    const parts: string[] = []
    for (const key of SHOWN_KEYS) {
        const v = op[key]
        if (v === undefined || v === null || v === "") continue
        parts.push(
            `${key}=${Array.isArray(v) ? v.join("/") : String(v).slice(0, 60)}`,
        )
    }
    // A graph carries its own nodes and edges; report the size, not the contents.
    const nodes = op.nodes
    const edges = op.edges
    if (Array.isArray(nodes))
        parts.push(
            `${nodes.length} node${nodes.length === 1 ? "" : "s"}${
                Array.isArray(edges)
                    ? `, ${edges.length} edge${edges.length === 1 ? "" : "s"}`
                    : ""
            }`,
        )
    return parts.join("  ")
}

/**
 * `restructure_diagram`'s operations: structural steps, not XML patches.
 *
 * Written to survive PARTIAL data. This renders while the tool input is still streaming, so
 * an entry may be `{}`, or `{op: "add_contai"}`, or — because a JSON array is repaired as it
 * arrives — `undefined`. Every field is therefore treated as possibly absent rather than
 * validated up front: dropping incomplete entries would make rows appear and disappear as
 * the text arrives, and asserting on them crashes the whole message.
 */
function StructureOperationsDisplay({
    operations,
}: {
    operations: StructureOperation[]
}) {
    return (
        <div className="space-y-1">
            {operations.map((op, index) => (
                <div
                    key={`${op?.op ?? "pending"}-${op?.id ?? index}-${index}`}
                    className="flex items-baseline gap-2 px-2 py-1 rounded bg-background/50 border border-border/40"
                >
                    <span
                        className={`text-[10px] font-medium uppercase tracking-wide shrink-0 ${opColour(op?.op)}`}
                    >
                        {op?.op ?? "…"}
                    </span>
                    {op?.id && (
                        <span className="text-xs font-mono text-foreground/80 shrink-0">
                            {op.id}
                        </span>
                    )}
                    <span className="text-[11px] text-muted-foreground font-mono break-all">
                        {summarise(op)}
                    </span>
                </div>
            ))}
        </div>
    )
}

/** `edit_diagram`'s operations. Also streamed, so also written for partial entries. */
function OperationsDisplay({ operations }: { operations: DiagramOperation[] }) {
    return (
        <div className="space-y-3">
            {operations.map((op, index) => (
                <div
                    key={`${op?.operation ?? "pending"}-${op?.cell_id ?? index}-${index}`}
                    className="rounded-lg border border-border/50 overflow-hidden bg-background/50"
                >
                    <div className="px-3 py-1.5 bg-muted/40 border-b border-border/30 flex items-center gap-2">
                        <span
                            className={`text-[10px] font-medium uppercase tracking-wide ${
                                op?.operation === "delete"
                                    ? "text-red-600"
                                    : op?.operation === "add"
                                      ? "text-green-600"
                                      : "text-blue-600"
                            }`}
                        >
                            {op?.operation ?? "…"}
                        </span>
                        {op?.cell_id && (
                            <span className="text-xs text-muted-foreground">
                                cell_id: {op.cell_id}
                            </span>
                        )}
                    </div>
                    {op?.new_xml && (
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
            case "restructure_diagram":
                return "Build Diagram"
            case "edit_diagram":
                return "Edit Diagram"
            case "search_stencils":
                return "Find Icons"
            // Only ever arrives from the server's cache-hit path now; the model cannot
            // call it. See createCachedStreamResponse in app/api/chat/route.ts.
            case "display_diagram":
                return "Generate Diagram"
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
                            // Truncation only applies to a tool that streams raw XML, which
                            // is now just the cached-answer replay. The engine tools send
                            // structured operations, so a failure there is a real error.
                            const isTruncated =
                                toolName === "display_diagram" &&
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
                        state === "input-streaming" ||
                        state === "input-available" ? (
                            <pre
                                className="text-[11px] leading-relaxed overflow-x-auto overflow-y-auto max-h-48 scrollbar-thin break-all whitespace-pre-wrap"
                                style={{
                                    fontFamily:
                                        "var(--font-mono), ui-monospace, monospace",
                                    margin: 0,
                                    padding: 0,
                                }}
                            >
                                {input.xml}
                            </pre>
                        ) : (
                            <CodeBlock code={input.xml} language="xml" />
                        )
                    ) : typeof input === "object" &&
                      input.operations &&
                      Array.isArray(input.operations) ? (
                        // Dispatch by TOOL, not by whether an `operations` key exists: both
                        // tools call their argument that, but the items have different shapes
                        // (op/id versus operation/cell_id), and reading one as the other
                        // printed a row of blank `cell_id:` labels.
                        toolName === "restructure_diagram" ? (
                            <StructureOperationsDisplay
                                operations={
                                    input.operations as StructureOperation[]
                                }
                            />
                        ) : (
                            <OperationsDisplay
                                operations={
                                    input.operations as DiagramOperation[]
                                }
                            />
                        )
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
                        toolName === "display_diagram" &&
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
            {/* What the tool actually returned. Worth showing on success, not only on
                error: restructure_diagram answers with an outline of the structure it
                built plus any notes about classes it could not honour, and that is the
                same text the model reads to name ids in its next call. */}
            {output && state === "output-available" && isExpanded && (
                <div className="px-4 py-3 border-t border-border/40">
                    <pre className="text-[11px] font-mono text-muted-foreground bg-muted/40 rounded-md p-2 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                        {typeof output === "string"
                            ? output.length > 4000
                                ? `${output.slice(0, 4000)}\n…`
                                : output
                            : String(output)}
                    </pre>
                </div>
            )}
        </div>
    )
}
