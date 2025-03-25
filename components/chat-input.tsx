"use client";

import React, { useCallback, useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Loader2,
    Send,
    RotateCcw,
    Image as ImageIcon,
    X,
    History,
} from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import Image from "next/image";

interface ChatInputProps {
    input: string;
    status: "submitted" | "streaming" | "ready" | "error";
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    setMessages: (messages: any[]) => void;
    onDisplayChart: (xml: string) => void;
    files?: FileList;
    onFileChange?: (files: FileList | undefined) => void;
    diagramHistory?: { svg: string; xml: string }[];
    onSelectHistoryItem?: (xml: string) => void;
    showHistory?: boolean;
    setShowHistory?: (show: boolean) => void;
}

export function ChatInput({
    input,
    status,
    onSubmit,
    onChange,
    setMessages,
    onDisplayChart,
    files,
    onFileChange,
    diagramHistory = [],
    onSelectHistoryItem = () => {},
    showHistory = false,
    setShowHistory = () => {},
}: ChatInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [showClearDialog, setShowClearDialog] = useState(false);

    // Auto-resize textarea based on content
    const adjustTextareaHeight = useCallback(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = "auto";
            textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
        }
    }, []);

    useEffect(() => {
        adjustTextareaHeight();
    }, [input, adjustTextareaHeight]);

    // Handle keyboard shortcuts
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            const form = e.currentTarget.closest("form");
            if (form && input.trim() && status !== "streaming") {
                form.requestSubmit();
            }
        }
    };

    // Handle file changes
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (onFileChange) {
            onFileChange(e.target.files || undefined);
        }
    };

    // Clear file selection
    const clearFiles = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
        if (onFileChange) {
            onFileChange(undefined);
        }
    };

    // Trigger file input click
    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    // Handle drag events
    const handleDragOver = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLFormElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (status === "streaming") return;

        const droppedFiles = e.dataTransfer.files;

        // Only process image files
        if (droppedFiles.length > 0) {
            const imageFiles = Array.from(droppedFiles).filter((file) =>
                file.type.startsWith("image/")
            );

            if (imageFiles.length > 0 && onFileChange) {
                // Create a new FileList-like object with only image files
                const dt = new DataTransfer();
                imageFiles.forEach((file) => dt.items.add(file));
                onFileChange(dt.files);
            }
        }
    };

    // Handle clearing conversation and diagram
    const handleClear = () => {
        setMessages([]);
        onDisplayChart(`<mxfile host="embed.diagrams.net" agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36" version="26.1.1">
            <diagram name="Page-1" id="NsivuNt5aJDXaP8udwGv">
                <mxGraphModel dx="394" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0">
                    <root>
                    </root>
                </mxGraphModel>
            </diagram>
        </mxfile>`);
        setShowClearDialog(false);
    };

    return (
        <form
            onSubmit={onSubmit}
            className={`w-full space-y-2 ${
                isDragging
                    ? "border-2 border-dashed border-primary p-4 rounded-lg bg-muted/20"
                    : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* File preview area */}
            {files && files.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 p-2 bg-muted/50 rounded-md">
                    {Array.from(files).map((file, index) => (
                        <div key={index} className="relative group">
                            <div className="w-20 h-20 border rounded-md overflow-hidden bg-muted">
                                {file.type.startsWith("image/") ? (
                                    <Image
                                        src={URL.createObjectURL(file)}
                                        alt={file.name}
                                        width={80}
                                        height={80}
                                        className="object-cover w-full h-full"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-xs text-center p-1">
                                        {file.name}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={clearFiles}
                                className="absolute -top-2 -right-2 bg-destructive rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                aria-label="Remove file"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <Textarea
                ref={textareaRef}
                value={input}
                onChange={onChange}
                onKeyDown={handleKeyDown}
                placeholder="Describe what changes you want to make to the diagram... (Press Cmd/Ctrl + Enter to send)"
                disabled={status === "streaming"}
                aria-label="Chat input"
                className="min-h-[80px] resize-none transition-all duration-200 px-1 py-0"
            />

            <div className="flex items-center gap-2">
                <div className="mr-auto">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setShowClearDialog(true)}
                                >
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                Clear current conversation and diagram
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    {/* Warning Modal */}
                    <Dialog
                        open={showClearDialog}
                        onOpenChange={setShowClearDialog}
                    >
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Clear Everything?</DialogTitle>
                                <DialogDescription>
                                    This will clear the current conversation and
                                    reset the diagram. This action cannot be
                                    undone.
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowClearDialog(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={handleClear}
                                >
                                    Clear Everything
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    {/* History Dialog */}
                    <Dialog open={showHistory} onOpenChange={setShowHistory}>
                        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Diagram History</DialogTitle>
                                <DialogDescription>
                                    Here saved each diagram before AI
                                    modification.
                                    <br />
                                    Click on a diagram to restore it
                                </DialogDescription>
                            </DialogHeader>

                            {diagramHistory.length === 0 ? (
                                <div className="text-center p-4 text-gray-500">
                                    No history available yet. Send messages to
                                    create diagram history.
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 py-4">
                                    {diagramHistory.map((item, index) => (
                                        <div
                                            key={index}
                                            className="border rounded-md p-2 cursor-pointer hover:border-primary transition-colors"
                                            onClick={() =>
                                                onSelectHistoryItem(item.xml)
                                            }
                                        >
                                            <div className="aspect-video bg-white rounded overflow-hidden flex items-center justify-center">
                                                <Image
                                                    src={item.svg}
                                                    alt={`Diagram version ${
                                                        index + 1
                                                    }`}
                                                    width={200}
                                                    height={100}
                                                    className="object-contain w-full h-full p-1"
                                                />
                                            </div>
                                            <div className="text-xs text-center mt-1 text-gray-500">
                                                Version {index + 1}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowHistory(false)}
                                >
                                    Close
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
                <div className="flex gap-2">
                    {/* History Button */}
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setShowHistory(true)}
                                    disabled={
                                        status === "streaming" ||
                                        diagramHistory.length === 0
                                    }
                                    title="Diagram History"
                                >
                                    <History className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                View diagram history
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={triggerFileInput}
                        disabled={status === "streaming"}
                        title="Upload image"
                    >
                        <ImageIcon className="h-4 w-4" />
                    </Button>

                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileChange}
                        accept="image/*"
                        multiple
                        disabled={status === "streaming"}
                    />
                </div>

                <Button
                    type="submit"
                    disabled={status === "streaming" || !input.trim()}
                    className="transition-opacity"
                    aria-label={
                        status === "streaming"
                            ? "Sending message..."
                            : "Send message"
                    }
                >
                    {status === "streaming" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Send className="mr-2 h-4 w-4" />
                    )}
                    Send
                </Button>
            </div>
        </form>
    );
}
