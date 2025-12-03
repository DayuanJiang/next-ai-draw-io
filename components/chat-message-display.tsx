"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { ScrollArea } from "@/components/ui/scroll-area";
import ExamplePanel from "./chat-example-panel";
import { UIMessage } from "ai";
import { convertToLegalXml, replaceNodes } from "@/lib/utils";
import { Copy, Check, X } from "lucide-react";

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
    error?: Error | null;
    setInput: (input: string) => void;
    setFiles: (files: File[]) => void;
}

export function ChatMessageDisplay({
    messages,
    error,
    setInput,
    setFiles,
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

    const handleDisplayChart = useCallback(
        (xml: string) => {
            const currentXml = xml || "";
            const convertedXml = convertToLegalXml(currentXml);
            if (convertedXml !== previousXML.current) {
                previousXML.current = convertedXml;
                const replacedXML = replaceNodes(chartXML, convertedXml);
                onDisplayChart(replacedXML);
            }
        },
        [chartXML, onDisplayChart]
    );

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    // Handle tool invocations and update diagram when needed
    useEffect(() => {
        messages.forEach((message) => {
            if (message.parts) {
                message.parts.forEach((part: any) => {
                    if (part.type?.startsWith("tool-")) {
                        const { toolCallId, state } = part;

                        // Auto-collapse args when diagrams are generated
                        if (state === "output-available") {
                            setExpandedTools((prev) => ({
                                ...prev,
                                [toolCallId]: false,
                            }));
                        }

                        // Handle diagram updates for display_diagram tool
                        if (
                            part.type === "tool-display_diagram" &&
                            part.input?.xml
                        ) {
                            // For streaming input, always update to show streaming
                            if (
                                state === "input-streaming" ||
                                state === "input-available"
                            ) {
                                handleDisplayChart(part.input.xml);
                            }
                            // For completed calls, only update if not processed yet
                            else if (
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

        return (
            <div
                key={callId}
                className="p-4 my-2 text-gray-500 border border-gray-300 rounded overflow-hidden"
            >
                <div className="flex flex-col gap-2 min-w-0">
                    <div className="flex items-center justify-between">
                        <div className="text-xs">Tool: {toolName}</div>
                        {input && Object.keys(input).length > 0 && (
                            <button
                                onClick={toggleExpanded}
                                className="text-xs text-gray-500 hover:text-gray-700"
                            >
                                {isExpanded ? "Hide Args" : "Show Args"}
                            </button>
                        )}
                    </div>
                    {input && isExpanded && (
                        <pre className="mt-1 font-mono text-xs overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                            {typeof input === "object" &&
                                Object.keys(input).length > 0 &&
                                `Input: ${JSON.stringify(input, null, 2)}`}
                        </pre>
                    )}
                    <div className="mt-2 text-sm">
                        {state === "input-streaming" ? (
                            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : state === "output-available" ? (
                            <div className="text-green-600">
                                {output || (toolName === "display_diagram"
                                    ? "Diagram generated"
                                    : toolName === "edit_diagram"
                                        ? "Diagram edited"
                                        : "Tool executed")}
                            </div>
                        ) : state === "output-error" ? (
                            <div className="text-red-600">
                                {output || (toolName === "display_diagram"
                                    ? "Error generating diagram"
                                    : toolName === "edit_diagram"
                                        ? "Error editing diagram"
                                        : "Tool error")}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <ScrollArea className="h-full pr-4">
            {messages.length === 0 ? (
                <ExamplePanel setInput={setInput} setFiles={setFiles} />
            ) : (
                messages.map((message) => {
                    const userMessageText = message.role === "user" ? getMessageTextContent(message) : "";
                    return (
                        <div
                            key={message.id}
                            className={`mb-4 flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                            {message.role === "user" && userMessageText && (
                                <button
                                    onClick={() => copyMessageToClipboard(message.id, userMessageText)}
                                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors self-center mr-1"
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
                            )}
                            <div
                                className={`px-4 py-2 whitespace-pre-wrap text-sm rounded-lg max-w-[85%] break-words ${message.role === "user"
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground"
                                    }`}
                            >
                                {message.parts?.map((part: any, index: number) => {
                                    switch (part.type) {
                                        case "text":
                                            return (
                                                <div key={index}>{part.text}</div>
                                            );
                                        case "file":
                                            return (
                                                <div key={index} className="mt-2">
                                                    <Image
                                                        src={part.url}
                                                        width={200}
                                                        height={200}
                                                        alt={`Uploaded diagram or image for AI analysis`}
                                                        className="rounded-md border"
                                                        style={{
                                                            objectFit: "contain",
                                                        }}
                                                    />
                                                </div>
                                            );
                                        default:
                                            if (part.type?.startsWith("tool-")) {
                                                return renderToolPart(part);
                                            }
                                            return null;
                                    }
                                })}
                            </div>
                        </div>
                    );
                })
            )}
            {error && (
                <div className="text-red-500 text-sm mt-2">
                    Error: {error.message}
                </div>
            )}
            <div ref={messagesEndRef} />
        </ScrollArea>
    );
}
