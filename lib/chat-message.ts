import type { InferUITools, UIMessage } from "ai"
import type { chatTools } from "@/lib/chat-tools"
import type { SelectedCell } from "@/stores/canvas-store"

/** Shapes sent with a user message (also kept in its metadata) */
export type MessageSelection = Pick<SelectedCell, "id" | "label">[]

export interface ChatMessageMetadata {
    selectedCells?: MessageSelection
}

/**
 * A failed request or an answer that drew nothing, shown in the chat with
 * what to do: an assistant message with this as its only part. The server
 * ignores data parts, so it never reaches the model.
 */
export interface ChatNotice {
    text: string
    /** Show a button that opens model settings, on the provider that refused */
    openModelConfig?: boolean
    providerId?: string
}

export type ChatToolName = keyof InferUITools<typeof chatTools>

export type ChatUIMessage = UIMessage<
    ChatMessageMetadata,
    { notice: ChatNotice },
    InferUITools<typeof chatTools>
>

export function noticeMessage(notice: ChatNotice): ChatUIMessage {
    return {
        id: `notice-${Date.now()}`,
        role: "assistant",
        parts: [{ type: "data-notice", data: notice }],
    }
}

/** The notice a message carries, if it is one */
export function noticeOf(message: ChatUIMessage): ChatNotice | undefined {
    const part = message.parts.find((p) => p.type === "data-notice")
    return part?.data
}
