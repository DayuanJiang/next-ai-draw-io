"use client";

import type React from "react";
import { useRef, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { FaGithub } from "react-icons/fa";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatInput } from "@/components/chat-input";
import { ChatMessageDisplay } from "./chat-message-display";
import { useDiagram } from "@/contexts/diagram-context";
import { replaceNodes, formatXML, validateMxCellStructure } from "@/lib/utils";
import { ButtonWithTooltip } from "@/components/button-with-tooltip";

interface ChatPanelProps {
    isVisible: boolean;
    onToggleVisibility: () => void;
}

export default function ChatPanel({
    isVisible,
    onToggleVisibility,
}: ChatPanelProps) {
    const {
        loadDiagram: onDisplayChart,
        handleExport: onExport,
        handleExportWithoutHistory,
        resolverRef,
        chartXML,
        clearDiagram,
    } = useDiagram();

    const onFetchChart = (saveToHistory = true) => {
        return Promise.race([
            new Promise<string>((resolve) => {
                if (resolverRef && "current" in resolverRef) {
                    resolverRef.current = resolve;
                }
                if (saveToHistory) {
                    onExport();
                } else {
                    handleExportWithoutHistory();
                }
            }),
            new Promise<string>((_, reject) =>
                setTimeout(
                    () =>
                        reject(
                            new Error("Chart export timed out after 10 seconds")
                        ),
                    10000
                )
            ),
        ]);
    };

    const [files, setFiles] = useState<File[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [input, setInput] = useState("");

    // Generate a unique session ID for Langfuse tracing
    const [sessionId, setSessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);

    // Store XML snapshots for each user message (keyed by message index)
    const xmlSnapshotsRef = useRef<Map<number, string>>(new Map());

    // Ref to track latest chartXML for use in callbacks (avoids stale closure)
    const chartXMLRef = useRef(chartXML);
    useEffect(() => {
        chartXMLRef.current = chartXML;
    }, [chartXML]);

    const { messages, sendMessage, addToolResult, status, error, setMessages } =
        useChat({
            transport: new DefaultChatTransport({
                api: "/api/chat",
            }),
            async onToolCall({ toolCall }) {
                if (toolCall.toolName === "display_diagram") {
                    const { xml } = toolCall.input as { xml: string };

                    const validationError = validateMxCellStructure(xml);

                    if (validationError) {
                        addToolResult({
                            tool: "display_diagram",
                            toolCallId: toolCall.toolCallId,
                            output: validationError,
                        });
                    } else {
                        addToolResult({
                            tool: "display_diagram",
                            toolCallId: toolCall.toolCallId,
                            output: "Successfully displayed the diagram.",
                        });
                    }
                } else if (toolCall.toolName === "edit_diagram") {
                    const { edits } = toolCall.input as {
                        edits: Array<{ search: string; replace: string }>;
                    };

                    let currentXml = "";
                    try {
                        console.log("[edit_diagram] Starting...");
                        // Use chartXML from ref directly - more reliable than export
                        // especially on Vercel where DrawIO iframe may have latency issues
                        // Using ref to avoid stale closure in callback
                        const cachedXML = chartXMLRef.current;
                        if (cachedXML) {
                            currentXml = cachedXML;
                            console.log("[edit_diagram] Using cached chartXML, length:", currentXml.length);
                        } else {
                            // Fallback to export only if no cached XML
                            console.log("[edit_diagram] No cached XML, fetching from DrawIO...");
                            currentXml = await onFetchChart(false);
                            console.log("[edit_diagram] Got XML from export, length:", currentXml.length);
                        }

                        const { replaceXMLParts } = await import("@/lib/utils");
                        const editedXml = replaceXMLParts(currentXml, edits);

                        onDisplayChart(editedXml);

                        addToolResult({
                            tool: "edit_diagram",
                            toolCallId: toolCall.toolCallId,
                            output: `Successfully applied ${edits.length} edit(s) to the diagram.`,
                        });
                        console.log("[edit_diagram] Success");
                    } catch (error) {
                        console.error("[edit_diagram] Failed:", error);

                        const errorMessage =
                            error instanceof Error
                                ? error.message
                                : String(error);

                        addToolResult({
                            tool: "edit_diagram",
                            toolCallId: toolCall.toolCallId,
                            output: `Edit failed: ${errorMessage}

Current diagram XML:
\`\`\`xml
${currentXml || "No XML available"}
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

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);


    const onFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const isProcessing = status === "streaming" || status === "submitted";
        if (input.trim() && !isProcessing) {
            try {
                let chartXml = await onFetchChart();
                chartXml = formatXML(chartXml);

                const parts: any[] = [{ type: "text", text: input }];

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

                // Save XML snapshot for this message (will be at index = current messages.length)
                const messageIndex = messages.length;
                xmlSnapshotsRef.current.set(messageIndex, chartXml);

                sendMessage(
                    { parts },
                    {
                        body: {
                            xml: chartXml,
                            sessionId,
                        },
                    }
                );

                setInput("");
                setFiles([]);
            } catch (error) {
                console.error("Error fetching chart data:", error);
            }
        }
    };

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        setInput(e.target.value);
    };

    const handleFileChange = (newFiles: File[]) => {
        setFiles(newFiles);
    };

    const handleRegenerate = async (messageIndex: number) => {
        const isProcessing = status === "streaming" || status === "submitted";
        if (isProcessing) return;

        // Find the user message before this assistant message
        let userMessageIndex = messageIndex - 1;
        while (userMessageIndex >= 0 && messages[userMessageIndex].role !== "user") {
            userMessageIndex--;
        }

        if (userMessageIndex < 0) return;

        const userMessage = messages[userMessageIndex];
        const userParts = userMessage.parts;

        // Get the text from the user message
        const textPart = userParts?.find((p: any) => p.type === "text");
        if (!textPart) return;

        // Get the saved XML snapshot for this user message
        const savedXml = xmlSnapshotsRef.current.get(userMessageIndex);
        if (!savedXml) {
            console.error("No saved XML snapshot for message index:", userMessageIndex);
            return;
        }

        // Restore the diagram to the saved state
        onDisplayChart(savedXml);

        // Clean up snapshots for messages after the user message (they will be removed)
        for (const key of xmlSnapshotsRef.current.keys()) {
            if (key > userMessageIndex) {
                xmlSnapshotsRef.current.delete(key);
            }
        }

        // Remove the user message AND assistant message onwards (sendMessage will re-add the user message)
        // Use flushSync to ensure state update is processed synchronously before sending
        const newMessages = messages.slice(0, userMessageIndex);
        flushSync(() => {
            setMessages(newMessages);
        });

        // Now send the message after state is guaranteed to be updated
        sendMessage(
            { parts: userParts },
            {
                body: {
                    xml: savedXml,
                    sessionId,
                },
            }
        );
    };

    const handleEditMessage = async (messageIndex: number, newText: string) => {
        const isProcessing = status === "streaming" || status === "submitted";
        if (isProcessing) return;

        const message = messages[messageIndex];
        if (!message || message.role !== "user") return;

        // Get the saved XML snapshot for this user message
        const savedXml = xmlSnapshotsRef.current.get(messageIndex);
        if (!savedXml) {
            console.error("No saved XML snapshot for message index:", messageIndex);
            return;
        }

        // Restore the diagram to the saved state
        onDisplayChart(savedXml);

        // Clean up snapshots for messages after the user message (they will be removed)
        for (const key of xmlSnapshotsRef.current.keys()) {
            if (key > messageIndex) {
                xmlSnapshotsRef.current.delete(key);
            }
        }

        // Create new parts with updated text
        const newParts = message.parts?.map((part: any) => {
            if (part.type === "text") {
                return { ...part, text: newText };
            }
            return part;
        }) || [{ type: "text", text: newText }];

        // Remove the user message AND assistant message onwards (sendMessage will re-add the user message)
        // Use flushSync to ensure state update is processed synchronously before sending
        const newMessages = messages.slice(0, messageIndex);
        flushSync(() => {
            setMessages(newMessages);
        });

        // Now send the edited message after state is guaranteed to be updated
        sendMessage(
            { parts: newParts },
            {
                body: {
                    xml: savedXml,
                    sessionId,
                },
            }
        );
    };

    // Collapsed view
    if (!isVisible) {
        return (
            <div className="h-full flex flex-col items-center pt-4 bg-card border border-border/30 rounded-xl">
                <ButtonWithTooltip
                    tooltipContent="Show chat panel (Ctrl+B)"
                    variant="ghost"
                    size="icon"
                    onClick={onToggleVisibility}
                    className="hover:bg-accent transition-colors"
                >
                    <PanelRightOpen className="h-5 w-5 text-muted-foreground" />
                </ButtonWithTooltip>
                <div
                    className="text-sm font-medium text-muted-foreground mt-8 tracking-wide"
                    style={{
                        writingMode: "vertical-rl",
                        transform: "rotate(180deg)",
                    }}
                >
                    AI Chat
                </div>
            </div>
        );
    }

    // Full view
    return (
        <div className="h-full flex flex-col bg-card shadow-soft animate-slide-in-right rounded-xl border border-border/30">
            {/* Header */}
            <header className="px-5 py-4 border-b border-border/50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Image
                                src="/favicon.ico"
                                alt="Next AI Drawio"
                                width={28}
                                height={28}
                                className="rounded"
                            />
                            <h1 className="text-base font-semibold tracking-tight whitespace-nowrap">
                                Next AI Drawio
                            </h1>
                        </div>
                        <Link
                            href="/about"
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors ml-2"
                        >
                            About
                        </Link>
                    </div>
                    <div className="flex items-center gap-1">
                        <a
                            href="https://github.com/DayuanJiang/next-ai-draw-io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                            <FaGithub className="w-5 h-5" />
                        </a>
                        <ButtonWithTooltip
                            tooltipContent="Hide chat panel (Ctrl+B)"
                            variant="ghost"
                            size="icon"
                            onClick={onToggleVisibility}
                            className="hover:bg-accent"
                        >
                            <PanelRightClose className="h-5 w-5 text-muted-foreground" />
                        </ButtonWithTooltip>
                    </div>
                </div>
            </header>

            {/* Messages */}
            <main className="flex-1 overflow-hidden">
                <ChatMessageDisplay
                    messages={messages}
                    error={error}
                    setInput={setInput}
                    setFiles={handleFileChange}
                    sessionId={sessionId}
                    onRegenerate={handleRegenerate}
                    onEditMessage={handleEditMessage}
                />
            </main>

            {/* Input */}
            <footer className="p-4 border-t border-border/50 bg-card/50">
                <ChatInput
                    input={input}
                    status={status}
                    onSubmit={onFormSubmit}
                    onChange={handleInputChange}
                    onClearChat={() => {
                        setMessages([]);
                        clearDiagram();
                        setSessionId(`session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
                        xmlSnapshotsRef.current.clear();
                    }}
                    files={files}
                    onFileChange={handleFileChange}
                    showHistory={showHistory}
                    onToggleHistory={setShowHistory}
                    sessionId={sessionId}
                />
            </footer>
        </div>
    );
}
