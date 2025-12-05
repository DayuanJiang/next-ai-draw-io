"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { ScrollArea } from "@/components/ui/scroll-area";
import ExamplePanel from "./chat-example-panel";
import { UIMessage } from "ai";
import { convertToLegalXml, replaceNodes, validateMxCellStructure } from "@/lib/utils";
import { Copy, Check, X, ChevronDown, ChevronUp, Cpu, Minus, Plus, ThumbsUp, ThumbsDown, RotateCcw, Pencil } from "lucide-react";
import { CodeBlock } from "./code-block";

interface EditPair {
    search: string;
    replace: string;
}

function EditDiffDisplay({ edits }: { edits: EditPair[] }) {
    return (
        <div className="space-y-3">
            {edits.map((edit, index) => (
                <div key={index} className="rounded-lg border border-border/50 overflow-hidden bg-background/50">
                    <div className="px-3 py-1.5 bg-muted/40 border-b border-border/30 flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                            Change {index + 1}
                        </span>
                    </div>
                    <div className="divide-y divide-border/30">
                        {/* Search (old) */}
                        <div className="px-3 py-2">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Minus className="w-3 h-3 text-red-500" />
                                <span className="text-[10px] font-medium text-red-600 uppercase tracking-wide">Remove</span>
                            </div>
                            <pre className="text-[11px] font-mono text-red-700 bg-red-50 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                                {edit.search}
                            </pre>
                        </div>
                        {/* Replace (new) */}
                        <div className="px-3 py-2">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Plus className="w-3 h-3 text-green-500" />
                                <span className="text-[10px] font-medium text-green-600 uppercase tracking-wide">Add</span>
                            </div>
                            <pre className="text-[11px] font-mono text-green-700 bg-green-50 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                                {edit.replace}
                            </pre>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

import { useDiagram } from "@/contexts/diagram-context";

const getMessageTextContent = (message: UIMessage): string => {
    if (!message.parts) return "";
    return message.parts
        .filter((part: any) => part.type === "text")
        .map((part: any) => part.text)
        .join("\n");
};

interface ChatMessageDisplayProps {
    messages: UIMessage[];
    setInput: (input: string) => void;
    setFiles: (files: File[]) => void;
    sessionId?: string;
    onRegenerate?: (messageIndex: number) => void;
    onEditMessage?: (messageIndex: number, newText: string) => void;
}

export function ChatMessageDisplay({
    messages,
    setInput,
    setFiles,
    sessionId,
    onRegenerate,
    onEditMessage,
}: ChatMessageDisplayProps) {
    const { chartXML, loadDiagram: onDisplayChart } = useDiagram();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const previousXML = useRef<string>("");
    const processedToolCalls = useRef<Set<string>>(new Set());
    const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
        {}
    );
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const [copyFailedMessageId, setCopyFailedMessageId] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<Record<string, "good" | "bad">>({});
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editText, setEditText] = useState<string>("");

    const copyMessageToClipboard = async (messageId: string, text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedMessageId(messageId);
            setTimeout(() => setCopiedMessageId(null), 2000);
        } catch (err) {
            console.error("Failed to copy message:", err);
            setCopyFailedMessageId(messageId);
            setTimeout(() => setCopyFailedMessageId(null), 2000);
        }
    };

    const submitFeedback = async (messageId: string, value: "good" | "bad") => {
        // Toggle off if already selected
        if (feedback[messageId] === value) {
            setFeedback((prev) => {
                const next = { ...prev };
                delete next[messageId];
                return next;
            });
            return;
        }

        setFeedback((prev) => ({ ...prev, [messageId]: value }));

        try {
            await fetch("/api/log-feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messageId,
                    feedback: value,
                    sessionId,
                }),
            });
        } catch (error) {
            console.warn("Failed to log feedback:", error);
        }
    };

    const handleDisplayChart = useCallback(
        (xml: string) => {
            const currentXml = xml || "";
            const convertedXml = convertToLegalXml(currentXml);
            if (convertedXml !== previousXML.current) {
                const replacedXML = replaceNodes(chartXML, convertedXml);

                const validationError = validateMxCellStructure(replacedXML);
                if (!validationError) {
                    previousXML.current = convertedXml;
                    onDisplayChart(replacedXML);
                } else {
                    console.log("[ChatMessageDisplay] XML validation failed:", validationError);
                }
            }
        },
        [chartXML, onDisplayChart]
    );

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    useEffect(() => {
        messages.forEach((message) => {
            if (message.parts) {
                message.parts.forEach((part: any) => {
                    if (part.type?.startsWith("tool-")) {
                        const { toolCallId, state } = part;

                        if (state === "output-available") {
                            setExpandedTools((prev) => ({
                                ...prev,
                                [toolCallId]: false,
                            }));
                        }

                        if (
                            part.type === "tool-display_diagram" &&
                            part.input?.xml
                        ) {
                            if (
                                state === "input-streaming" ||
                                state === "input-available"
                            ) {
                                handleDisplayChart(part.input.xml);
                            } else if (
                                state === "output-available" &&
                                !processedToolCalls.current.has(toolCallId)
                            ) {
                                handleDisplayChart(part.input.xml);
                                processedToolCalls.current.add(toolCallId);
                            }
                        }
                    }
                });
            }
        });
    }, [messages, handleDisplayChart]);

    const renderToolPart = (part: any) => {
        const callId = part.toolCallId;
        const { state, input, output } = part;
        const isExpanded = expandedTools[callId] ?? true;
        const toolName = part.type?.replace("tool-", "");

        const toggleExpanded = () => {
            setExpandedTools((prev) => ({
                ...prev,
                [callId]: !isExpanded,
            }));
        };

        const getToolDisplayName = (name: string) => {
            switch (name) {
                case "display_diagram":
                    return "Generate Diagram";
                case "edit_diagram":
                    return "Edit Diagram";
                default:
                    return name;
            }
        };

        return (
            <div
                key={callId}
                className="my-3 rounded-xl border border-border/60 bg-muted/30 overflow-hidden"
            >
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
                            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                Complete
                            </span>
                        )}
                        {state === "output-error" && (
                            <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                Error
                            </span>
                        )}
                        {input && Object.keys(input).length > 0 && (
                            <button
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
                        ) : typeof input === "object" && input.edits && Array.isArray(input.edits) ? (
                            <EditDiffDisplay edits={input.edits} />
                        ) : typeof input === "object" && Object.keys(input).length > 0 ? (
                            <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
                        ) : null}
                    </div>
                )}
                {output && state === "output-error" && (
                    <div className="px-4 py-3 border-t border-border/40 text-sm text-red-600">
                        {output}
                    </div>
                )}
            </div>
        );
    };

    return (
        <ScrollArea className="h-full px-4 scrollbar-thin">
            {messages.length === 0 ? (
                <ExamplePanel setInput={setInput} setFiles={setFiles} />
            ) : (
                <div className="py-4 space-y-4">
                    {messages.map((message, messageIndex) => {
                        const userMessageText = message.role === "user" ? getMessageTextContent(message) : "";
                        const isLastAssistantMessage = message.role === "assistant" && (
                            messageIndex === messages.length - 1 ||
                            messages.slice(messageIndex + 1).every(m => m.role !== "assistant")
                        );
                        const isLastUserMessage = message.role === "user" && (
                            messageIndex === messages.length - 1 ||
                            messages.slice(messageIndex + 1).every(m => m.role !== "user")
                        );
                        const isEditing = editingMessageId === message.id;
                        return (
                            <div
                                key={message.id}
                                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} animate-message-in`}
                                style={{ animationDelay: `${messageIndex * 50}ms` }}
                            >
                                {message.role === "user" && userMessageText && !isEditing && (
                                    <div className="flex items-center gap-1 self-center mr-2">
                                        {/* Edit button - only on last user message */}
                                        {onEditMessage && isLastUserMessage && (
                                            <button
                                                onClick={() => {
                                                    setEditingMessageId(message.id);
                                                    setEditText(userMessageText);
                                                }}
                                                className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted transition-colors"
                                                title="Edit message"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => copyMessageToClipboard(message.id, userMessageText)}
                                            className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted transition-colors"
                                            title={copiedMessageId === message.id ? "Copied!" : copyFailedMessageId === message.id ? "Failed to copy" : "Copy message"}
                                        >
                                            {copiedMessageId === message.id ? (
                                                <Check className="h-3.5 w-3.5 text-green-500" />
                                            ) : copyFailedMessageId === message.id ? (
                                                <X className="h-3.5 w-3.5 text-red-500" />
                                            ) : (
                                                <Copy className="h-3.5 w-3.5" />
                                            )}
                                        </button>
                                    </div>
                                )}
                                <div className="max-w-[85%]">
                                    {/* Edit mode for user messages */}
                                    {isEditing && message.role === "user" ? (
                                        <div className="flex flex-col gap-2">
                                            <textarea
                                                value={editText}
                                                onChange={(e) => setEditText(e.target.value)}
                                                className="w-full min-w-[300px] px-4 py-3 text-sm rounded-2xl border border-primary bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                                                rows={Math.min(editText.split('\n').length + 1, 6)}
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === "Escape") {
                                                        setEditingMessageId(null);
                                                        setEditText("");
                                                    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                                        e.preventDefault();
                                                        if (editText.trim() && onEditMessage) {
                                                            onEditMessage(messageIndex, editText.trim());
                                                            setEditingMessageId(null);
                                                            setEditText("");
                                                        }
                                                    }
                                                }}
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => {
                                                        setEditingMessageId(null);
                                                        setEditText("");
                                                    }}
                                                    className="px-3 py-1.5 text-xs rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (editText.trim() && onEditMessage) {
                                                            onEditMessage(messageIndex, editText.trim());
                                                            setEditingMessageId(null);
                                                            setEditText("");
                                                        }
                                                    }}
                                                    disabled={!editText.trim()}
                                                    className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                                >
                                                    Save & Submit
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Text content in bubble */
                                        message.parts?.some((part: any) => part.type === "text" || part.type === "file") && (
                                            <div
                                                className={`px-4 py-3 text-sm leading-relaxed ${
                                                    message.role === "user"
                                                        ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md shadow-sm"
                                                        : message.role === "system"
                                                        ? "bg-destructive/10 text-destructive border border-destructive/20 rounded-2xl rounded-bl-md"
                                                        : "bg-muted/60 text-foreground rounded-2xl rounded-bl-md"
                                                } ${message.role === "user" && isLastUserMessage && onEditMessage ? "cursor-pointer hover:opacity-90 transition-opacity" : ""}`}
                                                onClick={() => {
                                                    if (message.role === "user" && isLastUserMessage && onEditMessage) {
                                                        setEditingMessageId(message.id);
                                                        setEditText(userMessageText);
                                                    }
                                                }}
                                                title={message.role === "user" && isLastUserMessage && onEditMessage ? "Click to edit" : undefined}
                                            >
                                                {message.parts?.map((part: any, index: number) => {
                                                    switch (part.type) {
                                                        case "text":
                                                            return (
                                                                <div key={index} className="whitespace-pre-wrap break-words">
                                                                    {part.text}
                                                                </div>
                                                            );
                                                        case "file":
                                                            return (
                                                                <div key={index} className="mt-2">
                                                                    <Image
                                                                        src={part.url}
                                                                        width={200}
                                                                        height={200}
                                                                        alt={`Uploaded diagram or image for AI analysis`}
                                                                        className="rounded-lg border border-white/20"
                                                                        style={{
                                                                            objectFit: "contain",
                                                                        }}
                                                                    />
                                                                </div>
                                                            );
                                                        default:
                                                            return null;
                                                    }
                                                })}
                                            </div>
                                        )
                                    )}
                                    {/* Tool calls outside bubble */}
                                    {message.parts?.map((part: any) => {
                                        if (part.type?.startsWith("tool-")) {
                                            return renderToolPart(part);
                                        }
                                        return null;
                                    })}
                                    {/* Action buttons for assistant messages */}
                                    {message.role === "assistant" && (
                                        <div className="flex items-center gap-1 mt-2">
                                            {/* Copy button */}
                                            <button
                                                onClick={() => copyMessageToClipboard(message.id, getMessageTextContent(message))}
                                                className={`p-1.5 rounded-lg transition-colors ${
                                                    copiedMessageId === message.id
                                                        ? "text-green-600 bg-green-100"
                                                        : "text-muted-foreground/60 hover:text-foreground hover:bg-muted"
                                                }`}
                                                title={copiedMessageId === message.id ? "Copied!" : "Copy response"}
                                            >
                                                {copiedMessageId === message.id ? (
                                                    <Check className="h-3.5 w-3.5" />
                                                ) : (
                                                    <Copy className="h-3.5 w-3.5" />
                                                )}
                                            </button>
                                            {/* Regenerate button - only on last assistant message */}
                                            {onRegenerate && isLastAssistantMessage && (
                                                <button
                                                    onClick={() => onRegenerate(messageIndex)}
                                                    className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                                                    title="Regenerate response"
                                                >
                                                    <RotateCcw className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                            {/* Divider */}
                                            <div className="w-px h-4 bg-border mx-1" />
                                            {/* Thumbs up */}
                                            <button
                                                onClick={() => submitFeedback(message.id, "good")}
                                                className={`p-1.5 rounded-lg transition-colors ${
                                                    feedback[message.id] === "good"
                                                        ? "text-green-600 bg-green-100"
                                                        : "text-muted-foreground/60 hover:text-green-600 hover:bg-green-50"
                                                }`}
                                                title="Good response"
                                            >
                                                <ThumbsUp className="h-3.5 w-3.5" />
                                            </button>
                                            {/* Thumbs down */}
                                            <button
                                                onClick={() => submitFeedback(message.id, "bad")}
                                                className={`p-1.5 rounded-lg transition-colors ${
                                                    feedback[message.id] === "bad"
                                                        ? "text-red-600 bg-red-100"
                                                        : "text-muted-foreground/60 hover:text-red-600 hover:bg-red-50"
                                                }`}
                                                title="Bad response"
                                            >
                                                <ThumbsDown className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            <div ref={messagesEndRef} />
        </ScrollArea>
    );
}
