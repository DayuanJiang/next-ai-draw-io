import type { UIMessage } from "ai"

export interface ChatUsageMetadata {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cachedInputTokens?: number
    cacheWriteTokens?: number
    estimatedCostUsd?: number
    costAvailable?: boolean
    pricingSource?: string
}

export interface ChatMessageMetadata {
    provider?: string
    modelId?: string
    finishReason?: string
    usage?: ChatUsageMetadata
}

export type ChatUIMessage = UIMessage<ChatMessageMetadata>
