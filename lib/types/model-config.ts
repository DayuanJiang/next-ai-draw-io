// Types for multi-provider model configuration

import { PROVIDERS, type ProviderName } from "@/lib/providers"

export type { ProviderName } from "@/lib/providers"

// Individual model configuration
export interface ModelConfig {
    id: string // UUID for this model
    modelId: string // e.g., "gpt-4o", "claude-sonnet-4-5"
    validated?: boolean // Has this model been validated
    validationError?: string // Error message if validation failed
    validationWarning?: string // Passed, but e.g. did not call a tool
    responseTime?: number // Milliseconds the last test took
    // The thinking switch, for models that have one; unset means on
    thinkingEnabled?: boolean
}

// Provider configuration
export interface ProviderConfig {
    id: string // UUID for this provider config
    provider: ProviderName
    name?: string // Custom display name (e.g., "OpenAI Production")
    apiKey: string
    baseUrl?: string
    // AWS Bedrock specific fields
    awsAccessKeyId?: string
    awsSecretAccessKey?: string
    awsRegion?: string
    awsSessionToken?: string // Optional, for temporary credentials
    // Vertex AI specific fields
    vertexApiKey?: string // Express Mode API key

    models: ModelConfig[]
}

// The complete multi-model configuration
export interface MultiModelConfig {
    version: 1
    providers: ProviderConfig[]
    selectedModelId?: string // Currently selected model's UUID
}

// Flattened model for dropdown display
export interface FlattenedModel {
    id: string // Model config UUID or synthetic server ID (e.g., "server:provider:modelId")
    modelId: string // Actual model ID
    provider: ProviderName
    providerLabel: string // Provider display name
    apiKey: string
    baseUrl?: string
    // AWS Bedrock specific fields
    awsAccessKeyId?: string
    awsSecretAccessKey?: string
    awsRegion?: string
    awsSessionToken?: string
    // Vertex AI specific fields
    vertexApiKey?: string // Express Mode API key

    validated?: boolean // Has this model been validated
    // Source of this model config: user-defined (client) or server-defined
    source?: "user" | "server"
    // Whether this model is the server default (matches AI_MODEL env var)
    isDefault?: boolean
    thinkingEnabled?: boolean
}

// Helper to generate UUID
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// Create empty config
export function createEmptyConfig(): MultiModelConfig {
    return {
        version: 1,
        providers: [],
        selectedModelId: undefined,
    }
}

// Create new provider config
export function createProviderConfig(provider: ProviderName): ProviderConfig {
    return {
        id: generateId(),
        provider,
        apiKey: "",
        baseUrl: PROVIDERS[provider].defaultBaseUrl,
        models: [],
    }
}

// Create new model config
export function createModelConfig(modelId: string): ModelConfig {
    return {
        id: generateId(),
        modelId,
    }
}

// Get all models as flattened list for dropdown (user-defined only)
export function flattenModels(config: MultiModelConfig): FlattenedModel[] {
    const models: FlattenedModel[] = []

    for (const provider of config.providers) {
        // Use custom name if provided, otherwise use default provider label
        const providerLabel =
            provider.name || PROVIDERS[provider.provider].label

        for (const model of provider.models) {
            models.push({
                id: model.id,
                modelId: model.modelId,
                provider: provider.provider,
                providerLabel,
                apiKey: provider.apiKey,
                baseUrl: provider.baseUrl,
                // AWS Bedrock fields
                awsAccessKeyId: provider.awsAccessKeyId,
                awsSecretAccessKey: provider.awsSecretAccessKey,
                awsRegion: provider.awsRegion,
                awsSessionToken: provider.awsSessionToken,
                // Vertex AI fields
                vertexApiKey: provider.vertexApiKey,

                validated: model.validated,
                source: "user",
                isDefault: false,
                thinkingEnabled: model.thinkingEnabled,
            })
        }
    }

    return models
}

// Find model by ID
export function findModelById(
    config: MultiModelConfig,
    modelId: string,
): FlattenedModel | undefined {
    return flattenModels(config).find((m) => m.id === modelId)
}

/**
 * A base URL the way the SDKs expect it: no spaces, no trailing slash, and
 * no endpoint path users often paste along (".../v1/chat/completions"),
 * which the SDK would append a second time.
 */
export function normalizeBaseUrl(url: string): string {
    return url
        .trim()
        .replace(/\/+$/, "")
        .replace(/\/(?:chat\/completions|completions|messages|responses)$/, "")
}

/**
 * Ollama's native API root, which the SDK appends /chat to and the model
 * list /tags. Users often enter the server address ("http://localhost:11434")
 * or its OpenAI-compatible one (".../v1"); both get /api.
 */
export function ollamaApiUrl(baseUrl: string): string {
    return `${normalizeBaseUrl(baseUrl).replace(/\/(?:api|v1)$/, "")}/api`
}

/** Where a chat request goes for a base URL, or null when the SDK decides */
export function chatRequestUrl(
    provider: ProviderName,
    baseUrl: string,
): string | null {
    const url = normalizeBaseUrl(baseUrl)
    if (!url) return null
    const { sdk, ownRequestPath } = PROVIDERS[provider]
    if (sdk === "anthropic") return `${url}/messages`
    if (sdk === "ollama") return `${ollamaApiUrl(url)}/chat`
    // These SDKs build their own paths (or, for MiniMax, pick the protocol
    // from the URL)
    return ownRequestPath ? null : `${url}/chat/completions`
}
