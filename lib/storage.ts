// Centralized localStorage keys for quota tracking and settings
// Chat data is now stored in IndexedDB via session-storage.ts

export const STORAGE_KEYS = {
    // Quota tracking
    requestCount: "next-ai-draw-io-request-count",
    requestDate: "next-ai-draw-io-request-date",
    tokenCount: "next-ai-draw-io-token-count",
    tokenDate: "next-ai-draw-io-token-date",
    tpmCount: "next-ai-draw-io-tpm-count",
    tpmMinute: "next-ai-draw-io-tpm-minute",

    // Settings
    accessCode: "next-ai-draw-io-access-code",
    accessCodeRequired: "next-ai-draw-io-access-code-required",
    aiProvider: "next-ai-draw-io-ai-provider",
    aiBaseUrl: "next-ai-draw-io-ai-base-url",
    aiApiKey: "next-ai-draw-io-ai-api-key",
    aiModel: "next-ai-draw-io-ai-model",

    // Multi-model configuration
    modelConfigs: "next-ai-draw-io-model-configs",
    selectedModelId: "next-ai-draw-io-selected-model-id",

    // Chat input preferences
    sendShortcut: "next-ai-draw-io-send-shortcut",
} as const
