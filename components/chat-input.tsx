"use client";

import React, { useCallback, useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ResetWarningModal } from "@/components/reset-warning-modal";
import { SaveDialog } from "@/components/save-dialog";
import {
    Loader2,
    Send,
    Trash2,
    Image as ImageIcon,
    History,
    Download,
    Paperclip,
} from "lucide-react";
import { ButtonWithTooltip } from "@/components/button-with-tooltip";
import { FilePreviewList } from "./file-preview-list";
import { useDiagram } from "@/contexts/diagram-context";
import { HistoryDialog } from "@/components/history-dialog";

interface ChatInputProps {
    input: string;
    status: "submitted" | "streaming" | "ready" | "error";
    onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onClearChat: () => void;
    files?: File[];
    onFileChange?: (files: File[]) => void;
    showHistory?: boolean;
    onToggleHistory?: (show: boolean) => void;
    error?: Error | null;
}

export function ChatInput({
    input,
    status,
    onSubmit,
    onChange,
    onClearChat,
    files = [],
    onFileChange = () => {},
    showHistory = false,
    onToggleHistory = () => {},
    error = null,
}: ChatInputProps) {
    const { diagramHistory, saveDiagramToFile } = useDiagram();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [showClearDialog, setShowClearDialog] = useState(false);
    const [showSaveDialog, setShowSaveDialog] = useState(false);

    // Allow retry when there's an error (even if status is still "streaming" or "submitted")
    const isDisabled = (status === "streaming" || status === "submitted") && !error;

    useEffect(() => {
        console.log('[ChatInput] Status changed to:', status, '| Input disabled:', isDisabled);
    }, [status, isDisabled]);

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

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            const form = e.currentTarget.closest("form");
            if (form && input.trim() && !isDisabled) {
                form.requestSubmit();
            }
        }
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        if (isDisabled) return;

        const items = e.clipboardData.items;
        const imageItems = Array.from(items).filter((item) =>
            item.type.startsWith("image/")
        );

        if (imageItems.length > 0) {
            const imageFiles = await Promise.all(
                imageItems.map(async (item) => {
                    const file = item.getAsFile();
                    if (!file) return null;
                    return new File(
                        [file],
                        `pasted-image-${Date.now()}.${file.type.split("/")[1]}`,
                        {
                            type: file.type,
                        }
                    );
                })
            );

            const validFiles = imageFiles.filter(
                (file): file is File => file !== null
            );
            if (validFiles.length > 0) {
                onFileChange([...files, ...validFiles]);
            }
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = Array.from(e.target.files || []);
        onFileChange([...files, ...newFiles]);
    };

    const handleRemoveFile = (fileToRemove: File) => {
        onFileChange(files.filter((file) => file !== fileToRemove));
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

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

        if (isDisabled) return;

        const droppedFiles = e.dataTransfer.files;

        const imageFiles = Array.from(droppedFiles).filter((file) =>
            file.type.startsWith("image/")
        );

        if (imageFiles.length > 0) {
            onFileChange([...files, ...imageFiles]);
        }
    };

    const handleClear = () => {
        onClearChat();
        setShowClearDialog(false);
    };

    return (
        <form
            onSubmit={onSubmit}
            className={`w-full transition-all duration-200 ${
                isDragging
                    ? "ring-2 ring-primary ring-offset-2 rounded-2xl"
                    : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* File previews */}
            {files.length > 0 && (
                <div className="mb-3">
                    <FilePreviewList files={files} onRemoveFile={handleRemoveFile} />
                </div>
            )}

            {/* Input container */}
            <div className="relative rounded-2xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-all duration-200">
                <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={onChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="Describe your diagram or paste an image..."
                    disabled={isDisabled}
                    aria-label="Chat input"
                    className="min-h-[60px] max-h-[200px] resize-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60"
                />

                {/* Action bar */}
                <div className="flex items-center justify-between px-3 py-2 border-t border-border/50">
                    {/* Left actions */}
                    <div className="flex items-center gap-1">
                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowClearDialog(true)}
                            tooltipContent="Clear conversation"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                            <Trash2 className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <ResetWarningModal
                            open={showClearDialog}
                            onOpenChange={setShowClearDialog}
                            onClear={handleClear}
                        />

                        <HistoryDialog
                            showHistory={showHistory}
                            onToggleHistory={onToggleHistory}
                        />
                    </div>

                    {/* Right actions */}
                    <div className="flex items-center gap-1">
                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onToggleHistory(true)}
                            disabled={isDisabled || diagramHistory.length === 0}
                            tooltipContent="Diagram history"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                            <History className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowSaveDialog(true)}
                            disabled={isDisabled}
                            tooltipContent="Save diagram"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                            <Download className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <SaveDialog
                            open={showSaveDialog}
                            onOpenChange={setShowSaveDialog}
                            onSave={(filename, format) => saveDiagramToFile(filename, format)}
                            defaultFilename={`diagram-${new Date().toISOString().slice(0, 10)}`}
                        />

                        <ButtonWithTooltip
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={triggerFileInput}
                            disabled={isDisabled}
                            tooltipContent="Upload image"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                            <ImageIcon className="h-4 w-4" />
                        </ButtonWithTooltip>

                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileChange}
                            accept="image/*"
                            multiple
                            disabled={isDisabled}
                        />

                        <div className="w-px h-5 bg-border mx-1" />

                        <Button
                            type="submit"
                            disabled={isDisabled || !input.trim()}
                            size="sm"
                            className="h-8 px-4 rounded-xl font-medium shadow-sm"
                            aria-label={isDisabled ? "Sending..." : "Send message"}
                        >
                            {isDisabled ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <Send className="h-4 w-4 mr-1.5" />
                                    Send
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>

        </form>
    );
}
