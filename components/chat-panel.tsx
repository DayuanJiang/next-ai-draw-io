"use client";

import type React from "react";
import { useRef, useEffect, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import Link from "next/link";

import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatInput } from "@/components/chat-input";
import { ChatMessageDisplay } from "./chat-message-display";
import { useDiagram } from "@/contexts/diagram-context";
import { replaceNodes, formatXML } from "@/lib/utils";
import { ButtonWithTooltip } from "@/components/button-with-tooltip";

interface ChatPanelProps {
    isVisible: boolean;
    onToggleVisibility: () => void;
}

export default function ChatPanel({ isVisible, onToggleVisibility }: ChatPanelProps) {
    const {
        loadDiagram: onDisplayChart,
        handleExport: onExport,
        resolverRef,
        chartXML,
        clearDiagram,
    } = useDiagram();

    const onFetchChart = () => {
        return Promise.race([
            new Promise<string>((resolve) => {
                if (resolverRef && "current" in resolverRef) {
                    resolverRef.current = resolve;
                }
                onExport();
            }),
            new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error("Chart export timed out after 10 seconds")), 10000)
            )
        ]);
    };
    // Add a step counter to track updates

    // Add state for file attachments
    const [files, setFiles] = useState<File[]>([]);
    // Add state for showing the history dialog
    const [showHistory, setShowHistory] = useState(false);
    // Add state for conversation title
    const [conversationTitle, setConversationTitle] = useState<string>('New Conversation');

    // Convert File[] to FileList for experimental_attachments
    const createFileList = (files: File[]): FileList => {
        const dt = new DataTransfer();
        files.forEach((file) => dt.items.add(file));
        return dt.files;
    };

    // Add state for input management
    const [input, setInput] = useState("");

    // Remove the currentXmlRef and related useEffect
    const { messages, sendMessage, addToolResult, status, error, setMessages } =
        useChat({
            transport: new DefaultChatTransport({
                api: "/api/chat",
            }),
            async onToolCall({ toolCall }) {
                if (toolCall.toolName === "display_diagram") {
                    // Diagram is handled streamingly in the ChatMessageDisplay component
                    addToolResult({
                        tool: "display_diagram",
                        toolCallId: toolCall.toolCallId,
                        output: "Successfully displayed the diagram.",
                    });
                } else if (toolCall.toolName === "edit_diagram") {
                    const { edits } = toolCall.input as {
                        edits: Array<{ search: string; replace: string }>;
                    };

                    let currentXml = '';
                    try {
                        // Fetch current chart XML
                        currentXml = await onFetchChart();

                        // Apply edits using the utility function
                        const { replaceXMLParts } = await import("@/lib/utils");
                        const editedXml = replaceXMLParts(currentXml, edits);

                        // Load the edited diagram
                        onDisplayChart(editedXml);

                        addToolResult({
                            tool: "edit_diagram",
                            toolCallId: toolCall.toolCallId,
                            output: `Successfully applied ${edits.length} edit(s) to the diagram.`,
                        });
                    } catch (error) {
                        console.error("Edit diagram failed:", error);

                        const errorMessage = error instanceof Error ? error.message : String(error);

                        // Provide detailed error with current diagram XML
                        addToolResult({
                            tool: "edit_diagram",
                            toolCallId: toolCall.toolCallId,
                            output: `Edit failed: ${errorMessage}

Current diagram XML:
\`\`\`xml
${currentXml}
\`\`\`

Please retry with an adjusted search pattern or use display_diagram if retries are exhausted.`,
                        });
                    }
                }
            },
            onError: (error) => {
                console.error("Chat error:", error);
            },
        });
    
    // Function to generate conversation title using LLM
    const generateConversationTitle = async (userQuery: string) => {
        try {
            const response = await fetch('/api/generate-title', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userQuery }),
            });

            if (!response.ok) {
                throw new Error('Failed to generate title');
            }

            const data = await response.json();
            setConversationTitle(data.title);
        } catch (error) {
            console.error('Error generating conversation title:', error);
            // Fallback to truncated query if API fails
            setConversationTitle(userQuery.slice(0, 50) + (userQuery.length > 50 ? '...' : ''));
        }
    };
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    // Scroll to bottom when messages change
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    // Debug: Log status changes
    useEffect(() => {
        console.log('[ChatPanel] Status changed to:', status);
    }, [status]);

    const onFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const isProcessing = status === "streaming" || status === "submitted";
        if (input.trim() && !isProcessing) {
            try {
                // Generate title for the first message
                if (messages.length === 0) {
                    generateConversationTitle(input);
                }

                // Fetch chart data before sending message
                let chartXml = await onFetchChart();

                // Format the XML to ensure consistency
                chartXml = formatXML(chartXml);

                // Create message parts
                const parts: any[] = [{ type: "text", text: input }];

                // Add file parts if files exist
                if (files.length > 0) {
                    for (const file of files) {
                        const reader = new FileReader();
                        const dataUrl = await new Promise<string>((resolve) => {
                            reader.onload = () =>
                                resolve(reader.result as string);
                            reader.readAsDataURL(file);
                        });

                        parts.push({
                            type: "file",
                            url: dataUrl,
                            mediaType: file.type,
                        });
                    }
                }

                sendMessage(
                    { parts },
                    {
                        body: {
                            xml: chartXml,
                        },
                    }
                );

                // Clear input and files after submission
                setInput("");
                setFiles([]);
            } catch (error) {
                console.error("Error fetching chart data:", error);
            }
        }
    };

    // Handle input change
    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        setInput(e.target.value);
    };

    // Helper function to handle file changes
    const handleFileChange = (newFiles: File[]) => {
        setFiles(newFiles);
    };

    // Collapsed view when chat is hidden
    if (!isVisible) {
        return (
            <Card className="h-full flex flex-col rounded-2xl py-0 gap-0 items-center justify-start pt-4 shadow-md bg-white">
                <ButtonWithTooltip
                    tooltipContent="Show chat panel (Ctrl+B)"
                    variant="ghost"
                    size="icon"
                    onClick={onToggleVisibility}
                    className="h-8 w-8 rounded-full hover:bg-gray-100 transition-all duration-200"
                >
                    <PanelRightOpen className="h-4 w-4 text-gray-600" />
                </ButtonWithTooltip>
                <div
                    className="text-xs font-medium text-gray-400 mt-8 tracking-wider"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                    Next-AI-Drawio
                </div>
            </Card>
        );
    }

    // Full view when chat is visible
    return (
        <Card className="h-full flex flex-col rounded-2xl py-0 gap-0 shadow-md bg-white">
            <CardHeader className="px-4 py-3 flex flex-row justify-between items-center rounded-t-2xl bg-white">
                <div className="flex items-center bg-gray-50 rounded-full px-4 py-1.5 flex-1 max-w-md">
                    <CardTitle className="text-sm font-medium text-gray-700 tracking-tight truncate">
                        {conversationTitle}
                    </CardTitle>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1">
                    <Link href="/about" className="text-xs font-medium text-gray-600 hover:text-gray-900 transition-all duration-200 px-2">
                        About
                    </Link>
                    <div className="h-3 w-px bg-gray-300"></div>
                    <ButtonWithTooltip
                        tooltipContent="Hide chat panel (Ctrl+B)"
                        variant="ghost"
                        size="icon"
                        onClick={onToggleVisibility}
                        className="h-7 w-7 rounded-full hover:bg-white transition-all duration-200"
                    >
                        <PanelRightClose className="h-4 w-4 text-gray-600" />
                    </ButtonWithTooltip>
                    <a
                        href="https://github.com/DayuanJiang/next-ai-draw-io"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-7 w-7 flex items-center justify-center text-gray-600 hover:text-gray-900 transition-all duration-200 rounded-full hover:bg-white"
                    >
                        <FaGithub className="w-4 h-4" />
                    </a>
                </div>
            </CardHeader>
            <CardContent className="flex-grow overflow-hidden px-2">
                <ChatMessageDisplay
                    messages={messages}
                    error={error}
                    setInput={setInput}
                    setFiles={handleFileChange}
                />
            </CardContent>

            <CardFooter className="p-3 rounded-b-2xl bg-white flex flex-col gap-2">
                <ChatInput
                    input={input}
                    status={status}
                    onSubmit={onFormSubmit}
                    onChange={handleInputChange}
                    onClearChat={() => {
                        setMessages([]);
                        clearDiagram();
                        setConversationTitle('New Conversation');
                    }}
                    files={files}
                    onFileChange={handleFileChange}
                    showHistory={showHistory}
                    onToggleHistory={setShowHistory}
                />
                <div className="text-center text-xs text-gray-400 font-medium">
                    Next-AI-Drawio
                </div>
            </CardFooter>
        </Card>
    );
}
