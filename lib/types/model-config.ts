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
    | "atlascloud"

// Individual model configuration
export interface ModelConfig {
    id: string // UUID for this model
    modelId: string // e.g., "gpt-4o", "claude-sonnet-4-5"
    validated?: boolean // Has this model been validated
    validationError?: string // Error message if validation failed
    validationWarning?: string // Passed, but e.g. did not call a tool
    responseTime?: number // Milliseconds the last test took
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
    // Older versions saved here whether untested models were listed in the
    // model picker; they always are now
    showUnvalidatedModels?: boolean
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
    atlascloud: "openai",
}

/** How a provider lists its models (see lib/provider-models.ts) */
export type ModelListStyle =
    | "openai"
    | "anthropic"
    | "google"
    | "ollama"
    | "openrouter"
    | "aihubmix"
    | "gateway"

// Provider metadata. apiKeyUrl is the page where users create a key.
// modelList is missing where a key alone cannot list the models (Bedrock,
// Vertex, Azure) or the list is not reliable (Doubao, MiniMax).
export const PROVIDER_INFO: Record<
    ProviderName,
    {
        label: string
        defaultBaseUrl?: string
        apiKeyUrl?: string
        modelList?: ModelListStyle
    }
> = {
    openai: {
        label: "OpenAI",
        defaultBaseUrl: "https://api.openai.com/v1",
        apiKeyUrl: "https://platform.openai.com/api-keys",
        modelList: "openai",
    },
    anthropic: {
        label: "Anthropic",
        defaultBaseUrl: "https://api.anthropic.com/v1",
        apiKeyUrl: "https://platform.claude.com/settings/keys",
        modelList: "anthropic",
    },
    google: {
        label: "Google",
        defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
        apiKeyUrl: "https://aistudio.google.com/apikey",
        modelList: "google",
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
        apiKeyUrl: "https://ollama.com/settings/keys",
        modelList: "ollama",
    },
    openrouter: {
        label: "OpenRouter",
        defaultBaseUrl: "https://openrouter.ai/api/v1",
        apiKeyUrl: "https://openrouter.ai/keys",
        modelList: "openrouter",
    },
    aihubmix: {
        label: "AIHubMix",
        defaultBaseUrl: "https://aihubmix.com/v1",
        apiKeyUrl: "https://aihubmix.com/token",
        modelList: "aihubmix",
    },
    deepseek: {
        label: "DeepSeek",
        defaultBaseUrl: "https://api.deepseek.com/v1",
        apiKeyUrl: "https://platform.deepseek.com/api_keys",
        modelList: "openai",
    },
    siliconflow: {
        label: "SiliconFlow",
        defaultBaseUrl: "https://api.siliconflow.cn/v1",
        apiKeyUrl: "https://cloud.siliconflow.cn/account/ak",
        modelList: "openai",
    },
    sglang: {
        label: "SGLang",
        defaultBaseUrl: "http://127.0.0.1:8000/v1",
        modelList: "openai",
    },
    gateway: {
        label: "AI Gateway",
        defaultBaseUrl: "https://ai-gateway.vercel.sh/v1/ai",
        apiKeyUrl: "https://vercel.com/ai-gateway",
        modelList: "gateway",
    },
    edgeone: { label: "EdgeOne Pages" },
    doubao: {
        label: "Doubao (ByteDance)",
        defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        apiKeyUrl:
            "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    },
    modelscope: {
        label: "ModelScope",
        defaultBaseUrl: "https://api-inference.modelscope.cn/v1",
        apiKeyUrl: "https://modelscope.cn/my/myaccesstoken",
        modelList: "openai",
    },
    glm: {
        label: "GLM (Zhipu)",
        defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
        apiKeyUrl: "https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys",
        modelList: "openai",
    },
    qwen: {
        label: "Qwen (Alibaba)",
        defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKeyUrl: "https://bailian.console.aliyun.com/?tab=model#/api-key",
        modelList: "openai",
    },
    qiniu: {
        label: "Qiniu",
        defaultBaseUrl: "https://api.qnaigc.com/v1",
        apiKeyUrl: "https://www.qiniu.com/ai/models",
        modelList: "openai",
    },
    kimi: {
        label: "Kimi (Moonshot)",
        defaultBaseUrl: "https://api.moonshot.cn/v1",
        apiKeyUrl: "https://platform.moonshot.cn/console/api-keys",
        modelList: "openai",
    },
    minimax: {
        label: "MiniMax",
        defaultBaseUrl: "https://api.minimaxi.com/anthropic",
        apiKeyUrl:
            "https://platform.minimaxi.com/user-center/basic-information/interface-key",
    },
    novita: {
        label: "Novita AI",
        defaultBaseUrl: "https://api.novita.ai/openai",
        apiKeyUrl: "https://novita.ai/dashboard/key",
        modelList: "openai",
    },
    mimo: {
        label: "MiMo (Xiaomi)",
        defaultBaseUrl: "https://api.xiaomimimo.com/v1",
        apiKeyUrl: "https://platform.xiaomimimo.com/#/console/api-keys",
        modelList: "openai",
    },
    atlascloud: {
        label: "Atlas Cloud",
        defaultBaseUrl: "https://api.atlascloud.ai/v1",
        apiKeyUrl: "https://www.atlascloud.ai/console/api-keys",
        modelList: "openai",
    },
}

// Suggested models per provider for quick add
export const SUGGESTED_MODELS: Partial<Record<ProviderName, string[]>> = {
    openai: [
        "gpt-6.1-sol",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-6-astra",
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
        // Claude 5 series (latest)
        "claude-opus-5-5",
        "claude-sonnet-5-5",
        "claude-fable-5-1",
        "claude-opus-5",
        "claude-sonnet-5",
        // Claude 4.8 / 4.7 / 4.6 series (dateless pinned IDs)
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
    // Newer models only answer through an inference profile id (the region
    // prefix). Each id here was called once on 2026-10-04.
    bedrock: [
        // Anthropic Claude ("global." works from any region)
        "global.anthropic.claude-opus-5-5",
        "global.anthropic.claude-sonnet-5-5",
        "global.anthropic.claude-fable-5-1",
        "global.anthropic.claude-opus-5",
        "global.anthropic.claude-sonnet-5",
        "global.anthropic.claude-opus-4-8",
        "global.anthropic.claude-opus-4-7",
        "global.anthropic.claude-sonnet-4-6",
        "global.anthropic.claude-opus-4-6-v1",
        "global.anthropic.claude-opus-4-5-20251101-v1:0",
        "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
        "global.anthropic.claude-haiku-4-5-20251001-v1:0",
        "global.anthropic.claude-sonnet-4-20250514-v1:0",
        // Amazon Nova
        "us.amazon.nova-2-lite-v1:0",
        "amazon.nova-pro-v1:0",
        "amazon.nova-lite-v1:0",
        "amazon.nova-micro-v1:0",
        // Meta Llama
        "us.meta.llama4-maverick-17b-instruct-v1:0",
        "us.meta.llama4-scout-17b-instruct-v1:0",
        "us.meta.llama3-3-70b-instruct-v1:0",
        // Mistral
        "mistral.mistral-large-3-675b-instruct",
        "us.mistral.pixtral-large-2502-v1:0",
    ],
    openrouter: [
        // Anthropic
        "anthropic/claude-opus-5.5",
        "anthropic/claude-sonnet-5.5",
        "anthropic/claude-fable-5.1",
        "anthropic/claude-opus-4.8",
        "anthropic/claude-sonnet-4.6",
        "anthropic/claude-haiku-4.5",
        // OpenAI
        "openai/gpt-6.1-sol",
        "openai/gpt-6-luna",
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
        "anthropic/claude-opus-5.5",
        "anthropic/claude-sonnet-5.5",
        "openai/gpt-6.1-sol",
        "openai/gpt-6-luna",
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
    atlascloud: ["qwen/qwen3.5-flash", "deepseek-ai/deepseek-v4-pro"],
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
    if (provider === "anthropic") return `${url}/messages`
    if (provider === "ollama") return `${ollamaApiUrl(url)}/chat`
    // These SDKs build their own paths (or, for MiniMax, pick the protocol
    // from the URL)
    const ownPaths: ProviderName[] = [
        "google",
        "vertexai",
        "azure",
        "bedrock",
        "gateway",
        "minimax",
        "edgeone",
    ]
    return ownPaths.includes(provider) ? null : `${url}/chat/completions`
}
