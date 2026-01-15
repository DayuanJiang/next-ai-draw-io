# AIプロバイダーの設定

このガイドでは、next-ai-draw-io でさまざまな AI モデルプロバイダーを設定する方法について説明します。

## クイックスタート

1. `.env.example` を `.env.local` にコピーします
2. 選択したプロバイダーの API キーを設定します
3. `AI_MODEL` を希望のモデルに設定します
4. `npm run dev` を実行します

## 対応プロバイダー

### Doubao (ByteDance Volcengine)

> **無料トークン**: [Volcengine ARK プラットフォーム](https://console.volcengine.com/ark/region:ark+cn-beijing/overview?briefPage=0&briefType=introduce&type=new&utm_campaign=doubao&utm_content=aidrawio&utm_medium=github&utm_source=coopensrc&utm_term=project)に登録すると、すべてのモデルで使える50万トークンが無料で入手できます！

```bash
DOUBAO_API_KEY=your_api_key
AI_MODEL=doubao-seed-1-8-251215  # または他の Doubao モデル
```

### Google Gemini

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key
AI_MODEL=gemini-2.0-flash
```

任意のカスタムエンドポイント:

```bash
GOOGLE_BASE_URL=https://your-custom-endpoint
```

### OpenAI

```bash
OPENAI_API_KEY=your_api_key
AI_MODEL=gpt-4o
```

任意のカスタムエンドポイント（OpenAI 互換サービス用）:

```bash
OPENAI_BASE_URL=https://your-custom-endpoint/v1
```

### Anthropic

```bash
ANTHROPIC_API_KEY=your_api_key
AI_MODEL=claude-sonnet-4-5-20250514
```

任意のカスタムエンドポイント:

```bash
ANTHROPIC_BASE_URL=https://your-custom-endpoint
```

### DeepSeek

```bash
DEEPSEEK_API_KEY=your_api_key
AI_MODEL=deepseek-chat
```

任意のカスタムエンドポイント:

```bash
DEEPSEEK_BASE_URL=https://your-custom-endpoint
```

### SiliconFlow (OpenAI 互換)

```bash
SILICONFLOW_API_KEY=your_api_key
AI_MODEL=deepseek-ai/DeepSeek-V3  # 例; 任意の SiliconFlow モデル ID を使用
```

任意のカスタムエンドポイント（デフォルトは推奨ドメイン）:

```bash
SILICONFLOW_BASE_URL=https://api.siliconflow.com/v1  # または https://api.siliconflow.cn/v1
```

### SGLang

```bash
SGLANG_API_KEY=your_api_key
AI_MODEL=your_model_id
```

任意のカスタムエンドポイント:

```bash
SGLANG_BASE_URL=https://your-custom-endpoint/v1
```

### Azure OpenAI

```bash
AZURE_API_KEY=your_api_key
AZURE_RESOURCE_NAME=your-resource-name  # 必須: Azure リソース名
AI_MODEL=your-deployment-name
```

またはリソース名の代わりにカスタムエンドポイントを使用:

```bash
AZURE_API_KEY=your_api_key
AZURE_BASE_URL=https://your-resource.openai.azure.com  # AZURE_RESOURCE_NAME の代替
AI_MODEL=your-deployment-name
```

任意の推論設定:

```bash
AZURE_REASONING_EFFORT=low      # 任意: low, medium, high
AZURE_REASONING_SUMMARY=detailed  # 任意: none, brief, detailed
```

### AWS Bedrock

```bash
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AI_MODEL=anthropic.claude-sonnet-4-5-20250514-v1:0
```

注: AWS 上（IAM ロールを持つ Lambda や EC2）では、認証情報は IAM ロールから自動的に取得されます。

### OpenRouter

```bash
OPENROUTER_API_KEY=your_api_key
AI_MODEL=anthropic/claude-sonnet-4
```

任意のカスタムエンドポイント:

```bash
OPENROUTER_BASE_URL=https://your-custom-endpoint
```

### Ollama (ローカル)

```bash
AI_PROVIDER=ollama
AI_MODEL=llama3.2
```

任意のカスタム URL:

```bash
OLLAMA_BASE_URL=http://localhost:11434
```

### ModelScope

```bash
MODELSCOPE_API_KEY=your_api_key
AI_MODEL=Qwen/Qwen3-235B-A22B-Instruct-2507
```

任意のカスタムエンドポイント:

```bash
MODELSCOPE_BASE_URL=https://your-custom-endpoint
```

### Vercel AI Gateway

Vercel AI Gateway は、単一の API キーで複数の AI プロバイダーへの統合アクセスを提供します。これにより認証が簡素化され、複数の API キーを管理することなくプロバイダーを切り替えることができます。

**基本的な使用法 (Vercel ホストの Gateway):**

```bash
AI_GATEWAY_API_KEY=your_gateway_api_key
AI_MODEL=openai/gpt-4o
```

**カスタム Gateway URL (ローカル開発またはセルフホスト Gateway 用):**

```bash
AI_GATEWAY_API_KEY=your_custom_api_key
AI_GATEWAY_BASE_URL=https://your-custom-gateway.com/v1/ai
AI_MODEL=openai/gpt-4o
```

モデル形式は `provider/model` 構文を使用します:

-   `openai/gpt-4o` - OpenAI GPT-4o
-   `anthropic/claude-sonnet-4-5` - Anthropic Claude Sonnet 4.5
-   `google/gemini-2.0-flash` - Google Gemini 2.0 Flash

**設定に関する注意点:**

-   `AI_GATEWAY_BASE_URL` が設定されていない場合、デフォルトの Vercel Gateway URL (`https://ai-gateway.vercel.sh/v1/ai`) が使用されます
-   カスタムベース URL は以下の場合に便利です:
    -   カスタム Gateway インスタンスを使用したローカル開発
    -   セルフホスト AI Gateway デプロイメント
    -   エンタープライズプロキシ設定
-   カスタムベース URL を使用する場合、`AI_GATEWAY_API_KEY` も指定する必要があります

[Vercel AI Gateway ダッシュボード](https://vercel.com/ai-gateway)から API キーを取得してください。

## 自動検出

**1つ**のプロバイダーの API キーのみを設定した場合、システムはそのプロバイダーを自動的に検出して使用します。`AI_PROVIDER` を設定する必要はありません。

**複数**の API キーを設定する場合は、`AI_PROVIDER` を明示的に設定する必要があります:

```bash
AI_PROVIDER=google  # または: openai, anthropic, deepseek, siliconflow, doubao, azure, bedrock, openrouter, ollama, gateway, sglang
```

## サーバーサイドマルチモデル設定

管理者は、ユーザーが個人のAPIキーを提供することなく利用できる複数のサーバーサイドモデルを設定できます。

### 設定方法

**方法1：環境変数**（クラウドデプロイ推奨）

`AI_MODELS_CONFIG` をJSON文字列として設定：

```bash
AI_MODELS_CONFIG='{"providers":[{"name":"OpenAI","provider":"openai","models":["gpt-4o"],"default":true}]}'
```

**方法2：設定ファイル**

プロジェクトルートに `ai-models.json` ファイルを作成します（または `AI_MODELS_CONFIG_PATH` でパスを指定）。

### 設定例

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

### フィールド説明

| フィールド | 必須 | 説明 |
|------------|------|------|
| `name` | はい | 表示名（同一プロバイダーの複数設定をサポート） |
| `provider` | はい | プロバイダータイプ（`openai`, `anthropic`, `google`, `bedrock` など） |
| `models` | はい | モデルIDのリスト |
| `default` | いいえ | `true` に設定すると、そのプロバイダーの最初のモデルがデフォルトで選択されます |
| `apiKeyEnv` | いいえ | カスタムAPIキー環境変数名（デフォルトは `OPENAI_API_KEY` などの標準変数） |
| `baseUrlEnv` | いいえ | カスタムBase URL環境変数名 |

### 備考

- APIキーと認証情報は環境変数で提供します。デフォルトは標準変数名（例：`OPENAI_API_KEY`）を使用しますが、`apiKeyEnv` でカスタム変数名を指定できます。
- `name` フィールドにより同一プロバイダーの複数設定が可能です（例：「OpenAI Production」と「OpenAI Staging」が両方とも `provider: "openai"` を使用しつつ、異なる `apiKeyEnv` を持つ）。
- 設定が存在しない場合、アプリは `AI_PROVIDER`/`AI_MODEL` 環境変数設定にフォールバックします。

## モデル性能要件

このタスクは、厳密なフォーマット制約（draw.io XML）を伴う長文テキストの生成を含むため、非常に強力なモデル性能が必要です。

**推奨モデル**:

-   Claude Sonnet 4.5 / Opus 4.5

**Ollama に関する注意**: Ollama はプロバイダーとしてサポートされていますが、DeepSeek R1 や Qwen3-235B のような高性能モデルをローカルで実行していない限り、このユースケースでは一般的に実用的ではありません。

## Temperature（温度）設定

環境変数で Temperature を任意に設定できます:

```bash
TEMPERATURE=0  # より決定論的な出力（ダイアグラムに推奨）
```

**重要**: 以下の Temperature 設定をサポートしていないモデルでは、`TEMPERATURE` を未設定のままにしてください:
- GPT-5.1 およびその他の推論モデル
- 一部の特殊なモデル

未設定の場合、モデルはデフォルトの挙動を使用します。

## 推奨事項

-   **最高の体験**: 画像からダイアグラムを生成する機能には、ビジョン（画像認識）をサポートするモデル（GPT-4o, Claude, Gemini）を使用してください
-   **低コスト**: DeepSeek は競争力のある価格を提供しています
-   **プライバシー**: 完全にローカルなオフライン操作には Ollama を使用してください（強力なハードウェアが必要です）
-   **柔軟性**: OpenRouter は単一の API で多数のモデルへのアクセスを提供します
