import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { azure, createAzure } from '@ai-sdk/azure';
import { ollama, createOllama } from 'ollama-ai-provider-v2';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { deepseek, createDeepSeek } from '@ai-sdk/deepseek';

export type ProviderName =
  | 'bedrock'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure'
  | 'ollama'
  | 'openrouter'
  | 'deepseek';

interface ModelConfig {
  model: any;
  providerOptions?: any;
  headers?: Record<string, string>;
  modelId: string;
}

// Bedrock provider options for Anthropic beta features
const BEDROCK_ANTHROPIC_BETA = {
  bedrock: {
    anthropicBeta: ['fine-grained-tool-streaming-2025-05-14'],
  },
};

// Direct Anthropic API headers for beta features
const ANTHROPIC_BETA_HEADERS = {
  'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14',
};

// Map of provider to required environment variable
const PROVIDER_ENV_VARS: Record<ProviderName, string | null> = {
  bedrock: null, // AWS SDK auto-uses IAM role on AWS, or env vars locally
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  azure: 'AZURE_API_KEY',
  ollama: null, // No credentials needed for local Ollama
  openrouter: 'OPENROUTER_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

/**
 * Auto-detect provider based on available API keys
 * Returns the provider if exactly one is configured, otherwise null
 */
function detectProvider(): ProviderName | null {
  const configuredProviders: ProviderName[] = [];

  for (const [provider, envVar] of Object.entries(PROVIDER_ENV_VARS)) {
    if (envVar === null) {
      // Skip ollama - it doesn't require credentials
      continue;
    }
    if (process.env[envVar]) {
      configuredProviders.push(provider as ProviderName);
    }
  }

  if (configuredProviders.length === 1) {
    return configuredProviders[0];
  }

  return null;
}

/**
 * Validate that required API keys are present for the selected provider
 */
function validateProviderCredentials(provider: ProviderName): void {
  const requiredVar = PROVIDER_ENV_VARS[provider];
  if (requiredVar && !process.env[requiredVar]) {
    throw new Error(
      `${requiredVar} environment variable is required for ${provider} provider. ` +
      `Please set it in your .env.local file.`
    );
  }
}

/**
 * Get the AI model based on environment variables
 *
 * Environment variables:
 * - AI_PROVIDER: The provider to use (bedrock, openai, anthropic, google, azure, ollama, openrouter, deepseek)
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
 */
export function getAIModel(): ModelConfig {
  const modelId = process.env.AI_MODEL;

  if (!modelId) {
    throw new Error(
      `AI_MODEL environment variable is required. Example: AI_MODEL=claude-sonnet-4-5`
    );
  }

  // Determine provider: explicit config > auto-detect > error
  let provider: ProviderName;
  if (process.env.AI_PROVIDER) {
    provider = process.env.AI_PROVIDER as ProviderName;
  } else {
    const detected = detectProvider();
    if (detected) {
      provider = detected;
      console.log(`[AI Provider] Auto-detected provider: ${provider}`);
    } else {
      // List configured providers for better error message
      const configured = Object.entries(PROVIDER_ENV_VARS)
        .filter(([, envVar]) => envVar && process.env[envVar as string])
        .map(([p]) => p);

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
          `Or set AI_PROVIDER=ollama for local Ollama.`
        );
      } else {
        throw new Error(
          `Multiple AI providers configured (${configured.join(', ')}). ` +
          `Please set AI_PROVIDER to specify which one to use.`
        );
      }
    }
  }

  // Validate provider credentials
  validateProviderCredentials(provider);

  console.log(`[AI Provider] Initializing ${provider} with model: ${modelId}`);

  let model: any;
  let providerOptions: any = undefined;
  let headers: Record<string, string> | undefined = undefined;

  switch (provider) {
    case 'bedrock': {
      // Use credential provider chain for IAM role support (Amplify, Lambda, etc.)
      // Falls back to env vars (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) for local dev
      const bedrockProvider = createAmazonBedrock({
        region: process.env.AWS_REGION || 'us-west-2',
        credentialProvider: fromNodeProviderChain(),
      });
      model = bedrockProvider(modelId);
      // Add Anthropic beta options if using Claude models via Bedrock
      if (modelId.includes('anthropic.claude')) {
        providerOptions = BEDROCK_ANTHROPIC_BETA;
      }
      break;
    }

    case 'openai':
      if (process.env.OPENAI_BASE_URL) {
        const customOpenAI = createOpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          baseURL: process.env.OPENAI_BASE_URL,
        });
        model = customOpenAI.chat(modelId);
      } else {
        model = openai(modelId);
      }
      break;

    case 'anthropic':
      const customProvider = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
        headers: ANTHROPIC_BETA_HEADERS,
      });
      model = customProvider(modelId);
      // Add beta headers for fine-grained tool streaming
      headers = ANTHROPIC_BETA_HEADERS;
      break;

    case 'google':
      if (process.env.GOOGLE_BASE_URL) {
        const customGoogle = createGoogleGenerativeAI({
          apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
          baseURL: process.env.GOOGLE_BASE_URL,
        });
        model = customGoogle(modelId);
      } else {
        model = google(modelId);
      }
      break;

    case 'azure':
      if (process.env.AZURE_BASE_URL) {
        const customAzure = createAzure({
          apiKey: process.env.AZURE_API_KEY,
          baseURL: process.env.AZURE_BASE_URL,
        });
        model = customAzure(modelId);
      } else {
        model = azure(modelId);
      }
      break;

    case 'ollama':
      if (process.env.OLLAMA_BASE_URL) {
        const customOllama = createOllama({
          baseURL: process.env.OLLAMA_BASE_URL,
        });
        model = customOllama(modelId);
      } else {
        model = ollama(modelId);
      }
      break;

    case 'openrouter':
      const openrouter = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
        ...(process.env.OPENROUTER_BASE_URL && { baseURL: process.env.OPENROUTER_BASE_URL }),
      });
      model = openrouter(modelId);
      break;

    case 'deepseek':
      if (process.env.DEEPSEEK_BASE_URL) {
        const customDeepSeek = createDeepSeek({
          apiKey: process.env.DEEPSEEK_API_KEY,
          baseURL: process.env.DEEPSEEK_BASE_URL,
        });
        model = customDeepSeek(modelId);
      } else {
        model = deepseek(modelId);
      }
      break;

    default:
      throw new Error(
        `Unknown AI provider: ${provider}. Supported providers: bedrock, openai, anthropic, google, azure, ollama, openrouter, deepseek`
      );
  }

  return { model, providerOptions, headers, modelId };
}
