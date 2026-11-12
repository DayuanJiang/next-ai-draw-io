import type { UIMessage } from "ai"

/** A run of plain text, or an attached file / URL whose text was inlined */
export interface TextSection {
    type: "text" | "file" | "url"
    content: string
    filename?: string
    charCount?: number
    fileType?: "pdf" | "text" | "url"
}

// Matches the [PDF: ...], [File: ...] and [URL: ...] sections appended to the
// user's text. A name may hold "]" ("[Draft] plan.pdf"): the heading ends
// with the last one on its line, as the server reads it.
export const APPENDED_FILE_SECTIONS_PATTERN =
    /\n\n\[(PDF|File|URL):\s*[^\n]*\]\n[\s\S]*$/

export function splitTextIntoFileSections(text: string): TextSection[] {
    const sections: TextSection[] = []
    const filePattern =
        /\[(PDF|File|URL):\s*([^\n]*)\]\n([\s\S]*?)(?=\n\n\[(PDF|File|URL):|$)/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = filePattern.exec(text)) !== null) {
        const beforeText = text.slice(lastIndex, match.index).trim()
        if (beforeText) sections.push({ type: "text", content: beforeText })

        const sectionType = match[1].toLowerCase()
        const fileType =
            sectionType === "pdf"
                ? "pdf"
                : sectionType === "url"
                  ? "url"
                  : "text"
        const content = match[3].trim()
        sections.push({
            type: sectionType === "url" ? "url" : "file",
            content,
            filename: match[2].trim(),
            charCount: content.length,
            fileType,
        })
        lastIndex = match.index + match[0].length
    }

    const remainingText = text.slice(lastIndex).trim()
    if (remainingText) sections.push({ type: "text", content: remainingText })
    if (sections.length === 0) sections.push({ type: "text", content: text })
    return sections
}

export function getMessageTextContent(message: UIMessage): string {
    return message.parts
        .filter((part) => part.type === "text")
        .map((part) => (part as { text: string }).text)
        .join("\n")
}

/** Only the user's typed text, without appended file content */
export function getUserOriginalText(message: UIMessage): string {
    return getMessageTextContent(message)
        .replace(APPENDED_FILE_SECTIONS_PATTERN, "")
        .trim()
}

// DeepSeek on Amazon Bedrock ends the text before each tool call with the
// start of its own tool call syntax, "<｜DSML｜function_calls" (its bars are
// the fullwidth U+FF5C)
const TOOL_CALL_MARKER = /\s*<\uFF5CDSML\uFF5C[\s\S]*$/

/** A text part of an answer, without the tool call marker a model left in it */
export function withoutToolCallMarker(text: string): string {
    return text.replace(TOOL_CALL_MARKER, "")
}
