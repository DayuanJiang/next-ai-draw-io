// Centralized localStorage keys for settings.
// Chat data is stored in IndexedDB via session-storage.ts

export const STORAGE_KEYS = {
    // Access code for password-protected deployments
    accessCode: "next-ai-draw-io-access-code",
    accessCodeRequired: "next-ai-draw-io-access-code-required",

    // Multi-model configuration
    modelConfigs: "next-ai-draw-io-model-configs",

    // Appearance
    darkMode: "next-ai-draw-io-dark-mode",
    locale: "next-ai-draw-io-locale",
    minimalStyle: "next-ai-draw-io-minimal-style",
    panelWidth: "next-ai-draw-io-panel-width",

    // Chat input preferences
    sendShortcut: "next-ai-draw-io-send-shortcut",

    // Diagram validation
    vlmValidationEnabled: "next-ai-draw-io-vlm-validation-enabled",

    // Custom system message
    customSystemMessage: "next-ai-draw-io-custom-system-message",

    // Output token budget per turn (empty = server default)
    maxOutputTokens: "next-ai-draw-io-max-output-tokens",

    // Langfuse session id
    sessionId: "next-ai-draw-io-session-id",
} as const
