# Next AI Draw.io

<div align="center">

**AI搭載のダイアグラム作成ツール - チャット、描画、可視化**

[English](../../README.md) | [中文](../cn/README_CN.md) | 日本語

[![TrendShift](https://trendshift.io/api/badge/repositories/15449)](https://next-ai-drawio.jiang.jp/)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Next.js](https://img.shields.io/badge/Next.js-16.x-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.x-61dafb)](https://react.dev/)
[![Sponsor](https://img.shields.io/badge/Sponsor-❤-ea4aaa)](https://github.com/sponsors/DayuanJiang)

[![Live Demo](../../public/live-demo-button.svg)](https://next-ai-drawio.jiang.jp/)

</div>

AI機能とdraw.ioダイアグラムを統合したNext.jsウェブアプリケーションです。自然言語コマンドとAI支援の可視化により、ダイアグラムを作成、修正、強化できます。

> 注：<img src="https://raw.githubusercontent.com/DayuanJiang/next-ai-draw-io/main/public/doubao-color.png" alt="" height="20" /> [ByteDance Doubao](https://console.volcengine.com/ark/region:ark+cn-beijing/overview?briefPage=0&briefType=introduce&type=new&utm_campaign=doubao&utm_content=aidrawio&utm_medium=github&utm_source=coopensrc&utm_term=project) のご支援により、デモサイトに強力な K2-thinking モデルを導入しました！

https://github.com/user-attachments/assets/b2eef5f3-b335-4e71-a755-dc2e80931979

## 目次
- [Next AI Draw.io](#next-ai-drawio)
  - [目次](#目次)
  - [例](#例)
  - [機能](#機能)
  - [MCPサーバー（プレビュー）](#mcpサーバープレビュー)
    - [Claude Code CLI](#claude-code-cli)
  - [はじめに](#はじめに)
    - [オンラインで試す](#オンラインで試す)
    - [デスクトップアプリケーション](#デスクトップアプリケーション)
    - [Dockerで実行](#dockerで実行)
    - [インストール](#インストール)
  - [デプロイ](#デプロイ)
    - [EdgeOne Pagesへのデプロイ](#edgeone-pagesへのデプロイ)
    - [Vercelへのデプロイ](#vercelへのデプロイ)
    - [Cloudflare Workersへのデプロイ](#cloudflare-workersへのデプロイ)
  - [マルチプロバイダーサポート](#マルチプロバイダーサポート)
  - [仕組み](#仕組み)
  - [サポート＆お問い合わせ](#サポートお問い合わせ)
  - [スター履歴](#スター履歴)

## 例

以下はいくつかのプロンプト例と生成されたダイアグラムです：

<div align="center">
<table width="100%">
  <tr>
    <td colspan="2" valign="top" align="center">
      <strong>アニメーションTransformerコネクタ</strong><br />
      <p><strong>プロンプト：</strong> **アニメーションコネクタ**付きのTransformerアーキテクチャ図を作成してください。</p>
      <img src="../../public/animated_connectors.svg" alt="アニメーションコネクタ付きTransformerアーキテクチャ" width="480" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>GCPアーキテクチャ図</strong><br />
      <p><strong>プロンプト：</strong> **GCPアイコン**を使用してGCPアーキテクチャ図を生成してください。この図では、ユーザーがインスタンス上でホストされているフロントエンドに接続します。</p>
      <img src="../../public/gcp_demo.svg" alt="GCPアーキテクチャ図" width="480" />
    </td>
    <td width="50%" valign="top">
      <strong>AWSアーキテクチャ図</strong><br />
      <p><strong>プロンプト：</strong> **AWSアイコン**を使用してAWSアーキテクチャ図を生成してください。この図では、ユーザーがインスタンス上でホストされているフロントエンドに接続します。</p>
      <img src="../../public/aws_demo.svg" alt="AWSアーキテクチャ図" width="480" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>Azureアーキテクチャ図</strong><br />
      <p><strong>プロンプト：</strong> **Azureアイコン**を使用してAzureアーキテクチャ図を生成してください。この図では、ユーザーがインスタンス上でホストされているフロントエンドに接続します。</p>
      <img src="../../public/azure_demo.svg" alt="Azureアーキテクチャ図" width="480" />
    </td>
    <td width="50%" valign="top">
      <strong>猫のスケッチ</strong><br />
      <p><strong>プロンプト：</strong> かわいい猫を描いてください。</p>
      <img src="../../public/cat_demo.svg" alt="猫の絵" width="240" />
    </td>
  </tr>
</table>
</div>

## 機能

-   **LLM搭載のダイアグラム作成**：大規模言語モデルを活用して、自然言語コマンドで直接draw.ioダイアグラムを作成・操作
-   **画像ベースのダイアグラム複製**：既存のダイアグラムや画像をアップロードし、AIが自動的に複製・強化
-   **PDFとテキストファイルのアップロード**：PDFドキュメントやテキストファイルをアップロードして、既存のドキュメントからコンテンツを抽出し、ダイアグラムを生成
-   **AI推論プロセス表示**：サポートされているモデル（OpenAI o1/o3、Gemini、Claudeなど）のAIの思考プロセスを表示
-   **ダイアグラム履歴**：すべての変更を追跡する包括的なバージョン管理。AI編集前のダイアグラムの以前のバージョンを表示・復元可能
-   **インタラクティブなチャットインターフェース**：AIとリアルタイムでコミュニケーションしてダイアグラムを改善
-   **クラウドアーキテクチャダイアグラムサポート**：クラウドアーキテクチャダイアグラムの生成を専門的にサポート（AWS、GCP、Azure）
-   **アニメーションコネクタ**：より良い可視化のためにダイアグラム要素間に動的でアニメーション化されたコネクタを作成

## MCPサーバー（プレビュー）

> **プレビュー機能**：この機能は実験的であり、安定しない可能性があります。

MCP（Model Context Protocol）を介して、Claude Desktop、Cursor、VS CodeなどのAIエージェントでNext AI Draw.ioを使用できます。

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

### Claude Code CLI

```bash
claude mcp add drawio -- npx @next-ai-drawio/mcp-server@latest
```

Claudeにダイアグラムの作成を依頼：
> 「ログイン、MFA、セッション管理を含むユーザー認証のフローチャートを作成してください」

ダイアグラムがリアルタイムでブラウザに表示されます！

詳細は[MCPサーバーREADME](../../packages/mcp-server/README.md)をご覧ください（VS Code、Cursorなどのクライアント設定も含む）。

## はじめに

### オンラインで試す

インストール不要！デモサイトで直接お試しください：

[![Live Demo](../../public/live-demo-button.svg)](https://next-ai-drawio.jiang.jp/)

> **自分のAPIキーを使用**：自分のAPIキーを使用することで、デモサイトの利用制限を回避できます。チャットパネルの設定アイコンをクリックして、プロバイダーとAPIキーを設定してください。キーはブラウザのローカルに保存され、サーバーには保存されません。

### デスクトップアプリケーション

[Releases ページ](https://github.com/DayuanJiang/next-ai-draw-io/releases)からお使いのプラットフォーム用のネイティブデスクトップアプリをダウンロードしてください：

対応プラットフォーム：Windows、macOS、Linux。

### Dockerで実行

[Docker ガイドを参照](./docker.md)

### インストール

1. リポジトリをクローン：

```bash
git clone https://github.com/DayuanJiang/next-ai-draw-io
cd next-ai-draw-io
npm install
cp env.example .env.local
```

詳細な設定手順については[プロバイダー設定ガイド](./ai-providers.md)を参照してください。

2. 開発サーバーを起動：

```bash
npm run dev
```

3. ブラウザで[http://localhost:6002](http://localhost:6002)を開いてアプリケーションを確認。

## デプロイ

### EdgeOne Pagesへのデプロイ

[Tencent EdgeOne Pages](https://pages.edgeone.ai/)を使用してワンクリックでデプロイできます。

このボタンでデプロイ：

[![Deploy to EdgeOne Pages](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/pages/new?repository-url=https%3A%2F%2Fgithub.com%2FDayuanJiang%2Fnext-ai-draw-io)

詳細は[Tencent EdgeOne Pagesドキュメント](https://pages.edgeone.ai/document/deployment-overview)をご覧ください。

また、Tencent EdgeOne Pagesでデプロイすると、[DeepSeekモデルの毎日の無料クォータ](https://pages.edgeone.ai/document/edge-ai)が付与されます。

### Vercelへのデプロイ

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDayuanJiang%2Fnext-ai-draw-io)

Next.jsアプリをデプロイする最も簡単な方法は、Next.jsの作成者による[Vercelプラットフォーム](https://vercel.com/new)を使用することです。ローカルの`.env.local`ファイルと同様に、Vercelダッシュボードで**環境変数を設定**してください。

詳細は[Next.jsデプロイメントドキュメント](https://nextjs.org/docs/app/building-your-application/deploying)をご覧ください。

### Cloudflare Workersへのデプロイ

[Cloudflare デプロイガイドを参照](./cloudflare-deploy.md)


## マルチプロバイダーサポート

-   [ByteDance Doubao](https://console.volcengine.com/ark/region:ark+cn-beijing/overview?briefPage=0&briefType=introduce&type=new&utm_campaign=doubao&utm_content=aidrawio&utm_medium=github&utm_source=coopensrc&utm_term=project)
-   AWS Bedrock（デフォルト）
-   OpenAI
-   Anthropic
-   Google AI
-   Azure OpenAI
-   Ollama
-   OpenRouter
-   DeepSeek
-   SiliconFlow
-   SGLang
-   Vercel AI Gateway

AWS BedrockとOpenRouter以外のすべてのプロバイダーはカスタムエンドポイントをサポートしています。

📖 **[詳細なプロバイダー設定ガイド](./ai-providers.md)** - 各プロバイダーの設定手順をご覧ください。

**モデル要件**：このタスクは厳密なフォーマット制約（draw.io XML）を持つ長文テキスト生成を伴うため、強力なモデル機能が必要です。Claude Sonnet 4.5、GPT-5.1、Gemini 3 Pro、DeepSeek V3.2/R1を推奨します。

注：`claude`シリーズはAWS、Azure、GCPなどのクラウドアーキテクチャロゴ付きのdraw.ioダイアグラムで学習されているため、クラウドアーキテクチャダイアグラムを作成したい場合は最適な選択です。


## 仕組み

本アプリケーションは以下の技術を使用しています：

-   **Next.js**：フロントエンドフレームワークとルーティング
-   **Vercel AI SDK**（`ai` + `@ai-sdk/*`）：ストリーミングAIレスポンスとマルチプロバイダーサポート
-   **react-drawio**：ダイアグラムの表現と操作

ダイアグラムはdraw.ioでレンダリングできるXMLとして表現されます。AIがコマンドを処理し、それに応じてこのXMLを生成または変更します。


## サポート＆お問い合わせ

**デモサイトのAPIトークン使用を支援してくださった[ByteDance Doubao](https://console.volcengine.com/ark/region:ark+cn-beijing/overview?briefPage=0&briefType=introduce&type=new&utm_campaign=doubao&utm_content=aidrawio&utm_medium=github&utm_source=coopensrc&utm_term=project)に特別な感謝を申し上げます！** ARKプラットフォームに登録すると、50万トークンが無料でもらえます！

このプロジェクトが役に立ったら、ライブデモサイトのホスティングを支援するために[スポンサー](https://github.com/sponsors/DayuanJiang)をご検討ください！

サポートやお問い合わせについては、GitHubリポジトリでissueを開くか、メンテナーにご連絡ください：

-   メール：me[at]jiang.jp

## スター履歴

[![Star History Chart](https://api.star-history.com/svg?repos=DayuanJiang/next-ai-draw-io&type=date&legend=top-left)](https://www.star-history.com/#DayuanJiang/next-ai-draw-io&type=date&legend=top-left)

---
