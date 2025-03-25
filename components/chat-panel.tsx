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
    } = useChat({
        maxSteps: 5,
        async onToolCall({ toolCall }) {
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

    // Function to handle history item selection
    const handleSelectHistoryItem = (xml: string) => {
        onDisplayChart(xml);
        setShowHistory(false);
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
                    onDisplayChart={onDisplayChart}
                    stepCounterRef={stepCounterRef}
                />
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
