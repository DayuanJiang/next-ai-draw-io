import { bedrock } from '@ai-sdk/amazon-bedrock';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { azure } from '@ai-sdk/azure';
import { ollama } from 'ollama-ai-provider-v2';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

export type ProviderName =
  | 'bedrock'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure'
  | 'ollama'
  | 'openrouter';

interface ModelConfig {
  model: any;
  providerOptions?: any;
}

// Anthropic beta headers for fine-grained tool streaming
const ANTHROPIC_BETA_OPTIONS = {
  anthropic: {
    additionalModelRequestFields: {
      anthropic_beta: ['fine-grained-tool-streaming-2025-05-14']
    }
  }
};

/**
 * Validate that required API keys are present for the selected provider
 */
function validateProviderCredentials(provider: ProviderName): void {
  const requiredEnvVars: Record<ProviderName, string | null> = {
    bedrock: 'AWS_ACCESS_KEY_ID',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_GENERATIVE_AI_API_KEY',
    azure: 'AZURE_API_KEY',
    ollama: null, // No credentials needed for local Ollama
    openrouter: 'OPENROUTER_API_KEY',
  };

  const requiredVar = requiredEnvVars[provider];
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
 * - AI_PROVIDER: The provider to use (bedrock, openai, anthropic, google, azure, ollama, openrouter)
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
 */
export function getAIModel(): ModelConfig {
  const provider = (process.env.AI_PROVIDER || 'bedrock') as ProviderName;
  const modelId = process.env.AI_MODEL;

  if (!modelId) {
    throw new Error(
      `AI_MODEL environment variable is required. Example: AI_MODEL=claude-sonnet-4-5`
    );
  }

  // Validate provider credentials
  validateProviderCredentials(provider);

  // Log initialization for debugging
  console.log(`[AI Provider] Initializing ${provider} with model: ${modelId}`);

  let model: any;
  let providerOptions: any = undefined;

  switch (provider) {
    case 'bedrock':
      model = bedrock(modelId);
      // Add Anthropic beta headers if using Claude models via Bedrock
      if (modelId.includes('anthropic.claude')) {
        providerOptions = ANTHROPIC_BETA_OPTIONS;
      }
      break;

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
      model = anthropic(modelId);
      // Add beta headers for fine-grained tool streaming
      providerOptions = ANTHROPIC_BETA_OPTIONS;
      break;

    case 'google':
      model = google(modelId);
      break;

    case 'azure':
      model = azure(modelId);
      break;

    case 'ollama':
      model = ollama(modelId);
      break;

    case 'openrouter':
      const openrouter = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
      });
      model = openrouter(modelId);
      break;

    default:
      throw new Error(
        `Unknown AI provider: ${provider}. Supported providers: bedrock, openai, anthropic, google, azure, ollama, openrouter`
      );
  }

  // Log if provider options are being applied
  if (providerOptions) {
    console.log('[AI Provider] Applying provider-specific options');
  }

  return { model, providerOptions };
}
