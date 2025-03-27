"use client";

import type React from "react";
import { useRef, useEffect, useState } from "react";

import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { useChat } from "@ai-sdk/react";
import { ChatInput } from "@/components/chat-input";
import { ChatMessageDisplay } from "./chat-message-display";
import { useDiagram } from "@/contexts/diagram-context";

export default function ChatPanel() {
    const {
        loadDiagram: onDisplayChart,
        handleExport: onExport,
        resolverRef,
    } = useDiagram();

    const onFetchChart = () => {
        return new Promise<string>((resolve) => {
            if (resolverRef && "current" in resolverRef) {
                resolverRef.current = resolve; // Store the resolver
            }
            onExport(); // Trigger the export
        });
    };
    // Add a step counter to track updates

    // Add state for file attachments
    const [files, setFiles] = useState<File[]>([]);
    // Add state for showing the history dialog
    const [showHistory, setShowHistory] = useState(false);

    // Convert File[] to FileList for experimental_attachments
    const createFileList = (files: File[]): FileList => {
        const dt = new DataTransfer();
        files.forEach((file) => dt.items.add(file));
        return dt.files;
    };

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
    } = useChat({
        maxSteps: 5,
        async onToolCall({ toolCall }) {
            if (toolCall.toolName === "display_diagram") {
                const { xml } = toolCall.args as { xml: string };
                // do nothing because we will handle this streamingly in the ChatMessageDisplay component
                // onDisplayChart(xml);
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
                    experimental_attachments:
                        files.length > 0 ? createFileList(files) : undefined,
                });

                // Clear files after submission
                setFiles([]);
            } catch (error) {
                console.error("Error fetching chart data:", error);
            }
        }
    };

    // Helper function to handle file changes
    const handleFileChange = (newFiles: File[]) => {
        setFiles(newFiles);
    };

    return (
        <Card className="h-full flex flex-col rounded-none py-0 gap-0">
            <CardHeader className="p-4 text-center">
                <CardTitle>Next-AI-Drawio</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow overflow-hidden px-2">
                <ChatMessageDisplay
                    messages={messages}
                    error={error}
                    setInput={setInput}
                    setFiles={handleFileChange}
                />
            </CardContent>

            <CardFooter className="p-2">
                <ChatInput
                    input={input}
                    status={status}
                    onSubmit={onFormSubmit}
                    onChange={handleInputChange}
                    onClearChat={() => setMessages([])}
                    files={files}
                    onFileChange={handleFileChange}
                    showHistory={showHistory}
                    onToggleHistory={setShowHistory}
                />
            </CardFooter>
        </Card>
    );
}
