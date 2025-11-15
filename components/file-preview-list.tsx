"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";

interface FilePreviewListProps {
    files: File[];
    onRemoveFile: (fileToRemove: File) => void;
}

export function FilePreviewList({ files, onRemoveFile }: FilePreviewListProps) {
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

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
        <>
            <div className="flex flex-wrap gap-2 mt-2 p-2 bg-muted/50 rounded-md">
                {files.map((file, index) => {
                    const imageUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
                    return (
                        <div key={file.name + index} className="relative group">
                            <div
                                className="w-20 h-20 border rounded-md overflow-hidden bg-muted cursor-pointer"
                                onClick={() => imageUrl && setSelectedImage(imageUrl)}
                            >
                                {file.type.startsWith("image/") ? (
                                    <Image
                                        src={imageUrl!}
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
                    );
                })}
            </div>

            {/* Image Modal/Lightbox */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setSelectedImage(null)}
                >
                    <button
                        className="absolute top-4 right-4 z-10 bg-white rounded-full p-2 hover:bg-gray-200 transition-colors"
                        onClick={() => setSelectedImage(null)}
                        aria-label="Close"
                    >
                        <X className="h-6 w-6" />
                    </button>
                    <div className="relative w-auto h-auto max-w-[90vw] max-h-[90vh]">
                        <Image
                            src={selectedImage}
                            alt="Full size preview of uploaded diagram or image"
                            width={1200}
                            height={900}
                            className="object-contain max-w-full max-h-[90vh] w-auto h-auto"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
        </>
    );
}
