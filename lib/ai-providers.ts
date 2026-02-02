import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
import { createAnthropic } from "@ai-sdk/anthropic"
import { azure, createAzure } from "@ai-sdk/azure"
import { createDeepSeek, deepseek } from "@ai-sdk/deepseek"
import { createGateway, gateway } from "@ai-sdk/gateway"
import { createGoogleGenerativeAI, google } from "@ai-sdk/google"
import { createVertex } from "@ai-sdk/google-vertex"
import { createOpenAI, openai } from "@ai-sdk/openai"
import { fromNodeProviderChain } from "@aws-sdk/credential-providers"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createOllama, ollama } from "ollama-ai-provider-v2"
import type { ProviderName } from "@/lib/types/model-config"

export type { ProviderName }

interface ModelConfig {
    model: any
    providerOptions?: any
    headers?: Record<string, string>
    modelId: string
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
    // Custom headers (e.g., for EdgeOne cookie auth)
    headers?: Record<string, string>
    // Custom env var name(s) for server models
    // Can be a single string or array of strings for load balancing
    apiKeyEnv?: string | string[]
    baseUrlEnv?: string
}

// Providers that can be selected from client settings
const ALLOWED_CLIENT_PROVIDERS: ProviderName[] = [
    "openai",
    "anthropic",
    "google",
    "vertexai",
    "azure",
    "bedrock",
    "openrouter",
    "deepseek",
    "siliconflow",
    "sglang",
    "gateway",
    "edgeone",
    "ollama",
    "doubao",
    "modelscope",
]

// Bedrock provider options for Anthropic beta features
const BEDROCK_ANTHROPIC_BETA = {
    bedrock: {
        anthropicBeta: ["fine-grained-tool-streaming-2025-05-14"],
    },
}

// Direct Anthropic API headers for beta features
const ANTHROPIC_BETA_HEADERS = {
    "anthropic-beta": "fine-grained-tool-streaming-2025-05-14",
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
 * Build provider-specific options from environment variables
 * Supports various AI SDK providers with their unique configuration options
 *
 * Environment variables:
 * - OPENAI_REASONING_EFFORT: OpenAI reasoning effort level (minimal/low/medium/high) - for o1/o3/o4/gpt-5
 * - OPENAI_REASONING_SUMMARY: OpenAI reasoning summary (auto/detailed) - auto-enabled for o1/o3/o4/gpt-5
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

            // OpenAI reasoning models (o1, o3, o4, gpt-5) need reasoningSummary to return thoughts
            if (
                modelId &&
                (modelId.includes("o1") ||
                    modelId.includes("o3") ||
                    modelId.includes("o4") ||
                    modelId.includes("gpt-5"))
            ) {
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
            const reasoningEffort = process.env.GOOGLE_REASONING_EFFORT
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
            } else if (reasoningEffort) {
                options.google = {
                    reasoningEffort: reasoningEffort as
                        | "low"
                        | "medium"
                        | "high",
                }
            }

            // Keep existing Google options
            const options_obj: Record<string, any> = {}
            const candidateCount = parseIntSafe(
                process.env.GOOGLE_CANDIDATE_COUNT,
                "GOOGLE_CANDIDATE_COUNT",
                1,
                8,
            )
            if (candidateCount) {
                options_obj.candidateCount = candidateCount
            }
            const topK = parseIntSafe(
                process.env.GOOGLE_TOP_K,
                "GOOGLE_TOP_K",
                1,
                100,
            )
            if (topK) {
                options_obj.topK = topK
            }
            if (process.env.GOOGLE_TOP_P) {
                const topP = Number.parseFloat(process.env.GOOGLE_TOP_P)
                if (Number.isNaN(topP) || topP < 0 || topP > 1) {
                    throw new Error(
                        `GOOGLE_TOP_P must be a number between 0 and 1, got: ${process.env.GOOGLE_TOP_P}`,
                    )
                }
                options_obj.topP = topP
            }

            if (Object.keys(options_obj).length > 0) {
                options.google = { ...options.google, ...options_obj }
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

        case "deepseek":
        case "openrouter":
        case "siliconflow":
        case "sglang":
        case "gateway":
        case "modelscope":
        case "doubao": {
            // These providers don't have reasoning configs in AI SDK yet
            // Gateway passes through to underlying providers which handle their own configs
            break
        }

        default:
            break
    }

    return Object.keys(options).length > 0 ? options : undefined
}

// Map of provider to required environment variable
const PROVIDER_ENV_VARS: Record<ProviderName, string | null> = {
    bedrock: null, // AWS SDK auto-uses IAM role on AWS, or env vars locally
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_GENERATIVE_AI_API_KEY",
    vertexai: "GOOGLE_VERTEX_API_KEY",
    azure: "AZURE_API_KEY",
    ollama: null, // No credentials needed for local Ollama
    openrouter: "OPENROUTER_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    siliconflow: "SILICONFLOW_API_KEY",
    sglang: "SGLANG_API_KEY",
    gateway: "AI_GATEWAY_API_KEY",
    edgeone: null, // No credentials needed - uses EdgeOne Edge AI
    doubao: "DOUBAO_API_KEY",
    modelscope: "MODELSCOPE_API_KEY",
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
        if (process.env[envVar]) {
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

    // Use custom env var name if provided, otherwise use default
    const requiredVar = customApiKeyEnv || PROVIDER_ENV_VARS[provider]
    if (requiredVar && !process.env[requiredVar]) {
        throw new Error(
            `${requiredVar} environment variable is required for ${provider} provider. ` +
                `Please set it in your .env.local file.`,
        )
    }

    // Azure requires either AZURE_BASE_URL or AZURE_RESOURCE_NAME in addition to API key
    if (provider === "azure") {
        const hasBaseUrl = !!process.env.AZURE_BASE_URL
        const hasResourceName = !!process.env.AZURE_RESOURCE_NAME
        if (!hasBaseUrl && !hasResourceName) {
            throw new Error(
                `Azure requires either AZURE_BASE_URL or AZURE_RESOURCE_NAME to be set. ` +
                    `Please set one in your .env.local file.`,
            )
        }
    }
}

/**
 * Get the AI model based on environment variables
 *
 * Environment variables:
 * - AI_PROVIDER: The provider to use (bedrock, openai, anthropic, google, azure, ollama, openrouter, deepseek, siliconflow, sglang, gateway, modelscope)
 * - AI_MODEL: The model ID/name for the selected provider
 *
 * Provider-specific env vars:
 * - OPENAI_API_KEY: OpenAI API key
 * - OPENAI_BASE_URL: Custom OpenAI-compatible endpoint (optional)
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - GOOGLE_GENERATIVE_AI_API_KEY: Google API key
 * - AZURE_RESOURCE_NAME, AZURE_API_KEY: Azure OpenAI credentials
 * - AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: AWS Bedrock credentials
 * - OLLAMA_BASE_URL: Ollama server URL (optional, defaults to http://localhost:11434)
 * - OPENROUTER_API_KEY: OpenRouter API key
 * - DEEPSEEK_API_KEY: DeepSeek API key
 * - DEEPSEEK_BASE_URL: DeepSeek endpoint (optional)
 * - SILICONFLOW_API_KEY: SiliconFlow API key
 * - SILICONFLOW_BASE_URL: SiliconFlow endpoint (optional, defaults to https://api.siliconflow.cn/v1)
 * - SGLANG_API_KEY: SGLang API key
 * - SGLANG_BASE_URL: SGLang endpoint (optional)
 * - MODELSCOPE_API_KEY: ModelScope API key
 * - MODELSCOPE_BASE_URL: ModelScope endpoint (optional)
 */
export function getAIModel(overrides?: ClientOverrides): ModelConfig {
    // SECURITY: Prevent SSRF attacks (GHSA-9qf7-mprq-9qgm)
    // If a custom baseUrl is provided, an API key MUST also be provided.
    // This prevents attackers from redirecting server API keys to malicious endpoints.
    // Exception: EdgeOne and Ollama providers don't require API keys
    if (
        overrides?.baseUrl &&
        !overrides?.apiKey &&
        !(overrides?.provider === "vertexai" && overrides?.vertexApiKey) &&
        overrides?.provider !== "edgeone" &&
        overrides?.provider !== "ollama"
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

    // Use client override if provided, otherwise fall back to env vars
    const modelId = overrides?.modelId || process.env.AI_MODEL

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
        if (
            !ALLOWED_CLIENT_PROVIDERS.includes(
                overrides.provider as ProviderName,
            )
        ) {
            throw new Error(
                `Invalid provider: ${overrides.provider}. Allowed providers: ${ALLOWED_CLIENT_PROVIDERS.join(", ")}`,
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
                throw new Error(
                    `No AI provider configured. Please set one of the following API keys in your .env.local file:\n` +
                        `- AI_GATEWAY_API_KEY for Vercel AI Gateway\n` +
                        `- DEEPSEEK_API_KEY for DeepSeek\n` +
                        `- OPENAI_API_KEY for OpenAI\n` +
                        `- ANTHROPIC_API_KEY for Anthropic\n` +
                        `- GOOGLE_GENERATIVE_AI_API_KEY for Google\n` +
                        `- AWS_ACCESS_KEY_ID for Bedrock\n` +
                        `- OPENROUTER_API_KEY for OpenRouter\n` +
                        `- AZURE_API_KEY for Azure\n` +
                        `- SILICONFLOW_API_KEY for SiliconFlow\n` +
                        `- SGLANG_API_KEY for SGLang\n` +
                        `- MODELSCOPE_API_KEY for ModelScope\n` +
                        `Or set AI_PROVIDER=ollama for local Ollama.`,
                )
            } else {
                throw new Error(
                    `Multiple AI providers configured (${configured.join(", ")}). ` +
                        `Please set AI_PROVIDER to specify which one to use.`,
                )
            }
        }
    }

    // Only validate server credentials if client isn't providing their own API key
    if (!isClientOverride) {
        validateProviderCredentials(provider, overrides?.apiKeyEnv)
    }

    console.log(`[AI Provider] Initializing ${provider} with model: ${modelId}`)

    let model: any
    let providerOptions: any
    let headers: Record<string, string> | undefined

    // Build provider-specific options from environment variables
    const customProviderOptions = buildProviderOptions(provider, modelId)

    switch (provider) {
        case "bedrock": {
            // Use client-provided credentials if available, otherwise fall back to IAM/env vars
            const hasClientCredentials =
                overrides?.awsAccessKeyId && overrides?.awsSecretAccessKey
            const bedrockRegion =
                overrides?.awsRegion || process.env.AWS_REGION || "us-west-2"

            const bedrockProvider = hasClientCredentials
                ? createAmazonBedrock({
                      region: bedrockRegion,
                      accessKeyId: overrides.awsAccessKeyId as string,
                      secretAccessKey: overrides.awsSecretAccessKey as string,
                      ...(overrides?.awsSessionToken && {
                          sessionToken: overrides.awsSessionToken,
                      }),
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
                        ...(customProviderOptions?.bedrock || {}),
                    },
                }
            } else if (customProviderOptions) {
                providerOptions = customProviderOptions
            }
            break
        }

        case "openai": {
            const apiKey = resolveApiKey(overrides, "OPENAI_API_KEY")
            const serverBaseUrl = resolveBaseUrlEnv(
                overrides,
                "OPENAI_BASE_URL",
            )
            const baseURL = resolveBaseURL(
                overrides?.apiKey,
                overrides?.baseUrl,
                serverBaseUrl,
            )
            if (baseURL) {
                // Custom base URL = third-party proxy, use Chat Completions API
                // for compatibility (most proxies don't support /responses endpoint)
                const customOpenAI = createOpenAI({ apiKey, baseURL })
                model = customOpenAI.chat(modelId)
            } else if (overrides?.apiKey) {
                // Custom API key but official OpenAI endpoint, use Responses API
                // to support reasoning for gpt-5, o1, o3, o4 models
                const customOpenAI = createOpenAI({ apiKey })
                model = customOpenAI(modelId)
            } else {
                model = openai(modelId)
            }
            break
        }

        case "anthropic": {
            const apiKey = resolveApiKey(overrides, "ANTHROPIC_API_KEY")
            const serverBaseUrl = resolveBaseUrlEnv(
                overrides,
                "ANTHROPIC_BASE_URL",
            )
            const baseURL = resolveBaseURL(
                overrides?.apiKey,
                overrides?.baseUrl,
                serverBaseUrl,
                "https://api.anthropic.com/v1",
            )
            const customProvider = createAnthropic({
                apiKey,
                baseURL,
                headers: ANTHROPIC_BETA_HEADERS,
            })
            model = customProvider(modelId)
            // Add beta headers for fine-grained tool streaming
            headers = ANTHROPIC_BETA_HEADERS
            break
        }

        case "google": {
            const apiKey = resolveApiKey(
                overrides,
                "GOOGLE_GENERATIVE_AI_API_KEY",
            )
            const serverBaseUrl = resolveBaseUrlEnv(
                overrides,
                "GOOGLE_BASE_URL",
            )
            const baseURL = resolveBaseURL(
                overrides?.apiKey,
                overrides?.baseUrl,
                serverBaseUrl,
            )
            if (baseURL || overrides?.apiKey) {
                const customGoogle = createGoogleGenerativeAI({
                    apiKey,
                    ...(baseURL && { baseURL }),
                })
                model = customGoogle(modelId)
            } else {
                model = google(modelId)
            }
            break
        }
        case "vertexai": {
            // Express Mode: Use API key for authentication
            const vertexApiKey =
                overrides?.vertexApiKey || process.env.GOOGLE_VERTEX_API_KEY

            if (!vertexApiKey) {
                throw new Error(
                    "Vertex AI requires an API key for Express Mode. " +
                        "Get one from Google Cloud Console or set GOOGLE_VERTEX_API_KEY environment variable.",
                )
            }

            // Support custom base URL from env or client override
            const baseURL =
                overrides?.baseUrl || process.env.GOOGLE_VERTEX_BASE_URL

            const vertexProvider = createVertex({
                apiKey: vertexApiKey,
                ...(baseURL && { baseURL }),
            })
            model = vertexProvider(modelId)
            break
        }

        case "azure": {
            const apiKey = resolveApiKey(overrides, "AZURE_API_KEY")
            const serverBaseUrl = resolveBaseUrlEnv(overrides, "AZURE_BASE_URL")
            const baseURL = resolveBaseURL(
                overrides?.apiKey,
                overrides?.baseUrl,
                serverBaseUrl,
            )
            // Only use server's resourceName if user is NOT providing their own API key
            const resourceName = overrides?.apiKey
                ? undefined
                : process.env.AZURE_RESOURCE_NAME
            // Azure requires either baseURL or resourceName to construct the endpoint
            // resourceName constructs: https://{resourceName}.openai.azure.com/openai/v1{path}
            if (baseURL || resourceName || overrides?.apiKey) {
                const customAzure = createAzure({
                    apiKey,
                    // baseURL takes precedence over resourceName per SDK behavior
                    ...(baseURL && { baseURL }),
                    ...(!baseURL && resourceName && { resourceName }),
                })
                model = customAzure(modelId)
            } else {
                model = azure(modelId)
            }
            break
        }

        case "ollama": {
            const baseURL = overrides?.baseUrl || process.env.OLLAMA_BASE_URL
            if (baseURL) {
                const customOllama = createOllama({ baseURL })
                model = customOllama(modelId)
            } else {
                model = ollama(modelId)
            }
            break
        }

        case "openrouter": {
            const apiKey = resolveApiKey(overrides, "OPENROUTER_API_KEY")
            const serverBaseUrl = resolveBaseUrlEnv(
                overrides,
                "OPENROUTER_BASE_URL",
            )
            const baseURL = resolveBaseURL(
                overrides?.apiKey,
                overrides?.baseUrl,
                serverBaseUrl,
            )
            const openrouter = createOpenRouter({
                apiKey,
                ...(baseURL && { baseURL }),
            })
            model = openrouter(modelId)
            break
        }

        case "deepseek": {
            const apiKey = resolveApiKey(overrides, "DEEPSEEK_API_KEY")
            const serverBaseUrl = resolveBaseUrlEnv(
                overrides,
                "DEEPSEEK_BASE_URL",
            )
            const baseURL = resolveBaseURL(
                overrides?.apiKey,
                overrides?.baseUrl,
                serverBaseUrl,
            )
            if (baseURL || overrides?.apiKey) {
                const customDeepSeek = createDeepSeek({
                    apiKey,
                    ...(baseURL && { baseURL }),
                })
                model = customDeepSeek(modelId)
            } else {
                model = deepseek(modelId)
            }
            break
        }

        case "siliconflow": {
            const apiKey = resolveApiKey(overrides, "SILICONFLOW_API_KEY")
            const serverBaseUrl = resolveBaseUrlEnv(
                overrides,
                "SILICONFLOW_BASE_URL",
            )
            const baseURL = resolveBaseURL(
                overrides?.apiKey,
                overrides?.baseUrl,
                serverBaseUrl,
                "https://api.siliconflow.cn/v1",
            )
            const siliconflowProvider = createOpenAI({
                apiKey,
                baseURL,
            })
            model = siliconflowProvider.chat(modelId)
            break
        }

        case "sglang": {
            const apiKey = resolveApiKey(overrides, "SGLANG_API_KEY")
            const serverBaseUrl = resolveBaseUrlEnv(
                overrides,
                "SGLANG_BASE_URL",
            )
            const baseURL = resolveBaseURL(
                overrides?.apiKey,
                overrides?.baseUrl,
                serverBaseUrl,
            )

            const sglangProvider = createOpenAI({
                apiKey,
                ...(baseURL && { baseURL }),
                // Add a custom fetch wrapper to intercept and fix the stream from sglang
                fetch: async (url, options) => {
                    const response = await fetch(url, options)
                    if (!response.body) {
                        return response
                    }

                    // Create a transform stream to fix the non-compliant sglang stream
                    let buffer = ""
                    const decoder = new TextDecoder()

                    const transformStream = new TransformStream({
                        transform(chunk, controller) {
                            buffer += decoder.decode(chunk, { stream: true })
                            // Process all complete messages in the buffer
                            let messageEndPos
                            while (
                                (messageEndPos = buffer.indexOf("\n\n")) !== -1
                            ) {
                                const message = buffer.substring(
                                    0,
                                    messageEndPos,
                                )
                                buffer = buffer.substring(messageEndPos + 2) // Move past the '\n\n'

                                if (message.startsWith("data: ")) {
                                    const jsonStr = message.substring(6).trim()
                                    if (jsonStr === "[DONE]") {
                                        controller.enqueue(
                                            new TextEncoder().encode(
                                                message + "\n\n",
                                            ),
                                        )
                                        continue
                                    }
                                    try {
                                        const data = JSON.parse(jsonStr)
                                        const delta = data.choices?.[0]?.delta

                                        if (delta) {
                                            // Fix 1: remove invalid empty role
                                            if (delta.role === "") {
                                                delete delta.role
                                            }
                                            // Fix 2: remove non-standard reasoning_content field
                                            if ("reasoning_content" in delta) {
                                                delete delta.reasoning_content
                                            }
                                        }

                                        // Re-serialize and forward the corrected data with the correct SSE format
                                        controller.enqueue(
                                            new TextEncoder().encode(
                                                `data: ${JSON.stringify(data)}\n\n`,
                                            ),
                                        )
                                    } catch (_e) {
                                        // If parsing fails, forward the original message to avoid breaking the stream.
                                        controller.enqueue(
                                            new TextEncoder().encode(
                                                message + "\n\n",
                                            ),
                                        )
                                    }
                                } else if (message.trim() !== "") {
                                    // Pass through other message types (e.g., 'event: ...')
                                    controller.enqueue(
                                        new TextEncoder().encode(
                                            message + "\n\n",
                                        ),
                                    )
                                }
                            }
                        },
                        flush(controller) {
                            // If there's anything left in the buffer, forward it.
                            if (buffer.trim()) {
                                controller.enqueue(
                                    new TextEncoder().encode(buffer),
                                )
                            }
                        },
                    })

                    const transformedBody =
                        response.body.pipeThrough(transformStream)

                    // Return a new response with the transformed body
                    return new Response(transformedBody, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers,
                    })
                },
            })
            model = sglangProvider.chat(modelId)
            break
        }

        case "gateway": {
            // Vercel AI Gateway - unified access to multiple AI providers
            // Model format: "provider/model" e.g., "openai/gpt-4o", "anthropic/claude-sonnet-4-5"
            // See: https://vercel.com/ai-gateway
            const apiKey = resolveApiKey(overrides, "AI_GATEWAY_API_KEY")
            const serverBaseUrl = resolveBaseUrlEnv(
                overrides,
                "AI_GATEWAY_BASE_URL",
            )
            const baseURL = resolveBaseURL(
                overrides?.apiKey,
                overrides?.baseUrl,
                serverBaseUrl,
            )
            // Only use custom configuration if explicitly set (local dev or custom Gateway)
            // Otherwise undefined → AI SDK uses Vercel default (https://ai-gateway.vercel.sh/v1/ai) + OIDC
            if (baseURL || overrides?.apiKey) {
                const customGateway = createGateway({
                    apiKey,
                    ...(baseURL && { baseURL }),
                })
                model = customGateway(modelId)
            } else {
                model = gateway(modelId)
            }
            break
        }

        case "edgeone": {
            // EdgeOne Pages Edge AI - uses OpenAI-compatible API
            // AI SDK appends /chat/completions to baseURL
            // /api/edgeai + /chat/completions = /api/edgeai/chat/completions
            const baseURL = overrides?.baseUrl || "/api/edgeai"
            const edgeoneProvider = createOpenAI({
                apiKey: "edgeone", // Dummy key - EdgeOne doesn't require API key
                baseURL,
                // Pass cookies for EdgeOne Pages authentication (eo_token, eo_time)
                ...(overrides?.headers && { headers: overrides.headers }),
            })
            model = edgeoneProvider.chat(modelId)
            break
        }

        case "doubao": {
            const apiKey = resolveApiKey(overrides, "DOUBAO_API_KEY")
            const serverBaseUrl = resolveBaseUrlEnv(
                overrides,
                "DOUBAO_BASE_URL",
            )
            const baseURL = resolveBaseURL(
                overrides?.apiKey,
                overrides?.baseUrl,
                serverBaseUrl,
                "https://ark.cn-beijing.volces.com/api/v3",
            )
            const lowerModelId = modelId.toLowerCase()
            // Use DeepSeek provider for DeepSeek/Kimi models, OpenAI for others (multimodal support)
            if (
                lowerModelId.includes("deepseek") ||
                lowerModelId.includes("kimi")
            ) {
                const doubaoProvider = createDeepSeek({
                    apiKey,
                    baseURL,
                })
                model = doubaoProvider(modelId)
            } else {
                const doubaoProvider = createOpenAI({
                    apiKey,
                    baseURL,
                })
                model = doubaoProvider.chat(modelId)
            }
            break
        }

        case "modelscope": {
            const apiKey = resolveApiKey(overrides, "MODELSCOPE_API_KEY")
            const serverBaseUrl = resolveBaseUrlEnv(
                overrides,
                "MODELSCOPE_BASE_URL",
            )
            const baseURL = resolveBaseURL(
                overrides?.apiKey,
                overrides?.baseUrl,
                serverBaseUrl,
                "https://api-inference.modelscope.cn/v1",
            )
            const modelscopeProvider = createOpenAI({
                apiKey,
                baseURL,
            })
            model = modelscopeProvider.chat(modelId)
            break
        }

        default:
            throw new Error(
                `Unknown AI provider: ${provider}. Supported providers: bedrock, openai, anthropic, google, azure, ollama, openrouter, deepseek, siliconflow, sglang, gateway, edgeone, doubao, modelscope`,
            )
    }

    // Apply provider-specific options for all providers except bedrock (which has special handling)
    if (customProviderOptions && provider !== "bedrock" && !providerOptions) {
        providerOptions = customProviderOptions
    }

    return { model, providerOptions, headers, modelId }
}

/**
 * Check if a model supports prompt caching.
 * Currently only Claude models on Bedrock support prompt caching.
 */
export function supportsPromptCaching(modelId: string): boolean {
    // Bedrock prompt caching is supported for Claude models
    return (
        modelId.includes("claude") ||
        modelId.includes("anthropic") ||
        modelId.startsWith("us.anthropic") ||
        modelId.startsWith("eu.anthropic")
    )
}

/**
 * Check if a model supports image/vision input.
 * Some models silently drop image parts without error (AI SDK warning only).
 */
export function supportsImageInput(modelId: string): boolean {
    const lowerModelId = modelId.toLowerCase()

    // Helper to check if model has vision capability indicator
    const hasVisionIndicator =
        lowerModelId.includes("vision") || lowerModelId.includes("vl")

    // Models that DON'T support image/vision input (unless vision variant)
    // Kimi K2 doesn't support images, but K2.5 does
    // Only block kimi-k2 specifically, not other Kimi models
    if (
        (lowerModelId.includes("kimi-k2") ||
            lowerModelId.includes("kimi_k2")) &&
        !hasVisionIndicator &&
        !lowerModelId.includes("2.5") &&
        !lowerModelId.includes("k2.5")
    ) {
        return false
    }

    // DeepSeek text models (not vision variants)
    if (lowerModelId.includes("deepseek") && !hasVisionIndicator) {
        return false
    }

    // Qwen text models (not vision variants like qwen-vl)
    if (lowerModelId.includes("qwen") && !hasVisionIndicator) {
        return false
    }

    // Default: assume model supports images
    return true
}

/**
 * Get the AI model for diagram validation.
 * Uses VALIDATION_MODEL env var if set, otherwise falls back to AI_MODEL.
 * Throws if the model doesn't support image input.
 */
export function getValidationModel(): ReturnType<typeof getAIModel>["model"] {
    const modelId = process.env.VALIDATION_MODEL || process.env.AI_MODEL

    if (!modelId) {
        throw new Error(
            "No validation model configured. Set VALIDATION_MODEL or AI_MODEL.",
        )
    }

    if (!supportsImageInput(modelId)) {
        throw new Error(
            `Validation requires a vision-capable model. Model "${modelId}" does not support image input.`,
        )
    }

    const { model } = getAIModel({ modelId })
    return model
}
