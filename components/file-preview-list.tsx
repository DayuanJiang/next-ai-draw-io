"use client"

import { FileCode, FileText, Link, Loader2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import Image from "@/components/image-with-basepath"
import { useDictionary } from "@/hooks/use-dictionary"
import { isPdfFile, isTextFile } from "@/lib/pdf-utils"

function formatCharCount(count: number): string {
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}k`
    }
    return String(count)
}

interface FilePreviewListProps {
    files: File[]
    onRemoveFile: (fileToRemove: File) => void
    pdfData?: Map<
        File,
        { text: string; charCount: number; isExtracting: boolean }
    >
    urlData?: Map<
        string,
        { url: string; title: string; charCount: number; isExtracting: boolean }
    >
    onRemoveUrl?: (url: string) => void
}

export function FilePreviewList({
    files,
    onRemoveFile,
    pdfData = new Map(),
    urlData,
    onRemoveUrl,
}: FilePreviewListProps) {
    const dict = useDictionary()
    const [selectedImage, setSelectedImage] = useState<string | null>(null)
    const [imageUrls, setImageUrls] = useState<Map<File, string>>(new Map())
    const imageUrlsRef = useRef<Map<File, string>>(new Map())
    // Create and cleanup object URLs when files change
    useEffect(() => {
        const currentUrls = imageUrlsRef.current
        const newUrls = new Map<File, string>()

        files.forEach((file) => {
            if (file.type.startsWith("image/")) {
                // Reuse existing URL if file is already tracked
                const existingUrl = currentUrls.get(file)
                if (existingUrl) {
                    newUrls.set(file, existingUrl)
                } else {
                    newUrls.set(file, URL.createObjectURL(file))
                }
            }
        })
        // Revoke URLs for files that are no longer in the list
        currentUrls.forEach((url, file) => {
            if (!newUrls.has(file)) {
                URL.revokeObjectURL(url)
            }
        })

        imageUrlsRef.current = newUrls
        setImageUrls(newUrls)
    }, [files])
    // Cleanup all URLs on unmount only
    useEffect(() => {
        return () => {
            imageUrlsRef.current.forEach((url) => {
                URL.revokeObjectURL(url)
            })
            // Clear the ref so StrictMode remount creates fresh URLs
            imageUrlsRef.current = new Map()
        }
    }, [])
    // Clear selected image if its URL was revoked
    useEffect(() => {
        if (
            selectedImage &&
            !Array.from(imageUrls.values()).includes(selectedImage)
        ) {
            setSelectedImage(null)
        }
    }, [imageUrls, selectedImage])

    if (files.length === 0 && (!urlData || urlData.size === 0)) return null

    return (
        <>
            <div className="flex flex-wrap gap-2 mt-2 p-2 bg-muted/50 rounded-md">
                {files.map((file, index) => {
                    const imageUrl = imageUrls.get(file) || null
                    const pdfInfo = pdfData.get(file)
                    return (
                        <div key={file.name + index} className="relative group">
                            <div
                                className={`w-20 h-20 border rounded-md overflow-hidden bg-muted ${
                                    file.type.startsWith("image/") && imageUrl
                                        ? "cursor-pointer"
                                        : ""
                                }`}
                                onClick={() =>
                                    file.type.startsWith("image/") &&
                                    imageUrl &&
                                    setSelectedImage(imageUrl)
                                }
                            >
                                {file.type.startsWith("image/") && imageUrl ? (
                                    <Image
                                        src={imageUrl}
                                        alt={file.name}
                                        width={80}
                                        height={80}
                                        className="object-cover w-full h-full"
                                        unoptimized
                                    />
                                ) : isPdfFile(file) || isTextFile(file) ? (
                                    <div className="flex flex-col items-center justify-center h-full p-1">
                                        {pdfInfo?.isExtracting ? (
                                            <Loader2 className="h-6 w-6 text-blue-500 mb-1 animate-spin" />
                                        ) : isPdfFile(file) ? (
                                            <FileText className="h-6 w-6 text-red-500 mb-1" />
                                        ) : (
                                            <FileCode className="h-6 w-6 text-blue-500 mb-1" />
                                        )}
                                        <span className="text-xs text-center truncate w-full px-1">
                                            {file.name.length > 10
                                                ? `${file.name.slice(0, 7)}...`
                                                : file.name}
                                        </span>
                                        {pdfInfo?.isExtracting ? (
                                            <span className="text-[10px] text-muted-foreground">
                                                {dict.file.reading}
                                            </span>
                                        ) : pdfInfo?.charCount ? (
                                            <span className="text-[10px] text-green-600 font-medium">
                                                {formatCharCount(
                                                    pdfInfo.charCount,
                                                )}{" "}
                                                {dict.file.chars}
                                            </span>
                                        ) : null}
                                    </div>
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
                                aria-label={dict.file.removeFile}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    )
                })}
                {/* URL previews */}
                {urlData && urlData.size > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {Array.from(urlData.entries()).map(
                            ([url, data], index) => (
                                <div
                                    key={url + index}
                                    className="relative group"
                                >
                                    <div className="w-20 h-20 border rounded-md overflow-hidden bg-muted">
                                        <div className="flex flex-col items-center justify-center h-full p-1">
                                            {data.isExtracting ? (
                                                <>
                                                    <Loader2 className="h-6 w-6 text-blue-500 mb-1 animate-spin" />
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {dict.file.reading}
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <Link className="h-6 w-6 text-blue-500 mb-1" />
                                                    <span className="text-xs text-center truncate w-full px-1">
                                                        {data.title.length > 10
                                                            ? `${data.title.slice(0, 7)}...`
                                                            : data.title}
                                                    </span>
                                                    {data.charCount && (
                                                        <span className="text-[10px] text-green-600 font-medium">
                                                            {formatCharCount(
                                                                data.charCount,
                                                            )}{" "}
                                                            {dict.file.chars}
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    {onRemoveUrl && (
                                        <button
                                            type="button"
                                            onClick={() => onRemoveUrl(url)}
                                            className="absolute -top-2 -right-2 bg-destructive rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            aria-label={dict.file.removeFile}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                            ),
                        )}
                    </div>
                )}
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
                        aria-label={dict.common.close}
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
                            unoptimized
                        />
                    </div>
                </div>
            )}
        </>
    )
}
