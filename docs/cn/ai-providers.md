# AI 提供商配置

本指南介绍如何为 next-ai-draw-io 配置不同的 AI 模型提供商。

## 快速开始

1. 将 `.env.example` 复制为 `.env.local`
2. 设置所选提供商的 API 密钥
3. 将 `AI_MODEL` 设置为所需的模型
4. 运行 `npm run dev`

## 支持的提供商

### 豆包 (字节跳动火山引擎)

> **免费 Token**：在 [火山引擎 ARK 平台](https://www.volcengine.com/activity/newyear-referral?utm_campaign=doubao&utm_content=aidrawio&utm_medium=github&utm_source=coopensrc&utm_term=project) 注册，即可获得所有模型 50 万免费 Token！

```bash
DOUBAO_API_KEY=your_api_key
AI_MODEL=doubao-seed-1-8-251215  # 或其他豆包模型
```

### Google Gemini

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key
AI_MODEL=gemini-2.0-flash
```

可选的自定义端点：

```bash
GOOGLE_BASE_URL=https://your-custom-endpoint
```

### OpenAI

```bash
OPENAI_API_KEY=your_api_key
AI_MODEL=gpt-4o
```

可选的自定义端点（用于 OpenAI 兼容服务）：

```bash
OPENAI_BASE_URL=https://your-custom-endpoint/v1
```

### Anthropic

```bash
ANTHROPIC_API_KEY=your_api_key
AI_MODEL=claude-sonnet-4-5-20250514
```

可选的自定义端点：

```bash
ANTHROPIC_BASE_URL=https://your-custom-endpoint
```

### DeepSeek

```bash
DEEPSEEK_API_KEY=your_api_key
AI_MODEL=deepseek-chat
```

可选的自定义端点：

```bash
DEEPSEEK_BASE_URL=https://your-custom-endpoint
```

### SiliconFlow (OpenAI 兼容)

```bash
SILICONFLOW_API_KEY=your_api_key
AI_MODEL=deepseek-ai/DeepSeek-V3  # 示例；使用任何 SiliconFlow 模型 ID
```

可选的自定义端点（默认为推荐域名）：

```bash
SILICONFLOW_BASE_URL=https://api.siliconflow.com/v1  # 或 https://api.siliconflow.cn/v1
```

### SGLang

```bash
SGLANG_API_KEY=your_api_key
AI_MODEL=your_model_id
```

可选的自定义端点：

```bash
SGLANG_BASE_URL=https://your-custom-endpoint/v1
```

### Azure OpenAI

```bash
AZURE_API_KEY=your_api_key
AZURE_RESOURCE_NAME=your-resource-name  # 必填：您的 Azure 资源名称
AI_MODEL=your-deployment-name
```

或者使用自定义端点代替资源名称：

```bash
AZURE_API_KEY=your_api_key
AZURE_BASE_URL=https://your-resource.openai.azure.com  # AZURE_RESOURCE_NAME 的替代方案
AI_MODEL=your-deployment-name
```

可选的推理配置：

```bash
AZURE_REASONING_EFFORT=low      # 可选：low, medium, high
AZURE_REASONING_SUMMARY=detailed  # 可选：none, brief, detailed
```

### AWS Bedrock

```bash
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AI_MODEL=anthropic.claude-sonnet-4-5-20250514-v1:0
```

注意：在 AWS 环境（Lambda、带有 IAM 角色的 EC2）中，凭证会自动从 IAM 角色获取。

### OpenRouter

```bash
OPENROUTER_API_KEY=your_api_key
AI_MODEL=anthropic/claude-sonnet-4
```

可选的自定义端点：

```bash
OPENROUTER_BASE_URL=https://your-custom-endpoint
```

### Ollama (本地)

```bash
AI_PROVIDER=ollama
AI_MODEL=llama3.2
```

### ModelScope

```bash
MODELSCOPE_API_KEY=your_api_key
AI_MODEL=Qwen/Qwen3-235B-A22B-Instruct-2507
```

可选的自定义端点：

```bash
MODELSCOPE_BASE_URL=https://your-custom-endpoint
```

### MiniMax (Anthropic 兼容)

```bash
MINIMAX_API_KEY=your_api_key
AI_MODEL=MiniMax-M2.5  # 或 MiniMax-M2.5-highspeed
```

可选的自定义端点（默认为国际版）：

```bash
MINIMAX_BASE_URL=https://api.minimax.io/anthropic  # 或 https://api.minimaxi.com/anthropic
```

可选的自定义 URL：

```bash
OLLAMA_BASE_URL=http://localhost:11434
```

### Vercel AI Gateway

Vercel AI Gateway 通过单个 API 密钥提供对多个 AI 提供商的统一访问。这简化了身份验证，让您无需管理多个 API 密钥即可在不同提供商之间切换。

**基本用法（Vercel 托管网关）：**

```bash
AI_GATEWAY_API_KEY=your_gateway_api_key
AI_MODEL=openai/gpt-4o
```

**自定义网关 URL（用于本地开发或自托管网关）：**

```bash
AI_GATEWAY_API_KEY=your_custom_api_key
AI_GATEWAY_BASE_URL=https://your-custom-gateway.com/v1/ai
AI_MODEL=openai/gpt-4o
```

模型格式使用 `provider/model` 语法：

-   `openai/gpt-4o` - OpenAI GPT-4o
-   `anthropic/claude-sonnet-4-5` - Anthropic Claude Sonnet 4.5
-   `google/gemini-2.0-flash` - Google Gemini 2.0 Flash

**配置说明：**

-   如果未设置 `AI_GATEWAY_BASE_URL`，则使用默认的 Vercel Gateway URL (`https://ai-gateway.vercel.sh/v1/ai`)
-   自定义基础 URL 适用于：
    -   使用自定义网关实例进行本地开发
    -   自托管 AI Gateway 部署
    -   企业代理配置
-   当使用自定义基础 URL 时，必须同时提供 `AI_GATEWAY_API_KEY`

从 [Vercel AI Gateway 仪表板](https://vercel.com/ai-gateway) 获取您的 API 密钥。

## 自动检测

如果您只配置了**一个**提供商的 API 密钥，系统将自动检测并使用该提供商。无需设置 `AI_PROVIDER`。

如果您配置了**多个** API 密钥，则必须显式设置 `AI_PROVIDER`：

```bash
AI_PROVIDER=google  # 或：openai, anthropic, deepseek, siliconflow, doubao, azure, bedrock, openrouter, ollama, gateway, sglang, modelscope, minimax
```

## 服务端多模型配置

管理员可以配置多个服务端模型，让所有用户无需提供个人 API Key 即可使用。

### 配置方式

**方式一：环境变量**（推荐用于云部署）

设置 `AI_MODELS_CONFIG` 为 JSON 字符串：

```bash
AI_MODELS_CONFIG='{"providers":[{"name":"OpenAI","provider":"openai","models":["gpt-4o"],"default":true}]}'
```

**方式二：配置文件**

在项目根目录创建 `ai-models.json` 文件（或通过 `AI_MODELS_CONFIG_PATH` 指定路径）。

### 配置示例

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

### 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 显示名称（支持同一提供商多个配置） |
| `provider` | 是 | 提供商类型（`openai`, `anthropic`, `google`, `bedrock` 等） |
| `models` | 是 | 模型 ID 列表 |
| `default` | 否 | 设为 `true` 表示默认选中该提供商的第一个模型 |
| `apiKeyEnv` | 否 | 自定义 API Key 环境变量名（默认使用提供商标准变量如 `OPENAI_API_KEY`） |
| `baseUrlEnv` | 否 | 自定义 Base URL 环境变量名 |

### 说明

- API Key 和凭证通过环境变量提供。默认使用标准变量名（如 `OPENAI_API_KEY`），也可通过 `apiKeyEnv` 指定自定义变量名。
- `name` 字段允许同一提供商多个配置（例如 "OpenAI Production" 和 "OpenAI Staging" 都使用 `provider: "openai"` 但 `apiKeyEnv` 不同）。
- 如果配置不存在，应用会回退到 `AI_PROVIDER`/`AI_MODEL` 环境变量配置。

## 模型能力要求

此任务对模型能力要求极高，因为它涉及生成具有严格格式约束（draw.io XML）的长文本。

**推荐模型**：

-   Claude Sonnet 4.5 / Opus 4.5

**关于 Ollama 的说明**：虽然支持将 Ollama 作为提供商，但除非您在本地运行像 DeepSeek R1 或 Qwen3-235B 这样的高性能模型，否则对于此用例通常不太实用。

## 温度设置 (Temperature)

您可以通过环境变量选择性地配置温度：

```bash
TEMPERATURE=0  # 输出更具确定性（推荐用于图表）
```

**重要提示**：对于不支持温度设置的模型（例如以下模型），请勿设置 `TEMPERATURE`：
- GPT-5.1 和其他推理模型
- 某些专用模型

未设置时，模型将使用其默认行为。

## 推荐

-   **最佳体验**：使用支持视觉的模型（GPT-4o, Claude, Gemini）以获得图像转图表功能
-   **经济实惠**：DeepSeek 提供具有竞争力的价格
-   **隐私保护**：使用 Ollama 进行完全本地、离线的操作（需要强大的硬件支持）
-   **灵活性**：OpenRouter 通过单一 API 提供对众多模型的访问
