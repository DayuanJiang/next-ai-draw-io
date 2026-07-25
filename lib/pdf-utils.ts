import { extractText, getDocumentProxy } from "unpdf"

// Maximum characters allowed for extracted text (configurable via env)
const DEFAULT_MAX_EXTRACTED_CHARS = 150000 // 150k chars
export const MAX_EXTRACTED_CHARS =
    Number(process.env.NEXT_PUBLIC_MAX_EXTRACTED_CHARS) ||
    DEFAULT_MAX_EXTRACTED_CHARS

// Text file extensions we support
const TEXT_EXTENSIONS = [
    ".txt",
    ".md",
    ".markdown",
    ".json",
    ".csv",
    ".xml",
    ".html",
    ".css",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".py",
    ".java",
    ".c",
    ".cpp",
    ".h",
    ".go",
    ".rs",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".log",
    ".sh",
    ".bash",
    ".zsh",
]

/**
 * Extract text content from a PDF file
 * Uses unpdf library for client-side extraction
 */
export async function extractPdfText(file: File): Promise<string> {
    const buffer = await file.arrayBuffer()
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: true })
    return text as string
}

/**
 * Check if a file is a PDF
 */
export function isPdfFile(file: File): boolean {
    return file.type === "application/pdf" || file.name.endsWith(".pdf")
}

/**
 * Check if a file is a text file
 */
export function isTextFile(file: File): boolean {
    const name = file.name.toLowerCase()
    return (
        file.type.startsWith("text/") ||
        file.type === "application/json" ||
        TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))
    )
}

/**
 * Extract text content from a text file
 */
export async function extractTextFileContent(file: File): Promise<string> {
    return await file.text()
}
