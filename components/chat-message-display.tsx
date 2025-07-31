"use client";

import type React from "react";
import { useRef, useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { ScrollArea } from "@/components/ui/scroll-area";
import ExamplePanel from "./chat-example-panel";
import { Message } from "ai";
import { convertToLegalXml, replaceNodes } from "@/lib/utils";

import { useDiagram } from "@/contexts/diagram-context";

interface ChatMessageDisplayProps {
    messages: Message[];
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
    const handleDisplayChart = useCallback((xml: string) => {
        const currentXml = xml || "";
        const convertedXml = convertToLegalXml(currentXml);
        if (convertedXml !== previousXML.current) {
            previousXML.current = convertedXml;
            const replacedXML = replaceNodes(chartXML, convertedXml);
            onDisplayChart(replacedXML);
        }
    }, [chartXML, onDisplayChart]);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    // Handle tool invocations and update diagram when needed
    useEffect(() => {
        messages.forEach((message) => {
            if (message.parts) {
                message.parts.forEach((part) => {
                    if (part.type === "tool-invocation") {
                        const { toolCallId, state, args, toolName } = part.toolInvocation;
                        
                        // Auto-collapse args when diagrams are generated
                        if (state === "result") {
                            setExpandedTools((prev) => ({
                                ...prev,
                                [toolCallId]: false,
                            }));
                        }
                        
                        // Handle diagram updates for display_diagram tool
                        if (toolName === "display_diagram" && args?.xml) {
                            // For partial calls, always update to show streaming
                            if (state === "partial-call") {
                                handleDisplayChart(args.xml);
                            }
                            // For completed calls, only update if not processed yet
                            else if (state === "result" && !processedToolCalls.current.has(toolCallId)) {
                                handleDisplayChart(args.xml);
                                processedToolCalls.current.add(toolCallId);
                            }
                        }
                    }
                });
            }
        });
    }, [messages, handleDisplayChart]);

    const renderToolInvocation = (toolInvocation: any) => {
        const callId = toolInvocation.toolCallId;
        const { toolName, args, state } = toolInvocation;
        const isExpanded = expandedTools[callId] ?? true;

        const toggleExpanded = () => {
            setExpandedTools((prev) => ({
                ...prev,
                [callId]: !isExpanded,
            }));
        };

        return (
            <div
                key={callId}
                className="p-4 my-2 text-gray-500 border border-gray-300 rounded"
            >
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <div className="text-xs">Tool: display_diagram</div>
                        {args && Object.keys(args).length > 0 && (
                            <button
                                onClick={toggleExpanded}
                                className="text-xs text-gray-500 hover:text-gray-700"
                            >
                                {isExpanded ? "Hide Args" : "Show Args"}
                            </button>
                        )}
                    </div>
                    {args && isExpanded && (
                        <div className="mt-1 font-mono text-xs overflow-hidden">
                            {typeof args === "object" &&
                                Object.keys(args).length > 0 &&
                                `Args: ${JSON.stringify(args, null, 2)}`}
                        </div>
                    )}
                    <div className="mt-2 text-sm">
                        {state === "partial-call" ? (
                            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : state === "result" ? (
                            <div className="text-green-600">
                                Diagram generated
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
                messages.map((message) => (
                    <div
                        key={message.id}
                        className={`mb-4 ${
                            message.role === "user" ? "text-right" : "text-left"
                        }`}
                    >
                        <div
                            className={`inline-block px-4 py-2 whitespace-pre-wrap text-sm rounded-lg max-w-[85%] break-words ${
                                message.role === "user"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground"
                            }`}
                        >
                            {message.parts
                                ? message.parts.map((part, index) => {
                                      switch (part.type) {
                                          case "text":
                                              return (
                                                  <div key={index}>
                                                      {part.text}
                                                  </div>
                                              );
                                          case "tool-invocation":
                                              return renderToolInvocation(
                                                  part.toolInvocation
                                              );
                                          default:
                                              return null;
                                      }
                                  })
                                : message.content}
                        </div>

                        {message?.experimental_attachments
                            ?.filter((attachment) =>
                                attachment?.contentType?.startsWith("image/")
                            )
                            .map((attachment, index) => (
                                <div
                                    key={`${message.id}-${index}`}
                                    className={`mt-2 ${
                                        message.role === "user"
                                            ? "text-right"
                                            : "text-left"
                                    }`}
                                >
                                    <div className="inline-block">
                                        <Image
                                            src={attachment.url}
                                            width={200}
                                            height={200}
                                            alt={
                                                attachment.name ??
                                                `attachment-${index}`
                                            }
                                            className="rounded-md border"
                                            style={{
                                                objectFit: "contain",
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}

                        {(message as any).function_call && (
                            <div className="mt-2 text-left">
                                <div className="text-xs text-gray-500">
                                    Using tool:{" "}
                                    {(message as any).function_call.name}
                                    ...
                                </div>
                            </div>
                        )}
                    </div>
                ))
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
