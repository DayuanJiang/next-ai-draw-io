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
import {
    PROVIDER_NAMES,
    PROVIDERS,
    type ProviderDef,
    type ProviderName,
    publicDefaultUrl,
} from "@/lib/providers"
import { isPrivateUrl, redirectGuardedFetch } from "@/lib/ssrf-protection"
import { thinkingSwitchOf } from "@/lib/thinking-capabilities"
import { normalizeBaseUrl, ollamaApiUrl } from "@/lib/types/model-config"

const AIHUBMIX_APP_CODE = "MSBS9675"

interface ModelConfig {
    model: any
    providerOptions?: any
    modelId: string
    provider: ProviderName
}

/**
 * Normalize MiniMax base URL for AI SDK compatibility.
 * MiniMax supports Anthropic-compatible and OpenAI-compatible endpoints.
 */
function normalizeMiniMaxBaseURL(rawUrl: string): {
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
 * @returns The resolved base URL to use
 */
export function resolveBaseURL(
    userApiKey: string | null | undefined,
    userBaseUrl: string | null | undefined,
    serverBaseUrl: string | undefined,
): string | undefined {
    if (userApiKey) {
        // User provides their own API key - only use user's baseUrl
        return userBaseUrl || undefined
    }
    // No user API key - fall back to server config
    return userBaseUrl || serverBaseUrl || undefined
}

/** The provider record of a name that may not be one */
function providerDef(name: string): ProviderDef | undefined {
    return Object.hasOwn(PROVIDERS, name)
        ? PROVIDERS[name as ProviderName]
        : undefined
}

/**
 * A key and whose it is: the client's own, or the server's. "server" also
 * when the variable turns out empty, which the credential check reports.
 */
interface ResolvedKey {
    value?: string
    source: "client" | "server"
    /** The apiKeyEnv entry drawn, when there were several */
    selectedKeyEnv?: string
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
    defaultEnvVar: string | undefined,
): ResolvedKey {
    if (overrides?.apiKey) return { value: overrides.apiKey, source: "client" }

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
                return {
                    value: process.env[selectedEnvVar],
                    source: "server",
                    selectedKeyEnv: selectedEnvVar,
                }
            }
        } else {
            return { value: process.env[overrides.apiKeyEnv], source: "server" }
        }
    }

    return {
        value: defaultEnvVar ? process.env[defaultEnvVar] : undefined,
        source: "server",
    }
}

/** The server's base URL: a server model's own variable (baseUrlEnv) or the default one */
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
 * Gemini 2.5/3 models think by default, but need includeThoughts: true to
 * return the reasoning. The budget applies to Gemini 2.5, the level to
 * Gemini 3. Shared by Google AI and Vertex AI, which read different variables.
 */
function geminiThinkingOptions(
    modelId: string | undefined,
    budgetEnvName: string,
    levelEnvName: string,
): { thinkingConfig: Record<string, any> } | undefined {
    if (!modelId || !/gemini-?[23]/.test(modelId)) return undefined

    const thinkingConfig: Record<string, any> = { includeThoughts: true }
    const budget = parseIntSafe(
        process.env[budgetEnvName],
        budgetEnvName,
        1024,
        100000,
    )
    const level = process.env[levelEnvName] as
        | "minimal"
        | "low"
        | "medium"
        | "high"
        | undefined
    if (budget && (modelId.includes("2.5") || modelId.includes("2-5"))) {
        thinkingConfig.thinkingBudget = budget
    } else if (level && /gemini-?3/.test(modelId)) {
        thinkingConfig.thinkingLevel = level
    }
    return { thinkingConfig }
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
            const reasoningEffort = process.env.OPENAI_REASONING_EFFORT as
                | "minimal"
                | "low"
                | "medium"
                | "high"
                | undefined
            // Reasoning models (the o-series, gpt-5 and later) need
            // reasoningSummary to return thoughts; 'auto' as the default
            // since not all models support 'detailed'
            const isReasoning =
                !!modelId && /^(o\d|gpt-([5-9]|[1-9]\d))/.test(modelId)
            const reasoningSummary =
                (process.env.OPENAI_REASONING_SUMMARY as
                    | "auto"
                    | "detailed"
                    | undefined) || (isReasoning ? "auto" : undefined)

            if (reasoningSummary || reasoningEffort) {
                options.openai = {
                    ...(reasoningSummary && { reasoningSummary }),
                    ...(reasoningEffort && { reasoningEffort }),
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
            const google = geminiThinkingOptions(
                modelId,
                "GOOGLE_THINKING_BUDGET",
                "GOOGLE_THINKING_LEVEL",
            )
            if (google) options.google = google
            break
        }
        case "vertexai": {
            const google = geminiThinkingOptions(
                modelId,
                "GOOGLE_VERTEX_THINKING_BUDGET",
                "GOOGLE_VERTEX_THINKING_LEVEL",
            )
            if (google) options.google = google
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

/**
 * The provider options with the user's thinking switch applied, for a model
 * that has one (lib/thinking-capabilities.ts). With thinking on, a budget
 * or effort set in the environment still applies.
 */
export function applyThinkingSwitch(
    providerOptions: Record<string, any> | undefined,
    provider: ProviderName,
    modelId: string,
    enabled: boolean,
): Record<string, any> | undefined {
    const kind = thinkingSwitchOf(provider, modelId)
    if (!kind) return providerOptions
    const options = { ...providerOptions }

    switch (kind) {
        case "effort": {
            const key = provider === "azure" ? "azure" : "openai"
            // A summary has nothing to summarize without reasoning
            const { reasoningSummary, ...rest } = options[key] ?? {}
            options[key] = enabled
                ? {
                      ...options[key],
                      reasoningEffort: rest.reasoningEffort ?? "medium",
                  }
                : { ...rest, reasoningEffort: "none" }
            break
        }
        case "budget":
        case "adaptive": {
            const key = provider === "bedrock" ? "bedrock" : "anthropic"
            const field = key === "bedrock" ? "reasoningConfig" : "thinking"
            const { [field]: fromEnv, ...rest } = options[key] ?? {}
            // The environment's budget if it set one, and only that: its type
            // may say disabled, and BEDROCK_REASONING_EFFORT alone gives
            // Claude a config without a budget, which does not think at all.
            // Opus 4.7 and later return no thinking text unless asked to.
            const on = fromEnv?.budgetTokens
                ? { type: "enabled", budgetTokens: fromEnv.budgetTokens }
                : kind === "adaptive"
                  ? { type: "adaptive", display: "summarized" }
                  : { type: "enabled", budgetTokens: 1024 }
            // Claude Sonnet 5 and Opus 5 think when the request says
            // nothing, so off is said explicitly. Bedrock's SDK does not
            // send it for Claude, so it goes in the request fields.
            options[key] = enabled
                ? { ...rest, [field]: on }
                : key === "anthropic"
                  ? { ...rest, thinking: { type: "disabled" } }
                  : {
                        ...rest,
                        additionalModelRequestFields: {
                            ...rest.additionalModelRequestFields,
                            thinking: { type: "disabled" },
                        },
                    }
            break
        }
        case "gemini": {
            // Flash thinks by default with a budget it picks, Flash-Lite
            // only with a budget; -1 lets the model pick
            const config = options.google?.thinkingConfig ?? {}
            options.google = {
                ...options.google,
                thinkingConfig: enabled
                    ? {
                          ...config,
                          includeThoughts: true,
                          thinkingBudget: config.thinkingBudget ?? -1,
                      }
                    : { thinkingBudget: 0 },
            }
            break
        }
        case "nova":
            options.bedrock = {
                ...options.bedrock,
                reasoningConfig: enabled
                    ? {
                          type: "enabled",
                          maxReasoningEffort:
                              options.bedrock?.reasoningConfig
                                  ?.maxReasoningEffort ?? "medium",
                      }
                    : { type: "disabled" },
            }
            break
        case "deepseek":
            options.deepseek = {
                thinking: { type: enabled ? "enabled" : "disabled" },
            }
            break
    }

    return Object.keys(options).length > 0 ? options : undefined
}

/**
 * The names of a provider's server key and base URL variables, from the
 * record: <PREFIX>_API_KEY (or the record's own keyEnv) and <PREFIX>_BASE_URL.
 * Empty for Bedrock and EdgeOne. Always the spelling; whether the server
 * must have the key is serverCredentialError's question.
 */
export function envVarsOf(provider: ProviderName): {
    apiKey?: string
    baseUrl?: string
} {
    const { envPrefix, keyEnv } = PROVIDERS[provider]
    if (envPrefix === null) return {}
    return {
        apiKey: keyEnv ?? `${envPrefix}_API_KEY`,
        baseUrl: `${envPrefix}_BASE_URL`,
    }
}

// The key variable the server must have for each provider; null where it
// needs none of this kind: Bedrock (the AWS SDK uses an IAM role or the
// AWS_* variables), local Ollama, EdgeOne (the site's own function)
const REQUIRED_KEY_VARS = Object.fromEntries(
    PROVIDER_NAMES.map((p) => {
        const { credential } = PROVIDERS[p]
        const required = credential === "apiKey" || credential === "vertexKey"
        return [p, required ? (envVarsOf(p).apiKey ?? null) : null]
    }),
) as Record<ProviderName, string | null>

/**
 * Why the server lacks this provider's credentials, or null when it has
 * them. detectProvider asks for null; validateProviderCredentials throws
 * the text. In order: an array apiKeyEnv passes when any of its variables
 * has a value, and nothing else is checked; without a custom variable a
 * provider with an altKeyEnv (Anthropic's ANTHROPIC_AUTH_TOKEN) accepts
 * either variable; a custom variable without a value fails, with no fall
 * back to the default one; a provider with a resourceNameEnv (Azure) then
 * needs its base URL variable, the server model's own URL variable or the
 * resource name. Providers with no required key variable pass unless a
 * custom variable was given.
 */
function serverCredentialError(
    provider: ProviderName,
    customApiKeyEnv?: string | string[],
    customBaseUrlEnv?: string,
): string | null {
    if (Array.isArray(customApiKeyEnv)) {
        const hasAnyKey = customApiKeyEnv.some((envVar) => process.env[envVar])
        if (!hasAnyKey) {
            return (
                `At least one of [${customApiKeyEnv.join(", ")}] environment variables is required for ${provider} provider. ` +
                `Please set at least one in your .env.local file.`
            )
        }
        return null
    }

    const { altKeyEnv, resourceNameEnv } = PROVIDERS[provider]
    const requiredKeyEnv = REQUIRED_KEY_VARS[provider]
    if (altKeyEnv && !customApiKeyEnv) {
        const hasCredential = !!(
            (requiredKeyEnv && process.env[requiredKeyEnv]) ||
            process.env[altKeyEnv]
        )
        if (!hasCredential) {
            return (
                `Either ${requiredKeyEnv} or ${altKeyEnv} environment variable is required for ${provider} provider. ` +
                `Please set one in your .env.local file.`
            )
        }
    } else {
        const requiredVar = customApiKeyEnv || requiredKeyEnv
        if (requiredVar && !process.env[requiredVar]) {
            return (
                `${requiredVar} environment variable is required for ${provider} provider. ` +
                `Please set it in your .env.local file.`
            )
        }
    }

    // The SDK builds the URL from the resource name when there is no URL.
    // Only Azure has one, and the text stays as it was (tests freeze it)
    if (resourceNameEnv) {
        const baseUrlEnv = envVarsOf(provider).baseUrl as string
        const hasBaseUrl =
            !!process.env[baseUrlEnv] ||
            !!(customBaseUrlEnv && process.env[customBaseUrlEnv])
        const hasResourceName = !!process.env[resourceNameEnv]
        if (!hasBaseUrl && !hasResourceName) {
            return (
                `Azure requires either ${baseUrlEnv} or ${resourceNameEnv} to be set. ` +
                `Please set one in your .env.local file.`
            )
        }
    }
    return null
}

/**
 * Auto-detect provider based on available API keys
 * Returns the provider if exactly one is configured, otherwise null
 */
function detectProvider(): ProviderName | null {
    const configuredProviders = PROVIDER_NAMES.filter(
        (p) =>
            REQUIRED_KEY_VARS[p] !== null && serverCredentialError(p) === null,
    )
    return configuredProviders.length === 1 ? configuredProviders[0] : null
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
    const error = serverCredentialError(
        provider,
        customApiKeyEnv,
        customBaseUrlEnv,
    )
    if (error) throw new Error(error)
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

type KeySource = "client" | "server" | "none"

/** Where and how to call a provider, once credentials are resolved */
interface Endpoint {
    apiKey?: string
    /** Anthropic Bearer auth (ANTHROPIC_AUTH_TOKEN), server only */
    authToken?: string
    /** Azure, the server's resource only */
    resourceName?: string
    /** undefined: the SDK's built-in endpoint */
    baseURL?: string
    /** The URL came from the client or a server variable, not the record */
    configuredBaseURL: boolean
    /** A client-chosen, untrusted URL: wrap fetch in redirectGuardedFetch */
    guarded: boolean
    /** "server" is what usesServerCredentials answers true for */
    keySource: KeySource
    /** The apiKeyEnv entry drawn (array case); getAIModel logs it */
    selectedKeyEnv?: string
    headers?: Record<string, string>
    /** Set by getAIModel from guarded; resolveEndpoint never fills it */
    fetch?: typeof fetch
}

/**
 * Whose key a call uses and where it goes, by the provider's credential
 * kind. Reads its arguments and process.env, draws one key with Math.random
 * when apiKeyEnv is an array, and never throws, fetches or logs: getAIModel
 * decides what a missing key or URL means, usesServerCredentials reads
 * keySource. overrides.baseUrl must already be normalized (normalizeBaseUrl
 * drops one pasted endpoint path per call, so it runs once, in the caller).
 * Bedrock gets only keySource: bedrockModel() builds its SDK parameters.
 */
function resolveEndpoint(
    provider: ProviderName,
    overrides?: ClientOverrides,
): Endpoint {
    const def = PROVIDERS[provider]
    const vars = envVarsOf(provider)
    const clientUrl = overrides?.baseUrl || undefined
    // Requests to a base URL the client chose must not follow redirects. A
    // trusted URL is the server's own (the admin Test of an entry without
    // one), not a user's
    const guarded = !!clientUrl && !overrides?.trustedBaseUrl

    switch (def.credential) {
        case "aws": {
            // The client's own Bedrock API key or access key pair, else the
            // server's (the admin panel's ADMIN_AWS_* keys or an IAM role)
            const clientKeys = !!(
                overrides?.apiKey ||
                (overrides?.awsAccessKeyId && overrides?.awsSecretAccessKey)
            )
            return {
                configuredBaseURL: false,
                guarded,
                keySource: clientKeys ? "client" : "server",
            }
        }
        case "vertexKey": {
            // SECURITY: a client base URL only ever gets the client's key, so
            // the server's key is never sent to a client-chosen host. A client
            // key only goes to the client's URL or the official one.
            const apiKey = clientUrl
                ? overrides?.vertexApiKey || undefined
                : overrides?.vertexApiKey || process.env[vars.apiKey as string]
            const baseURL = resolveBaseURL(
                overrides?.vertexApiKey,
                clientUrl,
                process.env[vars.baseUrl as string],
            )
            return {
                apiKey,
                baseURL,
                configuredBaseURL: !!baseURL,
                guarded,
                keySource: overrides?.vertexApiKey ? "client" : "server",
            }
        }
        case "none":
            // The site's own function (EdgeOne), an OpenAI-compatible API
            // without a key. The route passes the site's absolute URL and the
            // cookies and access code that authenticate the call.
            return {
                apiKey: "edgeone",
                baseURL: clientUrl || "/api/edgeai",
                headers: overrides?.headers,
                configuredBaseURL: !!clientUrl,
                guarded,
                keySource: "none",
            }
        case "optionalKey": {
            // SECURITY: with a client base URL only the client's key is used,
            // never the server's (Ollama). A user's key never goes to the
            // server's URL: without a URL of their own it goes to the
            // provider's cloud. The server's key goes to the server's URL
            // variable (or a server model's own), else to the SDK's local
            // default.
            const key: ResolvedKey = clientUrl
                ? { value: overrides?.apiKey || undefined, source: "client" }
                : resolveApiKey(overrides, vars.apiKey)
            const baseURL =
                clientUrl ||
                (overrides?.apiKey
                    ? def.defaultBaseUrl
                    : resolveBaseUrlEnv(overrides, vars.baseUrl as string))
            // Only a server key costs money; a keyless local server or the
            // client's own server does not. Spelled out because resolveApiKey
            // says "server" for an empty variable too.
            const serverKey =
                overrides?.apiKeyEnv || process.env[vars.apiKey as string]
            const keySource: KeySource = overrides?.apiKey
                ? "client"
                : !clientUrl && serverKey
                  ? "server"
                  : "none"
            return {
                apiKey: key.value,
                baseURL,
                configuredBaseURL: !!baseURL,
                guarded,
                keySource,
                selectedKeyEnv: key.selectedKeyEnv,
            }
        }
        case "apiKey": {
            // An API key and a base URL from <PREFIX>_API_KEY /
            // <PREFIX>_BASE_URL, or a server model's apiKeyEnv / baseUrlEnv
            const key = resolveApiKey(overrides, vars.apiKey)
            const configuredUrl = resolveBaseURL(
                overrides?.apiKey,
                clientUrl,
                resolveBaseUrlEnv(overrides, vars.baseUrl as string),
            )
            // Without a configured URL an SDK that knows its endpoint gets
            // none, except OpenAI with a user's key: the SDK would read the
            // server's OPENAI_BASE_URL, so the official endpoint is named.
            // The others get the record's https default (a local default,
            // SGLang's 127.0.0.1, only fills the settings form).
            const baseURL =
                configuredUrl ||
                (def.sdkKnowsEndpoint &&
                !(def.sdk === "openai" && overrides?.apiKey)
                    ? undefined
                    : publicDefaultUrl(provider))
            return {
                apiKey: key.value,
                baseURL,
                configuredBaseURL: !!configuredUrl,
                guarded,
                keySource: key.source,
                selectedKeyEnv: key.selectedKeyEnv,
                // Bearer auth when there is no API key (Anthropic)
                authToken:
                    def.altKeyEnv && !key.value
                        ? process.env[def.altKeyEnv]
                        : undefined,
                // Only the server's own resource; a client key needs its URL
                // (Azure)
                resourceName:
                    def.resourceNameEnv && !overrides?.apiKey
                        ? process.env[def.resourceNameEnv]
                        : undefined,
            }
        }
    }
}

/**
 * A Bedrock model from the client's credentials if it sent any (a Bedrock
 * API key, or an access key pair), else the admin panel's ADMIN_AWS_* keys,
 * else the default AWS credential chain (an IAM role, the AWS_* variables).
 */
function bedrockModel(
    modelId: string,
    overrides: ClientOverrides | undefined,
): LanguageModel {
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
    return bedrockProvider(modelId)
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

/**
 * Create the model for a provider with its endpoint resolved, by the SDK
 * the record names. Bedrock never comes here: getAIModel calls bedrockModel.
 */
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
    switch (PROVIDERS[provider].sdk) {
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
        case "vertex":
            // Express Mode: an API key; the URL only when one is configured
            return createVertex(opts)(modelId)
        case "ollama":
            return createOllama({
                ...(e.baseURL && { baseURL: ollamaApiUrl(e.baseURL) }),
                ...(e.apiKey && {
                    headers: { Authorization: `Bearer ${e.apiKey}` },
                }),
                ...(e.fetch && { fetch: e.fetch }),
            })(modelId)
        case "openai-compatible":
            return compatibleModel(provider, modelId, e)
        case "bedrock":
            throw new Error("Bedrock models come from bedrockModel()")
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
    // Exceptions, by the provider's credential kind: a provider without keys
    // (EdgeOne); a Vertex key; an optional key (Ollama) only when the server
    // has no key of that provider, otherwise the client must send its own.
    // A trusted URL is the server's own (the admin Test of an entry without
    // one), not a user's. An unknown provider name has no kind and is
    // refused here like any other, and named below.
    const requested = overrides?.provider
        ? providerDef(overrides.provider)
        : undefined
    if (
        overrides?.baseUrl &&
        !overrides?.trustedBaseUrl &&
        !overrides?.apiKey &&
        !(requested?.credential === "vertexKey" && overrides?.vertexApiKey) &&
        requested?.credential !== "none" &&
        !(
            requested?.credential === "optionalKey" &&
            !process.env[
                envVarsOf(overrides.provider as ProviderName).apiKey as string
            ]
        )
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
            (requested?.credential === "vertexKey" && overrides?.vertexApiKey))
    )

    // Use client override if provided, otherwise fall back to env vars.
    // AI_MODEL may be comma-separated (multi-model fallback); pick the first.
    const envModel = process.env.AI_MODEL?.split(",")[0].trim() || undefined
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
        if (!Object.hasOwn(PROVIDERS, overrides.provider)) {
            throw new Error(
                `Invalid provider: ${overrides.provider}. Allowed providers: ${Object.keys(PROVIDERS).join(", ")}`,
            )
        }
        provider = overrides.provider as ProviderName
    } else if (process.env.AI_PROVIDER) {
        if (!Object.hasOwn(PROVIDERS, process.env.AI_PROVIDER)) {
            throw new Error(
                `Unknown AI provider: ${process.env.AI_PROVIDER}. Supported providers: ${Object.keys(PROVIDERS).join(", ")}`,
            )
        }
        provider = process.env.AI_PROVIDER as ProviderName
    } else {
        const detected = detectProvider()
        if (detected) {
            provider = detected
            console.log(`[AI Provider] Auto-detected provider: ${provider}`)
        } else {
            // List configured providers for better error message
            const configured = Object.entries(REQUIRED_KEY_VARS)
                .filter(([, envVar]) => envVar && process.env[envVar as string])
                .map(([p]) => p)

            if (configured.length === 0) {
                const keys = Object.entries(REQUIRED_KEY_VARS)
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

    // Only validate server credentials if client isn't providing their own API key
    if (!isClientOverride) {
        validateProviderCredentials(
            provider,
            overrides?.apiKeyEnv,
            overrides?.baseUrlEnv,
        )
    }

    console.log(`[AI Provider] Initializing ${provider} with model: ${modelId}`)

    // Build provider-specific options from environment variables
    let providerOptions = buildProviderOptions(provider, modelId)
    let model: LanguageModel
    const def = PROVIDERS[provider]

    if (def.sdk === "bedrock") {
        model = bedrockModel(modelId, overrides)
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
    } else {
        const e = resolveEndpoint(provider, overrides)
        if (e.selectedKeyEnv) {
            console.log(`[API Key Routing] Selected ${e.selectedKeyEnv}`)
        }
        if (def.credential === "vertexKey" && !e.apiKey) {
            throw new Error(
                "Vertex AI requires an API key for Express Mode. " +
                    "Get one from Google Cloud Console or set GOOGLE_VERTEX_API_KEY environment variable.",
            )
        }
        // A key-only provider needs a URL unless its SDK knows the endpoint;
        // with a user's key an SDK that builds the URL from the server's
        // resource name (Azure) would read AZURE_RESOURCE_NAME, so it needs one too
        if (
            def.credential === "apiKey" &&
            !e.baseURL &&
            (!def.sdkKnowsEndpoint ||
                (def.resourceNameEnv && overrides?.apiKey))
        ) {
            throw new Error(
                `${def.label} needs a base URL. Add it in the model settings.`,
            )
        }
        model = createModel(provider, modelId, {
            ...e,
            fetch: e.guarded ? redirectGuardedFetch() : undefined,
        })
    }

    return { model, providerOptions, modelId, provider }
}

/**
 * The deployment's EdgeOne Pages function, as an absolute URL (the SDK
 * needs one). EdgeOne serves functions by their folder from the site root,
 * so Next's base path does not apply. Behind a proxy req.url is the internal
 * address and the browser's Origin header is the site's, so Origin wins,
 * but only for the host the request was addressed to: another site's page
 * sends its own Origin, and the request's cookies must not go there.
 */
export function edgeOneEndpoint(req: Request): string {
    const own = new URL(req.url)
    const origin = req.headers.get("origin")
    const originHost = origin ? hostOf(origin) : undefined
    const addressed = [
        req.headers.get("x-forwarded-host"),
        req.headers.get("host"),
    ].filter((h): h is string => !!h)
    // Without Host headers (tests, odd runtimes) Origin is all there is
    const trusted =
        !!originHost &&
        (addressed.length === 0 ||
            addressed.includes(originHost) ||
            originHost === own.host)
    return `${trusted ? origin : own.origin}/api/edgeai`
}

function hostOf(url: string): string | undefined {
    try {
        return new URL(url).host
    } catch {
        return undefined
    }
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
    const name = envVarsOf(provider).baseUrl as string
    return process.env[name] || undefined
}

/** The provider of the server's own config: AI_PROVIDER, or the one with a key */
export function getServerProvider(): ProviderName | null {
    return (process.env.AI_PROVIDER as ProviderName) || detectProvider()
}

/**
 * Whether a call made with the caller's own settings runs on an endpoint of
 * the deployment: the site's own function (EdgeOne, credential "none"), the
 * server's keyless local provider (Ollama, credential "optionalKey"), or an
 * address on the server's network (which ignores a dummy key header).
 * Bedrock never uses a client base URL. Never in the desktop app, where
 * every endpoint is the user's. clientBaseUrl: normalized.
 */
export async function usesServerEndpoint(
    provider: ProviderName,
    clientBaseUrl: string,
    apiKey: string | null | undefined,
): Promise<boolean> {
    if (process.env.NEXT_AI_DRAWIO_DESKTOP === "1") return false
    const def = PROVIDERS[provider]
    if (def.credential === "none") return true
    if (def.credential === "optionalKey" && !clientBaseUrl && !apiKey) {
        return true
    }
    return (
        def.sdk !== "bedrock" &&
        !!clientBaseUrl &&
        (await isPrivateUrl(clientBaseUrl))
    )
}

/**
 * Whether the call is paid for by the server's own credentials (env keys or
 * IAM role) rather than credentials sent with the request: the key
 * resolveEndpoint picks for getAIModel is the server's.
 */
export function usesServerCredentials(
    provider: ProviderName,
    overrides?: ClientOverrides,
): boolean {
    // The desktop app's local server only has the user's own keys (its .env)
    if (process.env.NEXT_AI_DRAWIO_DESKTOP === "1") return false
    // Cleaned like getAIModel does: "/" means no base URL
    const baseUrl = normalizeBaseUrl(overrides?.baseUrl ?? "")
    return (
        resolveEndpoint(provider, { ...overrides, baseUrl }).keySource ===
        "server"
    )
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
    return modelId.includes("claude") || modelId.includes("anthropic")
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
    const envFallback = process.env.AI_MODEL?.split(",")[0].trim() || undefined
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
