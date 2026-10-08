import type { getSelectedAIConfig } from "@/hooks/use-model-config"

type AIConfig = ReturnType<typeof getSelectedAIConfig>

/**
 * Request headers for /api/chat: the access code, the user's own provider
 * credentials (when a client-side model is selected) and per-request options.
 */
export function buildChatHeaders(
    config: AIConfig,
    options: { minimalStyle: boolean; maxOutputTokens: string },
): Record<string, string> {
    const headers: Record<string, string> = {
        "x-access-code": config.accessCode,
    }
    const set = (name: string, value: string | undefined) => {
        if (value) headers[name] = value
    }
    if (config.aiProvider) {
        set("x-ai-provider", config.aiProvider)
        set("x-ai-base-url", config.aiBaseUrl)
        set("x-ai-api-key", config.aiApiKey)
        set("x-ai-model", config.aiModel)
        // AWS Bedrock credentials
        set("x-aws-access-key-id", config.awsAccessKeyId)
        set("x-aws-secret-access-key", config.awsSecretAccessKey)
        set("x-aws-region", config.awsRegion)
        set("x-aws-session-token", config.awsSessionToken)
        // Vertex AI credentials (Express Mode)
        set("x-vertex-api-key", config.vertexApiKey)
    }
    // Selected model ID for server model lookup (apiKeyEnv/baseUrlEnv)
    set("x-selected-model-id", config.selectedModelId)
    if (options.minimalStyle) headers["x-minimal-style"] = "true"
    set("x-max-output-tokens", options.maxOutputTokens)
    return headers
}
