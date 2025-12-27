"use client"

import { useState } from "react"
import { toast } from "sonner"
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

/**
 * Hook for processing file uploads, especially PDFs and text files.
 * Handles text extraction, character limit validation, and cleanup.
 */
export function useFileProcessor() {
    const [files, setFiles] = useState<File[]>([])
    const [pdfData, setPdfData] = useState<Map<File, FileData>>(new Map())

    const handleFileChange = async (newFiles: File[]) => {
        setFiles(newFiles)

        // Extract text immediately for new PDF/text files
        for (const file of newFiles) {
            const needsExtraction =
                (isPdfFile(file) || isTextFile(file)) && !pdfData.has(file)
            if (needsExtraction) {
                // Mark as extracting
                setPdfData((prev) => {
                    const next = new Map(prev)
                    next.set(file, {
                        text: "",
                        charCount: 0,
                        isExtracting: true,
                    })
                    return next
                })

                // Extract text asynchronously
                try {
                    let text: string
                    if (isPdfFile(file)) {
                        text = await extractPdfText(file)
                    } else {
                        text = await extractTextFileContent(file)
                    }

                    // Check character limit
                    if (text.length > MAX_EXTRACTED_CHARS) {
                        const limitK = MAX_EXTRACTED_CHARS / 1000
                        toast.error(
                            `${file.name}: Content exceeds ${limitK}k character limit (${(text.length / 1000).toFixed(1)}k chars)`,
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
                    toast.error(`Failed to read file: ${file.name}`)
                    setPdfData((prev) => {
                        const next = new Map(prev)
                        next.delete(file)
                        return next
                    })
                }
            }
        }

        // Clean up pdfData for removed files
        setPdfData((prev) => {
            const next = new Map(prev)
            for (const key of prev.keys()) {
                if (!newFiles.includes(key)) {
                    next.delete(key)
                }
            }
            return next
        })
    }

    return {
        files,
        pdfData,
        handleFileChange,
        setFiles, // Export for external control (e.g., clearing files)
    }
}
