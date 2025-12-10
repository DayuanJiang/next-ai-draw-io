import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock"
import { createAnthropic } from "@ai-sdk/anthropic"
import { azure, createAzure } from "@ai-sdk/azure"
import { createDeepSeek, deepseek } from "@ai-sdk/deepseek"
import { createGoogleGenerativeAI, google } from "@ai-sdk/google"
import { createOpenAI, openai } from "@ai-sdk/openai"
import { fromNodeProviderChain } from "@aws-sdk/credential-providers"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { createOllama, ollama } from "ollama-ai-provider-v2"

export type ProviderName =
    | "bedrock"
    | "openai"
    | "anthropic"
    | "google"
    | "azure"
    | "ollama"
    | "openrouter"
    | "deepseek"
    | "siliconflow"

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
}

// Providers that can be used with client-provided API keys
const ALLOWED_CLIENT_PROVIDERS: ProviderName[] = [
    "openai",
    "anthropic",
    "google",
    "azure",
    "openrouter",
    "deepseek",
    "siliconflow",
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
 * Build provider-specific options from environment variables
 * Supports various AI SDK providers with their unique configuration options
 *
 * Environment variables:
 * - OPENAI_REASONING_EFFORT: OpenAI reasoning effort level (low, medium, high)
 * - OPENAI_REASONING_SUMMARY: OpenAI reasoning summary (none, brief, detailed)
 * - ANTHROPIC_THINKING_BUDGET_TOKENS: Anthropic thinking budget in tokens
 * - ANTHROPIC_THINKING_TYPE: Anthropic thinking type (enabled)
 * - GOOGLE_REASONING_EFFORT: Google reasoning effort (low, medium, high)
 * - AZURE_REASONING_EFFORT: Azure/OpenAI reasoning effort (low, medium, high)
 * - DEEPSEEK_REASONING_EFFORT: DeepSeek reasoning effort (low, medium, high)
 * - DEEPSEEK_REASONING_BUDGET_TOKENS: DeepSeek reasoning budget in tokens
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

            // OpenAI reasoning models (o1, o3, gpt-5) need reasoningSummary to return thoughts
            if (
                modelId &&
                (modelId.includes("o1") ||
                    modelId.includes("o3") ||
                    modelId.includes("gpt-5"))
            ) {
                options.openai = {
                    // Auto-enable reasoning summary for reasoning models (default: detailed)
                    reasoningSummary:
                        (reasoningSummary as "none" | "brief" | "detailed") ||
                        "detailed",
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
                        | "none"
                        | "brief"
                        | "detailed"
                }
            }
            break
        }

        case "anthropic": {
            const thinkingBudget = process.env.ANTHROPIC_THINKING_BUDGET_TOKENS
            const thinkingType =
                process.env.ANTHROPIC_THINKING_TYPE || "enabled"

            if (thinkingBudget) {
                options.anthropic = {
                    thinking: {
                        type: thinkingType,
                        budgetTokens: parseInt(thinkingBudget, 10),
                    },
                }
            }
            break
        }

        case "google": {
            const reasoningEffort = process.env.GOOGLE_REASONING_EFFORT
            const thinkingBudget = process.env.GOOGLE_THINKING_BUDGET
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
                    thinkingBudget &&
                    (modelId.includes("2.5") || modelId.includes("2-5"))
                ) {
                    thinkingConfig.thinkingBudget = parseInt(thinkingBudget, 10)
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
            if (process.env.GOOGLE_CANDIDATE_COUNT) {
                options_obj.candidateCount = parseInt(
                    process.env.GOOGLE_CANDIDATE_COUNT,
                    10,
                )
            }
            if (process.env.GOOGLE_TOP_K) {
                options_obj.topK = parseInt(process.env.GOOGLE_TOP_K, 10)
            }
            if (process.env.GOOGLE_TOP_P) {
                options_obj.topP = parseFloat(process.env.GOOGLE_TOP_P)
            }

            if (Object.keys(options_obj).length > 0) {
                options.google = { ...options.google, ...options_obj }
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
            const budgetTokens = process.env.BEDROCK_REASONING_BUDGET_TOKENS
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
                    reasoningConfig.budgetTokens = parseInt(budgetTokens, 10)
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
        case "siliconflow": {
            // These providers don't have reasoning configs in AI SDK yet
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
    azure: "AZURE_API_KEY",
    ollama: null, // No credentials needed for local Ollama
    openrouter: "OPENROUTER_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    siliconflow: "SILICONFLOW_API_KEY",
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
            configuredProviders.push(provider as ProviderName)
        }
    }

    if (configuredProviders.length === 1) {
        return configuredProviders[0]
    }

    return null
}

/**
 * Validate that required API keys are present for the selected provider
 */
function validateProviderCredentials(provider: ProviderName): void {
    const requiredVar = PROVIDER_ENV_VARS[provider]
    if (requiredVar && !process.env[requiredVar]) {
        throw new Error(
            `${requiredVar} environment variable is required for ${provider} provider. ` +
                `Please set it in your .env.local file.`,
        )
    }
}

/**
 * Get the AI model based on environment variables
 *
 * Environment variables:
 * - AI_PROVIDER: The provider to use (bedrock, openai, anthropic, google, azure, ollama, openrouter, deepseek, siliconflow)
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
 * - SILICONFLOW_BASE_URL: SiliconFlow endpoint (optional, defaults to https://api.siliconflow.com/v1)
 */
export function getAIModel(overrides?: ClientOverrides): ModelConfig {
    // Check if client is providing their own provider override
    const isClientOverride = !!(overrides?.provider && overrides?.apiKey)

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
                        `- DEEPSEEK_API_KEY for DeepSeek\n` +
                        `- OPENAI_API_KEY for OpenAI\n` +
                        `- ANTHROPIC_API_KEY for Anthropic\n` +
                        `- GOOGLE_GENERATIVE_AI_API_KEY for Google\n` +
                        `- AWS_ACCESS_KEY_ID for Bedrock\n` +
                        `- OPENROUTER_API_KEY for OpenRouter\n` +
                        `- AZURE_API_KEY for Azure\n` +
                        `- SILICONFLOW_API_KEY for SiliconFlow\n` +
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
        validateProviderCredentials(provider)
    }

    console.log(`[AI Provider] Initializing ${provider} with model: ${modelId}`)

    let model: any
    let providerOptions: any
    let headers: Record<string, string> | undefined

    // Build provider-specific options from environment variables
    const customProviderOptions = buildProviderOptions(provider, modelId)

    switch (provider) {
        case "bedrock": {
            // Use credential provider chain for IAM role support (Lambda, EC2, etc.)
            // Falls back to env vars (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) for local dev
            const bedrockProvider = createAmazonBedrock({
                region: process.env.AWS_REGION || "us-west-2",
                credentialProvider: fromNodeProviderChain(),
            })
            model = bedrockProvider(modelId)
            // Add Anthropic beta options if using Claude models via Bedrock
            if (modelId.includes("anthropic.claude")) {
                providerOptions = {
                    ...BEDROCK_ANTHROPIC_BETA,
                    ...(customProviderOptions || {}),
                }
            } else if (customProviderOptions) {
                providerOptions = customProviderOptions
            }
            break
        }

        case "openai": {
            const apiKey = overrides?.apiKey || process.env.OPENAI_API_KEY
            const baseURL = overrides?.baseUrl || process.env.OPENAI_BASE_URL
            if (baseURL || overrides?.apiKey) {
                const customOpenAI = createOpenAI({
                    apiKey,
                    ...(baseURL && { baseURL }),
                })
                model = customOpenAI.chat(modelId)
            } else {
                model = openai(modelId)
            }
            if (customProviderOptions) {
                providerOptions = customProviderOptions
            }
            break
        }

        case "anthropic": {
            const apiKey = overrides?.apiKey || process.env.ANTHROPIC_API_KEY
            const baseURL =
                overrides?.baseUrl ||
                process.env.ANTHROPIC_BASE_URL ||
                "https://api.anthropic.com/v1"
            const customProvider = createAnthropic({
                apiKey,
                baseURL,
                headers: ANTHROPIC_BETA_HEADERS,
            })
            model = customProvider(modelId)
            // Add beta headers for fine-grained tool streaming
            headers = ANTHROPIC_BETA_HEADERS
            if (customProviderOptions) {
                providerOptions = customProviderOptions
            }
            break
        }

        case "google": {
            const apiKey =
                overrides?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY
            const baseURL = overrides?.baseUrl || process.env.GOOGLE_BASE_URL
            if (baseURL || overrides?.apiKey) {
                const customGoogle = createGoogleGenerativeAI({
                    apiKey,
                    ...(baseURL && { baseURL }),
                })
                model = customGoogle(modelId)
            } else {
                model = google(modelId)
            }
            if (customProviderOptions) {
                providerOptions = customProviderOptions
            }
            break
        }

        case "azure": {
            const apiKey = overrides?.apiKey || process.env.AZURE_API_KEY
            const baseURL = overrides?.baseUrl || process.env.AZURE_BASE_URL
            if (baseURL || overrides?.apiKey) {
                const customAzure = createAzure({
                    apiKey,
                    ...(baseURL && { baseURL }),
                })
                model = customAzure(modelId)
            } else {
                model = azure(modelId)
            }
            if (customProviderOptions) {
                providerOptions = customProviderOptions
            }
            break
        }

        case "ollama":
            if (process.env.OLLAMA_BASE_URL) {
                const customOllama = createOllama({
                    baseURL: process.env.OLLAMA_BASE_URL,
                })
                model = customOllama(modelId)
            } else {
                model = ollama(modelId)
            }
            break

        case "openrouter": {
            const apiKey = overrides?.apiKey || process.env.OPENROUTER_API_KEY
            const baseURL =
                overrides?.baseUrl || process.env.OPENROUTER_BASE_URL
            const openrouter = createOpenRouter({
                apiKey,
                ...(baseURL && { baseURL }),
            })
            model = openrouter(modelId)
            if (customProviderOptions) {
                providerOptions = customProviderOptions
            }
            break
        }

        case "deepseek": {
            const apiKey = overrides?.apiKey || process.env.DEEPSEEK_API_KEY
            const baseURL = overrides?.baseUrl || process.env.DEEPSEEK_BASE_URL
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
            const apiKey = overrides?.apiKey || process.env.SILICONFLOW_API_KEY
            const baseURL =
                overrides?.baseUrl ||
                process.env.SILICONFLOW_BASE_URL ||
                "https://api.siliconflow.com/v1"
            const siliconflowProvider = createOpenAI({
                apiKey,
                baseURL,
            })
            model = siliconflowProvider.chat(modelId)
            if (customProviderOptions) {
                providerOptions = customProviderOptions
            }
            break
        }

        default:
            throw new Error(
                `Unknown AI provider: ${provider}. Supported providers: bedrock, openai, anthropic, google, azure, ollama, openrouter, deepseek, siliconflow`,
            )
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
