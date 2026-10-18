// Shared helper functions for chat route
// Exported for testing

import type { MessageDiagram } from "@/lib/diagram-context"
import { foldCells } from "@/packages/mcp-server/src/compact-cells.ts"
import { imageRefNote } from "@/packages/mcp-server/src/embedded-images.ts"
import { hasCells } from "@/packages/mcp-server/src/pages.ts"

// File upload limits (must match client-side)
export const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
export const MAX_FILES = 5

// Helper function to validate file parts in messages
// Checks every message, since history is sent to the model too
export function validateFileParts(messages: any[]): {
    valid: boolean
    error?: string
} {
    for (const message of messages) {
        const fileParts = message.parts.filter((p: any) => p.type === "file")

        if (fileParts.length > MAX_FILES) {
            return {
                valid: false,
                error: `Too many files. Maximum ${MAX_FILES} allowed.`,
            }
        }

        for (const filePart of fileParts) {
            // The client sends files inline. Any other URL would be downloaded
            // by the server (AI SDK does that for models without URL support).
            if (!filePart.url.startsWith("data:")) {
                return {
                    valid: false,
                    error: "Files must be uploaded inline as data URLs.",
                }
            }

            // Data URLs format: data:image/png;base64,<data>
            // Base64 increases size by ~33%, so we check the decoded size
            const base64Data = filePart.url.split(",")[1]
            if (base64Data) {
                const sizeInBytes = Math.ceil((base64Data.length * 3) / 4)
                if (sizeInBytes > MAX_FILE_SIZE) {
                    return {
                        valid: false,
                        error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit.`,
                    }
                }
            }
        }
    }

    return { valid: true }
}

// A tool-call input providers accept: a non-empty JSON object
function isValidToolInput(input: unknown): boolean {
    return !!input && typeof input === "object" && Object.keys(input).length > 0
}

// The text of a document or web page the user attached: the client adds
// "\n\n[PDF: name]\n<text>" ("File" and "URL" alike) after the typed text.
// The name may hold "]": the heading ends with the last one on its line.
const ATTACHED_TEXT =
    /(\n\n\[(?:PDF|File|URL): [^\n]*\])\n[\s\S]*?(?=\n\n\[(?:PDF|File|URL): |$)/g

const isImagePart = (part: any) =>
    part.type === "image" ||
    (part.type === "file" && String(part.mediaType).startsWith("image/"))

// An attached document or image goes to the model with its own turn only:
// the user messages before the newest one keep just a document's name line
export function withoutOldAttachments(messages: any[]): any[] {
    let newest = -1
    messages.forEach((msg, i) => {
        if (msg.role === "user") newest = i
    })
    return messages.map((msg, i) => {
        if (
            msg.role !== "user" ||
            i === newest ||
            !Array.isArray(msg.content)
        ) {
            return msg
        }
        const content = msg.content
            .filter((part: any) => !isImagePart(part))
            .map((part: any) =>
                part.type === "text" && typeof part.text === "string"
                    ? { ...part, text: part.text.replace(ATTACHED_TEXT, "$1") }
                    : part,
            )
        // Providers reject an empty message (the app always sends text)
        return content.length > 0 ? { ...msg, content } : msg
    })
}

// Remove tool-calls with invalid inputs (from failed repair or interrupted streaming),
// together with their tool-results: providers reject a result whose call is missing.
// Messages left empty are removed too (Bedrock rejects empty content arrays).
export function dropInvalidToolCalls(messages: any[]): any[] {
    const droppedIds = new Set<string>()
    return messages
        .map((msg) => {
            if (!Array.isArray(msg.content)) return msg
            const content = msg.content.filter((part: any) => {
                if (
                    msg.role === "assistant" &&
                    part.type === "tool-call" &&
                    !isValidToolInput(part.input)
                ) {
                    console.warn(
                        `[chat-helpers] Dropping tool-call with invalid input:`,
                        { toolName: part.toolName, input: part.input },
                    )
                    droppedIds.add(part.toolCallId)
                    return false
                }
                // Results always come after their call, so the id is known by now
                return !(
                    part.type === "tool-result" &&
                    droppedIds.has(part.toolCallId)
                )
            })
            return { ...msg, content }
        })
        .filter((msg) => !Array.isArray(msg.content) || msg.content.length > 0)
}

// Fix common LLM JSON mistakes in tool-call input before jsonrepair runs
export function fixToolInputJson(input: string): string {
    return (
        input
            // Inconsistent quote escaping in XML attributes inside JSON strings:
            // y="-20\" (opening quote unescaped, closing escaped) becomes y=\"-20\".
            // Must run before the key fix below, which would rewrite the `="`.
            .replace(/(\w+)="([^"]*?)\\"/g, '$1=\\"$2\\"')
            // `:=` instead of `: `
            .replace(/:=/g, ": ")
            // `"key"= "` instead of `"key": "`, only for JSON keys
            .replace(/"(\w+)"\s*=\s*"/g, '"$1": "')
    )
}

// Some models write an array argument as a JSON string:
// {"operations":"[{...}]"} becomes {"operations":[{...}]}
export function parseStringifiedArrays(json: string): string {
    let value: unknown
    try {
        value = JSON.parse(json)
    } catch {
        return json
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return json
    const fields = value as Record<string, unknown>
    let changed = false
    for (const [key, field] of Object.entries(fields)) {
        if (typeof field !== "string" || !field.trim().startsWith("[")) continue
        try {
            const parsed = JSON.parse(field)
            if (Array.isArray(parsed)) {
                fields[key] = parsed
                changed = true
            }
        } catch {
            // Not JSON: a plain string that starts with "["
        }
    }
    return changed ? JSON.stringify(fields) : json
}

const PAGE_BACKGROUND =
    /<mxGraphModel\b[^>]*\bbackground(?:Image)?="(?!none")[^"]/

/**
 * The note on the canvas that ends a user message (lib/diagram-context.ts).
 * The same message always gets the same text, so the history the model gets
 * stays the same from request to request.
 */
export function diagramContextText(diagram: MessageDiagram): string {
    if ("unchanged" in diagram) {
        return "[Canvas: unchanged when this message was sent. It is the latest canvas shown in an earlier note (or the empty one), with your display_diagram and edit_diagram calls since then applied.]"
    }
    // A background, colour or picture, is something to show too
    if (!hasCells(diagram.xml) && !PAGE_BACKGROUND.test(diagram.xml)) {
        return "[Canvas: empty when this message was sent.]"
    }
    const shown = foldCells(diagram.xml)
    const imageNote = imageRefNote(shown)
    return `[Canvas when this message was sent, in the compact notation you write (shapes with x, y, w, h; edges with source and target). It is the source of truth from this point on and shows any change the user made by hand.]
"""xml
${shown}
"""${imageNote ? `\n${imageNote}` : ""}`
}

// Shapes the user selected on the canvas; sent with the request as
// selectedCells: [{ id, label }]
const MAX_SELECTED_CELLS = 50
const MAX_SELECTED_TEXT = 100

function cleanSelectionText(value: unknown): string {
    if (typeof value !== "string") return ""
    return value
        .replace(/[\r\n"]+/g, " ")
        .trim()
        .slice(0, MAX_SELECTED_TEXT)
}

/** Prompt text describing the selection, or "" when there is none */
export function formatSelectionContext(selectedCells: unknown): string {
    if (!Array.isArray(selectedCells)) return ""
    const lines = selectedCells
        .slice(0, MAX_SELECTED_CELLS)
        .map((cell) => {
            const id = cleanSelectionText(cell?.id)
            if (!id) return null
            const label = cleanSelectionText(cell?.label)
            return label ? `- id="${id}" (${label})` : `- id="${id}"`
        })
        .filter((line): line is string => line !== null)
    if (lines.length === 0) return ""
    // Past the limit the model must know the list is cut short
    const more = selectedCells.length - MAX_SELECTED_CELLS
    if (more > 0) lines.push(`- and ${more} more selected shapes not listed`)
    return `The user selected these shapes on the canvas before sending this message:
${lines.join("\n")}
Apply the request to the selected shapes unless it clearly asks for something else. Prefer edit_diagram with these cell ids over redrawing the whole diagram.`
}
