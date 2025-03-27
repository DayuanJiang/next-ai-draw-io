"use client";

import React, { useEffect } from "react";
import Image from "next/image";
import { X } from "lucide-react";

interface FilePreviewListProps {
    files: File[];
    onRemoveFile: (fileToRemove: File) => void;
}

export function FilePreviewList({ files, onRemoveFile }: FilePreviewListProps) {
    // Cleanup object URLs on unmount
    useEffect(() => {
        const objectUrls = files
            .filter((file) => file.type.startsWith("image/"))
            .map((file) => URL.createObjectURL(file));

        return () => {
            objectUrls.forEach(URL.revokeObjectURL);
        };
    }, [files]);

    if (files.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2 mt-2 p-2 bg-muted/50 rounded-md">
            {files.map((file, index) => (
                <div key={file.name + index} className="relative group">
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
                        onClick={() => onRemoveFile(file)}
                        className="absolute -top-2 -right-2 bg-destructive rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Remove file"
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            ))}
        </div>
    );
}
