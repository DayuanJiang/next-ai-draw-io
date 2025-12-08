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
 * - ANTHROPIC_THINKING_BUDGET_TOKENS: Anthropic thinking budget in tokens
 * - ANTHROPIC_THINKING_TYPE: Anthropic thinking type (enabled)
 * - GOOGLE_CANDIDATE_COUNT: Google number of candidates to generate
 * - GOOGLE_TOP_K: Google top K value for sampling
 * - GOOGLE_TOP_P: Google nucleus sampling parameter
 * - AZURE_REASONING_EFFORT: Azure/OpenAI reasoning effort (low, medium, high)
 * - DEEPSEEK_REASONING_EFFORT: DeepSeek reasoning effort (low, medium, high)
 * - DEEPSEEK_REASONING_BUDGET_TOKENS: DeepSeek reasoning budget in tokens
 */
function buildProviderOptions(
    provider: ProviderName,
): Record<string, any> | undefined {
    const options: Record<string, any> = {}

    switch (provider) {
        case "openai": {
            const reasoningEffort = process.env.OPENAI_REASONING_EFFORT
            if (reasoningEffort) {
                options.openai = {
                    reasoningEffort: reasoningEffort as
                        | "low"
                        | "medium"
                        | "high",
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
                options.google = options_obj
            }
            break
        }

        case "azure": {
            const reasoningEffort = process.env.AZURE_REASONING_EFFORT
            if (reasoningEffort) {
                options.azure = {
                    reasoningEffort: reasoningEffort as
                        | "low"
                        | "medium"
                        | "high",
                }
            }
            break
        }

        case "deepseek": {
            const options_obj: Record<string, any> = {}
            const reasoningEffort = process.env.DEEPSEEK_REASONING_EFFORT
            const reasoningBudget = process.env.DEEPSEEK_REASONING_BUDGET_TOKENS

            if (reasoningEffort || reasoningBudget) {
                options_obj.reasoning = {}
                if (reasoningEffort) {
                    ;(options_obj.reasoning as any).effort = reasoningEffort
                }
                if (reasoningBudget) {
                    ;(options_obj.reasoning as any).budgetTokens = parseInt(
                        reasoningBudget,
                        10,
                    )
                }
            }

            if (Object.keys(options_obj).length > 0) {
                options.deepseek = options_obj
            }
            break
        }

        case "bedrock": {
            // Bedrock-specific options handled separately
            break
        }

        case "ollama":
        case "openrouter":
        case "siliconflow": {
            // These providers have limited provider-specific options in the AI SDK
            // Add support here as new options become available
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
export function getAIModel(): ModelConfig {
    const modelId = process.env.AI_MODEL

    if (!modelId) {
        throw new Error(
            `AI_MODEL environment variable is required. Example: AI_MODEL=claude-sonnet-4-5`,
        )
    }

    // Determine provider: explicit config > auto-detect > error
    let provider: ProviderName
    if (process.env.AI_PROVIDER) {
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

    // Validate provider credentials
    validateProviderCredentials(provider)

    console.log(`[AI Provider] Initializing ${provider} with model: ${modelId}`)

    let model: any
    let providerOptions: any
    let headers: Record<string, string> | undefined

    // Build provider-specific options from environment variables
    const customProviderOptions = buildProviderOptions(provider)

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
                providerOptions = BEDROCK_ANTHROPIC_BETA
            } else if (customProviderOptions) {
                providerOptions = customProviderOptions
            }
            break
        }

        case "openai":
            if (process.env.OPENAI_BASE_URL) {
                const customOpenAI = createOpenAI({
                    apiKey: process.env.OPENAI_API_KEY,
                    baseURL: process.env.OPENAI_BASE_URL,
                })
                model = customOpenAI.chat(modelId)
            } else {
                model = openai(modelId)
            }
            if (customProviderOptions) {
                providerOptions = customProviderOptions
            }
            break

        case "anthropic": {
            const customProvider = createAnthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
                baseURL:
                    process.env.ANTHROPIC_BASE_URL ||
                    "https://api.anthropic.com/v1",
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

        case "google":
            if (process.env.GOOGLE_BASE_URL) {
                const customGoogle = createGoogleGenerativeAI({
                    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
                    baseURL: process.env.GOOGLE_BASE_URL,
                })
                model = customGoogle(modelId)
            } else {
                model = google(modelId)
            }
            if (customProviderOptions) {
                providerOptions = customProviderOptions
            }
            break

        case "azure":
            if (process.env.AZURE_BASE_URL) {
                const customAzure = createAzure({
                    apiKey: process.env.AZURE_API_KEY,
                    baseURL: process.env.AZURE_BASE_URL,
                })
                model = customAzure(modelId)
            } else {
                model = azure(modelId)
            }
            if (customProviderOptions) {
                providerOptions = customProviderOptions
            }
            break

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
            const openrouter = createOpenRouter({
                apiKey: process.env.OPENROUTER_API_KEY,
                ...(process.env.OPENROUTER_BASE_URL && {
                    baseURL: process.env.OPENROUTER_BASE_URL,
                }),
            })
            model = openrouter(modelId)
            if (customProviderOptions) {
                providerOptions = customProviderOptions
            }
            break
        }

        case "deepseek":
            if (process.env.DEEPSEEK_BASE_URL) {
                const customDeepSeek = createDeepSeek({
                    apiKey: process.env.DEEPSEEK_API_KEY,
                    baseURL: process.env.DEEPSEEK_BASE_URL,
                })
                model = customDeepSeek(modelId)
            } else {
                model = deepseek(modelId)
            }
            if (customProviderOptions) {
                providerOptions = customProviderOptions
            }
            break

        case "siliconflow": {
            const siliconflowProvider = createOpenAI({
                apiKey: process.env.SILICONFLOW_API_KEY,
                baseURL:
                    process.env.SILICONFLOW_BASE_URL ||
                    "https://api.siliconflow.com/v1",
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
