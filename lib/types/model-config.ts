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
    | "aihubmix"
    | "deepseek"
    | "siliconflow"
    | "sglang"
    | "gateway"
    | "edgeone"
    | "doubao"
    | "modelscope"
    | "glm"
    | "qwen"
    | "qiniu"
    | "kimi"
    | "minimax"
    | "novita"
    | "mimo"

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

// Providers whose server credentials live in fixed env vars
// (AWS_ACCESS_KEY_ID, GOOGLE_VERTEX_API_KEY, OLLAMA_API_KEY) with no
// apiKeyEnv redirection support — their credentials are global
export const FIXED_CRED_PROVIDERS: ProviderName[] = [
    "bedrock",
    "vertexai",
    "ollama",
]

// Map provider names to models.dev logo names
export const PROVIDER_LOGO_MAP: Record<string, string> = {
    openai: "openai",
    anthropic: "anthropic",
    google: "google",
    azure: "azure",
    bedrock: "amazon-bedrock",
    openrouter: "openrouter",
    aihubmix: "aihubmix",
    deepseek: "deepseek",
    siliconflow: "siliconflow",
    sglang: "openai", // SGLang is OpenAI-compatible
    gateway: "vercel",
    edgeone: "tencent-cloud",
    vertexai: "google",
    doubao: "bytedance",
    modelscope: "modelscope",
    minimax: "minimax",
    novita: "novita",
    mimo: "xiaomi",
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
        defaultBaseUrl: "https://ollama.com/api",
    },
    openrouter: {
        label: "OpenRouter",
        defaultBaseUrl: "https://openrouter.ai/api/v1",
    },
    aihubmix: {
        label: "AIHubMix",
        defaultBaseUrl: "https://aihubmix.com/v1",
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
    glm: {
        label: "GLM (Zhipu)",
        defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    },
    qwen: {
        label: "Qwen (Alibaba)",
        defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    },
    qiniu: {
        label: "Qiniu",
        defaultBaseUrl: "https://api.qnaigc.com/v1",
    },
    kimi: {
        label: "Kimi (Moonshot)",
        defaultBaseUrl: "https://api.moonshot.cn/v1",
    },
    minimax: {
        label: "MiniMax",
        defaultBaseUrl: "https://api.minimaxi.com/anthropic",
    },
    novita: {
        label: "Novita AI",
        defaultBaseUrl: "https://api.novita.ai/openai",
    },
    mimo: {
        label: "MiMo (Xiaomi)",
        defaultBaseUrl: "https://api.xiaomimimo.com/v1",
    },
}

// Suggested models per provider for quick add
export const SUGGESTED_MODELS: Partial<Record<ProviderName, string[]>> = {
    openai: [
        "gpt-5.5-pro",
        "gpt-5.5",
        "gpt-5.4-pro",
        "gpt-5.4",
        "gpt-5.4-mini",
        "gpt-5.4-nano",
        "gpt-5-codex-mini",
        "gpt-4.1",
        "gpt-4.1-mini",
        "gpt-4o",
        "gpt-4o-mini",
    ],
    anthropic: [
        // Claude 4.8 / 4.7 / 4.6 series (latest, dateless pinned IDs)
        "claude-opus-4-8",
        "claude-sonnet-4-6",
        "claude-haiku-4-5",
        "claude-opus-4-7",
        "claude-opus-4-6",
        // Claude 4.5 series
        "claude-sonnet-4-5-20250929",
        "claude-opus-4-5-20251101",
        // Claude 3.7 series
        "claude-3-7-sonnet-20250219",
        // Claude 3.5 series
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
    ],
    google: [
        // Gemini 3 series
        "gemini-3.1-pro",
        "gemini-3.5-flash",
        "gemini-3-flash",
        "gemini-3.1-flash-lite",
        // Gemini 2.5 series
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
    ],
    vertexai: [
        // Gemini 3 series
        "gemini-3.1-pro-preview",
        "gemini-3.5-flash",
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite",
        // Gemini 2.5 series
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
    ],
    azure: [
        "gpt-5.5",
        "gpt-5.4",
        "gpt-5.1",
        "gpt-5",
        "gpt-5-mini",
        "gpt-4.1",
        "gpt-4o",
        "gpt-4o-mini",
        "o3",
        "o4-mini",
    ],
    bedrock: [
        // Anthropic Claude
        "anthropic.claude-opus-4-8",
        "anthropic.claude-opus-4-7",
        "anthropic.claude-sonnet-4-6",
        "anthropic.claude-opus-4-6-v1",
        "anthropic.claude-opus-4-5-20251101-v1:0",
        "anthropic.claude-sonnet-4-5-20250929-v1:0",
        "anthropic.claude-haiku-4-5-20251001-v1:0",
        "anthropic.claude-opus-4-1-20250805-v1:0",
        "anthropic.claude-opus-4-20250514-v1:0",
        "anthropic.claude-sonnet-4-20250514-v1:0",
        "anthropic.claude-3-5-haiku-20241022-v1:0",
        // Amazon Nova
        "amazon.nova-2-lite-v1:0",
        "amazon.nova-premier-v1:0",
        "amazon.nova-pro-v1:0",
        "amazon.nova-lite-v1:0",
        "amazon.nova-micro-v1:0",
        // Meta Llama
        "meta.llama4-maverick-17b-instruct-v1:0",
        "meta.llama4-scout-17b-instruct-v1:0",
        "meta.llama3-3-70b-instruct-v1:0",
        // Mistral
        "mistral.mistral-large-3-675b-instruct",
        "mistral.pixtral-large-2502-v1:0",
    ],
    openrouter: [
        // Anthropic
        "anthropic/claude-opus-4.8",
        "anthropic/claude-sonnet-4.6",
        "anthropic/claude-haiku-4.5",
        // OpenAI
        "openai/gpt-5.5",
        "openai/gpt-5.4",
        "openai/gpt-5.4-mini",
        "openai/gpt-4o-mini",
        // Google
        "google/gemini-3.1-pro-preview",
        "google/gemini-3.5-flash",
        "google/gemini-2.5-flash-lite",
        // xAI
        "x-ai/grok-4.3",
        // Meta Llama
        "meta-llama/llama-4-maverick",
        "meta-llama/llama-4-scout",
        "meta-llama/llama-3.3-70b-instruct",
        // DeepSeek
        "deepseek/deepseek-v4-pro",
        "deepseek/deepseek-v3.2",
        // Qwen
        "qwen/qwen3.7-max",
        "qwen/qwen3-coder",
        // MiniMax
        "minimax/minimax-m3",
    ],
    aihubmix: [
        // Fallback list. The settings UI loads the live model list from AIHubMix when available.
        // Anthropic Claude
        "claude-fable-5",
        "claude-opus-4-8",
        "claude-sonnet-4-6",
        // OpenAI
        "gpt-5.5",
        "gpt-5.5-pro",
        "gpt-5.4",
        // Google Gemini
        "gemini-3.5-flash",
        "gemini-3.1-pro-preview",
        "gemini-3-flash-preview",
        // DeepSeek
        "deepseek-v4-pro",
        "deepseek-v4-flash",
        // Qwen
        "qwen3.7-max",
        "qwen3-coder-next",
        // Z.ai
        "glm-5.1",
        // Moonshot AI
        "kimi-k2.6",
        // MiniMax
        "minimax-m3",
        // xAI
        "grok-4.3",
        // Baidu
        "ernie-5.1",
        // Mistral
        "mistral-large-3",
        // Meta
        "llama-4-maverick",
    ],
    deepseek: [
        "deepseek-v4-pro",
        "deepseek-v4-flash",
        "deepseek-chat",
        "deepseek-reasoner",
    ],
    siliconflow: [
        // DeepSeek
        "deepseek-ai/DeepSeek-V4-Pro",
        "deepseek-ai/DeepSeek-V4-Flash",
        "deepseek-ai/DeepSeek-V3.2",
        // MiniMax
        "MiniMaxAI/MiniMax-M3",
        // Moonshot
        "moonshotai/Kimi-K2.6",
        // Z.ai
        "zai-org/GLM-5",
        // Qwen
        "Qwen/Qwen3.6-35B-A3B",
        "Qwen/Qwen3-Coder-480B-A35B-Instruct",
        "Qwen/Qwen3-30B-A3B-Instruct-2507",
        "Qwen/Qwen3-VL-32B-Instruct",
        // OpenAI open-weights
        "openai/gpt-oss-120b",
    ],
    sglang: [
        // SGLang is OpenAI-compatible, models depend on deployment
        "default",
    ],
    gateway: [
        "openai/gpt-5.5",
        "anthropic/claude-opus-4.7",
        "google/gemini-3.1-pro-preview",
        "xai/grok-4.3",
        "anthropic/claude-sonnet-4.6",
        "anthropic/claude-haiku-4.5",
        "openai/gpt-5.4-mini",
    ],
    edgeone: ["@tx/deepseek-ai/deepseek-v32"],
    doubao: [
        // ByteDance Doubao models (Volcengine Ark IDs use dash form)
        "doubao-seed-2-0-pro-260215",
        "doubao-seed-2-0-lite-260428",
        "doubao-seed-2-0-mini-260428",
        "doubao-seed-1-8-251228",
        "doubao-seed-1-6-251015",
        "doubao-seed-1-6-flash-250828",
        "doubao-seed-1-6-vision-250815",
        "doubao-1-5-pro-32k-250115",
        "doubao-1-5-lite-32k-250115",
    ],
    modelscope: [
        // DeepSeek
        "deepseek-ai/DeepSeek-V4-Pro",
        "deepseek-ai/DeepSeek-V3.2",
        "deepseek-ai/DeepSeek-R1-0528",
        "deepseek-ai/DeepSeek-R1",
        // Qwen
        "Qwen/Qwen3-235B-A22B-Instruct-2507",
        "Qwen/Qwen3-VL-235B-A22B-Instruct",
        "Qwen/Qwen3-Coder-30B-A3B-Instruct",
        "Qwen/Qwen3-32B",
        "Qwen/Qwen2.5-72B-Instruct",
    ],
    minimax: [
        // MiniMax models (Anthropic-compatible API)
        "MiniMax-M3",
        "MiniMax-M2.7",
        "MiniMax-M2.7-highspeed",
        "MiniMax-M2.5",
    ],
    novita: [
        // Novita AI models (OpenAI-compatible API)
        "minimax/minimax-m3",
        "deepseek/deepseek-v4-pro",
        "zai-org/glm-5.1",
        "moonshotai/kimi-k2.6",
        "deepseek/deepseek-v4-flash",
    ],
    mimo: ["mimo-v2.5-pro", "mimo-v2.5"],
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
