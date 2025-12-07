import * as pdfParse from "pdf-parse"

export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
    try {
        const data = await pdfParse(pdfBuffer)

        if (!data.text || data.text.trim().length === 0) {
            throw new Error("No text content found in PDF")
        }

        const cleanedText = data.text
            .replace(/\r\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim()

        const metadata = [
            `PDF Document: ${data.info?.Title || "Untitled"}`,
            data.info?.Author ? `Author: ${data.info.Author}` : "",
            `Pages: ${data.numpages}`,
            "",
            "--- Content ---",
            cleanedText,
        ]
            .filter(Boolean)
            .join("\n")

        return metadata
    } catch (error) {
        console.error("PDF parsing error:", error)
        throw new Error(
            `Failed to extract text from PDF: ${error instanceof Error ? error.message : "Unknown error"}`,
        )
    }
}

export function isProviderSupportingPDFUpload(provider: string): boolean {
    const supportedProviders = ["anthropic", "openai", "google", "vertex"]
    return supportedProviders.includes(provider.toLowerCase())
}

export function validatePDFFile(
    file: File,
    maxSize: number = 5 * 1024 * 1024,
): { valid: boolean; error?: string } {
    if (file.type !== "application/pdf") {
        return { valid: false, error: "File must be a PDF" }
    }
    if (file.size > maxSize) {
        return {
            valid: false,
            error: `File size must be less than ${maxSize / (1024 * 1024)}MB`,
        }
    }
    return { valid: true }
}
