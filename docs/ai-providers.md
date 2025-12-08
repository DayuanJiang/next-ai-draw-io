# AI Provider Configuration

This guide explains how to configure different AI model providers for next-ai-draw-io.

## Quick Start

1. Copy `.env.example` to `.env.local`
2. Set your API key for your chosen provider
3. Set `AI_MODEL` to your desired model
4. Run `npm run dev`

## Supported Providers

### Google Gemini

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key
AI_MODEL=gemini-2.0-flash
```

Optional custom endpoint:

```bash
GOOGLE_BASE_URL=https://your-custom-endpoint
```

### OpenAI

```bash
OPENAI_API_KEY=your_api_key
AI_MODEL=gpt-4o
```

Optional custom endpoint (for OpenAI-compatible services):

```bash
OPENAI_BASE_URL=https://your-custom-endpoint/v1
```

### Anthropic

```bash
ANTHROPIC_API_KEY=your_api_key
AI_MODEL=claude-sonnet-4-5-20250514
```

Optional custom endpoint:

```bash
ANTHROPIC_BASE_URL=https://your-custom-endpoint
```

### DeepSeek

```bash
DEEPSEEK_API_KEY=your_api_key
AI_MODEL=deepseek-chat
```

Optional custom endpoint:

```bash
DEEPSEEK_BASE_URL=https://your-custom-endpoint
```

### SiliconFlow (OpenAI-compatible)

```bash
SILICONFLOW_API_KEY=your_api_key
AI_MODEL=deepseek-ai/DeepSeek-V3  # example; use any SiliconFlow model id
```

Optional custom endpoint (defaults to the recommended domain):

```bash
SILICONFLOW_BASE_URL=https://api.siliconflow.com/v1  # or https://api.siliconflow.cn/v1
```

### Azure OpenAI

```bash
AZURE_API_KEY=your_api_key
AI_MODEL=your-deployment-name
```

Optional custom endpoint:

```bash
AZURE_BASE_URL=https://your-resource.openai.azure.com
```

### AWS Bedrock

```bash
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AI_MODEL=anthropic.claude-sonnet-4-5-20250514-v1:0
```

Note: On AWS (Lambda, EC2 with IAM role), credentials are automatically obtained from the IAM role.

### OpenRouter

```bash
OPENROUTER_API_KEY=your_api_key
AI_MODEL=anthropic/claude-sonnet-4
```

Optional custom endpoint:

```bash
OPENROUTER_BASE_URL=https://your-custom-endpoint
```

### Ollama (Local)

```bash
AI_PROVIDER=ollama
AI_MODEL=llama3.2
```

Optional custom URL:

```bash
OLLAMA_BASE_URL=http://localhost:11434
```

## Auto-Detection

If you only configure **one** provider's API key, the system will automatically detect and use that provider. No need to set `AI_PROVIDER`.

If you configure **multiple** API keys, you must explicitly set `AI_PROVIDER`:

```bash
AI_PROVIDER=google  # or: openai, anthropic, deepseek, siliconflow, azure, bedrock, openrouter, ollama
```

## Model Capability Requirements

This task requires exceptionally strong model capabilities, as it involves generating long-form text with strict formatting constraints (draw.io XML).

**Recommended models**:

-   Claude Sonnet 4.5 / Opus 4.5

**Note on Ollama**: While Ollama is supported as a provider, it's generally not practical for this use case unless you're running high-capability models like DeepSeek R1 or Qwen3-235B locally.

## Temperature Setting

You can optionally configure the temperature via environment variable:

```bash
TEMPERATURE=0  # More deterministic output (recommended for diagrams)
```

**Important**: Leave `TEMPERATURE` unset for models that don't support temperature settings, such as:
- GPT-5.1 and other reasoning models
- Some specialized models

When unset, the model uses its default behavior.

## Recommendations

-   **Best experience**: Use models with vision support (GPT-4o, Claude, Gemini) for image-to-diagram features
-   **Budget-friendly**: DeepSeek offers competitive pricing
-   **Privacy**: Use Ollama for fully local, offline operation (requires powerful hardware)
-   **Flexibility**: OpenRouter provides access to many models through a single API
