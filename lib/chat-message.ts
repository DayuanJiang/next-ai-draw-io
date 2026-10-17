import type { InferUITools, LanguageModelUsage, UIMessage } from "ai"
import type { chatTools } from "@/lib/chat-tools"
import type { SelectedCell } from "@/stores/canvas-store"

/** Shapes sent with a user message (also kept in its metadata, where
 * isEdge names a connector as one; messages saved before it have none) */
export type MessageSelection = (Pick<SelectedCell, "id" | "label"> &
    Partial<Pick<SelectedCell, "isEdge">>)[]

/** Tokens and model time of an answer, over all the requests of its turn */
export interface ReplyUsage {
    inputTokens: number
    outputTokens: number
    /** Of the input, read from the provider's prompt cache */
    cacheReadTokens: number
    /** Of the output, spent thinking */
    reasoningTokens: number
    durationMs: number
    /** USD at the official price; missing when a request had no known price */
    costUsd?: number
}

export interface ChatMessageMetadata {
    selectedCells?: MessageSelection
    usage?: ReplyUsage
}

/**
 * The answer's usage with one more request added. A request whose provider
 * reported no usage adds nothing. The cost stays known only while every
 * request of the turn had a price.
 */
export function addReplyUsage(
    before: ReplyUsage | undefined,
    usage: LanguageModelUsage,
    durationMs: number,
    costUsd?: number,
): ReplyUsage | undefined {
    if (usage.inputTokens === undefined && usage.outputTokens === undefined)
        return before
    const cost =
        costUsd !== undefined && (!before || before.costUsd !== undefined)
            ? (before?.costUsd ?? 0) + costUsd
            : undefined
    return {
        inputTokens: (before?.inputTokens ?? 0) + (usage.inputTokens ?? 0),
        outputTokens: (before?.outputTokens ?? 0) + (usage.outputTokens ?? 0),
        cacheReadTokens:
            (before?.cacheReadTokens ?? 0) +
            (usage.inputTokenDetails.cacheReadTokens ?? 0),
        reasoningTokens:
            (before?.reasoningTokens ?? 0) +
            (usage.outputTokenDetails.reasoningTokens ?? 0),
        durationMs: (before?.durationMs ?? 0) + durationMs,
        ...(cost !== undefined && { costUsd: cost }),
    }
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
