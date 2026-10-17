# AI 服务商

自己部署 Next AI Draw.io 时，用环境变量选择 AI 服务商和模型。本页列出每家服务商的环境变量，并说明如何为所有用户提供多个模型，以及如何在代码里新增一个服务商。

## 快速开始

1. 将 `env.example` 复制为 `.env.local`。
2. 设置所选服务商的 API Key。
3. 把 `AI_MODEL` 设为您想用的模型。
4. 运行 `npm run dev`。

## 配置各家服务商

### OpenAI

```bash
OPENAI_API_KEY=your_api_key
AI_MODEL=gpt-4o
```

也可以为 OpenAI 兼容服务设置自定义端点：

```bash
OPENAI_BASE_URL=https://your-custom-endpoint/v1
```

LM Studio 等本地 OpenAI 兼容服务也用同样的方式。把基础 URL 设为 `http://localhost:1234/v1`（LM Studio 的默认端口），API Key 填任意非空值即可，例如 `lm-studio`。在上面的环境变量里，或在“设置”的“模型”标签页里配置都可以。

### Anthropic

```bash
ANTHROPIC_API_KEY=your_api_key
AI_MODEL=claude-sonnet-4-5-20250929
```

也可以用 Bearer 令牌登录，例如通过会下发 OAuth 风格令牌的网关时：

```bash
ANTHROPIC_AUTH_TOKEN=your_auth_token
AI_MODEL=claude-sonnet-4-5-20250929
```

`ANTHROPIC_API_KEY` 会作为 `x-api-key` 头发送，`ANTHROPIC_AUTH_TOKEN` 会作为 `Authorization: Bearer <token>` 发送。两者不能同时使用，只设置其中一个。

也可以设置自定义端点：

```bash
ANTHROPIC_BASE_URL=https://your-custom-endpoint
```

### Google Gemini

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key
AI_MODEL=gemini-2.0-flash
```

也可以设置自定义端点：

```bash
GOOGLE_BASE_URL=https://your-custom-endpoint
```

### DeepSeek

```bash
DEEPSEEK_API_KEY=your_api_key
AI_MODEL=deepseek-chat
```

也可以设置自定义端点：

```bash
DEEPSEEK_BASE_URL=https://your-custom-endpoint
```

### Qwen（阿里云通义千问）

```bash
QWEN_API_KEY=your_api_key
AI_MODEL=qwen-turbo
```

也可以设置自定义端点：

```bash
QWEN_BASE_URL=https://your-custom-endpoint
```

### 豆包（字节跳动火山引擎）

```bash
DOUBAO_API_KEY=your_api_key
AI_MODEL=doubao-seed-1-8-251228  # 或其他豆包模型
```

### GLM（智谱 AI）

```bash
GLM_API_KEY=your_api_key
AI_MODEL=glm-4
```

也可以设置自定义端点：

```bash
GLM_BASE_URL=https://your-custom-endpoint
```

### Kimi（月之暗面 Moonshot AI）

```bash
KIMI_API_KEY=your_api_key
AI_MODEL=kimi-latest
```

也可以设置自定义端点：

```bash
KIMI_BASE_URL=https://your-custom-endpoint
```

### MiniMax

MiniMax 支持两种 API 格式：

| 格式 | 端点 | 说明 |
|---|---|---|
| Anthropic 兼容 | `/anthropic` | 推荐。支持 interleaved thinking，也就是模型可以在两次工具调用之间思考 |
| OpenAI 兼容 | `/v1` | 标准的 OpenAI 聊天补全格式 |

```bash
MINIMAX_API_KEY=your_api_key
AI_MODEL=MiniMax-M3
```

可选配置：

```bash
# 中国大陆版，Anthropic 兼容（默认）
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic

# 中国大陆版，OpenAI 兼容
MINIMAX_BASE_URL=https://api.minimaxi.com/v1

# 国际版，Anthropic 兼容
MINIMAX_BASE_URL=https://api.minimax.io/anthropic

# 国际版，OpenAI 兼容
MINIMAX_BASE_URL=https://api.minimax.io/v1
```

### MiMo（小米）

```bash
MIMO_API_KEY=your_api_key
AI_MODEL=mimo-v2.5-pro
```

也可以设置自定义端点。Token Plan 订阅用户请设置专属的基础 URL：

```bash
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
```

### OpenRouter

```bash
OPENROUTER_API_KEY=your_api_key
AI_MODEL=anthropic/claude-sonnet-4
```

也可以设置自定义端点：

```bash
OPENROUTER_BASE_URL=https://your-custom-endpoint
```

### AIHubMix

AIHubMix 用一个 API Key 提供 Claude、GPT、Gemini、DeepSeek 等模型。

```bash
AIHUBMIX_API_KEY=your_api_key
AI_MODEL=claude-sonnet-4-5-20250929
```

也可以设置自定义端点：

```bash
AIHUBMIX_BASE_URL=https://aihubmix.com/v1
```

### SiliconFlow（OpenAI 兼容）

```bash
SILICONFLOW_API_KEY=your_api_key
AI_MODEL=deepseek-ai/DeepSeek-V3  # 示例；使用任何 SiliconFlow 模型 ID
```

不设置基础 URL 时，应用使用 `https://api.siliconflow.cn/v1`，这是 cloud.siliconflow.cn 上创建的 Key 对应的端点。如果您的 Key 来自国际站 cloud.siliconflow.com，请设置 .com 的端点：

```bash
SILICONFLOW_BASE_URL=https://api.siliconflow.com/v1
```

### ModelScope

```bash
MODELSCOPE_API_KEY=your_api_key
AI_MODEL=Qwen/Qwen3-235B-A22B-Instruct-2507
```

也可以设置自定义端点：

```bash
MODELSCOPE_BASE_URL=https://your-custom-endpoint
```

### Novita AI

```bash
NOVITA_API_KEY=your_api_key
AI_MODEL=deepseek/deepseek-v4-pro
```

也可以设置自定义端点。不设置时使用 `https://api.novita.ai/openai`：

```bash
NOVITA_BASE_URL=https://your-custom-endpoint
```

### Atlas Cloud

```bash
ATLASCLOUD_API_KEY=your_api_key
AI_MODEL=your_model_id
```

应用没有内置 Atlas Cloud 的模型列表。在“设置”的“模型”标签页里，应用会用您的 Key 从 Atlas Cloud 读取模型列表。

也可以设置自定义端点。不设置时使用 `https://api.atlascloud.ai/v1`：

```bash
ATLASCLOUD_BASE_URL=https://your-custom-endpoint
```

### Qiniu（七牛云）

```bash
QINIU_API_KEY=your_api_key
AI_MODEL=your_model_id
```

也可以设置自定义端点：

```bash
QINIU_BASE_URL=https://your-custom-endpoint
```

### Vercel AI Gateway

Vercel AI Gateway 让您用一个 API Key 使用多家 AI 服务商。登录更简单，切换服务商时也不用管理多个 API Key。

使用 Vercel 托管的网关：

```bash
AI_GATEWAY_API_KEY=your_gateway_api_key
AI_MODEL=openai/gpt-4o
```

使用自定义网关 URL，用于本地开发或自托管的网关：

```bash
AI_GATEWAY_API_KEY=your_custom_api_key
AI_GATEWAY_BASE_URL=https://your-custom-gateway.com/v1/ai
AI_MODEL=openai/gpt-4o
```

模型 ID 的格式是 `provider/model`：

| `AI_MODEL` | 模型 |
|---|---|
| `openai/gpt-4o` | OpenAI GPT-4o |
| `anthropic/claude-sonnet-4-5` | Anthropic Claude Sonnet 4.5 |
| `google/gemini-2.0-flash` | Google Gemini 2.0 Flash |

如果没有设置 `AI_GATEWAY_BASE_URL`，会使用默认的 Vercel Gateway URL（`https://ai-gateway.vercel.sh/v1/ai`）。自定义基础 URL 适用于：

- 用自己的网关实例做本地开发
- 自托管的 AI Gateway 部署
- 企业代理配置

使用自定义基础 URL 时，必须同时设置 `AI_GATEWAY_API_KEY`。

从 [Vercel AI Gateway 仪表板](https://vercel.com/ai-gateway) 获取您的 API Key。

### Amazon Bedrock

```bash
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AI_MODEL=global.anthropic.claude-sonnet-5-5
```

较新的 Claude 模型只能通过推理配置文件（inference profile）的 ID 调用。这种 ID 以地区前缀开头，例如 `global.` 或 `us.`。直接用 `anthropic.claude-sonnet-5-5` 这样不带前缀的 ID 会报错 “on-demand throughput isn't supported”。

在 AWS 上（Lambda，或带有 IAM 角色的 EC2），凭证会自动从 IAM 角色获取。

### Google Vertex AI

Google Vertex AI 是 Google Cloud 面向企业的服务，提供企业级功能和数据驻留（数据保存在您选择的地区）。它的 Express 模式用普通的 API Key 登录，所以也能在 Vercel、Cloudflare 这类边缘运行环境里使用。

```bash
GOOGLE_VERTEX_API_KEY=your_api_key
AI_MODEL=gemini-2.0-flash
```

也可以设置自定义端点：

```bash
GOOGLE_VERTEX_BASE_URL=https://your-custom-endpoint
```

### Azure OpenAI

Azure 需要资源名称或端点 URL，设置其中一个即可。两个都设置时，使用 `AZURE_BASE_URL`。

使用资源名称：

```bash
AZURE_API_KEY=your_api_key
AZURE_RESOURCE_NAME=your-resource-name  # 您的 Azure 资源名称
AI_MODEL=your-deployment-name
```

也可以用端点 URL 代替资源名称：

```bash
AZURE_API_KEY=your_api_key
AZURE_BASE_URL=https://your-resource.openai.azure.com/openai  # 代替 AZURE_RESOURCE_NAME
AI_MODEL=your-deployment-name
```

也可以设置推理选项：

```bash
AZURE_REASONING_EFFORT=low      # 可选：low, medium, high
AZURE_REASONING_SUMMARY=detailed  # 可选：none, brief, detailed
```

### EdgeOne Pages（腾讯云）

把应用部署在腾讯云 EdgeOne Pages 上时，可以使用站点自带的 Edge AI 函数 `/api/edgeai`。它不需要 API Key，也不需要基础 URL。因为没有 Key 可供检测，服务端无法自动选中这家服务商，请设置 `AI_PROVIDER`：

```bash
AI_PROVIDER=edgeone
AI_MODEL=@tx/deepseek-ai/deepseek-v32
```

这个函数支持 `@tx/deepseek-ai/deepseek-v32`、`@tx/deepseek-ai/deepseek-r1-0528` 和 `@tx/deepseek-ai/deepseek-v3-0324`。如果您设置了 `ACCESS_CODE_LIST`，函数也会检查访问码。

### Ollama（本地）

```bash
AI_PROVIDER=ollama
AI_MODEL=llama3.2
```

也可以设置自定义 URL：

```bash
OLLAMA_BASE_URL=http://localhost:11434/api
```

### SGLang

```bash
SGLANG_API_KEY=your_api_key
AI_MODEL=your_model_id
```

也可以设置自定义端点：

```bash
SGLANG_BASE_URL=https://your-custom-endpoint/v1
```

### 任何其他 OpenAI 兼容接口（custom）

上面没有列出的服务，例如 vLLM、LM Studio、LiteLLM 或 API 网关，请在“设置”里选择 OpenAI-compatible，填入它的基础 URL 和 Key。服务端不校验 Key 时，填任意非空内容即可。

应用会把多条 system 消息合并成一条，开源模型的对话模板通常要求这样；`<think>` 里的推理内容会从回复里分离出来。

```bash
CUSTOM_API_KEY=your_api_key
CUSTOM_BASE_URL=http://127.0.0.1:8000/v1
AI_MODEL=your_model_id
```

## 服务端怎样选择服务商

如果您只设置了一家服务商的 API Key，服务端会自动检测并使用这家服务商，无需设置 `AI_PROVIDER`。

如果您设置了多家服务商的 API Key，就必须设置 `AI_PROVIDER`：

```bash
AI_PROVIDER=google  # 或：openai, anthropic, google, vertexai, azure, bedrock, ollama, openrouter, aihubmix, deepseek, siliconflow, sglang, gateway, edgeone, doubao, modelscope, glm, qwen, qiniu, kimi, minimax, novita, mimo, atlascloud, custom
```

## 为所有用户提供多个模型

管理员可以在服务端配置多个模型。所有用户都可以使用这些模型，不需要自己的 API Key。没有这份配置时，应用使用 `AI_PROVIDER` 和 `AI_MODEL` 这两个环境变量。

有三种配置方式。

### 把配置写进环境变量

推荐在云部署时使用这种方式。把 `AI_MODELS_CONFIG` 设为一个 JSON 字符串：

```bash
AI_MODELS_CONFIG='{"providers":[{"name":"OpenAI","provider":"openai","models":["gpt-4o"],"default":true}]}'
```

### 使用配置文件

在项目根目录创建 `ai-models.json` 文件。如果想放在其他位置，用 `AI_MODELS_CONFIG_PATH` 指定它的路径。

### 在 AI_MODEL 里列出多个模型

这是单个服务商的快速配置。如果只需要同一家服务商的多个模型，可以在 `AI_MODEL` 里用逗号分隔列出它们。第一个模型是默认模型。

```bash
AI_PROVIDER=doubao
AI_MODEL=doubao-seed-1-8-251228,doubao-seed-1-6-flash-250828,doubao-seed-1-6-251015
```

这是等价的 `ai-models.json` 的简写。如果需要多家服务商，或者要自定义 `apiKeyEnv` 和 `baseUrlEnv`，请使用环境变量或配置文件。

### 示例

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

### 字段

| 字段 | 必填 | 作用 |
|---|---|---|
| `name` | 是 | 显示名称。同一家服务商可以有多份配置 |
| `provider` | 是 | 服务商类型（`openai`、`anthropic`、`google`、`bedrock` 等） |
| `models` | 是 | 模型 ID 列表 |
| `default` | 否 | 设为 `true` 时，默认选中这家服务商的第一个模型 |
| `apiKeyEnv` | 否 | 自定义的 API Key 环境变量名。不填时使用服务商的标准变量，例如 `OPENAI_API_KEY`。也可以写成环境变量名数组：每次请求从有值的变量中随机选一个，把负载分摊到多个 Key 上 |
| `baseUrlEnv` | 否 | 自定义的基础 URL 环境变量名 |

### Key 和名称

- API Key 和凭证都通过环境变量提供。默认使用标准变量名，例如 `OPENAI_API_KEY`。用 `apiKeyEnv` 可以改用您自己的变量名。
- 有了 `name`，同一家服务商可以有多份配置。例如 “OpenAI Production” 和 “OpenAI Staging” 都使用 `provider: "openai"`，但 `apiKeyEnv` 不同。

## 选择模型

画图时，模型要写出很长的 draw.io XML，并且必须符合严格的格式，所以这项任务需要能力很强的模型。

推荐模型：Claude Sonnet 4.5 或 Opus 4.5。

Ollama 可以作为服务商使用。但对这项任务来说，通常只有在本地运行 DeepSeek R1 或 Qwen3-235B 这样的强大模型时才实用。

| 您想要 | 推荐使用 |
|---|---|
| 最佳体验 | 能读图片的模型（GPT-4o、Claude、Gemini），用于把图片转成图表 |
| 低成本 | DeepSeek，价格有竞争力 |
| 隐私 | Ollama，完全在本地离线运行。需要性能强大的硬件 |
| 灵活 | OpenRouter，通过一个 API 使用众多模型 |

## 设置温度（Temperature）

温度可以不设置。需要时用环境变量设置：

```bash
TEMPERATURE=0  # 输出更具确定性（推荐用于图表）
```

**重要提示：** 对于不支持温度设置的模型，请不要设置 `TEMPERATURE`，例如：

- GPT-5.1 和其他推理模型
- 某些专用模型

不设置时，模型使用它的默认行为。

## 新增一个服务商

一个服务商的全部信息都在 `lib/providers.ts` 的一条记录里：

- 用哪个 AI SDK 运行（`sdk`）
- 用什么凭据登录（`credential`）
- 环境变量 `<PREFIX>_API_KEY` 和 `<PREFIX>_BASE_URL` 的前缀（`envPrefix`）
- 官方地址
- 在服务商选择器里的分组
- 可选的提示文案

设置界面、连接测试、聊天路由和管理面板都读取这条记录。新增一个 OpenAI 兼容服务商的步骤如下：

1. 在 `lib/providers.ts` 里加一条记录，例如：

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

    如果服务商需要在基础 URL 输入框下方显示提示，或在选择器里显示说明，就在记录里加 `baseUrlHint` 或 `note` 对象，四种界面语言（`en`、`zh`、`ja`、`zh-Hant`）都要写。不能在线列出模型的服务商，用一个简短的 `models` 列表代替 `modelList`。
2. 在 `env.example` 里加上 `ACME_API_KEY` 和 `ACME_BASE_URL`。有一个单元测试会检查每条记录的变量都出现在这个文件里。
3. 在 `docs/en`、`docs/cn`、`docs/tw` 和 `docs/ja` 的本页里各加一节说明。
4. 把它加进 `tests/unit/provider-matrix.test.ts` 开头的两个清单（`MATRIX_PROVIDERS` 和 `MATRIX_MODEL_IDS`）。然后用 `npx vitest run tests/unit/provider-matrix.test.ts -u` 重新生成行为快照。新增的行都属于这家服务商，已有的行不能变。
5. 也把它加进 `tests/unit/providers.test.ts`。这个文件写明了选择器的分组，以及会改变服务端行为的服务商集合（自动检测、只接受一条 system 消息）。
6. 更新三份 README 里的服务商数量，以及本页的 `AI_PROVIDER` 可选值清单。
