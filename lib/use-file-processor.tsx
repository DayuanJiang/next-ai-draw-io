"use client"

import { useState } from "react"
import { toast } from "sonner"
import { toastUnexpectedError } from "@/lib/client-error-report"
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
    /** A file without text, such as a scanned PDF */
    noText: string
    readFailed: string
    /** The Report button of the read failure */
    report: string
}

/**
 * Hook for processing file uploads, especially PDFs and text files.
 * Handles text extraction, character limit validation, and cleanup.
 */
export function useFileProcessor(messages: FileProcessorMessages) {
    const [files, setFiles] = useState<File[]>([])
    const [pdfData, setPdfData] = useState<Map<File, FileData>>(new Map())

    // A file whose text cannot be sent leaves the list: shown as attached,
    // it would go out with the message as nothing at all
    const removeFile = (file: File) => {
        setPdfData((prev) => {
            const next = new Map(prev)
            next.delete(file)
            return next
        })
        setFiles((prev) => prev.filter((f) => f !== file))
    }

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
                    removeFile(file)
                    continue
                }

                // A scanned PDF has pictures of its pages and no text: unpdf
                // gives "", or the line breaks between its pages
                if (!text.trim()) {
                    toast.error(
                        formatMessage(messages.noText, { name: file.name }),
                    )
                    removeFile(file)
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
                toastUnexpectedError(
                    formatMessage(messages.readFailed, { name: file.name }),
                    messages.report,
                    error,
                )
                removeFile(file)
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
