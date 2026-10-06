import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createAzure } from "@ai-sdk/azure"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createVertex } from "@ai-sdk/google-vertex"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createAihubmix } from "@aihubmix/ai-sdk-provider"
import { fromNodeProviderChain } from "@aws-sdk/credential-providers"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import {
    createGateway,
    defaultSettingsMiddleware,
    extractReasoningMiddleware,
    type LanguageModel,
    wrapLanguageModel,
} from "ai"
import { createOllama } from "ollama-ai-provider-v2"
import {
    adminProvidersToConfig,
    loadAdminProviders,
} from "@/lib/admin/providers"
import { getEnvFallback } from "@/lib/admin/settings"
import { isPrivateUrl, redirectGuardedFetch } from "@/lib/ssrf-protection"
import {
    normalizeBaseUrl,
    ollamaApiUrl,
    PROVIDER_INFO,
    type ProviderName,
} from "@/lib/types/model-config"

export type { ProviderName }

export const AIHUBMIX_APP_CODE = "MSBS9675"

interface ModelConfig {
    model: any
    providerOptions?: any
    modelId: string
    provider: ProviderName
}

// Providers that only support a single system message
export const SINGLE_SYSTEM_PROVIDERS = new Set<ProviderName>([
    "minimax",
    "glm",
    "qwen",
    "kimi",
    "qiniu",
    "novita",
    "mimo",
])

/**
 * Normalize MiniMax base URL for AI SDK compatibility.
 * MiniMax supports Anthropic-compatible and OpenAI-compatible endpoints.
 */
export function normalizeMiniMaxBaseURL(rawUrl: string): {
    baseURL: string
    isAnthropicCompatible: boolean
} {
    const isAnthropicCompatible = rawUrl.includes("/anthropic")
    let baseURL = rawUrl.replace(/\/$/, "")
    if (isAnthropicCompatible) {
        if (!baseURL.endsWith("/anthropic/v1")) {
            if (baseURL.endsWith("/anthropic")) {
                baseURL = `${baseURL}/v1`
            } else {
                baseURL = `${baseURL}/anthropic/v1`
            }
        }
    } else {
        if (!baseURL.endsWith("/v1")) {
            baseURL = `${baseURL}/v1`
        }
    }
    return { baseURL, isAnthropicCompatible }
}

export function isAihubmixStandardBaseURL(
    rawUrl: string | null | undefined,
): boolean {
    if (!rawUrl) return true

    const baseURL = rawUrl.replace(/\/+$/, "")
    return (
        baseURL === "https://aihubmix.com" ||
        baseURL === "https://aihubmix.com/v1"
    )
}

export interface ClientOverrides {
    provider?: string | null
    baseUrl?: string | null
    apiKey?: string | null
    modelId?: string | null
    // AWS Bedrock credentials
    awsAccessKeyId?: string | null
    awsSecretAccessKey?: string | null
    awsRegion?: string | null
    awsSessionToken?: string | null
    // Vertex AI config
    vertexApiKey?: string | null // Express Mode API key
    // baseUrl is the server's own <P>_BASE_URL (the admin panel's Test),
    // not one a user chose: no redirect guard
    trustedBaseUrl?: boolean
    // Custom headers (e.g., for EdgeOne cookie auth)
    headers?: Record<string, string>
    // Custom env var name(s) for server models
    // Can be a single string or array of strings for load balancing
    apiKeyEnv?: string | string[]
    baseUrlEnv?: string
}

// Bedrock provider options for Anthropic beta features
const BEDROCK_ANTHROPIC_BETA = {
    bedrock: {
        anthropicBeta: ["fine-grained-tool-streaming-2025-05-14"],
    },
}

/**
 * Resolve baseURL based on whether user is providing their own API key.
 * When user provides their own API key, we should NOT fall back to server's
 * baseURL environment variable - user credentials should only be sent to
 * user-specified endpoints or official provider endpoints.
 *
 * @param userApiKey - User-provided API key (if any)
 * @param userBaseUrl - User-provided base URL (if any)
 * @param serverBaseUrl - Server's base URL from environment variable
 * @param defaultBaseUrl - Provider's official/default base URL (optional)
 * @returns The resolved base URL to use
 */
export function resolveBaseURL(
    userApiKey: string | null | undefined,
    userBaseUrl: string | null | undefined,
    serverBaseUrl: string | undefined,
    defaultBaseUrl?: string,
): string | undefined {
    if (userApiKey) {
        // User provides their own API key - only use user's baseUrl or default
        return userBaseUrl || defaultBaseUrl || undefined
    }
    // No user API key - fall back to server config
    return userBaseUrl || serverBaseUrl || defaultBaseUrl || undefined
}

/**
 * Resolve API key from custom env var name or default env var.
 * Supports multiple API keys per provider via ai-models.json apiKeyEnv config.
 * When multiple keys are configured, randomly selects one for load balancing.
 *
 * Priority:
 * 1. User-provided API key (overrides.apiKey)
 * 2. Custom env var(s) from ai-models.json (overrides.apiKeyEnv)
 *    - If array, randomly picks one with a valid value
 * 3. Default provider env var (defaultEnvVar)
 */
function resolveApiKey(
    overrides: ClientOverrides | undefined,
    defaultEnvVar: string,
): string | undefined {
    if (overrides?.apiKey) return overrides.apiKey

    if (overrides?.apiKeyEnv) {
        // Handle array of env var names - randomly select one
        if (Array.isArray(overrides.apiKeyEnv)) {
            // Filter to only env vars that have values
            const validEnvVars = overrides.apiKeyEnv.filter(
                (envVar) => process.env[envVar],
            )
            if (validEnvVars.length > 0) {
                // Randomly select one
                const selectedEnvVar =
                    validEnvVars[
                        Math.floor(Math.random() * validEnvVars.length)
                    ]
                console.log(
                    `[API Key Routing] Selected ${selectedEnvVar} from ${validEnvVars.length} available keys`,
                )
                return process.env[selectedEnvVar]
            }
        } else {
            return process.env[overrides.apiKeyEnv]
        }
    }

    return process.env[defaultEnvVar]
}

/**
 * Resolve base URL from custom env var name or default env var.
 * Supports multiple base URLs per provider via ai-models.json baseUrlEnv config.
 */
function resolveBaseUrlEnv(
    overrides: ClientOverrides | undefined,
    defaultEnvVar: string,
): string | undefined {
    if (overrides?.baseUrlEnv) return process.env[overrides.baseUrlEnv]
    return process.env[defaultEnvVar]
}

/**
 * Safely parse integer from environment variable with validation
 */
function parseIntSafe(
    value: string | undefined,
    varName: string,
    min?: number,
    max?: number,
): number | undefined {
    if (!value) return undefined
    const parsed = Number.parseInt(value, 10)
    if (Number.isNaN(parsed)) {
        throw new Error(`${varName} must be a valid integer, got: ${value}`)
    }
    if (min !== undefined && parsed < min) {
        throw new Error(`${varName} must be >= ${min}, got: ${parsed}`)
    }
    if (max !== undefined && parsed > max) {
        throw new Error(`${varName} must be <= ${max}, got: ${parsed}`)
    }
    return parsed
}

/**
 * GOOGLE_TOP_K and GOOGLE_TOP_P. They are call settings, so they go on the
 * model through a middleware: as Google provider options they were dropped.
 */
function googleSamplingSettings(): { topK?: number; topP?: number } {
    const settings: { topK?: number; topP?: number } = {}
    const topK = parseIntSafe(process.env.GOOGLE_TOP_K, "GOOGLE_TOP_K", 1, 100)
    if (topK) settings.topK = topK
    if (process.env.GOOGLE_TOP_P) {
        const topP = Number.parseFloat(process.env.GOOGLE_TOP_P)
        if (Number.isNaN(topP) || topP < 0 || topP > 1) {
            throw new Error(
                `GOOGLE_TOP_P must be a number between 0 and 1, got: ${process.env.GOOGLE_TOP_P}`,
            )
        }
        settings.topP = topP
    }
    return settings
}

/**
 * Build provider-specific options from environment variables
 * Supports various AI SDK providers with their unique configuration options
 *
 * Environment variables:
 * - OPENAI_REASONING_EFFORT: OpenAI reasoning effort level (minimal/low/medium/high) - for the o-series and gpt-5 or later
 * - OPENAI_REASONING_SUMMARY: OpenAI reasoning summary (auto/detailed) - auto-enabled for the o-series and gpt-5 or later
 * - ANTHROPIC_THINKING_BUDGET_TOKENS: Anthropic thinking budget in tokens (1024-64000)
 * - ANTHROPIC_THINKING_TYPE: Anthropic thinking type (enabled)
 * - GOOGLE_THINKING_BUDGET: Google Gemini 2.5 thinking budget in tokens (1024-100000)
 * - GOOGLE_THINKING_LEVEL: Google Gemini 3 thinking level (low/high)
 * - GOOGLE_VERTEX_THINKING_BUDGET: Vertex AI Gemini 2.5 thinking budget in tokens (1024-100000)
 * - GOOGLE_VERTEX_THINKING_LEVEL: Vertex AI Gemini 3 thinking level (low/high)
 * - AZURE_REASONING_EFFORT: Azure/OpenAI reasoning effort (low/medium/high)
 * - AZURE_REASONING_SUMMARY: Azure reasoning summary (none/brief/detailed)
 * - BEDROCK_REASONING_BUDGET_TOKENS: Bedrock Claude reasoning budget in tokens (1024-64000)
 * - BEDROCK_REASONING_EFFORT: Bedrock Nova reasoning effort (low/medium/high)
 * - OLLAMA_ENABLE_THINKING: Enable Ollama thinking mode (set to "true")
 */
function buildProviderOptions(
    provider: ProviderName,
    modelId?: string,
): Record<string, any> | undefined {
    const options: Record<string, any> = {}

    switch (provider) {
        case "openai": {
            const reasoningEffort = process.env.OPENAI_REASONING_EFFORT
            const reasoningSummary = process.env.OPENAI_REASONING_SUMMARY

            // Reasoning models (the o-series, gpt-5 and later) need
            // reasoningSummary to return thoughts
            if (modelId && /^(o\d|gpt-([5-9]|[1-9]\d))/.test(modelId)) {
                options.openai = {
                    // Auto-enable reasoning summary for reasoning models
                    // Use 'auto' as default since not all models support 'detailed'
                    reasoningSummary:
                        (reasoningSummary as "auto" | "detailed") || "auto",
                }

                // Optionally configure reasoning effort
                if (reasoningEffort) {
                    options.openai.reasoningEffort = reasoningEffort as
                        | "minimal"
                        | "low"
                        | "medium"
                        | "high"
                }
            } else if (reasoningEffort || reasoningSummary) {
                // Non-reasoning models: only apply if explicitly configured
                options.openai = {}
                if (reasoningEffort) {
                    options.openai.reasoningEffort = reasoningEffort as
                        | "minimal"
                        | "low"
                        | "medium"
                        | "high"
                }
                if (reasoningSummary) {
                    options.openai.reasoningSummary = reasoningSummary as
                        | "auto"
                        | "detailed"
                }
            }
            break
        }

        case "anthropic": {
            const thinkingBudget = parseIntSafe(
                process.env.ANTHROPIC_THINKING_BUDGET_TOKENS,
                "ANTHROPIC_THINKING_BUDGET_TOKENS",
                1024,
                64000,
            )
            const thinkingType =
                process.env.ANTHROPIC_THINKING_TYPE || "enabled"

            if (thinkingBudget) {
                options.anthropic = {
                    thinking: {
                        type: thinkingType,
                        budgetTokens: thinkingBudget,
                    },
                }
            }
            break
        }

        case "google": {
            const thinkingBudgetVal = parseIntSafe(
                process.env.GOOGLE_THINKING_BUDGET,
                "GOOGLE_THINKING_BUDGET",
                1024,
                100000,
            )
            const thinkingLevel = process.env.GOOGLE_THINKING_LEVEL

            // Google Gemini 2.5/3 models think by default, but need includeThoughts: true
            // to return the reasoning in the response
            if (
                modelId &&
                (modelId.includes("gemini-2") ||
                    modelId.includes("gemini-3") ||
                    modelId.includes("gemini2") ||
                    modelId.includes("gemini3"))
            ) {
                const thinkingConfig: Record<string, any> = {
                    includeThoughts: true,
                }

                // Optionally configure thinking budget or level
                if (
                    thinkingBudgetVal &&
                    (modelId.includes("2.5") || modelId.includes("2-5"))
                ) {
                    thinkingConfig.thinkingBudget = thinkingBudgetVal
                } else if (
                    thinkingLevel &&
                    (modelId.includes("gemini-3") ||
                        modelId.includes("gemini3"))
                ) {
                    thinkingConfig.thinkingLevel = thinkingLevel as
                        | "low"
                        | "high"
                }

                options.google = { thinkingConfig }
            }
            break
        }
        case "vertexai": {
            const thinkingBudget = parseIntSafe(
                process.env.GOOGLE_VERTEX_THINKING_BUDGET,
                "GOOGLE_VERTEX_THINKING_BUDGET",
                1024,
                100000,
            )
            const thinkingLevel = process.env.GOOGLE_VERTEX_THINKING_LEVEL

            if (
                modelId &&
                (modelId.includes("gemini-2") ||
                    modelId.includes("gemini-3") ||
                    modelId.includes("gemini2") ||
                    modelId.includes("gemini3"))
            ) {
                const thinkingConfig: Record<string, any> = {
                    includeThoughts: true,
                }

                const isGemini3 =
                    modelId?.includes("gemini-3") ||
                    modelId?.includes("gemini3")
                const isGemini25 =
                    modelId?.includes("2.5") || modelId?.includes("2-5")

                if (isGemini3 && thinkingLevel) {
                    // Vertex AI provider in AI SDK supports more granular levels (minimal/low/medium/high)
                    thinkingConfig.thinkingLevel = thinkingLevel as
                        | "minimal"
                        | "low"
                        | "medium"
                        | "high"
                } else if (isGemini25 && thinkingBudget) {
                    thinkingConfig.thinkingBudget = thinkingBudget
                }
                options.google = { thinkingConfig }
            }
            break
        }
        case "azure": {
            const reasoningEffort = process.env.AZURE_REASONING_EFFORT
            const reasoningSummary = process.env.AZURE_REASONING_SUMMARY

            if (reasoningEffort || reasoningSummary) {
                options.azure = {}
                if (reasoningEffort) {
                    options.azure.reasoningEffort = reasoningEffort as
                        | "low"
                        | "medium"
                        | "high"
                }
                if (reasoningSummary) {
                    options.azure.reasoningSummary = reasoningSummary as
                        | "none"
                        | "brief"
                        | "detailed"
                }
            }
            break
        }

        case "bedrock": {
            const budgetTokens = parseIntSafe(
                process.env.BEDROCK_REASONING_BUDGET_TOKENS,
                "BEDROCK_REASONING_BUDGET_TOKENS",
                1024,
                64000,
            )
            const reasoningEffort = process.env.BEDROCK_REASONING_EFFORT

            // Bedrock reasoning ONLY for Claude and Nova models
            // Other models (MiniMax, etc.) don't support reasoningConfig
            if (
                modelId &&
                (budgetTokens || reasoningEffort) &&
                (modelId.includes("claude") ||
                    modelId.includes("anthropic") ||
                    modelId.includes("nova") ||
                    modelId.includes("amazon"))
            ) {
                const reasoningConfig: Record<string, any> = { type: "enabled" }

                // Claude models: use budgetTokens (1024-64000)
                if (
                    budgetTokens &&
                    (modelId.includes("claude") ||
                        modelId.includes("anthropic"))
                ) {
                    reasoningConfig.budgetTokens = budgetTokens
                }
                // Nova models: use maxReasoningEffort (low/medium/high)
                else if (
                    reasoningEffort &&
                    (modelId.includes("nova") || modelId.includes("amazon"))
                ) {
                    reasoningConfig.maxReasoningEffort = reasoningEffort as
                        | "low"
                        | "medium"
                        | "high"
                }

                options.bedrock = { reasoningConfig }
            }
            break
        }

        case "ollama": {
            const enableThinking = process.env.OLLAMA_ENABLE_THINKING
            // Ollama supports reasoning with think: true for models like qwen3
            if (enableThinking === "true") {
                options.ollama = { think: true }
            }
            break
        }

        default:
            break
    }

    return Object.keys(options).length > 0 ? options : undefined
}

// Map of provider to required environment variable
export const PROVIDER_ENV_VARS: Record<ProviderName, string | null> = {
    bedrock: null, // AWS SDK auto-uses IAM role on AWS, or env vars locally
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_GENERATIVE_AI_API_KEY",
    vertexai: "GOOGLE_VERTEX_API_KEY",
    azure: "AZURE_API_KEY",
    ollama: null, // No credentials needed for local Ollama
    openrouter: "OPENROUTER_API_KEY",
    aihubmix: "AIHUBMIX_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    siliconflow: "SILICONFLOW_API_KEY",
    sglang: "SGLANG_API_KEY",
    gateway: "AI_GATEWAY_API_KEY",
    edgeone: null, // No credentials needed - uses EdgeOne Edge AI
    doubao: "DOUBAO_API_KEY",
    modelscope: "MODELSCOPE_API_KEY",
    glm: "GLM_API_KEY",
    qwen: "QWEN_API_KEY",
    qiniu: "QINIU_API_KEY",
    kimi: "KIMI_API_KEY",
    minimax: "MINIMAX_API_KEY",
    novita: "NOVITA_API_KEY",
    mimo: "MIMO_API_KEY",
    atlascloud: "ATLASCLOUD_API_KEY",
}

/**
 * Auto-detect provider based on available API keys
 * Returns the provider if exactly one is configured, otherwise null
 */
function detectProvider(): ProviderName | null {
    const configuredProviders: ProviderName[] = []

    for (const [provider, envVar] of Object.entries(PROVIDER_ENV_VARS)) {
        if (envVar === null) {
            // Skip ollama - it doesn't require credentials
            continue
        }
        // Anthropic accepts ANTHROPIC_AUTH_TOKEN (Bearer auth) as alternative to ANTHROPIC_API_KEY
        const hasCredential =
            provider === "anthropic"
                ? !!(
                      process.env.ANTHROPIC_API_KEY ||
                      process.env.ANTHROPIC_AUTH_TOKEN
                  )
                : !!process.env[envVar]
        if (hasCredential) {
            // Azure requires additional config (baseURL or resourceName)
            if (provider === "azure") {
                const hasBaseUrl = !!process.env.AZURE_BASE_URL
                const hasResourceName = !!process.env.AZURE_RESOURCE_NAME
                if (hasBaseUrl || hasResourceName) {
                    configuredProviders.push(provider as ProviderName)
                }
            } else {
                configuredProviders.push(provider as ProviderName)
            }
        }
    }

    if (configuredProviders.length === 1) {
        return configuredProviders[0]
    }

    return null
}

/**
 * Validate that required API keys are present for the selected provider
 * @param provider - The provider to validate
 * @param customApiKeyEnv - Optional custom env var name(s) (from ai-models.json apiKeyEnv)
 */
function validateProviderCredentials(
    provider: ProviderName,
    customApiKeyEnv?: string | string[],
    customBaseUrlEnv?: string,
): void {
    // Handle array of env var names - at least one must be set
    if (Array.isArray(customApiKeyEnv)) {
        const hasAnyKey = customApiKeyEnv.some((envVar) => process.env[envVar])
        if (!hasAnyKey) {
            throw new Error(
                `At least one of [${customApiKeyEnv.join(", ")}] environment variables is required for ${provider} provider. ` +
                    `Please set at least one in your .env.local file.`,
            )
        }
        return
    }

    // Anthropic accepts ANTHROPIC_AUTH_TOKEN (Bearer auth) as alternative to ANTHROPIC_API_KEY
    if (provider === "anthropic" && !customApiKeyEnv) {
        const hasCredential = !!(
            process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
        )
        if (!hasCredential) {
            throw new Error(
                `Either ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN environment variable is required for anthropic provider. ` +
                    `Please set one in your .env.local file.`,
            )
        }
    } else {
        // Use custom env var name if provided, otherwise use default
        const requiredVar = customApiKeyEnv || PROVIDER_ENV_VARS[provider]
        if (requiredVar && !process.env[requiredVar]) {
            throw new Error(
                `${requiredVar} environment variable is required for ${provider} provider. ` +
                    `Please set it in your .env.local file.`,
            )
        }
    }

    // Azure requires either AZURE_BASE_URL or AZURE_RESOURCE_NAME in addition
    // to API key, or a server model's own URL variable (an admin panel entry)
    if (provider === "azure") {
        const hasBaseUrl =
            !!process.env.AZURE_BASE_URL ||
            !!(customBaseUrlEnv && process.env[customBaseUrlEnv])
        const hasResourceName = !!process.env.AZURE_RESOURCE_NAME
        if (!hasBaseUrl && !hasResourceName) {
            throw new Error(
                `Azure requires either AZURE_BASE_URL or AZURE_RESOURCE_NAME to be set. ` +
                    `Please set one in your .env.local file.`,
            )
        }
    }
}

/** AWS's Bedrock endpoint for a region, as the Bedrock SDK builds it */
function bedrockRuntimeUrl(region: string): string {
    const suffix =
        [
            ["cn-", "amazonaws.com.cn"],
            ["us-iso-", "c2s.ic.gov"],
            ["us-isob-", "sc2s.sgov.gov"],
            ["eu-isoe-", "cloud.adc-e.uk"],
            ["us-isof-", "csp.hci.ic.gov"],
            ["eusc-", "amazonaws.eu"],
        ].find(([prefix]) => region.startsWith(prefix))?.[1] ?? "amazonaws.com"
    return `https://bedrock-runtime.${region}.${suffix}`
}

/**
 * Providers whose SDK has the official endpoint built in. The others are
 * OpenAI-compatible APIs (or Anthropic) that are called at
 * PROVIDER_INFO.defaultBaseUrl unless a base URL is configured.
 */
const SDK_KNOWS_ENDPOINT = new Set<ProviderName>([
    "openai",
    "google",
    "azure",
    "openrouter",
    "gateway",
    "deepseek",
])

/** Where and how to call a provider, once credentials are resolved */
interface Endpoint {
    apiKey?: string
    baseURL?: string
    headers?: Record<string, string>
    fetch?: typeof fetch
    authToken?: string // Anthropic Bearer auth
    resourceName?: string // Azure
    // baseURL comes from the settings or env, not the provider's default
    configuredBaseURL?: boolean
}

/**
 * An OpenAI-compatible chat model. includeUsage asks for token usage in the
 * stream, which quota tracking needs. Some of these models write their
 * reasoning inside <think> tags; that text becomes reasoning, not reply.
 */
function compatibleModel(
    provider: ProviderName,
    modelId: string,
    e: Endpoint,
): LanguageModel {
    const model = createOpenAICompatible({
        name: provider,
        apiKey: e.apiKey,
        baseURL: e.baseURL ?? "",
        ...(e.headers && { headers: e.headers }),
        ...(e.fetch && { fetch: e.fetch }),
        includeUsage: true,
    })(modelId)
    return wrapLanguageModel({
        model,
        middleware: extractReasoningMiddleware({ tagName: "think" }),
    })
}

/** Create the model for a provider. Credentials are already resolved. */
function createModel(
    provider: ProviderName,
    modelId: string,
    e: Endpoint,
): LanguageModel {
    const opts = {
        apiKey: e.apiKey,
        ...(e.baseURL && { baseURL: e.baseURL }),
        ...(e.fetch && { fetch: e.fetch }),
    }
    switch (provider) {
        case "openai": {
            const openaiProvider = createOpenAI(opts)
            // A configured base URL is usually a proxy that only has Chat
            // Completions; without one the Responses API is used, which
            // returns reasoning for the o-series and gpt-5 or later
            return e.configuredBaseURL
                ? openaiProvider.chat(modelId)
                : openaiProvider(modelId)
        }
        case "anthropic":
            // The provider streams tool input per tool (eager_input_streaming),
            // which replaced the fine-grained-tool-streaming beta header
            return createAnthropic({
                ...(e.authToken
                    ? { authToken: e.authToken }
                    : { apiKey: e.apiKey }),
                baseURL: e.baseURL,
                ...(e.fetch && { fetch: e.fetch }),
            })(modelId)
        case "google": {
            const model = createGoogleGenerativeAI(opts)(modelId)
            const sampling = googleSamplingSettings()
            return Object.keys(sampling).length > 0
                ? wrapLanguageModel({
                      model,
                      middleware: defaultSettingsMiddleware({
                          settings: sampling,
                      }),
                  })
                : model
        }
        case "azure":
            // baseURL takes precedence over resourceName per SDK behavior
            return createAzure({
                ...opts,
                ...(!e.baseURL &&
                    e.resourceName && { resourceName: e.resourceName }),
            })(modelId)
        case "openrouter":
            return createOpenRouter(opts)(modelId)
        case "gateway":
            // Without a key or URL the SDK uses Vercel's endpoint and OIDC
            return createGateway(opts)(modelId)
        case "deepseek":
        case "kimi":
        case "mimo":
            // Kimi and MiMo return reasoning_content like DeepSeek and need it
            // passed back in multi-turn tool calls (MiMo answers 400 otherwise)
            return createDeepSeek(opts)(modelId)
        case "doubao": {
            // DeepSeek and Kimi models on Doubao use reasoning_content too
            const lower = modelId.toLowerCase()
            return lower.includes("deepseek") || lower.includes("kimi")
                ? createDeepSeek(opts)(modelId)
                : compatibleModel(provider, modelId, e)
        }
        case "aihubmix":
            return isAihubmixStandardBaseURL(e.baseURL)
                ? createAihubmix({
                      apiKey: e.apiKey,
                      appCode: AIHUBMIX_APP_CODE,
                  })(modelId)
                : compatibleModel(provider, modelId, e)
        case "minimax": {
            const { baseURL, isAnthropicCompatible } = normalizeMiniMaxBaseURL(
                e.baseURL as string,
            )
            return isAnthropicCompatible
                ? createAnthropic({
                      apiKey: e.apiKey,
                      baseURL,
                      ...(e.fetch && { fetch: e.fetch }),
                  })(modelId)
                : compatibleModel(provider, modelId, { ...e, baseURL })
        }
        default:
            // siliconflow, sglang, modelscope, glm, qwen, qiniu, novita,
            // atlascloud, edgeone
            return compatibleModel(provider, modelId, e)
    }
}

/**
 * Get the AI model for a chat request: the client's own provider and
 * credentials, or the server's (AI_PROVIDER, AI_MODEL and each provider's
 * <NAME>_API_KEY / <NAME>_BASE_URL, see env.example). The settings test
 * button uses the same function, so a passing test means the chat works.
 */
export function getAIModel(clientOverrides?: ClientOverrides): ModelConfig {
    // Drop an endpoint path pasted along with the client's base URL
    const overrides = clientOverrides?.baseUrl
        ? {
              ...clientOverrides,
              baseUrl: normalizeBaseUrl(clientOverrides.baseUrl),
          }
        : clientOverrides
    // SECURITY: Prevent SSRF attacks (GHSA-9qf7-mprq-9qgm)
    // If a custom baseUrl is provided, an API key MUST also be provided.
    // This prevents attackers from redirecting server API keys to malicious endpoints.
    // Exception: EdgeOne doesn't require API keys.
    // Ollama is exempt only when no server OLLAMA_API_KEY is configured;
    // when it IS configured, the outer guard also enforces client apiKey for custom baseUrls.
    // A trusted URL is the server's own (the admin Test of an entry without
    // one), not a user's
    if (
        overrides?.baseUrl &&
        !overrides?.trustedBaseUrl &&
        !overrides?.apiKey &&
        !(overrides?.provider === "vertexai" && overrides?.vertexApiKey) &&
        overrides?.provider !== "edgeone" &&
        !(overrides?.provider === "ollama" && !process.env.OLLAMA_API_KEY)
    ) {
        throw new Error(
            `API key is required when using a custom base URL. ` +
                `Please provide your own API key in Settings.`,
        )
    }

    // Check if client is providing their own provider override
    const isClientOverride = !!(
        overrides?.provider &&
        (overrides?.apiKey ||
            (overrides?.provider === "vertexai" && overrides?.vertexApiKey))
    )

    // Use client override if provided, otherwise fall back to env vars.
    // AI_MODEL may be comma-separated (multi-model fallback); pick the first.
    const envModel = process.env.AI_MODEL?.split(",")[0]?.trim() || undefined
    const modelId = overrides?.modelId || envModel

    if (!modelId) {
        if (isClientOverride) {
            throw new Error(
                `Model ID is required when using custom AI provider. Please specify a model in Settings.`,
            )
        }
        throw new Error(
            `AI_MODEL environment variable is required. Example: AI_MODEL=claude-sonnet-4-5`,
        )
    }

    // Determine provider: client override > explicit config > auto-detect > error
    let provider: ProviderName
    if (overrides?.provider) {
        // Validate client-provided provider
        if (!Object.hasOwn(PROVIDER_INFO, overrides.provider)) {
            throw new Error(
                `Invalid provider: ${overrides.provider}. Allowed providers: ${Object.keys(PROVIDER_INFO).join(", ")}`,
            )
        }
        provider = overrides.provider as ProviderName
    } else if (process.env.AI_PROVIDER) {
        provider = process.env.AI_PROVIDER as ProviderName
    } else {
        const detected = detectProvider()
        if (detected) {
            provider = detected
            console.log(`[AI Provider] Auto-detected provider: ${provider}`)
        } else {
            // List configured providers for better error message
            const configured = Object.entries(PROVIDER_ENV_VARS)
                .filter(([, envVar]) => envVar && process.env[envVar as string])
                .map(([p]) => p)

            if (configured.length === 0) {
                const keys = Object.entries(PROVIDER_ENV_VARS)
                    .filter(([, envVar]) => envVar)
                    .map(([p, envVar]) => `- ${envVar} for ${p}`)
                throw new Error(
                    `No AI provider configured. Please set one of the following API keys in your .env.local file:\n` +
                        `${keys.join("\n")}\n` +
                        `- AWS_ACCESS_KEY_ID for bedrock\n` +
                        `Or set AI_PROVIDER=ollama for local Ollama.`,
                )
            }
            throw new Error(
                `Multiple AI providers configured (${configured.join(", ")}). ` +
                    `Please set AI_PROVIDER to specify which one to use.`,
            )
        }
    }
    if (!Object.hasOwn(PROVIDER_INFO, provider)) {
        throw new Error(
            `Unknown AI provider: ${provider}. Supported providers: ${Object.keys(PROVIDER_INFO).join(", ")}`,
        )
    }

    // Only validate server credentials if client isn't providing their own API key
    if (!isClientOverride) {
        validateProviderCredentials(
            provider,
            overrides?.apiKeyEnv,
            overrides?.baseUrlEnv,
        )
    }

    console.log(`[AI Provider] Initializing ${provider} with model: ${modelId}`)

    // Requests to a base URL the client chose must not follow redirects
    const guardedFetch =
        overrides?.baseUrl && !overrides.trustedBaseUrl
            ? redirectGuardedFetch()
            : undefined
    // Build provider-specific options from environment variables
    let providerOptions = buildProviderOptions(provider, modelId)
    let model: LanguageModel

    switch (provider) {
        case "bedrock": {
            // Use client-provided credentials if available (a Bedrock API
            // key, or an access key pair), otherwise fall back to IAM/env vars
            const clientApiKey = overrides?.apiKey
            const hasClientCredentials =
                overrides?.awsAccessKeyId && overrides?.awsSecretAccessKey
            // Keys from the admin panel. The ADMIN_ names keep them out of the
            // default AWS credential chain, which other clients such as the
            // DynamoDB quota manager use with their own credentials.
            const adminAccessKeyId = process.env.ADMIN_AWS_ACCESS_KEY_ID
            const adminSecretAccessKey = process.env.ADMIN_AWS_SECRET_ACCESS_KEY
            // The region becomes part of the endpoint's host name, so a
            // request's region must be a region name, or it could send the
            // server's credentials to another host
            if (
                overrides?.awsRegion &&
                !/^[a-z]{2,4}(-[a-z]+)+-\d{1,2}$/.test(overrides.awsRegion)
            ) {
                throw Object.assign(
                    new Error(`Invalid AWS region "${overrides.awsRegion}"`),
                    { statusCode: 400 },
                )
            }
            const bedrockRegion =
                overrides?.awsRegion ||
                process.env.ADMIN_AWS_REGION ||
                process.env.AWS_REGION ||
                "us-west-2"

            const bedrockProvider = clientApiKey
                ? createAmazonBedrock({
                      region: bedrockRegion,
                      apiKey: clientApiKey,
                      // The SDK falls back to signing with AWS keys when it
                      // drops a key (one of spaces): never the server's
                      credentialProvider: async () => {
                          throw new Error("The Bedrock API key is empty")
                      },
                      // Without a baseURL it reads the server's
                      // AWS_ENDPOINT_URL_BEDROCK_RUNTIME / AWS_ENDPOINT_URL
                      baseURL: bedrockRuntimeUrl(bedrockRegion),
                  })
                : hasClientCredentials
                  ? createAmazonBedrock({
                        region: bedrockRegion,
                        accessKeyId: overrides.awsAccessKeyId as string,
                        secretAccessKey: overrides.awsSecretAccessKey as string,
                        ...(overrides?.awsSessionToken && {
                            sessionToken: overrides.awsSessionToken,
                        }),
                        // Without an apiKey the SDK reads the server's
                        // AWS_BEARER_TOKEN_BEDROCK, which wins over the keys
                        apiKey: "",
                        // Without a baseURL it reads the server's
                        // AWS_ENDPOINT_URL_BEDROCK_RUNTIME / AWS_ENDPOINT_URL
                        baseURL: bedrockRuntimeUrl(bedrockRegion),
                    })
                  : adminAccessKeyId && adminSecretAccessKey
                    ? createAmazonBedrock({
                          region: bedrockRegion,
                          accessKeyId: adminAccessKeyId,
                          secretAccessKey: adminSecretAccessKey,
                          // The keys the admin panel's Test button checked
                          apiKey: "",
                      })
                    : createAmazonBedrock({
                          region: bedrockRegion,
                          credentialProvider: fromNodeProviderChain(),
                      })
            model = bedrockProvider(modelId)
            // Add Anthropic beta options if using Claude models via Bedrock
            if (modelId.includes("anthropic.claude")) {
                // Deep merge to preserve both anthropicBeta and reasoningConfig
                providerOptions = {
                    bedrock: {
                        ...BEDROCK_ANTHROPIC_BETA.bedrock,
                        ...(providerOptions?.bedrock || {}),
                    },
                }
            }
            break
        }

        case "vertexai": {
            // Express Mode: Use API key for authentication
            // SECURITY: a client base URL only ever gets the client's key, so the
            // server's GOOGLE_VERTEX_API_KEY is never sent to a client-chosen host
            const vertexApiKey = overrides?.baseUrl
                ? overrides.vertexApiKey
                : overrides?.vertexApiKey || process.env.GOOGLE_VERTEX_API_KEY

            if (!vertexApiKey) {
                throw new Error(
                    "Vertex AI requires an API key for Express Mode. " +
                        "Get one from Google Cloud Console or set GOOGLE_VERTEX_API_KEY environment variable.",
                )
            }

            // Support custom base URL from env or client override.
            // A client key only goes to the client's URL or the official one.
            const baseURL = resolveBaseURL(
                overrides?.vertexApiKey,
                overrides?.baseUrl,
                process.env.GOOGLE_VERTEX_BASE_URL,
            )
            model = createVertex({
                apiKey: vertexApiKey,
                ...(baseURL && { baseURL }),
                ...(guardedFetch && { fetch: guardedFetch }),
            })(modelId)
            break
        }

        case "ollama": {
            // SECURITY: When client provides a custom base URL, only use
            // client-provided API key. Never fall back to server OLLAMA_API_KEY
            // to prevent leaking server credentials to user-controlled endpoints.
            const apiKey = overrides?.baseUrl
                ? overrides?.apiKey || undefined
                : resolveApiKey(overrides, "OLLAMA_API_KEY")
            // Like other providers, a user's key never goes to the server's
            // base URL: without a URL of their own it goes to Ollama Cloud.
            // The server's key goes to OLLAMA_BASE_URL (or a server model's
            // own variable), else to the SDK's local default: the desktop
            // app's "Ollama (Local)" preset puts its key field there too.
            const baseURL =
                overrides?.baseUrl ||
                (overrides?.apiKey
                    ? PROVIDER_INFO.ollama.defaultBaseUrl
                    : resolveBaseUrlEnv(overrides, "OLLAMA_BASE_URL"))
            model = createOllama({
                ...(baseURL && { baseURL: ollamaApiUrl(baseURL) }),
                ...(apiKey && {
                    headers: { Authorization: `Bearer ${apiKey}` },
                }),
                ...(guardedFetch && { fetch: guardedFetch }),
            })(modelId)
            break
        }

        case "edgeone":
            // EdgeOne Pages Edge AI, an OpenAI-compatible API without a key.
            // The SDK appends /chat/completions to the base URL. Cookies
            // (eo_token, eo_time) and the access code authenticate the call.
            model = compatibleModel(provider, modelId, {
                apiKey: "edgeone",
                baseURL: overrides?.baseUrl || "/api/edgeai",
                headers: overrides?.headers,
                fetch: guardedFetch,
            })
            break

        default: {
            // Every other provider takes an API key and a base URL from
            // <NAME>_API_KEY / <NAME>_BASE_URL (or a server model's apiKeyEnv)
            const apiKey = resolveApiKey(
                overrides,
                PROVIDER_ENV_VARS[provider] as string,
            )
            const baseUrlEnv =
                provider === "gateway"
                    ? "AI_GATEWAY_BASE_URL"
                    : `${provider.toUpperCase()}_BASE_URL`
            // A local default (SGLang's 127.0.0.1) only fills the settings
            // form; the server must not call its own machine for it. With a
            // user's key the OpenAI SDK would read the server's
            // OPENAI_BASE_URL, so name the official endpoint.
            const defaultUrl = PROVIDER_INFO[provider].defaultBaseUrl
            const publicDefault = defaultUrl?.startsWith("https://")
                ? defaultUrl
                : undefined
            const configuredBaseURL = resolveBaseURL(
                overrides?.apiKey,
                overrides?.baseUrl,
                resolveBaseUrlEnv(overrides, baseUrlEnv),
            )
            const baseURL =
                configuredBaseURL ||
                (SDK_KNOWS_ENDPOINT.has(provider) &&
                !(provider === "openai" && overrides?.apiKey)
                    ? undefined
                    : publicDefault)
            // With a user's Azure key the SDK would read the server's
            // AZURE_RESOURCE_NAME
            if (
                !baseURL &&
                (!SDK_KNOWS_ENDPOINT.has(provider) ||
                    (provider === "azure" && overrides?.apiKey))
            ) {
                throw new Error(
                    `${PROVIDER_INFO[provider].label} needs a base URL. Add it in the model settings.`,
                )
            }
            model = createModel(provider, modelId, {
                apiKey,
                baseURL,
                configuredBaseURL: !!configuredBaseURL,
                fetch: guardedFetch,
                // Bearer auth for Anthropic when there is no API key
                authToken:
                    provider === "anthropic" && !apiKey
                        ? process.env.ANTHROPIC_AUTH_TOKEN
                        : undefined,
                // Only the server's own resource; a client key needs its URL
                resourceName:
                    provider === "azure" && !overrides?.apiKey
                        ? process.env.AZURE_RESOURCE_NAME
                        : undefined,
            })
        }
    }

    return { model, providerOptions, modelId, provider }
}

/**
 * The deployment's EdgeOne Pages function, as an absolute URL (the SDK
 * needs one). EdgeOne serves functions by their folder from the site root,
 * so Next's base path does not apply.
 */
export function edgeOneEndpoint(req: Request): string {
    const origin = req.headers.get("origin") || new URL(req.url).origin
    return `${origin}/api/edgeai`
}

/**
 * The server's <P>_BASE_URL for a provider, which getAIModel uses for a
 * server model without a URL variable of its own (an admin panel entry
 * without a URL). None for Bedrock and EdgeOne. Ollama and Vertex AI share
 * one variable with the panel, which writes an entry's URL into it: an
 * entry without a URL gets the environment's value once saved (before a
 * save the variable may still hold the entry's previous URL), and Ollama
 * without one goes to the SDK's local default.
 */
export function globalBaseUrl(provider: ProviderName): string | undefined {
    if (provider === "ollama") {
        return getEnvFallback("OLLAMA_BASE_URL") || "http://127.0.0.1:11434/api"
    }
    if (provider === "vertexai") {
        return getEnvFallback("GOOGLE_VERTEX_BASE_URL") || undefined
    }
    if (provider === "bedrock" || provider === "edgeone") return undefined
    // Azure set up by resource name only: the URL the SDK builds from it
    if (
        provider === "azure" &&
        !process.env.AZURE_BASE_URL &&
        process.env.AZURE_RESOURCE_NAME
    ) {
        return `https://${process.env.AZURE_RESOURCE_NAME}.openai.azure.com/openai`
    }
    const name =
        provider === "gateway"
            ? "AI_GATEWAY_BASE_URL"
            : `${provider.toUpperCase()}_BASE_URL`
    return process.env[name] || undefined
}

/** The provider of the server's own config: AI_PROVIDER, or the one with a key */
export function getServerProvider(): ProviderName | null {
    return (process.env.AI_PROVIDER as ProviderName) || detectProvider()
}

/**
 * Whether a call made with the caller's own settings runs on an endpoint of
 * the deployment: its EdgeOne function, the server's keyless Ollama, or an
 * address on the server's network (which ignores a dummy key header).
 * Bedrock and EdgeOne never use a client base URL. Never in the desktop
 * app, where every endpoint is the user's. clientBaseUrl: normalized.
 */
export async function usesServerEndpoint(
    provider: ProviderName | null | undefined,
    clientBaseUrl: string,
    apiKey: string | null | undefined,
): Promise<boolean> {
    if (process.env.NEXT_AI_DRAWIO_DESKTOP === "1") return false
    if (provider === "edgeone") return true
    if (provider === "ollama" && !clientBaseUrl && !apiKey) return true
    return (
        provider !== "bedrock" &&
        !!clientBaseUrl &&
        (await isPrivateUrl(clientBaseUrl))
    )
}

/**
 * Whether the call is paid for by the server's own credentials (env keys or
 * IAM role) rather than credentials sent with the request. Mirrors which key
 * each branch of getAIModel ends up using.
 */
export function usesServerCredentials(
    provider: ProviderName,
    overrides?: ClientOverrides,
): boolean {
    // The desktop app's local server holds the user's own preset keys
    if (process.env.NEXT_AI_DRAWIO_DESKTOP === "1") return false
    // Cleaned like getAIModel does: "/" means no base URL
    const baseUrl = normalizeBaseUrl(overrides?.baseUrl ?? "")
    switch (provider) {
        case "bedrock":
            return !(
                overrides?.apiKey ||
                (overrides?.awsAccessKeyId && overrides?.awsSecretAccessKey)
            )
        case "vertexai":
            return !overrides?.vertexApiKey
        case "edgeone":
            // The platform's own endpoint, no key involved
            return false
        case "ollama":
            // Only a server key costs money; a keyless local server or the
            // client's own server does not
            return (
                !baseUrl &&
                !overrides?.apiKey &&
                !!(overrides?.apiKeyEnv || process.env.OLLAMA_API_KEY)
            )
        default:
            return !overrides?.apiKey
    }
}

/**
 * Prompt cache breakpoint for Claude, set on a message's providerOptions.
 * Each provider reads only its own key; OpenRouter also reads the
 * anthropic one.
 */
export const CACHE_POINT = {
    bedrock: { cachePoint: { type: "default" } },
    anthropic: { cacheControl: { type: "ephemeral" } },
}

/**
 * Check if a model supports prompt caching: Claude models, on Bedrock,
 * the Anthropic API or OpenRouter (see CACHE_POINT).
 */
export function supportsPromptCaching(modelId: string): boolean {
    return (
        modelId.includes("claude") ||
        modelId.includes("anthropic") ||
        modelId.startsWith("us.anthropic") ||
        modelId.startsWith("eu.anthropic")
    )
}

/**
 * Get the AI model for diagram validation.
 * Uses VALIDATION_MODEL env var if set, otherwise falls back to AI_MODEL.
 *
 * Note: we no longer guess whether the model supports image input from its
 * name — that heuristic misfired on newer models (see issue #874). If a
 * configured validation model can't handle images, the API call simply errors
 * and the validate-diagram route falls back to "valid".
 */
export function getValidationModel(): ReturnType<typeof getAIModel>["model"] {
    // AI_MODEL may be comma-separated (multi-model fallback); pick the first.
    const envFallback = process.env.AI_MODEL?.split(",")[0]?.trim() || undefined
    const modelId = process.env.VALIDATION_MODEL || envFallback

    if (!modelId) {
        throw new Error(
            "No validation model configured. Set VALIDATION_MODEL or AI_MODEL.",
        )
    }

    // A default set in the admin panel becomes AI_PROVIDER/AI_MODEL, but its key
    // lives in an ADMIN_-prefixed env var. Point at it the way the chat route
    // does for server models, or the standard env var is required instead.
    const panelDefault = adminProvidersToConfig(
        loadAdminProviders(),
    ).providers.find((p) => p.default && p.provider === process.env.AI_PROVIDER)

    const { model } = getAIModel({
        modelId,
        apiKeyEnv: panelDefault?.apiKeyEnv,
        baseUrlEnv: panelDefault?.baseUrlEnv,
    })
    return model
}
