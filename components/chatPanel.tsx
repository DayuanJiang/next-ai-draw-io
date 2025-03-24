"use client";

import type React from "react";
import { useRef, useEffect, useState } from "react";
import Image from "next/image";

import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useChat } from "@ai-sdk/react";
import { ChatInput } from "@/components/chat-input";
import { convertToLegalXml } from "@/lib/utils";
interface ChatPanelProps {
    onDisplayChart: (xml: string) => void;
    onFetchChart: () => Promise<string>;
    diagramHistory?: { svg: string; xml: string }[];
    onAddToHistory?: () => void;
}

export default function ChatPanel({
    onDisplayChart,
    onFetchChart,
    diagramHistory = [],
    onAddToHistory = () => {},
}: ChatPanelProps) {
    // Add a step counter to track updates
    const stepCounterRef = useRef<number>(0);
    // Add state for file attachments
    const [files, setFiles] = useState<FileList | undefined>(undefined);
    // Add state to control visibility of prompt examples panel
    // Add state for showing the history dialog
    const [showHistory, setShowHistory] = useState(false);

    // Remove the currentXmlRef and related useEffect
    const {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        status,
        error,
        setInput,
        setMessages,
        append,
    } = useChat({
        maxSteps: 5,
        async onToolCall({ toolCall }) {
            console.log("Tool call:", toolCall);
            console.log("Tool call name:", toolCall.toolName);
            console.log("Tool call arguments:", toolCall.args);
            if (toolCall.toolName === "display_diagram") {
                const { xml } = toolCall.args as { xml: string };
                onDisplayChart(xml);
                return "Successfully displayed the flowchart.";
            }
        },
        onError: (error) => {
            console.error("Chat error:", error);
        },
    });
    const messagesEndRef = useRef<HTMLDivElement>(null);
    // Scroll to bottom when messages change
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    const onFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (input.trim() && status !== "streaming") {
            try {
                // Fetch chart data before setting input
                const chartXml = await onFetchChart();
                handleSubmit(e, {
                    data: {
                        xml: chartXml,
                    },
                    experimental_attachments: files,
                });

                // Clear files after submission
                setFiles(undefined);
                console.log("messages", messages);
            } catch (error) {
                console.error("Error fetching chart data:", error);
            }
        }
    };

    // Helper function to handle file changes
    const handleFileChange = (newFiles: FileList | undefined) => {
        setFiles(newFiles);
    };

    // New utility function to create a FileList from a File
    const createFileList = (file: File): FileList => {
        const dt = new DataTransfer();
        dt.items.add(file);
        return dt.files;
    };

    // New handler for the "Replicate this flowchart" button
    const handleReplicateFlowchart = async () => {
        setInput("Replicate this flowchart.");

        try {
            // Fetch the example image
            const response = await fetch("/example.png");
            const blob = await response.blob();
            const file = new File([blob], "example.png", { type: "image/png" });

            // Set the file to the files state
            setFiles(createFileList(file));
        } catch (error) {
            console.error("Error loading example image:", error);
        }
    };

    // Function to handle history item selection
    const handleSelectHistoryItem = (xml: string) => {
        onDisplayChart(xml);
        setShowHistory(false);
    };

    // Helper function to render tool invocations
    const renderToolInvocation = (toolInvocation: any) => {
        const callId = toolInvocation.toolCallId;

        switch (toolInvocation.toolName) {
            case "display_diagram": {
                switch (toolInvocation.state) {
                    case "partial-call": {
                        const currentXml = toolInvocation.args?.xml || "";

                        // Increment the step counter
                        stepCounterRef.current += 1;
                        // Log the current step

                        // Determine whether to show details based on a simple threshold
                        // Rather than comparing lengths (which can cause re-renders)
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

    const examplePanel = (
        <div className="px-4 py-2 border-t border-b border-gray-100">
            <p className="text-sm text-gray-500 mb-2">
                {" "}
                Start a conversation to generate or modify diagrams.
            </p>
            <p className="text-sm text-gray-500 mb-2">
                {" "}
                You can also upload images to use as references.
            </p>
            <p className="text-sm text-gray-500 mb-2">Try these examples:</p>
            <div className="flex flex-wrap gap-5">
                <button
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-1 px-2 rounded"
                    onClick={handleReplicateFlowchart}
                >
                    Replicate this flowchart
                </button>
                <button
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-1 px-2 rounded"
                    onClick={() => setInput("Draw a cat for me")}
                >
                    Draw a cat for me
                </button>
            </div>
        </div>
    );

    return (
        <Card className="h-full flex flex-col rounded-none py-0 gap-0">
            <CardHeader className="p-4 text-center">
                <CardTitle>Next-AI-Drawio</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow overflow-hidden px-2">
                <ScrollArea className="h-full pr-4">
                    {messages.length === 0
                        ? examplePanel
                        : messages.map((message) => (
                              <div
                                  key={message.id}
                                  className={`mb-4 ${
                                      message.role === "user"
                                          ? "text-right"
                                          : "text-left"
                                  }`}
                              >
                                  <div
                                      className={`inline-block px-4 py-2 whitespace-pre-wrap text-sm rounded-lg max-w-[85%] break-words ${
                                          message.role === "user"
                                              ? "bg-primary text-primary-foreground"
                                              : "bg-muted text-muted-foreground"
                                      }`}
                                  >
                                      {/* Render message content based on parts if available */}
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
                                          : // Fallback to simple content for older format
                                            message.content}
                                  </div>

                                  {/* Display image attachments */}
                                  {message?.experimental_attachments
                                      ?.filter((attachment) =>
                                          attachment?.contentType?.startsWith(
                                              "image/"
                                          )
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

                                  {/* Legacy support for function_call format */}
                                  {(message as any).function_call && (
                                      <div className="mt-2 text-left">
                                          <div className="text-xs text-gray-500">
                                              Using tool:{" "}
                                              {
                                                  (message as any).function_call
                                                      .name
                                              }
                                              ...
                                          </div>
                                      </div>
                                  )}
                              </div>
                          ))}
                    {error && (
                        <div className="text-red-500 text-sm mt-2">
                            Error: {error.message}
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </ScrollArea>
            </CardContent>

            <CardFooter className="p-2">
                <ChatInput
                    input={input}
                    status={status}
                    onSubmit={onFormSubmit}
                    onChange={handleInputChange}
                    setMessages={setMessages}
                    onDisplayChart={onDisplayChart}
                    files={files}
                    onFileChange={handleFileChange}
                    diagramHistory={diagramHistory}
                    onSelectHistoryItem={handleSelectHistoryItem}
                    showHistory={showHistory}
                    setShowHistory={setShowHistory}
                />
            </CardFooter>
        </Card>
    );
}
