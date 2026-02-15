// Types for multi-provider model configuration

export type ProviderName =
    | "openai"
    | "anthropic"
    | "google"
    | "vertexai"
    | "azure"
    | "bedrock"
    | "ollama"
    | "openrouter"
    | "deepseek"
    | "siliconflow"
    | "sglang"
    | "gateway"
    | "edgeone"
    | "doubao"
    | "modelscope"

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
    // Vertex AI specific fields
    vertexApiKey?: string // Express Mode API key

    models: ModelConfig[]
    validated?: boolean // Has API key been validated
}

// The complete multi-model configuration
export interface MultiModelConfig {
    version: 1
    providers: ProviderConfig[]
    selectedModelId?: string // Currently selected model's UUID
    showUnvalidatedModels?: boolean // Show models that haven't been validated
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
    // Custom env var name(s) for server models
    // Can be a single string or array of strings for load balancing
    apiKeyEnv?: string | string[]
    baseUrlEnv?: string
}

// Provider metadata
export const PROVIDER_INFO: Record<
    ProviderName,
    { label: string; defaultBaseUrl?: string }
> = {
    openai: {
        label: "OpenAI",
        defaultBaseUrl: "https://api.openai.com/v1",
    },
    anthropic: {
        label: "Anthropic",
        defaultBaseUrl: "https://api.anthropic.com/v1",
    },
    google: {
        label: "Google",
        defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    },
    vertexai: { label: "Google Vertex AI" },
    azure: {
        label: "Azure OpenAI",
        defaultBaseUrl: "https://your-resource.openai.azure.com/openai",
    },
    bedrock: { label: "Amazon Bedrock" },
    ollama: {
        label: "Ollama",
        defaultBaseUrl: "http://localhost:11434",
    },
    openrouter: {
        label: "OpenRouter",
        defaultBaseUrl: "https://openrouter.ai/api/v1",
    },
    deepseek: {
        label: "DeepSeek",
        defaultBaseUrl: "https://api.deepseek.com/v1",
    },
    siliconflow: {
        label: "SiliconFlow",
        defaultBaseUrl: "https://api.siliconflow.cn/v1",
    },
    sglang: {
        label: "SGLang",
        defaultBaseUrl: "http://127.0.0.1:8000/v1",
    },
    gateway: {
        label: "AI Gateway",
        defaultBaseUrl: "https://ai-gateway.vercel.sh/v1/ai",
    },
    edgeone: { label: "EdgeOne Pages" },
    doubao: {
        label: "Doubao (ByteDance)",
        defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    },
    modelscope: {
        label: "ModelScope",
        defaultBaseUrl: "https://api-inference.modelscope.cn/v1",
    },
}

// Suggested models per provider for quick add
export const SUGGESTED_MODELS: Partial<Record<ProviderName, string[]>> = {
    openai: [
        "gpt-5.2-pro",
        "gpt-5.2-chat-latest",
        "gpt-5.2",
        "gpt-5.1-codex-mini",
        "gpt-5.1-codex",
        "gpt-5.1-chat-latest",
        "gpt-5.1",
        "gpt-5-pro",
        "gpt-5",
        "gpt-5-mini",
        "gpt-5-nano",
        "gpt-5-codex",
        "gpt-5-chat-latest",
        "gpt-4.1",
        "gpt-4.1-mini",
        "gpt-4.1-nano",
        "gpt-4o",
        "gpt-4o-mini",
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
    vertexai: [
        // Gemini 2.5 series
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        // Gemini 2.0 series
        "gemini-2.0-flash",
        "gemini-2.0-flash-exp",
        // Gemini 1.5 series
        "gemini-1.5-pro",
        "gemini-1.5-flash",
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
    sglang: [
        // SGLang is OpenAI-compatible, models depend on deployment
        "default",
    ],
    gateway: [
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "anthropic/claude-sonnet-4-5",
        "anthropic/claude-3-5-sonnet",
        "google/gemini-2.0-flash",
    ],
    edgeone: ["@tx/deepseek-ai/deepseek-v32"],
    doubao: [
        // ByteDance Doubao models
        "doubao-1.5-thinking-pro-250415",
        "doubao-1.5-thinking-pro-m-250428",
        "doubao-1.5-pro-32k-250115",
        "doubao-1.5-pro-256k-250115",
        "doubao-pro-32k-241215",
        "doubao-pro-256k-241215",
    ],
    modelscope: [
        // Qwen
        "Qwen/Qwen2.5-72B-Instruct",
        "Qwen/Qwen2.5-32B-Instruct",
        "Qwen/Qwen3-235B-A22B-Instruct-2507",
        "Qwen/Qwen3-VL-235B-A22B-Instruct",
        "Qwen/Qwen3-32B",
        // DeepSeek
        "deepseek-ai/DeepSeek-R1-0528",
        "deepseek-ai/DeepSeek-V3.2",
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

// Get all models as flattened list for dropdown (user-defined only)
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
                // Vertex AI fields
                vertexApiKey: provider.vertexApiKey,

                validated: model.validated,
                source: "user",
                isDefault: false,
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
