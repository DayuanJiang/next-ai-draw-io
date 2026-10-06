"use client"

import { useState } from "react"
import { toast } from "sonner"
import { formatMessage } from "@/lib/i18n/utils"
import {
    extractPdfText,
    extractTextFileContent,
    isPdfFile,
    isTextFile,
    MAX_EXTRACTED_CHARS,
} from "@/lib/pdf-utils"

export interface FileData {
    text: string
    charCount: number
    isExtracting: boolean
}

/** Toast texts; {name}, {limit} and {size} are filled in */
export interface FileProcessorMessages {
    tooLong: string
    readFailed: string
}

const DEFAULT_MESSAGES: FileProcessorMessages = {
    tooLong: "{name}: Content exceeds {limit}k character limit ({size}k chars)",
    readFailed: "Failed to read file: {name}",
}

/**
 * Hook for processing file uploads, especially PDFs and text files.
 * Handles text extraction, character limit validation, and cleanup.
 */
export function useFileProcessor(
    messages: FileProcessorMessages = DEFAULT_MESSAGES,
) {
    const [files, setFiles] = useState<File[]>([])
    const [pdfData, setPdfData] = useState<Map<File, FileData>>(new Map())

    const handleFileChange = async (newFiles: File[]) => {
        setFiles(newFiles)

        const pending = newFiles.filter(
            (file) =>
                (isPdfFile(file) || isTextFile(file)) && !pdfData.has(file),
        )

        // Before any await: drop data for removed files and mark every new
        // file as extracting, so queued files also block sending
        setPdfData((prev) => {
            const next = new Map<File, FileData>()
            for (const file of newFiles) {
                const existing = prev.get(file)
                if (existing) next.set(file, existing)
            }
            for (const file of pending) {
                next.set(file, { text: "", charCount: 0, isExtracting: true })
            }
            return next
        })

        // Extract one file at a time
        for (const file of pending) {
            try {
                let text: string
                if (isPdfFile(file)) {
                    text = await extractPdfText(file)
                } else {
                    text = await extractTextFileContent(file)
                }

                // Check character limit
                if (text.length > MAX_EXTRACTED_CHARS) {
                    toast.error(
                        formatMessage(messages.tooLong, {
                            name: file.name,
                            limit: MAX_EXTRACTED_CHARS / 1000,
                            size: (text.length / 1000).toFixed(1),
                        }),
                    )
                    setPdfData((prev) => {
                        const next = new Map(prev)
                        next.delete(file)
                        return next
                    })
                    // Remove the file from the list
                    setFiles((prev) => prev.filter((f) => f !== file))
                    continue
                }

                setPdfData((prev) => {
                    // The file was removed while extracting
                    if (!prev.has(file)) return prev
                    const next = new Map(prev)
                    next.set(file, {
                        text,
                        charCount: text.length,
                        isExtracting: false,
                    })
                    return next
                })
            } catch (error) {
                console.error("Failed to extract text:", error)
                toast.error(
                    formatMessage(messages.readFailed, { name: file.name }),
                )
                setPdfData((prev) => {
                    const next = new Map(prev)
                    next.delete(file)
                    return next
                })
            }
        }
    }

    return {
        files,
        pdfData,
        handleFileChange,
        setFiles, // Export for external control (e.g., clearing files)
    }
}
