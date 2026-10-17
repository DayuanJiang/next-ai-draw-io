<div align="center">

# Next AI Draw.io

**AI とチャットしながら draw.io のダイアグラムを描き、直す。**

[English](../../README.md) | [中文](../cn/README_CN.md) | 日本語

[![TrendShift](https://trendshift.io/api/badge/repositories/15449)](https://next-ai-drawio.jiang.jp/)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Sponsor](https://img.shields.io/badge/Sponsor-❤-ea4aaa)](https://github.com/sponsors/DayuanJiang)

[**オンラインデモ**](https://next-ai-drawio.jiang.jp/) · [**ドキュメント**](https://next-ai-drawio.jiang.jp/ja/docs) · [**ギャラリー**](https://next-ai-drawio.jiang.jp/ja/gallery) · [**デスクトップアプリ**](https://github.com/DayuanJiang/next-ai-draw-io/releases) · [**MCP サーバー**](https://next-ai-drawio.jiang.jp/ja/mcp)

</div>

https://github.com/user-attachments/assets/66b9f12f-219f-4d62-acc0-0725e6850eec

欲しいダイアグラムを一文で伝えると、AI が本物の draw.io キャンバスに描きます。普通の draw.io ファイルと同じように手で直すことも、図形をいくつか選んで AI に変更を頼むこともできます。AI の変更はすべてバージョンとして残り、比較・復元・取り消しができます。結果は `.drawio`、`.png`、`.svg` で書き出せます。

Web アプリ、Windows / macOS / Linux 向けデスクトップアプリ、そして Claude Code、Cursor、VS Code などの AI エージェントから呼び出せる MCP サーバーとして使えます。

## 特長

**描く**

-   アーキテクチャ図、フローチャート、シーケンス図などを一文から生成。AWS、Azure、GCP、Kubernetes のアイコンライブラリを内蔵
-   コネクタに流れるアニメーションを付けられる
-   スクリーンショットや手描きの図をアップロードすると AI が描き直す。PDF、Markdown、コードなどのテキストファイルからも内容を図にできる

**直す**

-   チャットで修正：変更はストリーミングでキャンバスに反映され、AI が変更した図形はハイライト表示
-   選択して頼む：キャンバスで図形を選ぶと、AI はその図形だけを変更
-   バージョンと取り消し：AI の変更ごとにサムネイル付きのバージョンカードが残り、キャンバスと比較・復元・取り消しができる。キャンバス上の Ctrl+Z でも AI の変更を一度で戻せる
-   ただの draw.io ダイアグラム：ダブルクリックで名前を変え、ドラッグし、スタイルを変え、複数ページを使い、いつでも `.drawio`、`.png`、`.svg`、`.drawio.svg` に書き出せる

**使う**

-   24 のモデルプロバイダーに対応。自分の API キーをブラウザに入力でき、キーは端末内にだけ保存される
-   推論するモデルは思考過程を表示
-   ダークモード。UI は英語、簡体字中国語、繁体字中国語、日本語に対応

## 例

<div align="center">
<table width="100%">
  <tr>
    <td width="50%" valign="top">
      <strong>AWS の高可用性 Web アプリ</strong><br />
      <p><strong>プロンプト：</strong> Draw an AWS architecture for a highly available web app across two Availability Zones with AWS icons: Route 53, CloudFront with AWS WAF, an Application Load Balancer, ECS Fargate services in private subnets, Aurora PostgreSQL with a writer and a reader, ElastiCache for Redis, S3 for static assets, NAT gateways, and CloudWatch for monitoring.</p>
      <p><strong>モデル：</strong> Claude Opus 5.5（Claude Code から MCP サーバー経由）</p>
      <img src="../../public/gallery/aws-ha.svg" alt="AWS の高可用性 Web アプリ" width="400" />
    </td>
    <td width="50%" valign="top">
      <strong>Web ショップの Kubernetes デプロイ</strong><br />
      <p><strong>プロンプト：</strong> Draw a Kubernetes deployment for a web shop: an ingress, web and API deployments with their services and pods, a Redis StatefulSet with a persistent volume, a ConfigMap, a Secret, and an autoscaler on the API.</p>
      <p><strong>モデル：</strong> Claude Opus 5.5（Claude Code から MCP サーバー経由）</p>
      <img src="../../public/gallery/kubernetes.svg" alt="Web ショップの Kubernetes デプロイ" width="400" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>オンラインショップの ER 図</strong><br />
      <p><strong>プロンプト：</strong> Draw an ER diagram for an online shop: customers, addresses, orders, order items, products, categories and payments, with primary and foreign keys and the cardinality of each relationship.</p>
      <p><strong>モデル：</strong> Claude Opus 5.5（Claude Code から MCP サーバー経由）</p>
      <img src="../../public/gallery/er-shop.svg" alt="オンラインショップの ER 図" width="400" />
    </td>
    <td width="50%" valign="top">
      <strong>BPMN の経費精算プロセス</strong><br />
      <p><strong>プロンプト：</strong> Draw a BPMN process for an expense claim: an employee submits it, the manager approves or rejects it, finance checks the receipts and pays, and the claim goes back to the employee when receipts are missing.</p>
      <p><strong>モデル：</strong> Claude Opus 5.5（Claude Code から MCP サーバー経由）</p>
      <img src="../../public/gallery/bpmn-expense.svg" alt="BPMN の経費精算プロセス" width="400" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>アニメーション付きの Transformer 構成</strong><br />
      <p><strong>プロンプト：</strong> Give me an animated connector diagram of transformer's architecture.</p>
      <p><strong>モデル：</strong> Claude Opus 5.5（Claude Code から MCP サーバー経由）</p>
      <img src="../../public/gallery/transformer.svg" alt="アニメーション付きの Transformer 構成" width="400" />
    </td>
    <td width="50%" valign="top">
      <strong>モバイルバンキングのカスタマージャーニーマップ</strong><br />
      <p><strong>プロンプト：</strong> Draw a customer journey map for a mobile banking app across five stages (discover, sign up, first payment, everyday use, get help), with the customer's actions, touchpoints, feelings and pain points in each stage, and an opportunity for each pain point.</p>
      <p><strong>モデル：</strong> Claude Opus 5.5（Claude Code から MCP サーバー経由）</p>
      <img src="../../public/gallery/journey-map.svg" alt="モバイルバンキングのカスタマージャーニーマップ" width="400" />
    </td>
  </tr>
</table>
</div>

ほかの例と、それぞれのプロンプトやモデルは **[ギャラリー](https://next-ai-drawio.jiang.jp/ja/gallery)** にあります。

## 使い方

### オンラインデモ

[next-ai-drawio.jiang.jp](https://next-ai-drawio.jiang.jp/) を開けばすぐ使えます。インストールは不要です。デモサイトには利用上限があります。チャットパネルの設定アイコンから自分のプロバイダーと API キーを入力すると上限なしで使えます。キーはブラウザ内にだけ保存され、サーバーには送られません。

### デスクトップアプリ

[Releases ページ](https://github.com/DayuanJiang/next-ai-draw-io/releases) から Windows、macOS、Linux 向けのインストーラーをダウンロードしてください。

### AI エージェントから使う（MCP）

https://github.com/user-attachments/assets/6f53a67b-ab21-4113-9fee-7fb32f9de678

MCP（Model Context Protocol、AI エージェントが外部ツールを呼び出すためのプロトコル）を通して、Claude Desktop、Cursor、VS Code などから直接 draw.io のダイアグラムを描けます。クライアントの MCP 設定に次を追加します。

```json
{
  "mcpServers": {
    "drawio": {
      "command": "npx",
      "args": ["@next-ai-drawio/mcp-server@latest"]
    }
  }
}
```

VS Code と Cursor はボタン一つで追加できます：[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square)](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522drawio%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522%2540next-ai-drawio%252Fmcp-server%2540latest%2522%255D%257D) [![Add to Cursor](https://img.shields.io/badge/Cursor-Add_Server-000000?style=flat-square)](https://cursor.com/en/install-mcp?name=drawio&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJAbmV4dC1haS1kcmF3aW8vbWNwLXNlcnZlckBsYXRlc3QiXX0%3D)

Claude Code ならコマンド一つです（`--scope user` を付けると、どのプロジェクトでも使えます）。

```bash
claude mcp add --scope user drawio -- npx @next-ai-drawio/mcp-server@latest
```

Claude Code のコミュニティプラグインマーケットプレイスにもプラグインとして登録されています（Claude Code 2.1.275 以降）。

```text
/plugin install next-ai-drawio --marketplace anthropics/claude-plugins-community
```

あとは AI に「ログイン、MFA、セッション管理を含むユーザー認証のフローチャートを描いて」と頼めば、描かれていく様子がブラウザに表示されます。MCP サーバーには Web アプリの作図機能のほとんどが入っています。

-   Web アプリと同じ作図ルール、アイコンライブラリ（AWS、Azure、GCP、Kubernetes など）、キャンバス。AI の変更には印が付き、Ctrl+Z 一回で元に戻せ、選択中の図形を AI が読み取れる
-   スクリーンショットツール。AI が描いた結果を確認して自分で直せる
-   バージョン履歴、複数ページ、`.drawio`、`.png`、`.svg`、`.drawio.svg` での書き出し、`~/.next-ai-drawio/` への自動保存。draw.io エディターはパッケージに同梱されているので、プレビューはオフラインでも動く

Codex、VS Code、Cursor などの設定、すべてのツール、ほかの draw.io MCP サーバーとの比較は、[MCP サーバーのページ](https://next-ai-drawio.jiang.jp/ja/mcp)を参照してください。

### draw.io 標準の AI との違い

draw.io には Generate ツール（Arrange > Insert > Generate）があります。draw.io の中で無料のホスト型モデルか自分の API キーで動き、チャットに添付したダイアグラム、ページ、選択中の図形を変更できます。Next AI Draw.io はメッセージごとに、手作業の変更も含めた現在のキャンバスを送ります。AI の変更はすべてバージョンになり、比較や復元ができます。Ollama のローカルモデルを含む 25 のプロバイダーに対応し、デモサイト、デスクトップアプリ、自分のサーバーのどれでも使えます。

## 自分でホストする

### ローカルで動かす

```bash
git clone https://github.com/DayuanJiang/next-ai-draw-io
cd next-ai-draw-io
npm install
cp env.example .env.local   # プロバイダーと API キーを記入。下の「モデルとプロバイダー」を参照
npm run dev
```

[http://localhost:6002](http://localhost:6002) を開きます。

### ワンクリックデプロイ

| プラットフォーム | 方法 |
| --- | --- |
| Tencent EdgeOne Pages | [![Deploy to EdgeOne Pages](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/pages/new?repository-url=https%3A%2F%2Fgithub.com%2FDayuanJiang%2Fnext-ai-draw-io) デプロイすると [DeepSeek モデルの毎日の無料クォータ](https://pages.edgeone.ai/document/edge-ai) も付きます |
| Vercel | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDayuanJiang%2Fnext-ai-draw-io) `.env.local` と同じ環境変数を Vercel のダッシュボードで設定してください |
| Cloudflare Workers | [Cloudflare デプロイガイド](./cloudflare-deploy.md) |
| Docker | [Docker ガイド](./docker.md) |
| オフラインまたは社内ネットワーク | [オフラインデプロイ](./offline-deployment.md) |

### モデルとプロバイダー

AWS Bedrock（既定）、OpenAI、Anthropic、Google AI、Google Vertex AI、Azure OpenAI、Ollama、OpenRouter、AIHubMix、DeepSeek、SiliconFlow、SGLang、Vercel AI Gateway、Tencent EdgeOne、ByteDance Doubao、ModelScope、Zhipu GLM、Qwen、Qiniu、Kimi、MiniMax、Novita、Xiaomi MiMo、Atlas Cloud、および任意の URL を使える OpenAI 互換プリセット（vLLM、LM Studio、ゲートウェイ）の 25 プロバイダーに対応しています。各プロバイダーの環境変数と注意点は[プロバイダー設定ガイド](./ai-providers.md)にあります。

**どのモデルを選ぶか**：厳密な形式の長いテキスト（draw.io の XML）を生成するタスクなので、能力の高いモデルを選んでください。小さなモデルは壊れた図を出しがちです。

**複数モデルと管理パネル**：`AI_MODEL` にモデル ID をカンマ区切りで並べるか、`AI_MODELS_CONFIG` 環境変数または `ai-models.json` ファイルで複数プロバイダーのモデルを設定すると、全ユーザーが自分のキーなしで使えます。`ADMIN_PASSWORD` を設定して `/admin` を開くと、モデル、アクセスコード、機能の切り替え、オブザーバビリティ、クォータを Web 画面から管理できます。[管理パネルガイド](./admin-panel.md)を参照してください。

## サポート

-   質問や提案：[GitHub Issue](https://github.com/DayuanJiang/next-ai-draw-io/issues) を立てるか、me[at]jiang.jp までメールしてください
-   よくある問題：[FAQ](./FAQ.md)
-   このプロジェクトが役に立ったら、デモサイトの運営のために[スポンサー](https://github.com/sponsors/DayuanJiang)をご検討ください

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=DayuanJiang/next-ai-draw-io&type=date&legend=top-left)](https://www.star-history.com/#DayuanJiang/next-ai-draw-io&type=date&legend=top-left)

</div>
