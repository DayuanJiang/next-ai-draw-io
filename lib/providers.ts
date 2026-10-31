// Every fact about a provider in one record: which AI SDK factory runs it,
// what it signs in with, its environment variable names, its official URL
// and what the settings UI shows for it. Pure data with no runtime imports,
// so client components, the Edge runtime and Node can all read it.
//
// Adding an OpenAI-compatible provider means adding one record here, plus
// its two lines in env.example and a paragraph in docs/*/ai-providers.md.

import type { Locale } from "@/lib/i18n/config"

/** Which AI SDK factory createModel() calls */
export type Sdk =
    | "openai" // @ai-sdk/openai: Responses API, Chat Completions behind a configured URL
    | "openai-compatible" // @ai-sdk/openai-compatible plus <think> tag extraction
    | "deepseek" // @ai-sdk/deepseek: reasoning_content round trip (deepseek, kimi, mimo)
    | "doubao" // deepseek for DeepSeek and Kimi model ids, openai-compatible otherwise
    | "anthropic"
    | "minimax" // anthropic or openai-compatible, chosen from the URL path
    | "google"
    | "vertex"
    | "azure"
    | "bedrock"
    | "openrouter"
    | "gateway"
    | "aihubmix" // @aihubmix/ai-sdk-provider on the official URL, openai-compatible elsewhere
    | "ollama"

/** What the settings form asks for and what a request signs in with */
export type Credential =
    | "apiKey" // one key, required with a custom base URL
    | "optionalKey" // Ollama: the key may be empty
    | "none" // EdgeOne: the site's own function, cookies authenticate
    | "aws" // Bedrock: a Bedrock API key, or an access key pair, plus a region
    | "vertexKey" // Vertex AI Express Mode key

/** How a provider lists its models (see lib/provider-models.ts) */
export type ModelListStyle =
    | "openai"
    | "anthropic"
    | "google"
    | "ollama"
    | "openrouter"
    | "aihubmix"
    | "gateway"

export type ProviderGroup = "vendors" | "aggregators" | "cloud" | "selfHosted"

/** One sentence in every UI language */
export type LocalizedText = Record<Locale, string>

export interface ProviderDef {
    label: string
    sdk: Sdk
    credential: Credential
    /** The picker's group; the order of the records is the order inside a group */
    group: ProviderGroup
    /**
     * The server reads <PREFIX>_API_KEY and <PREFIX>_BASE_URL. Only the
     * spelling of the names: whether the key is required (auto-detection,
     * validation) follows `credential`, and whether the admin panel writes
     * ADMIN_<PREFIX>_API_KEY[_n] follows `fixedCredentials`.
     * null: no key variables (Bedrock, EdgeOne)
     */
    envPrefix: string | null
    /** The key variable when it does not follow the prefix (GOOGLE_GENERATIVE_AI_API_KEY) */
    keyEnv?: string
    /** A second variable accepted as the server key (ANTHROPIC_AUTH_TOKEN, sent as Bearer) */
    altKeyEnv?: string
    /** Azure: the SDK builds the URL from this variable when there is no base URL */
    resourceNameEnv?: string
    /**
     * The official endpoint, also the form's placeholder. A non-https value
     * (SGLang's 127.0.0.1) only fills the form; the server never falls back
     * to it. A credential "apiKey" provider without one (Azure, custom)
     * needs the user's URL
     */
    defaultBaseUrl?: string
    /** The SDK has the official endpoint built in: pass no baseURL unless one is configured */
    sdkKnowsEndpoint?: true
    /** Where users create a key */
    apiKeyUrl?: string
    /** How to list models; missing when a key alone cannot (Bedrock, Vertex, Azure, EdgeOne, Doubao, MiniMax) */
    modelList?: ModelListStyle
    /** The list is public or local: no key needed to list (Ollama, OpenRouter, AIHubMix) */
    listNeedsNoKey?: true
    /** A short hand-written list for providers without modelList; the first one is added with the provider */
    models?: string[]
    /** The SDK builds the request path itself, so chatRequestUrl shows nothing */
    ownRequestPath?: true
    /** Server credentials live in fixed env vars; the admin panel allows one entry */
    fixedCredentials?: true
    /** models.dev logo name when it differs from the key */
    logo?: string
    /** A Lucide icon shown instead of a models.dev logo */
    icon?: "cloud" | "server" | "sparkles"
    /** The note shown under the name in the picker (Bedrock: "AWS credentials") */
    note?: LocalizedText
    /** A hint under the base URL field (MiniMax: which path selects which protocol) */
    baseUrlHint?: LocalizedText
    /** The folded options start open: the base URL usually needs changing */
    optionsOpen?: true
}

// Written in the order the provider picker shows them, group by group
const defs = {
    // Model vendors
    openai: {
        label: "OpenAI",
        sdk: "openai",
        credential: "apiKey",
        group: "vendors",
        envPrefix: "OPENAI",
        defaultBaseUrl: "https://api.openai.com/v1",
        sdkKnowsEndpoint: true,
        apiKeyUrl: "https://platform.openai.com/api-keys",
        modelList: "openai",
    },
    anthropic: {
        label: "Anthropic",
        sdk: "anthropic",
        credential: "apiKey",
        group: "vendors",
        envPrefix: "ANTHROPIC",
        altKeyEnv: "ANTHROPIC_AUTH_TOKEN",
        defaultBaseUrl: "https://api.anthropic.com/v1",
        apiKeyUrl: "https://platform.claude.com/settings/keys",
        modelList: "anthropic",
    },
    google: {
        label: "Google",
        sdk: "google",
        credential: "apiKey",
        group: "vendors",
        envPrefix: "GOOGLE",
        keyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
        defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
        sdkKnowsEndpoint: true,
        apiKeyUrl: "https://aistudio.google.com/apikey",
        modelList: "google",
        ownRequestPath: true,
    },
    deepseek: {
        label: "DeepSeek",
        sdk: "deepseek",
        credential: "apiKey",
        group: "vendors",
        envPrefix: "DEEPSEEK",
        defaultBaseUrl: "https://api.deepseek.com/v1",
        sdkKnowsEndpoint: true,
        apiKeyUrl: "https://platform.deepseek.com/api_keys",
        modelList: "openai",
    },
    qwen: {
        label: "Qwen (Alibaba)",
        sdk: "openai-compatible",
        credential: "apiKey",
        group: "vendors",
        envPrefix: "QWEN",
        defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKeyUrl: "https://bailian.console.aliyun.com/?tab=model#/api-key",
        modelList: "openai",
    },
    doubao: {
        label: "Doubao (ByteDance)",
        sdk: "doubao",
        credential: "apiKey",
        group: "vendors",
        envPrefix: "DOUBAO",
        defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        apiKeyUrl:
            "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
        icon: "sparkles",
        // Volcengine Ark ids use the dash form
        models: [
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
    },
    glm: {
        label: "GLM (Zhipu)",
        sdk: "openai-compatible",
        credential: "apiKey",
        group: "vendors",
        envPrefix: "GLM",
        defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
        apiKeyUrl: "https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys",
        modelList: "openai",
    },
    kimi: {
        label: "Kimi (Moonshot)",
        sdk: "deepseek",
        credential: "apiKey",
        group: "vendors",
        envPrefix: "KIMI",
        defaultBaseUrl: "https://api.moonshot.cn/v1",
        apiKeyUrl: "https://platform.moonshot.cn/console/api-keys",
        modelList: "openai",
    },
    minimax: {
        label: "MiniMax",
        sdk: "minimax",
        credential: "apiKey",
        group: "vendors",
        envPrefix: "MINIMAX",
        defaultBaseUrl: "https://api.minimaxi.com/anthropic",
        apiKeyUrl:
            "https://platform.minimaxi.com/user-center/basic-information/interface-key",
        ownRequestPath: true,
        optionsOpen: true,
        baseUrlHint: {
            en: "Use /anthropic for Anthropic-compatible API (recommended), or /v1 for OpenAI-compatible API",
            zh: "使用 /anthropic 端点为 Anthropic 兼容 API（推荐），或使用 /v1 端点为 OpenAI 兼容 API",
            ja: "/anthropic で Anthropic 互換 API（推奨）、または /v1 で OpenAI 互換 API を使用",
            "zh-Hant":
                "使用 /anthropic 端點為 Anthropic 相容 API（推薦），或使用 /v1 端點為 OpenAI 相容 API",
        },
        // The Anthropic-compatible API
        models: [
            "MiniMax-M3.1-Flash",
            "MiniMax-M3",
            "MiniMax-M2.7",
            "MiniMax-M2.7-highspeed",
            "MiniMax-M2.5",
        ],
    },
    mimo: {
        label: "MiMo (Xiaomi)",
        sdk: "deepseek",
        credential: "apiKey",
        group: "vendors",
        envPrefix: "MIMO",
        defaultBaseUrl: "https://api.xiaomimimo.com/v1",
        apiKeyUrl: "https://platform.xiaomimimo.com/#/console/api-keys",
        modelList: "openai",
        logo: "xiaomi",
        optionsOpen: true,
        baseUrlHint: {
            en: "Default works with pay-as-you-go keys (sk-...). Token Plan subscribers (tp-... keys) must set https://token-plan-cn.xiaomimimo.com/v1",
            zh: "默认地址适用于按量付费密钥（sk-...）。Token Plan 订阅用户（tp-... 密钥）请设置为 https://token-plan-cn.xiaomimimo.com/v1",
            ja: "デフォルトは従量課金キー（sk-...）用です。Token Plan 加入者（tp-... キー）は https://token-plan-cn.xiaomimimo.com/v1 を設定してください",
            "zh-Hant":
                "預設地址適用於按量付費金鑰（sk-...）。Token Plan 訂閱用戶（tp-... 金鑰）請設定為 https://token-plan-cn.xiaomimimo.com/v1",
        },
    },

    // Aggregators and gateways
    openrouter: {
        label: "OpenRouter",
        sdk: "openrouter",
        credential: "apiKey",
        group: "aggregators",
        envPrefix: "OPENROUTER",
        defaultBaseUrl: "https://openrouter.ai/api/v1",
        sdkKnowsEndpoint: true,
        apiKeyUrl: "https://openrouter.ai/keys",
        modelList: "openrouter",
        listNeedsNoKey: true,
    },
    aihubmix: {
        label: "AIHubMix",
        sdk: "aihubmix",
        credential: "apiKey",
        group: "aggregators",
        envPrefix: "AIHUBMIX",
        defaultBaseUrl: "https://aihubmix.com/v1",
        apiKeyUrl: "https://aihubmix.com/token",
        modelList: "aihubmix",
        listNeedsNoKey: true,
    },
    siliconflow: {
        label: "SiliconFlow",
        sdk: "openai-compatible",
        credential: "apiKey",
        group: "aggregators",
        envPrefix: "SILICONFLOW",
        defaultBaseUrl: "https://api.siliconflow.cn/v1",
        apiKeyUrl: "https://cloud.siliconflow.cn/account/ak",
        modelList: "openai",
    },
    modelscope: {
        label: "ModelScope",
        sdk: "openai-compatible",
        credential: "apiKey",
        group: "aggregators",
        envPrefix: "MODELSCOPE",
        defaultBaseUrl: "https://api-inference.modelscope.cn/v1",
        apiKeyUrl: "https://modelscope.cn/my/myaccesstoken",
        modelList: "openai",
    },
    novita: {
        label: "Novita AI",
        sdk: "openai-compatible",
        credential: "apiKey",
        group: "aggregators",
        envPrefix: "NOVITA",
        defaultBaseUrl: "https://api.novita.ai/openai",
        apiKeyUrl: "https://novita.ai/dashboard/key",
        modelList: "openai",
    },
    atlascloud: {
        label: "Atlas Cloud",
        sdk: "openai-compatible",
        credential: "apiKey",
        group: "aggregators",
        envPrefix: "ATLASCLOUD",
        defaultBaseUrl: "https://api.atlascloud.ai/v1",
        apiKeyUrl: "https://www.atlascloud.ai/console/api-keys",
        modelList: "openai",
        logo: "openai",
    },
    qiniu: {
        label: "Qiniu",
        sdk: "openai-compatible",
        credential: "apiKey",
        group: "aggregators",
        envPrefix: "QINIU",
        defaultBaseUrl: "https://api.qnaigc.com/v1",
        apiKeyUrl: "https://www.qiniu.com/ai/models",
        modelList: "openai",
    },
    gateway: {
        label: "AI Gateway",
        sdk: "gateway",
        credential: "apiKey",
        group: "aggregators",
        envPrefix: "AI_GATEWAY",
        defaultBaseUrl: "https://ai-gateway.vercel.sh/v1/ai",
        sdkKnowsEndpoint: true,
        apiKeyUrl: "https://vercel.com/ai-gateway",
        modelList: "gateway",
        ownRequestPath: true,
        logo: "vercel",
    },

    // Cloud platforms
    bedrock: {
        label: "Amazon Bedrock",
        sdk: "bedrock",
        credential: "aws",
        group: "cloud",
        envPrefix: null,
        fixedCredentials: true,
        ownRequestPath: true,
        icon: "cloud",
        note: {
            en: "AWS credentials",
            zh: "AWS 凭证",
            ja: "AWS 認証情報",
            "zh-Hant": "AWS 憑證",
        },
        // Newer models only answer through an inference profile id (the
        // region prefix). Each id here was called once on 2026-10-04.
        models: [
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
    },
    vertexai: {
        label: "Google Vertex AI",
        sdk: "vertex",
        credential: "vertexKey",
        group: "cloud",
        envPrefix: "GOOGLE_VERTEX",
        fixedCredentials: true,
        ownRequestPath: true,
        logo: "google",
        note: {
            en: "Express mode key",
            zh: "Express 模式 Key",
            ja: "Express モードのキー",
            "zh-Hant": "Express 模式 Key",
        },
        models: [
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
    },
    azure: {
        label: "Azure OpenAI",
        sdk: "azure",
        credential: "apiKey",
        group: "cloud",
        envPrefix: "AZURE",
        resourceNameEnv: "AZURE_RESOURCE_NAME",
        // No default: the URL names the user's own resource
        sdkKnowsEndpoint: true,
        ownRequestPath: true,
        optionsOpen: true,
        note: {
            en: "Key and resource URL",
            zh: "Key 和资源地址",
            ja: "キーとリソース URL",
            "zh-Hant": "Key 和資源位址",
        },
        baseUrlHint: {
            en: "Your Azure OpenAI resource's URL, https://<resource>.openai.azure.com/openai",
            zh: "Azure OpenAI 资源的地址，形如 https://<资源名>.openai.azure.com/openai",
            ja: "Azure OpenAI リソースの URL。例: https://<リソース名>.openai.azure.com/openai",
            "zh-Hant":
                "Azure OpenAI 資源的位址，形如 https://<資源名稱>.openai.azure.com/openai",
        },
        // Deployment names in the user's resource
        models: [
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
    },
    edgeone: {
        label: "EdgeOne Pages",
        sdk: "openai-compatible",
        credential: "none",
        group: "cloud",
        envPrefix: null,
        ownRequestPath: true,
        logo: "tencent-cloud",
        note: {
            en: "No key needed",
            zh: "不用 Key",
            ja: "キー不要",
            "zh-Hant": "不用 Key",
        },
        models: ["@tx/deepseek-ai/deepseek-v32"],
    },

    // Self-hosted
    ollama: {
        label: "Ollama",
        sdk: "ollama",
        credential: "optionalKey",
        group: "selfHosted",
        envPrefix: "OLLAMA",
        fixedCredentials: true,
        defaultBaseUrl: "https://ollama.com/api",
        apiKeyUrl: "https://ollama.com/settings/keys",
        modelList: "ollama",
        listNeedsNoKey: true,
        optionsOpen: true,
        note: {
            en: "Key optional",
            zh: "Key 可不填",
            ja: "キーは任意",
            "zh-Hant": "Key 可不填",
        },
    },
    sglang: {
        label: "SGLang",
        sdk: "openai-compatible",
        credential: "apiKey",
        group: "selfHosted",
        envPrefix: "SGLANG",
        // A local example that only fills the form; the server never falls
        // back to it (publicDefaultUrl)
        defaultBaseUrl: "http://127.0.0.1:8000/v1",
        modelList: "openai",
        icon: "server",
        optionsOpen: true,
        note: {
            en: "Your server's URL",
            zh: "填服务地址",
            ja: "サーバーの URL",
            "zh-Hant": "填服務位址",
        },
    },
    // Any OpenAI-compatible API: vLLM, LM Studio, LiteLLM, a gateway. The
    // user enters the URL; a server that ignores keys takes any non-empty
    // one (a custom URL always needs a key, see getAIModel's guard)
    custom: {
        label: "OpenAI-compatible",
        sdk: "openai-compatible",
        credential: "apiKey",
        group: "selfHosted",
        envPrefix: "CUSTOM",
        modelList: "openai",
        icon: "server",
        optionsOpen: true,
        note: {
            en: "Your URL and key",
            zh: "填地址和 Key",
            ja: "URL とキー",
            "zh-Hant": "填位址和 Key",
        },
    },
} satisfies Record<string, ProviderDef>

export type ProviderName = keyof typeof defs

// Widened to ProviderDef so optional fields can be read on any provider:
// `satisfies` keeps each record's own literal type, on whose union only the
// fields every record has would exist
export const PROVIDERS: Record<ProviderName, ProviderDef> = defs

export const PROVIDER_NAMES = Object.keys(PROVIDERS) as ProviderName[]

/**
 * The https default the server may call on its own. A local default
 * (SGLang's 127.0.0.1) only fills the settings form: the server must not
 * call its own machine for it.
 */
export function publicDefaultUrl(provider: ProviderName): string | undefined {
    const url = PROVIDERS[provider].defaultBaseUrl
    return url?.startsWith("https://") ? url : undefined
}
