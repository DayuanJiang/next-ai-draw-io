// Types for multi-provider model configuration

export type ProviderName =
    | "openai"
    | "anthropic"
    | "google"
    | "azure"
    | "bedrock"
    | "openrouter"
    | "deepseek"
    | "siliconflow"
    | "gateway"

// Individual model configuration
export interface ModelConfig {
    id: string // UUID for this model
    modelId: string // e.g., "gpt-4o", "claude-sonnet-4-5"
    validated?: boolean // Has this model been validated
    validationError?: string // Error message if validation failed
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
    models: ModelConfig[]
    validated?: boolean // Has API key been validated
}

// The complete multi-model configuration
export interface MultiModelConfig {
    version: 1
    providers: ProviderConfig[]
    selectedModelId?: string // Currently selected model's UUID
}

// Flattened model for dropdown display
export interface FlattenedModel {
    id: string // Model config UUID
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
    validated?: boolean // Has this model been validated
}

// Provider metadata
export const PROVIDER_INFO: Record<
    ProviderName,
    { label: string; defaultBaseUrl?: string }
> = {
    openai: { label: "OpenAI" },
    anthropic: {
        label: "Anthropic",
        defaultBaseUrl: "https://api.anthropic.com/v1",
    },
    google: { label: "Google" },
    azure: { label: "Azure OpenAI" },
    bedrock: { label: "Amazon Bedrock" },
    openrouter: { label: "OpenRouter" },
    deepseek: { label: "DeepSeek" },
    siliconflow: {
        label: "SiliconFlow",
        defaultBaseUrl: "https://api.siliconflow.com/v1",
    },
    gateway: { label: "AI Gateway" },
}

// Suggested models per provider for quick add
export const SUGGESTED_MODELS: Record<ProviderName, string[]> = {
    openai: [
        // GPT-4o series (latest)
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4o-2024-11-20",
        // GPT-4 Turbo
        "gpt-4-turbo",
        "gpt-4-turbo-preview",
        // o1/o3 reasoning models
        "o1",
        "o1-mini",
        "o1-preview",
        "o3-mini",
        // GPT-4
        "gpt-4",
        // GPT-3.5
        "gpt-3.5-turbo",
    ],
    anthropic: [
        // Claude 4.5 series (latest)
        "claude-opus-4-5-20250514",
        "claude-sonnet-4-5-20250514",
        // Claude 4 series
        "claude-opus-4-20250514",
        "claude-sonnet-4-20250514",
        // Claude 3.7 series
        "claude-3-7-sonnet-20250219",
        // Claude 3.5 series
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        // Claude 3 series
        "claude-3-opus-20240229",
        "claude-3-sonnet-20240229",
        "claude-3-haiku-20240307",
    ],
    google: [
        // Gemini 2.5 series
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-preview-05-20",
        // Gemini 2.0 series
        "gemini-2.0-flash",
        "gemini-2.0-flash-exp",
        "gemini-2.0-flash-lite",
        // Gemini 1.5 series
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        // Legacy
        "gemini-pro",
    ],
    azure: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-35-turbo"],
    bedrock: [
        // Anthropic Claude
        "anthropic.claude-opus-4-5-20250514-v1:0",
        "anthropic.claude-sonnet-4-5-20250514-v1:0",
        "anthropic.claude-opus-4-20250514-v1:0",
        "anthropic.claude-sonnet-4-20250514-v1:0",
        "anthropic.claude-3-7-sonnet-20250219-v1:0",
        "anthropic.claude-3-5-sonnet-20241022-v2:0",
        "anthropic.claude-3-5-haiku-20241022-v1:0",
        "anthropic.claude-3-opus-20240229-v1:0",
        "anthropic.claude-3-sonnet-20240229-v1:0",
        "anthropic.claude-3-haiku-20240307-v1:0",
        // Amazon Nova
        "amazon.nova-pro-v1:0",
        "amazon.nova-lite-v1:0",
        "amazon.nova-micro-v1:0",
        // Meta Llama
        "meta.llama3-3-70b-instruct-v1:0",
        "meta.llama3-1-405b-instruct-v1:0",
        "meta.llama3-1-70b-instruct-v1:0",
        // Mistral
        "mistral.mistral-large-2411-v1:0",
        "mistral.mistral-small-2503-v1:0",
    ],
    openrouter: [
        // Anthropic
        "anthropic/claude-sonnet-4",
        "anthropic/claude-opus-4",
        "anthropic/claude-3.5-sonnet",
        "anthropic/claude-3.5-haiku",
        // OpenAI
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "openai/o1",
        "openai/o3-mini",
        // Google
        "google/gemini-2.5-pro",
        "google/gemini-2.5-flash",
        "google/gemini-2.0-flash-exp:free",
        // Meta Llama
        "meta-llama/llama-3.3-70b-instruct",
        "meta-llama/llama-3.1-405b-instruct",
        "meta-llama/llama-3.1-70b-instruct",
        // DeepSeek
        "deepseek/deepseek-chat",
        "deepseek/deepseek-r1",
        // Qwen
        "qwen/qwen-2.5-72b-instruct",
    ],
    deepseek: ["deepseek-chat", "deepseek-reasoner", "deepseek-coder"],
    siliconflow: [
        // DeepSeek
        "deepseek-ai/DeepSeek-V3",
        "deepseek-ai/DeepSeek-R1",
        "deepseek-ai/DeepSeek-V2.5",
        // Qwen
        "Qwen/Qwen2.5-72B-Instruct",
        "Qwen/Qwen2.5-32B-Instruct",
        "Qwen/Qwen2.5-Coder-32B-Instruct",
        "Qwen/Qwen2.5-7B-Instruct",
        "Qwen/Qwen2-VL-72B-Instruct",
    ],
    gateway: [
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "anthropic/claude-sonnet-4-5",
        "anthropic/claude-3-5-sonnet",
        "google/gemini-2.0-flash",
    ],
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
        baseUrl: PROVIDER_INFO[provider].defaultBaseUrl,
        models: [],
        validated: false,
    }
}

// Create new model config
export function createModelConfig(modelId: string): ModelConfig {
    return {
        id: generateId(),
        modelId,
    }
}

// Get all models as flattened list for dropdown
export function flattenModels(config: MultiModelConfig): FlattenedModel[] {
    const models: FlattenedModel[] = []

    for (const provider of config.providers) {
        // Use custom name if provided, otherwise use default provider label
        const providerLabel =
            provider.name || PROVIDER_INFO[provider.provider].label

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
                validated: model.validated,
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
