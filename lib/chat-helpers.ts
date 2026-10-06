// Shared helper functions for chat route
// Exported for testing

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
        const fileParts =
            message?.parts?.filter((p: any) => p.type === "file") || []

        if (fileParts.length > MAX_FILES) {
            return {
                valid: false,
                error: `Too many files. Maximum ${MAX_FILES} allowed.`,
            }
        }

        for (const filePart of fileParts) {
            // The client sends files inline. Any other URL would be downloaded
            // by the server (AI SDK does that for models without URL support).
            if (
                typeof filePart.url !== "string" ||
                !filePart.url.startsWith("data:")
            ) {
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

// Helper function to replace historical tool call XML with placeholders
// This reduces token usage and forces LLM to rely on the current diagram XML (source of truth)
// Tool calls with invalid inputs are left for dropInvalidToolCalls to remove
export function replaceHistoricalToolInputs(messages: any[]): any[] {
    return messages.map((msg) => {
        if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
            return msg
        }
        const replacedContent = msg.content.map((part: any) => {
            if (
                part.type === "tool-call" &&
                isValidToolInput(part.input) &&
                (part.toolName === "display_diagram" ||
                    part.toolName === "edit_diagram")
            ) {
                return {
                    ...part,
                    input: {
                        placeholder:
                            "[XML content replaced - see current diagram XML in system context]",
                    },
                }
            }
            return part
        })
        return { ...msg, content: replacedContent }
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
