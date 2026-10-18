# AI providers

When you host Next AI Draw.io yourself, environment variables choose the AI provider and the model. This page shows the variables for each provider, how to offer several models to all users, and how to add a new provider to the code.

## Get started

1. Copy `env.example` to `.env.local`.
2. Set the API key of the provider you chose.
3. Set `AI_MODEL` to the model you want.
4. Run `npm run dev`.

## Set up each provider

### OpenAI

```bash
OPENAI_API_KEY=your_api_key
AI_MODEL=gpt-4o
```

Optionally, set a custom endpoint for an OpenAI-compatible service:

```bash
OPENAI_BASE_URL=https://your-custom-endpoint/v1
```

LM Studio and other local OpenAI-compatible servers work the same way. Set the base URL to `http://localhost:1234/v1` (LM Studio's default port) and use any non-empty API key, such as `lm-studio`. This works with the environment variables above and in the Models tab of Settings.

### Anthropic

```bash
ANTHROPIC_API_KEY=your_api_key
AI_MODEL=claude-sonnet-4-5-20250929
```

You can also sign in with a Bearer token, for example when you go through a gateway that issues OAuth-style tokens:

```bash
ANTHROPIC_AUTH_TOKEN=your_auth_token
AI_MODEL=claude-sonnet-4-5-20250929
```

`ANTHROPIC_API_KEY` is sent as the `x-api-key` header, and `ANTHROPIC_AUTH_TOKEN` is sent as `Authorization: Bearer <token>`. The two cannot be used together, so set only one.

Optionally, set a custom endpoint:

```bash
ANTHROPIC_BASE_URL=https://your-custom-endpoint
```

### Google Gemini

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key
AI_MODEL=gemini-2.0-flash
```

Optionally, set a custom endpoint:

```bash
GOOGLE_BASE_URL=https://your-custom-endpoint
```

### DeepSeek

```bash
DEEPSEEK_API_KEY=your_api_key
AI_MODEL=deepseek-chat
```

Optionally, set a custom endpoint:

```bash
DEEPSEEK_BASE_URL=https://your-custom-endpoint
```

### Qwen (Alibaba Cloud)

```bash
QWEN_API_KEY=your_api_key
AI_MODEL=qwen-turbo
```

Optionally, set a custom endpoint:

```bash
QWEN_BASE_URL=https://your-custom-endpoint
```

### Doubao (ByteDance Volcengine)

```bash
DOUBAO_API_KEY=your_api_key
AI_MODEL=doubao-seed-1-8-251228  # or other Doubao model
```

### GLM (Zhipu AI)

```bash
GLM_API_KEY=your_api_key
AI_MODEL=glm-4
```

Optionally, set a custom endpoint:

```bash
GLM_BASE_URL=https://your-custom-endpoint
```

### Kimi (Moonshot AI)

```bash
KIMI_API_KEY=your_api_key
AI_MODEL=kimi-latest
```

Optionally, set a custom endpoint:

```bash
KIMI_BASE_URL=https://your-custom-endpoint
```

### MiniMax

MiniMax supports two API formats:

| Format | Endpoint | Notes |
|---|---|---|
| Anthropic-compatible | `/anthropic` | Recommended. Supports interleaved thinking, where the model can think between tool calls |
| OpenAI-compatible | `/v1` | The standard OpenAI chat completions format |

```bash
MINIMAX_API_KEY=your_api_key
AI_MODEL=MiniMax-M3
```

Optional settings:

```bash
# China mainland, Anthropic-compatible (default)
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic

# China mainland, OpenAI-compatible
MINIMAX_BASE_URL=https://api.minimaxi.com/v1

# International, Anthropic-compatible
MINIMAX_BASE_URL=https://api.minimax.io/anthropic

# International, OpenAI-compatible
MINIMAX_BASE_URL=https://api.minimax.io/v1
```

### MiMo (Xiaomi)

```bash
MIMO_API_KEY=your_api_key
AI_MODEL=mimo-v2.5-pro
```

Optionally, set a custom endpoint. Token Plan subscribers should set their dedicated base URL:

```bash
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
```

### OpenRouter

```bash
OPENROUTER_API_KEY=your_api_key
AI_MODEL=anthropic/claude-sonnet-4
```

Optionally, set a custom endpoint:

```bash
OPENROUTER_BASE_URL=https://your-custom-endpoint
```

### AIHubMix

AIHubMix gives you Claude, GPT, Gemini, DeepSeek and other models with one API key.

```bash
AIHUBMIX_API_KEY=your_api_key
AI_MODEL=claude-sonnet-4-5-20250929
```

Optionally, set a custom endpoint:

```bash
AIHUBMIX_BASE_URL=https://aihubmix.com/v1
```

### SiliconFlow (OpenAI-compatible)

```bash
SILICONFLOW_API_KEY=your_api_key
AI_MODEL=deepseek-ai/DeepSeek-V3  # example; use any SiliconFlow model id
```

Without a base URL, the app uses `https://api.siliconflow.cn/v1`, the endpoint for keys from cloud.siliconflow.cn. If your key comes from the international site, cloud.siliconflow.com, set the .com endpoint:

```bash
SILICONFLOW_BASE_URL=https://api.siliconflow.com/v1
```

### ModelScope

```bash
MODELSCOPE_API_KEY=your_api_key
AI_MODEL=Qwen/Qwen3-235B-A22B-Instruct-2507
```

Optionally, set a custom endpoint:

```bash
MODELSCOPE_BASE_URL=https://your-custom-endpoint
```

### Novita AI

```bash
NOVITA_API_KEY=your_api_key
AI_MODEL=deepseek/deepseek-v4-pro
```

Optionally, set a custom endpoint. Without one, `https://api.novita.ai/openai` is used:

```bash
NOVITA_BASE_URL=https://your-custom-endpoint
```

### Atlas Cloud

```bash
ATLASCLOUD_API_KEY=your_api_key
AI_MODEL=your_model_id
```

The app has no built-in model list for Atlas Cloud. In the Models tab of Settings, it loads the list from Atlas Cloud with your key.

Optionally, set a custom endpoint. Without one, `https://api.atlascloud.ai/v1` is used:

```bash
ATLASCLOUD_BASE_URL=https://your-custom-endpoint
```

### Qiniu (Qiniu Cloud)

```bash
QINIU_API_KEY=your_api_key
AI_MODEL=your_model_id
```

Optionally, set a custom endpoint:

```bash
QINIU_BASE_URL=https://your-custom-endpoint
```

### Vercel AI Gateway

Vercel AI Gateway gives you many AI providers through one API key. Signing in is simpler, and you can switch providers without managing several API keys.

With the gateway that Vercel hosts:

```bash
AI_GATEWAY_API_KEY=your_gateway_api_key
AI_MODEL=openai/gpt-4o
```

With a custom gateway URL, for local development or a self-hosted gateway:

```bash
AI_GATEWAY_API_KEY=your_custom_api_key
AI_GATEWAY_BASE_URL=https://your-custom-gateway.com/v1/ai
AI_MODEL=openai/gpt-4o
```

Model ids take the form `provider/model`:

| `AI_MODEL` | Model |
|---|---|
| `openai/gpt-4o` | OpenAI GPT-4o |
| `anthropic/claude-sonnet-4-5` | Anthropic Claude Sonnet 4.5 |
| `google/gemini-2.0-flash` | Google Gemini 2.0 Flash |

If `AI_GATEWAY_BASE_URL` is not set, the default Vercel Gateway URL (`https://ai-gateway.vercel.sh/v1/ai`) is used. A custom base URL is useful for:

- Local development with your own Gateway instance
- Self-hosted AI Gateway deployments
- Enterprise proxy setups

When you use a custom base URL, you must also set `AI_GATEWAY_API_KEY`.

Get your API key from the [Vercel AI Gateway dashboard](https://vercel.com/ai-gateway).

### Amazon Bedrock

```bash
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AI_MODEL=global.anthropic.claude-sonnet-5-5
```

Recent Claude models answer only through an inference profile id. This id starts with a region prefix such as `global.` or `us.`. The plain id (`anthropic.claude-sonnet-5-5`) fails with "on-demand throughput isn't supported".

On AWS (Lambda, or EC2 with an IAM role), the credentials come from the IAM role automatically.

### Google Vertex AI

Google Vertex AI is Google Cloud's service for companies, with enterprise features and data residency (your data stays in the region you choose). Its Express Mode signs in with a plain API key, so it also works on edge runtimes such as Vercel and Cloudflare.

```bash
GOOGLE_VERTEX_API_KEY=your_api_key
AI_MODEL=gemini-2.0-flash
```

Optionally, set a custom endpoint:

```bash
GOOGLE_VERTEX_BASE_URL=https://your-custom-endpoint
```

### Azure OpenAI

Azure needs either your resource name or your endpoint URL. Set one of the two. If you set both, `AZURE_BASE_URL` is used.

With the resource name:

```bash
AZURE_API_KEY=your_api_key
AZURE_RESOURCE_NAME=your-resource-name  # Your Azure resource name
AI_MODEL=your-deployment-name
```

Or with the endpoint URL in place of the resource name:

```bash
AZURE_API_KEY=your_api_key
AZURE_BASE_URL=https://your-resource.openai.azure.com/openai  # In place of AZURE_RESOURCE_NAME
AI_MODEL=your-deployment-name
```

Optionally, set the reasoning options:

```bash
AZURE_REASONING_EFFORT=low      # Optional: low, medium, high
AZURE_REASONING_SUMMARY=detailed  # Optional: none, brief, detailed
```

### EdgeOne Pages (Tencent Cloud)

When you deploy the app on Tencent EdgeOne Pages, it can use the site's own Edge AI function at `/api/edgeai`. This needs no API key and no base URL. With no key to detect, the server cannot pick this provider by itself, so set `AI_PROVIDER`:

```bash
AI_PROVIDER=edgeone
AI_MODEL=@tx/deepseek-ai/deepseek-v32
```

The function accepts `@tx/deepseek-ai/deepseek-v32`, `@tx/deepseek-ai/deepseek-r1-0528` and `@tx/deepseek-ai/deepseek-v3-0324`. If you set `ACCESS_CODE_LIST`, the function checks the access code too.

### Ollama (local)

```bash
AI_PROVIDER=ollama
AI_MODEL=llama3.2
```

Optionally, set a custom URL:

```bash
OLLAMA_BASE_URL=http://localhost:11434/api
```

### SGLang

```bash
SGLANG_API_KEY=your_api_key
AI_MODEL=your_model_id
```

Optionally, set a custom endpoint:

```bash
SGLANG_BASE_URL=https://your-custom-endpoint/v1
```

### Any other OpenAI-compatible API (custom)

For a server not listed above, such as vLLM, LM Studio, LiteLLM or an API gateway, pick OpenAI-compatible in Settings and enter its base URL and a key. If the server ignores keys, any non-empty value works.

The app merges several system messages into one, as open-source chat templates expect, and splits `<think>` reasoning from the reply.

```bash
CUSTOM_API_KEY=your_api_key
CUSTOM_BASE_URL=http://127.0.0.1:8000/v1
AI_MODEL=your_model_id
```

## How the server picks the provider

If you set the API key of only one provider, the server detects that provider and uses it. You do not need to set `AI_PROVIDER`.

If you set API keys for several providers, you must set `AI_PROVIDER`:

```bash
AI_PROVIDER=google  # or: openai, anthropic, google, vertexai, azure, bedrock, ollama, openrouter, aihubmix, deepseek, siliconflow, sglang, gateway, edgeone, doubao, modelscope, glm, qwen, qiniu, kimi, minimax, novita, mimo, atlascloud, custom
```

## Offer several models to all users

As an administrator, you can set up several models on the server. All users can then use them without an API key of their own. Without this config, the app uses the `AI_PROVIDER` and `AI_MODEL` variables.

You can set it up in three ways.

### Put the config in an environment variable

This way is recommended for cloud deployments. Set `AI_MODELS_CONFIG` to a JSON string:

```bash
AI_MODELS_CONFIG='{"providers":[{"name":"OpenAI","provider":"openai","models":["gpt-4o"],"default":true}]}'
```

### Use a config file

Create an `ai-models.json` file in the project root. To keep it somewhere else, set `AI_MODELS_CONFIG_PATH` to its location.

### List several models in AI_MODEL

This is a quick setup for a single provider. If you only need several models from one provider, list them in `AI_MODEL`, separated by commas. The first model is the default.

```bash
AI_PROVIDER=doubao
AI_MODEL=doubao-seed-1-8-251228,doubao-seed-1-6-flash-250828,doubao-seed-1-6-251015
```

This is a short way to write the same `ai-models.json`. For several providers, or for your own `apiKeyEnv` and `baseUrlEnv`, use the environment variable or the config file.

### Example

```json
{
  "providers": [
    {
      "name": "OpenAI Production",
      "provider": "openai",
      "models": ["gpt-4o", "gpt-4o-mini"],
      "default": true
    },
    {
      "name": "Custom DeepSeek",
      "provider": "deepseek",
      "models": ["deepseek-chat"],
      "apiKeyEnv": "MY_DEEPSEEK_KEY",
      "baseUrlEnv": "MY_DEEPSEEK_URL"
    }
  ]
}
```

### Fields

| Field | Required | What it does |
|---|---|---|
| `name` | Yes | The display name. Several configs can use the same provider |
| `provider` | Yes | The provider type (`openai`, `anthropic`, `google`, `bedrock` and so on) |
| `models` | Yes | The list of model IDs |
| `default` | No | `true` selects this provider's first model as the default |
| `apiKeyEnv` | No | The name of a custom API key variable. Without it, the provider's standard variable is used, such as `OPENAI_API_KEY`. It can also be an array of variable names: each request picks one that has a value at random, which spreads the load over several keys |
| `baseUrlEnv` | No | The name of a custom base URL variable |

### Keys and names

- API keys and credentials come from environment variables. By default the standard names are used, such as `OPENAI_API_KEY`. With `apiKeyEnv` you can use names of your own.
- With `name`, one provider can have several configs. For example, "OpenAI Production" and "OpenAI Staging" can both use `provider: "openai"` with different `apiKeyEnv` values.

## Choose a model

To draw, the model writes long draw.io XML that must follow a strict format, so this task needs a very capable model.

Recommended models: Claude Sonnet 4.5 or Opus 4.5.

Ollama is supported as a provider. For this task, it is usually practical only when you run a strong model such as DeepSeek R1 or Qwen3-235B locally.

| What you want | What to use |
|---|---|
| The best experience | A model that can read images (GPT-4o, Claude, Gemini), for turning images into diagrams |
| A low cost | DeepSeek, which has competitive prices |
| Privacy | Ollama, fully local and offline. It needs powerful hardware |
| Flexibility | OpenRouter, which gives you many models through one API |

## Set the temperature

Setting the temperature is optional. Set it with an environment variable:

```bash
TEMPERATURE=0  # More deterministic output (recommended for diagrams)
```

**Important:** leave `TEMPERATURE` unset for models that do not support a temperature setting, such as:

- GPT-5.1 and other reasoning models
- Some specialized models

When it is unset, the model uses its default behavior.

## Add a new provider

Everything about a provider is in one record in `lib/providers.ts`:

- which AI SDK runs it (`sdk`)
- what it signs in with (`credential`)
- the prefix of its `<PREFIX>_API_KEY` and `<PREFIX>_BASE_URL` variables (`envPrefix`)
- its official URL
- its group in the provider picker
- optional notes

The settings screen, the connection test, the chat route and the admin panel all read this record. To add an OpenAI-compatible provider:

1. Add a record to `lib/providers.ts`, for example:

    ```ts
    acme: {
        label: "Acme AI",
        sdk: "openai-compatible",
        credential: "apiKey",
        group: "aggregators",
        envPrefix: "ACME",
        defaultBaseUrl: "https://api.acme.example/v1",
        apiKeyUrl: "https://acme.example/keys",
        modelList: "openai",
    },
    ```

    If the provider needs a hint under its base URL field, or a note in the picker, give it a `baseUrlHint` or `note` object with all four UI languages (`en`, `zh`, `ja`, `zh-Hant`). A provider that cannot list its models online gets a short `models` list in place of `modelList`.
2. Add `ACME_API_KEY` and `ACME_BASE_URL` to `env.example`. A unit test checks that the variables of every record appear there.
3. Add a section for it to this page in `docs/en`, `docs/cn`, `docs/tw` and `docs/ja`.
4. Add it to the two lists at the top of `tests/unit/provider-matrix.test.ts` (`MATRIX_PROVIDERS` and `MATRIX_MODEL_IDS`). Then regenerate the behavior snapshot with `npx vitest run tests/unit/provider-matrix.test.ts -u`. The new rows belong to the new provider, and the existing rows must not change.
5. Add it to `tests/unit/providers.test.ts` too. That file spells out the groups of the picker and the sets of providers that change what the server does (auto-detection, model lists without a key).
6. Update the provider count in the three READMEs and the `AI_PROVIDER` list on this page.
