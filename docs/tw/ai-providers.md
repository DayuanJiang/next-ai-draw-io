# AI 服務商

自己部署 Next AI Draw.io 時，用環境變數選擇 AI 服務商和模型。本頁列出每家服務商的環境變數，並說明如何為所有使用者提供多個模型，以及如何在程式碼裡新增一個服務商。

## 快速開始

1. 將 `env.example` 複製為 `.env.local`。
2. 設定所選服務商的 API Key。
3. 把 `AI_MODEL` 設為您想用的模型。
4. 執行 `npm run dev`。

## 設定各家服務商

### OpenAI

```bash
OPENAI_API_KEY=your_api_key
AI_MODEL=gpt-4o
```

也可以為 OpenAI 相容服務設定自訂端點：

```bash
OPENAI_BASE_URL=https://your-custom-endpoint/v1
```

LM Studio 等本機 OpenAI 相容服務也用同樣的方式。把基礎 URL 設為 `http://localhost:1234/v1`（LM Studio 的預設連接埠），API Key 填任意非空值即可，例如 `lm-studio`。在上面的環境變數裡，或在「設定」的「模型」分頁裡設定都可以。

### Anthropic

```bash
ANTHROPIC_API_KEY=your_api_key
AI_MODEL=claude-sonnet-4-5-20250929
```

也可以用 Bearer 權杖驗證，例如透過會核發 OAuth 風格權杖的閘道時：

```bash
ANTHROPIC_AUTH_TOKEN=your_auth_token
AI_MODEL=claude-sonnet-4-5-20250929
```

`ANTHROPIC_API_KEY` 會作為 `x-api-key` 標頭傳送，`ANTHROPIC_AUTH_TOKEN` 會作為 `Authorization: Bearer <token>` 傳送。兩者不能同時使用，只設定其中一個。

也可以設定自訂端點：

```bash
ANTHROPIC_BASE_URL=https://your-custom-endpoint
```

### Google Gemini

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key
AI_MODEL=gemini-2.0-flash
```

也可以設定自訂端點：

```bash
GOOGLE_BASE_URL=https://your-custom-endpoint
```

### DeepSeek

```bash
DEEPSEEK_API_KEY=your_api_key
AI_MODEL=deepseek-chat
```

也可以設定自訂端點：

```bash
DEEPSEEK_BASE_URL=https://your-custom-endpoint
```

### Qwen（阿里雲通義千問）

```bash
QWEN_API_KEY=your_api_key
AI_MODEL=qwen-turbo
```

也可以設定自訂端點：

```bash
QWEN_BASE_URL=https://your-custom-endpoint
```

### 豆包（字節跳動火山引擎）

```bash
DOUBAO_API_KEY=your_api_key
AI_MODEL=doubao-seed-1-8-251228  # 或其他豆包模型
```

### GLM（智譜 AI）

```bash
GLM_API_KEY=your_api_key
AI_MODEL=glm-4
```

也可以設定自訂端點：

```bash
GLM_BASE_URL=https://your-custom-endpoint
```

### Kimi（月之暗面 Moonshot AI）

```bash
KIMI_API_KEY=your_api_key
AI_MODEL=kimi-latest
```

也可以設定自訂端點：

```bash
KIMI_BASE_URL=https://your-custom-endpoint
```

### MiniMax

MiniMax 支援兩種 API 格式：

| 格式 | 端點 | 說明 |
|---|---|---|
| Anthropic 相容 | `/anthropic` | 推薦。支援 interleaved thinking，也就是模型可以在兩次工具呼叫之間思考 |
| OpenAI 相容 | `/v1` | 標準的 OpenAI 聊天補全格式 |

```bash
MINIMAX_API_KEY=your_api_key
AI_MODEL=MiniMax-M3
```

選用設定：

```bash
# 中國大陸版，Anthropic 相容（預設）
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic

# 中國大陸版，OpenAI 相容
MINIMAX_BASE_URL=https://api.minimaxi.com/v1

# 國際版，Anthropic 相容
MINIMAX_BASE_URL=https://api.minimax.io/anthropic

# 國際版，OpenAI 相容
MINIMAX_BASE_URL=https://api.minimax.io/v1
```

### MiMo（小米）

```bash
MIMO_API_KEY=your_api_key
AI_MODEL=mimo-v2.5-pro
```

也可以設定自訂端點。Token Plan 訂閱使用者請設定專屬的基礎 URL：

```bash
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
```

### OpenRouter

```bash
OPENROUTER_API_KEY=your_api_key
AI_MODEL=anthropic/claude-sonnet-4
```

也可以設定自訂端點：

```bash
OPENROUTER_BASE_URL=https://your-custom-endpoint
```

### AIHubMix

AIHubMix 用一個 API Key 提供 Claude、GPT、Gemini、DeepSeek 等模型。

```bash
AIHUBMIX_API_KEY=your_api_key
AI_MODEL=claude-sonnet-4-5-20250929
```

也可以設定自訂端點：

```bash
AIHUBMIX_BASE_URL=https://aihubmix.com/v1
```

### SiliconFlow（OpenAI 相容）

```bash
SILICONFLOW_API_KEY=your_api_key
AI_MODEL=deepseek-ai/DeepSeek-V3  # 範例；可使用任何 SiliconFlow 模型 ID
```

不設定基礎 URL 時，應用程式使用 `https://api.siliconflow.cn/v1`，這是 cloud.siliconflow.cn 上建立的 Key 對應的端點。如果您的 Key 來自國際站 cloud.siliconflow.com，請設定 .com 的端點：

```bash
SILICONFLOW_BASE_URL=https://api.siliconflow.com/v1
```

### ModelScope

```bash
MODELSCOPE_API_KEY=your_api_key
AI_MODEL=Qwen/Qwen3-235B-A22B-Instruct-2507
```

也可以設定自訂端點：

```bash
MODELSCOPE_BASE_URL=https://your-custom-endpoint
```

### Novita AI

```bash
NOVITA_API_KEY=your_api_key
AI_MODEL=deepseek/deepseek-v4-pro
```

也可以設定自訂端點。不設定時使用 `https://api.novita.ai/openai`：

```bash
NOVITA_BASE_URL=https://your-custom-endpoint
```

### Atlas Cloud

```bash
ATLASCLOUD_API_KEY=your_api_key
AI_MODEL=your_model_id
```

應用程式沒有內建 Atlas Cloud 的模型列表。在「設定」的「模型」分頁裡，應用程式會用您的 Key 從 Atlas Cloud 讀取模型列表。

也可以設定自訂端點。不設定時使用 `https://api.atlascloud.ai/v1`：

```bash
ATLASCLOUD_BASE_URL=https://your-custom-endpoint
```

### Qiniu（七牛雲）

```bash
QINIU_API_KEY=your_api_key
AI_MODEL=your_model_id
```

也可以設定自訂端點：

```bash
QINIU_BASE_URL=https://your-custom-endpoint
```

### Vercel AI Gateway

Vercel AI Gateway 讓您用一個 API Key 使用多家 AI 服務商。驗證更簡單，切換服務商時也不用管理多個 API Key。

使用 Vercel 託管的閘道：

```bash
AI_GATEWAY_API_KEY=your_gateway_api_key
AI_MODEL=openai/gpt-4o
```

使用自訂閘道 URL，用於本機開發或自行託管的閘道：

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

如果沒有設定 `AI_GATEWAY_BASE_URL`，會使用預設的 Vercel Gateway URL（`https://ai-gateway.vercel.sh/v1/ai`）。自訂基礎 URL 適用於：

- 用自己的閘道執行個體做本機開發
- 自行託管的 AI Gateway 部署
- 企業代理伺服器設定

使用自訂基礎 URL 時，必須同時設定 `AI_GATEWAY_API_KEY`。

從 [Vercel AI Gateway 儀表板](https://vercel.com/ai-gateway) 取得您的 API Key。

### Amazon Bedrock

```bash
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AI_MODEL=global.anthropic.claude-sonnet-5-5
```

較新的 Claude 模型只能透過推論設定檔（inference profile）的 ID 呼叫。這種 ID 以地區字首開頭，例如 `global.` 或 `us.`。直接用 `anthropic.claude-sonnet-5-5` 這樣不帶字首的 ID 會出現錯誤「on-demand throughput isn't supported」。

在 AWS 上（Lambda，或帶有 IAM 角色的 EC2），憑證會自動從 IAM 角色取得。

### Google Vertex AI

Google Vertex AI 是 Google Cloud 針對企業的服務，提供企業級功能和資料駐留（資料儲存在您選擇的地區）。它的 Express 模式用普通的 API Key 驗證，所以也能在 Vercel、Cloudflare 這類邊緣執行環境裡使用。

```bash
GOOGLE_VERTEX_API_KEY=your_api_key
AI_MODEL=gemini-2.0-flash
```

也可以設定自訂端點：

```bash
GOOGLE_VERTEX_BASE_URL=https://your-custom-endpoint
```

### Azure OpenAI

Azure 需要資源名稱或端點 URL，設定其中一個即可。兩個都設定時，使用 `AZURE_BASE_URL`。

使用資源名稱：

```bash
AZURE_API_KEY=your_api_key
AZURE_RESOURCE_NAME=your-resource-name  # 您的 Azure 資源名稱
AI_MODEL=your-deployment-name
```

也可以用端點 URL 代替資源名稱：

```bash
AZURE_API_KEY=your_api_key
AZURE_BASE_URL=https://your-resource.openai.azure.com/openai  # 代替 AZURE_RESOURCE_NAME
AI_MODEL=your-deployment-name
```

也可以設定推理選項：

```bash
AZURE_REASONING_EFFORT=low      # 可選：low, medium, high
AZURE_REASONING_SUMMARY=detailed  # 可選：none, brief, detailed
```

### EdgeOne Pages（騰訊雲）

把應用程式部署在騰訊雲 EdgeOne Pages 上時，可以使用網站內建的 Edge AI 函式 `/api/edgeai`。它不需要 API Key，也不需要基礎 URL。因為沒有 Key 可供偵測，伺服器無法自動選擇這家服務商，請設定 `AI_PROVIDER`：

```bash
AI_PROVIDER=edgeone
AI_MODEL=@tx/deepseek-ai/deepseek-v32
```

這個函式支援 `@tx/deepseek-ai/deepseek-v32`、`@tx/deepseek-ai/deepseek-r1-0528` 和 `@tx/deepseek-ai/deepseek-v3-0324`。如果您設定了 `ACCESS_CODE_LIST`，函式也會檢查存取碼。

### Ollama（本機）

```bash
AI_PROVIDER=ollama
AI_MODEL=llama3.2
```

也可以設定自訂 URL：

```bash
OLLAMA_BASE_URL=http://localhost:11434/api
```

### SGLang

```bash
SGLANG_API_KEY=your_api_key
AI_MODEL=your_model_id
```

也可以設定自訂端點：

```bash
SGLANG_BASE_URL=https://your-custom-endpoint/v1
```

### 任何其他 OpenAI 相容介面（custom）

上面沒有列出的服務，例如 vLLM、LM Studio、LiteLLM 或 API 閘道，請在「設定」裡選擇 OpenAI-compatible，填入它的基礎 URL 和 Key。伺服器不驗證 Key 時，填任意非空內容即可。

應用程式會把多則 system 訊息合併成一則，開放原始碼模型的對話範本通常要求這樣；`<think>` 裡的推理內容會從回覆裡分離出來。

```bash
CUSTOM_API_KEY=your_api_key
CUSTOM_BASE_URL=http://127.0.0.1:8000/v1
AI_MODEL=your_model_id
```

## 伺服器怎麼選擇服務商

如果您只設定了一家服務商的 API Key，伺服器會自動偵測並使用這家服務商，無需設定 `AI_PROVIDER`。

如果您設定了多家服務商的 API Key，就必須設定 `AI_PROVIDER`：

```bash
AI_PROVIDER=google  # 或：openai, anthropic, google, vertexai, azure, bedrock, ollama, openrouter, aihubmix, deepseek, siliconflow, sglang, gateway, edgeone, doubao, modelscope, glm, qwen, qiniu, kimi, minimax, novita, mimo, atlascloud, custom
```

## 為所有使用者提供多個模型

管理員可以在伺服器上設定多個模型。所有使用者都可以使用這些模型，不需要自己的 API Key。沒有這份設定時，應用程式使用 `AI_PROVIDER` 和 `AI_MODEL` 這兩個環境變數。

有三種設定方式。

### 把設定寫進環境變數

部署在雲端時建議使用這種方式。把 `AI_MODELS_CONFIG` 設為一個 JSON 字串：

```bash
AI_MODELS_CONFIG='{"providers":[{"name":"OpenAI","provider":"openai","models":["gpt-4o"],"default":true}]}'
```

### 使用設定檔

在專案根目錄建立 `ai-models.json` 檔案。如果想放在其他位置，用 `AI_MODELS_CONFIG_PATH` 指定它的路徑。

### 在 AI_MODEL 裡列出多個模型

這是單一服務商的快速設定。如果只需要同一家服務商的多個模型，可以在 `AI_MODEL` 裡用逗號分隔列出它們。第一個模型是預設模型。

```bash
AI_PROVIDER=doubao
AI_MODEL=doubao-seed-1-8-251228,doubao-seed-1-6-flash-250828,doubao-seed-1-6-251015
```

這是等同於 `ai-models.json` 的簡寫。如果需要多家服務商，或者要自訂 `apiKeyEnv` 和 `baseUrlEnv`，請使用環境變數或設定檔。

### 範例

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

### 欄位

| 欄位 | 必填 | 作用 |
|---|---|---|
| `name` | 是 | 顯示名稱。同一家服務商可以有多份設定 |
| `provider` | 是 | 服務商類型（`openai`、`anthropic`、`google`、`bedrock` 等） |
| `models` | 是 | 模型 ID 列表 |
| `default` | 否 | 設為 `true` 時，預設選取這家服務商的第一個模型 |
| `apiKeyEnv` | 否 | 自訂的 API Key 環境變數名稱。不填時使用服務商的標準變數，例如 `OPENAI_API_KEY`。也可以寫成環境變數名稱陣列：每次請求從有值的變數中隨機選一個，把負載分攤到多個 Key 上 |
| `baseUrlEnv` | 否 | 自訂的基礎 URL 環境變數名稱 |

### Key 和名稱

- API Key 和憑證都透過環境變數提供。預設使用標準變數名稱，例如 `OPENAI_API_KEY`。用 `apiKeyEnv` 可以改用您自己的變數名稱。
- 有了 `name`，同一家服務商可以有多份設定。例如「OpenAI Production」和「OpenAI Staging」都使用 `provider: "openai"`，但 `apiKeyEnv` 不同。

## 選擇模型

畫圖時，模型要寫出很長的 draw.io XML，並且必須符合嚴格的格式，所以這項任務需要能力很強的模型。

推薦模型：Claude Sonnet 4.5 或 Opus 4.5。

Ollama 可以作為服務商使用。但對這項任務來說，通常只有在本機執行 DeepSeek R1 或 Qwen3-235B 這樣的強大模型時才實用。

| 您想要 | 推薦使用 |
|---|---|
| 最佳體驗 | 能讀圖片的模型（GPT-4o、Claude、Gemini），用於把圖片轉成圖表 |
| 低成本 | DeepSeek，價格有競爭力 |
| 隱私 | Ollama，完全在本機離線執行。需要效能強大的硬體 |
| 靈活 | OpenRouter，透過一個 API 使用眾多模型 |

## 設定溫度（Temperature）

溫度可以不設定。需要時用環境變數設定：

```bash
TEMPERATURE=0  # 輸出更具確定性（推薦用於圖表）
```

**重要提示：** 對於不支援溫度設定的模型，請不要設定 `TEMPERATURE`，例如：

- GPT-5.1 和其他推理模型
- 某些專用模型

不設定時，模型使用它的預設行為。

## 新增一個服務商

一個服務商的全部資訊都在 `lib/providers.ts` 的一筆記錄裡：

- 用哪個 AI SDK 執行（`sdk`）
- 用什麼憑證驗證（`credential`）
- 環境變數 `<PREFIX>_API_KEY` 和 `<PREFIX>_BASE_URL` 的字首（`envPrefix`）
- 官方網址
- 在服務商選擇器裡的分組
- 選用的提示文字

設定介面、連線測試、聊天路由和管理面板都讀取這筆記錄。新增一個 OpenAI 相容服務商的步驟如下：

1. 在 `lib/providers.ts` 裡加一筆記錄，例如：

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

    如果服務商需要在基礎 URL 輸入框下方顯示提示，或在選擇器裡顯示說明，就在記錄裡加 `baseUrlHint` 或 `note` 物件，四種介面語言（`en`、`zh`、`ja`、`zh-Hant`）都要寫。不能線上列出模型的服務商，用一個簡短的 `models` 列表代替 `modelList`。
2. 在 `env.example` 裡加上 `ACME_API_KEY` 和 `ACME_BASE_URL`。有一個單元測試會檢查每筆記錄的變數都出現在這個檔案裡。
3. 在 `docs/en`、`docs/cn`、`docs/tw` 和 `docs/ja` 的本頁裡各加一節說明。
4. 把它加進 `tests/unit/provider-matrix.test.ts` 開頭的兩個清單（`MATRIX_PROVIDERS` 和 `MATRIX_MODEL_IDS`）。然後用 `npx vitest run tests/unit/provider-matrix.test.ts -u` 重新產生行為快照。新增的行都屬於這家服務商，現有的行不能變。
5. 也把它加進 `tests/unit/providers.test.ts`。這個檔案寫明了選擇器的分組，以及會改變伺服器端行為的服務商集合（自動偵測、只接受一則 system 訊息）。
6. 更新三份 README 裡的服務商數量，以及本頁的 `AI_PROVIDER` 可選值清單。
