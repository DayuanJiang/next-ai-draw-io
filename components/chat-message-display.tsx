"use client";

import type React from "react";
import { useRef, useEffect } from "react";
import Image from "next/image";
import { ScrollArea } from "@/components/ui/scroll-area";
import ExamplePanel from "./chat-example-panel";
import { Message } from "ai";
import { convertToLegalXml } from "@/lib/utils";

interface ChatMessageDisplayProps {
    messages: Message[];
    error?: Error | null;
    setInput: (input: string) => void;
    setFiles: (files: FileList | undefined) => void;
    onDisplayChart: (xml: string) => void;
    stepCounterRef: React.MutableRefObject<number>;
}

export function ChatMessageDisplay({
    messages,
    error,
    setInput,
    setFiles,
    onDisplayChart,
    stepCounterRef,
}: ChatMessageDisplayProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const renderToolInvocation = (toolInvocation: any) => {
        const callId = toolInvocation.toolCallId;

        switch (toolInvocation.toolName) {
            case "display_diagram": {
                switch (toolInvocation.state) {
                    case "partial-call": {
                        const currentXml = toolInvocation.args?.xml || "";

                        // Increment the step counter
                        stepCounterRef.current += 1;

                        // Determine whether to show details based on a simple threshold
                        if (
                            stepCounterRef.current >= 50 &&
                            stepCounterRef.current % 20 === 0
                        ) {
                            onDisplayChart(convertToLegalXml(currentXml));
                        }
                        return (
                            <div
                                key={callId}
                                className="mt-2 text-sm bg-blue-50 p-2 rounded border border-blue-200"
                            >
                                <div className="font-medium">
                                    Generating diagram...
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    Tool: display_diagram
                                    <div className="mt-1 font-mono text-xs">
                                        onDisplayChart
                                    </div>
                                </div>
                            </div>
                        );
                    }
                    case "call":
                        return (
                            <div
                                key={callId}
                                className="mt-2 text-sm bg-yellow-50 p-2 rounded border border-yellow-200"
                            >
                                <div className="font-medium">
                                    Displaying diagram...
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    Tool: display_diagram
                                    <div className="mt-1 font-mono text-xs">
                                        Args:{" "}
                                        {JSON.stringify(
                                            toolInvocation.args,
                                            null,
                                            2
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    case "result":
                        return null;
                }
                break;
            }
            default:
                return null;
        }
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
