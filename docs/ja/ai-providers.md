# AI プロバイダー

Next AI Draw.io を自分でホストする場合は、環境変数で AI プロバイダーとモデルを選びます。このページでは、プロバイダーごとの環境変数と、全ユーザーに複数のモデルを提供する方法、コードに新しいプロバイダーを追加する方法を説明します。

## はじめる

1. `env.example` を `.env.local` にコピーします。
2. 選んだプロバイダーの API キーを設定します。
3. `AI_MODEL` に使いたいモデルを設定します。
4. `npm run dev` を実行します。

## プロバイダーごとに設定する

### OpenAI

```bash
OPENAI_API_KEY=your_api_key
AI_MODEL=gpt-4o
```

OpenAI 互換サービスを使う場合は、カスタムエンドポイントも設定できます。

```bash
OPENAI_BASE_URL=https://your-custom-endpoint/v1
```

LM Studio などのローカルな OpenAI 互換サーバーも同じ方法で使えます。ベース URL を `http://localhost:1234/v1`（LM Studio の既定ポート）に設定し、API キーには `lm-studio` など空でない任意の値を入力してください。上の環境変数でも、設定の「モデル」タブでも設定できます。

### Anthropic

```bash
ANTHROPIC_API_KEY=your_api_key
AI_MODEL=claude-sonnet-4-5-20250929
```

Bearer トークンでサインインすることもできます。OAuth スタイルのトークンを発行するゲートウェイを経由する場合などです。

```bash
ANTHROPIC_AUTH_TOKEN=your_auth_token
AI_MODEL=claude-sonnet-4-5-20250929
```

`ANTHROPIC_API_KEY` は `x-api-key` ヘッダーで送信され、`ANTHROPIC_AUTH_TOKEN` は `Authorization: Bearer <token>` で送信されます。2 つは同時に使えないので、どちらか一方だけを設定してください。

必要に応じて、カスタムエンドポイントを設定できます。

```bash
ANTHROPIC_BASE_URL=https://your-custom-endpoint
```

### Google Gemini

```bash
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key
AI_MODEL=gemini-2.0-flash
```

必要に応じて、カスタムエンドポイントを設定できます。

```bash
GOOGLE_BASE_URL=https://your-custom-endpoint
```

### DeepSeek

```bash
DEEPSEEK_API_KEY=your_api_key
AI_MODEL=deepseek-chat
```

必要に応じて、カスタムエンドポイントを設定できます。

```bash
DEEPSEEK_BASE_URL=https://your-custom-endpoint
```

### Qwen（Alibaba Cloud）

```bash
QWEN_API_KEY=your_api_key
AI_MODEL=qwen-turbo
```

必要に応じて、カスタムエンドポイントを設定できます。

```bash
QWEN_BASE_URL=https://your-custom-endpoint
```

### Doubao（ByteDance Volcengine）

```bash
DOUBAO_API_KEY=your_api_key
AI_MODEL=doubao-seed-1-8-251228  # または他の Doubao モデル
```

### GLM（Zhipu AI）

```bash
GLM_API_KEY=your_api_key
AI_MODEL=glm-4
```

必要に応じて、カスタムエンドポイントを設定できます。

```bash
GLM_BASE_URL=https://your-custom-endpoint
```

### Kimi（Moonshot AI）

```bash
KIMI_API_KEY=your_api_key
AI_MODEL=kimi-latest
```

必要に応じて、カスタムエンドポイントを設定できます。

```bash
KIMI_BASE_URL=https://your-custom-endpoint
```

### MiniMax

MiniMax は 2 つの API 形式に対応しています。

| 形式 | エンドポイント | 説明 |
|---|---|---|
| Anthropic 互換 | `/anthropic` | 推奨です。インターリーブ思考（モデルがツール呼び出しの合間に考えること）に対応しています |
| OpenAI 互換 | `/v1` | 標準的な OpenAI のチャット補完の形式です |

```bash
MINIMAX_API_KEY=your_api_key
AI_MODEL=MiniMax-M3
```

オプションの設定です。

```bash
# 中国大陸版、Anthropic 互換（デフォルト）
MINIMAX_BASE_URL=https://api.minimaxi.com/anthropic

# 中国大陸版、OpenAI 互換
MINIMAX_BASE_URL=https://api.minimaxi.com/v1

# 国際版、Anthropic 互換
MINIMAX_BASE_URL=https://api.minimax.io/anthropic

# 国際版、OpenAI 互換
MINIMAX_BASE_URL=https://api.minimax.io/v1
```

### MiMo（Xiaomi）

```bash
MIMO_API_KEY=your_api_key
AI_MODEL=mimo-v2.5-pro
```

必要に応じて、カスタムエンドポイントを設定できます。Token Plan 加入者は、専用のベース URL を設定してください。

```bash
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
```

### OpenRouter

```bash
OPENROUTER_API_KEY=your_api_key
AI_MODEL=anthropic/claude-sonnet-4
```

必要に応じて、カスタムエンドポイントを設定できます。

```bash
OPENROUTER_BASE_URL=https://your-custom-endpoint
```

### AIHubMix

AIHubMix では、1 つの API キーで Claude、GPT、Gemini、DeepSeek などのモデルを使えます。

```bash
AIHUBMIX_API_KEY=your_api_key
AI_MODEL=claude-sonnet-4-5-20250929
```

必要に応じて、カスタムエンドポイントを設定できます。

```bash
AIHUBMIX_BASE_URL=https://aihubmix.com/v1
```

### SiliconFlow（OpenAI 互換）

```bash
SILICONFLOW_API_KEY=your_api_key
AI_MODEL=deepseek-ai/DeepSeek-V3  # 例; 任意の SiliconFlow モデル ID を使用
```

ベース URL を設定しない場合、アプリは `https://api.siliconflow.cn/v1` を使います。これは cloud.siliconflow.cn で作成したキー用のエンドポイントです。キーを国際版のサイト cloud.siliconflow.com で作成した場合は、.com のエンドポイントを設定してください。

```bash
SILICONFLOW_BASE_URL=https://api.siliconflow.com/v1
```

### ModelScope

```bash
MODELSCOPE_API_KEY=your_api_key
AI_MODEL=Qwen/Qwen3-235B-A22B-Instruct-2507
```

必要に応じて、カスタムエンドポイントを設定できます。

```bash
MODELSCOPE_BASE_URL=https://your-custom-endpoint
```

### Novita AI

```bash
NOVITA_API_KEY=your_api_key
AI_MODEL=deepseek/deepseek-v4-pro
```

必要に応じて、カスタムエンドポイントを設定できます。設定しない場合は `https://api.novita.ai/openai` が使われます。

```bash
NOVITA_BASE_URL=https://your-custom-endpoint
```

### Atlas Cloud

```bash
ATLASCLOUD_API_KEY=your_api_key
AI_MODEL=your_model_id
```

アプリには Atlas Cloud のモデル一覧が組み込まれていません。設定の「モデル」タブでキーを入力すると、アプリが Atlas Cloud からモデル一覧を読み込みます。

必要に応じて、カスタムエンドポイントを設定できます。設定しない場合は `https://api.atlascloud.ai/v1` が使われます。

```bash
ATLASCLOUD_BASE_URL=https://your-custom-endpoint
```

### Qiniu（Qiniu Cloud）

```bash
QINIU_API_KEY=your_api_key
AI_MODEL=your_model_id
```

必要に応じて、カスタムエンドポイントを設定できます。

```bash
QINIU_BASE_URL=https://your-custom-endpoint
```

### Vercel AI Gateway

Vercel AI Gateway では、1 つの API キーで多くの AI プロバイダーを使えます。サインインが簡単になり、複数の API キーを管理しなくてもプロバイダーを切り替えられます。

Vercel がホストする Gateway を使う場合です。

```bash
AI_GATEWAY_API_KEY=your_gateway_api_key
AI_MODEL=openai/gpt-4o
```

カスタム Gateway URL を使う場合です。ローカル開発や、セルフホストの Gateway に使います。

```bash
AI_GATEWAY_API_KEY=your_custom_api_key
AI_GATEWAY_BASE_URL=https://your-custom-gateway.com/v1/ai
AI_MODEL=openai/gpt-4o
```

モデル ID は `provider/model` の形式で書きます。

| `AI_MODEL` | モデル |
|---|---|
| `openai/gpt-4o` | OpenAI GPT-4o |
| `anthropic/claude-sonnet-4-5` | Anthropic Claude Sonnet 4.5 |
| `google/gemini-2.0-flash` | Google Gemini 2.0 Flash |

`AI_GATEWAY_BASE_URL` を設定しない場合は、デフォルトの Vercel Gateway URL（`https://ai-gateway.vercel.sh/v1/ai`）が使われます。カスタムベース URL は次の場合に便利です。

- 自分の Gateway インスタンスを使ったローカル開発
- セルフホストの AI Gateway のデプロイ
- エンタープライズのプロキシ設定

カスタムベース URL を使う場合は、`AI_GATEWAY_API_KEY` も設定する必要があります。

API キーは [Vercel AI Gateway のダッシュボード](https://vercel.com/ai-gateway)で取得してください。

### Amazon Bedrock

```bash
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AI_MODEL=global.anthropic.claude-sonnet-5-5
```

最近の Claude モデルは、推論プロファイル（inference profile）の ID でのみ呼び出せます。この ID は `global.` や `us.` などのリージョン接頭辞で始まります。`anthropic.claude-sonnet-5-5` のような接頭辞なしの ID では「on-demand throughput isn't supported」というエラーになります。

AWS 上（Lambda や、IAM ロールを持つ EC2）では、認証情報は IAM ロールから自動的に取得されます。

### Google Vertex AI

Google Vertex AI は、企業向けの Google Cloud のサービスです。エンタープライズ向けの機能とデータレジデンシー（データを選んだリージョンに保管すること）を備えています。Express モードでは普通の API キーでサインインできるので、Vercel や Cloudflare などのエッジランタイムでも使えます。

```bash
GOOGLE_VERTEX_API_KEY=your_api_key
AI_MODEL=gemini-2.0-flash
```

必要に応じて、カスタムエンドポイントを設定できます。

```bash
GOOGLE_VERTEX_BASE_URL=https://your-custom-endpoint
```

### Azure OpenAI

Azure には、リソース名かエンドポイント URL のどちらかが必要です。どちらか一方を設定してください。両方を設定した場合は `AZURE_BASE_URL` が使われます。

リソース名を使う場合です。

```bash
AZURE_API_KEY=your_api_key
AZURE_RESOURCE_NAME=your-resource-name  # Azure リソース名
AI_MODEL=your-deployment-name
```

リソース名の代わりに、エンドポイント URL を指定することもできます。

```bash
AZURE_API_KEY=your_api_key
AZURE_BASE_URL=https://your-resource.openai.azure.com/openai  # AZURE_RESOURCE_NAME の代わり
AI_MODEL=your-deployment-name
```

必要に応じて、推論の設定もできます。

```bash
AZURE_REASONING_EFFORT=low      # 任意: low, medium, high
AZURE_REASONING_SUMMARY=detailed  # 任意: none, brief, detailed
```

### EdgeOne Pages（Tencent Cloud）

アプリを Tencent EdgeOne Pages にデプロイした場合は、サイト自身の Edge AI 関数 `/api/edgeai` を使えます。API キーもベース URL も要りません。検出できるキーがないので、サーバーはこのプロバイダーを自動では選べません。`AI_PROVIDER` を設定してください。

```bash
AI_PROVIDER=edgeone
AI_MODEL=@tx/deepseek-ai/deepseek-v32
```

この関数が受け付けるモデルは `@tx/deepseek-ai/deepseek-v32`、`@tx/deepseek-ai/deepseek-r1-0528`、`@tx/deepseek-ai/deepseek-v3-0324` です。`ACCESS_CODE_LIST` を設定した場合は、関数もアクセスコードを確認します。

### Ollama（ローカル）

```bash
AI_PROVIDER=ollama
AI_MODEL=llama3.2
```

必要に応じて、カスタム URL を設定できます。

```bash
OLLAMA_BASE_URL=http://localhost:11434/api
```

### SGLang

```bash
SGLANG_API_KEY=your_api_key
AI_MODEL=your_model_id
```

必要に応じて、カスタムエンドポイントを設定できます。

```bash
SGLANG_BASE_URL=https://your-custom-endpoint/v1
```

### そのほかの OpenAI 互換 API（custom）

上に挙がっていないサーバー（vLLM、LM Studio、LiteLLM、API ゲートウェイなど）は、設定で OpenAI-compatible を選び、そのベース URL とキーを入力します。キーを確認しないサーバーには、空でない任意の値を入れてください。

アプリは複数の system メッセージを 1 つにまとめます。オープンソースモデルのチャットテンプレートがそれを前提にしているためです。`<think>` 内の推論は返答から分離されます。

```bash
CUSTOM_API_KEY=your_api_key
CUSTOM_BASE_URL=http://127.0.0.1:8000/v1
AI_MODEL=your_model_id
```

## サーバーがプロバイダーを選ぶしくみ

1 つのプロバイダーの API キーだけを設定した場合は、サーバーがそのプロバイダーを自動的に検出して使います。`AI_PROVIDER` を設定する必要はありません。

複数のプロバイダーの API キーを設定した場合は、`AI_PROVIDER` を設定する必要があります。

```bash
AI_PROVIDER=google  # または: openai, anthropic, google, vertexai, azure, bedrock, ollama, openrouter, aihubmix, deepseek, siliconflow, sglang, gateway, edgeone, doubao, modelscope, glm, qwen, qiniu, kimi, minimax, novita, mimo, atlascloud, custom
```

## 全ユーザーに複数のモデルを提供する

管理者は、サーバーに複数のモデルを設定できます。全ユーザーが、自分の API キーなしでそれらのモデルを使えます。この設定がない場合、アプリは環境変数 `AI_PROVIDER` と `AI_MODEL` を使います。

設定の方法は 3 つあります。

### 設定を環境変数に書く

クラウドにデプロイする場合は、この方法をおすすめします。`AI_MODELS_CONFIG` に JSON 文字列を設定します。

```bash
AI_MODELS_CONFIG='{"providers":[{"name":"OpenAI","provider":"openai","models":["gpt-4o"],"default":true}]}'
```

### 設定ファイルを使う

プロジェクトのルートに `ai-models.json` ファイルを作成します。別の場所に置く場合は、`AI_MODELS_CONFIG_PATH` でその場所を指定します。

### AI_MODEL に複数のモデルを並べる

1 つのプロバイダー向けの簡易設定です。1 つのプロバイダーの複数のモデルだけが必要な場合は、`AI_MODEL` にカンマ区切りで並べます。最初のモデルがデフォルトになります。

```bash
AI_PROVIDER=doubao
AI_MODEL=doubao-seed-1-8-251228,doubao-seed-1-6-flash-250828,doubao-seed-1-6-251015
```

これは同じ内容の `ai-models.json` を短く書いたものです。複数のプロバイダーを使う場合や、独自の `apiKeyEnv` と `baseUrlEnv` を使う場合は、環境変数か設定ファイルを使ってください。

### 例

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

### フィールド

| フィールド | 必須 | 内容 |
|---|---|---|
| `name` | はい | 表示名です。同じプロバイダーに複数の設定を作れます |
| `provider` | はい | プロバイダーの種類です（`openai`、`anthropic`、`google`、`bedrock` など） |
| `models` | はい | モデル ID のリストです |
| `default` | いいえ | `true` にすると、このプロバイダーの最初のモデルがデフォルトで選ばれます |
| `apiKeyEnv` | いいえ | API キーを入れる独自の環境変数名です。指定しない場合は、`OPENAI_API_KEY` などプロバイダーの標準の変数を使います。環境変数名の配列も指定できます。リクエストごとに値のある変数から 1 つがランダムに選ばれ、負荷が複数のキーに分散されます |
| `baseUrlEnv` | いいえ | ベース URL を入れる独自の環境変数名です |

### キーと名前

- API キーと認証情報は環境変数で渡します。デフォルトでは `OPENAI_API_KEY` などの標準の変数名を使います。`apiKeyEnv` を使うと、独自の変数名を指定できます。
- `name` を使うと、同じプロバイダーに複数の設定を作れます。たとえば「OpenAI Production」と「OpenAI Staging」の両方で `provider: "openai"` を使い、`apiKeyEnv` をそれぞれ別にできます。

## モデルを選ぶ

図を描くとき、モデルは厳密な形式に従った長い draw.io XML を書きます。そのため、この作業にはとても高い性能のモデルが必要です。

推奨モデル：Claude Sonnet 4.5 または Opus 4.5。

Ollama もプロバイダーとして使えます。ただしこの作業では、DeepSeek R1 や Qwen3-235B のような高性能なモデルをローカルで動かす場合でないと、たいてい実用的ではありません。

| 目的 | 使うもの |
|---|---|
| 最高の体験 | 画像を読めるモデル（GPT-4o、Claude、Gemini）。画像から図を作る機能に使います |
| 低コスト | DeepSeek。競争力のある価格です |
| プライバシー | Ollama。完全にローカルで、オフラインで動きます。高性能なハードウェアが必要です |
| 柔軟性 | OpenRouter。1 つの API で多くのモデルを使えます |

## Temperature（温度）を設定する

Temperature の設定は任意です。環境変数で設定します。

```bash
TEMPERATURE=0  # より決定論的な出力（ダイアグラムに推奨）
```

**重要：** Temperature の設定に対応していないモデルでは、`TEMPERATURE` を設定しないでください。たとえば次のモデルです。

- GPT-5.1 およびその他の推論モデル
- 一部の特殊なモデル

設定しない場合、モデルはデフォルトの動作になります。

## 新しいプロバイダーを追加する

プロバイダーに関する情報は、すべて `lib/providers.ts` の 1 つのレコードにあります。

- 使用する AI SDK（`sdk`）
- サインインに使う資格情報（`credential`）
- 環境変数 `<PREFIX>_API_KEY` と `<PREFIX>_BASE_URL` のプレフィックス（`envPrefix`）
- 公式 URL
- プロバイダー選択でのグループ
- 任意の注記

設定画面、接続テスト、チャットのルート、管理パネルは、すべてこのレコードを読みます。OpenAI 互換プロバイダーを追加する手順は次のとおりです。

1. `lib/providers.ts` にレコードを追加します。例：

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

    ベース URL 欄の下にヒントを表示したいプロバイダーや、プロバイダー選択に注記を表示したいプロバイダーには、`baseUrlHint` または `note` オブジェクトを追加します。4 つの UI 言語（`en`、`zh`、`ja`、`zh-Hant`）をすべて書きます。モデル一覧をオンラインで取得できないプロバイダーは、`modelList` の代わりに短い `models` リストを持ちます。
2. `env.example` に `ACME_API_KEY` と `ACME_BASE_URL` を追加します。各レコードの変数がそこにあることを、ユニットテストが確認します。
3. `docs/en`、`docs/cn`、`docs/tw`、`docs/ja` のこのページに、それぞれセクションを追加します。
4. `tests/unit/provider-matrix.test.ts` の先頭にある 2 つのリスト（`MATRIX_PROVIDERS` と `MATRIX_MODEL_IDS`）に追加します。次に `npx vitest run tests/unit/provider-matrix.test.ts -u` で動作のスナップショットを作り直します。新しく増える行はこのプロバイダーのものです。既存の行は変わってはいけません。
5. `tests/unit/providers.test.ts` にも追加します。このファイルには、プロバイダー選択のグループと、サーバーの動作を変えるプロバイダーの集合（自動検出、system メッセージが 1 つだけ）が書き出されています。
6. 3 つの README のプロバイダー数と、このページの `AI_PROVIDER` の選択肢一覧を更新します。
