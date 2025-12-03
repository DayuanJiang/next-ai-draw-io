"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

interface SaveDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (filename: string) => void;
    defaultFilename: string;
}

export function SaveDialog({
    open,
    onOpenChange,
    onSave,
    defaultFilename,
}: SaveDialogProps) {
    const [filename, setFilename] = useState(defaultFilename);

    useEffect(() => {
        if (open) {
            setFilename(defaultFilename);
        }
    }, [open, defaultFilename]);

    const handleSave = () => {
        const finalFilename = filename.trim() || defaultFilename;
        onSave(finalFilename);
        onOpenChange(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSave();
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Save Diagram</DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Filename</label>
                    <div className="flex items-stretch">
                        <Input
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter filename"
                            autoFocus
                            onFocus={(e) => e.target.select()}
                            className="rounded-r-none border-r-0 focus-visible:z-10"
                        />
                        <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-input bg-muted text-sm text-muted-foreground font-mono">
                            .drawio
                        </span>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave}>Save</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
