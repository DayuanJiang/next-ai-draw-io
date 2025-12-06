# Next AI Draw.io

<div align="center">

**AI搭載のダイアグラム作成ツール - チャット、描画、可視化**

[English](./README.md) | [中文](./README_CN.md) | 日本語

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-15.x-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Sponsor](https://img.shields.io/badge/Sponsor-❤-ea4aaa)](https://github.com/sponsors/DayuanJiang)

[🚀 ライブデモ](https://next-ai-drawio.jiang.jp/)

</div>

AI機能とdraw.ioダイアグラムを統合したNext.jsウェブアプリケーションです。自然言語コマンドとAI支援の可視化により、ダイアグラムを作成、修正、強化できます。

https://github.com/user-attachments/assets/b2eef5f3-b335-4e71-a755-dc2e80931979

## 機能

-   **LLM搭載のダイアグラム作成**：大規模言語モデルを活用して、自然言語コマンドで直接draw.ioダイアグラムを作成・操作
-   **画像ベースのダイアグラム複製**：既存のダイアグラムや画像をアップロードし、AIが自動的に複製・強化
-   **ダイアグラム履歴**：すべての変更を追跡する包括的なバージョン管理。AI編集前のダイアグラムの以前のバージョンを表示・復元可能
-   **インタラクティブなチャットインターフェース**：AIとリアルタイムでコミュニケーションしてダイアグラムを改善
-   **AWSアーキテクチャダイアグラムサポート**：AWSアーキテクチャダイアグラムの生成を専門的にサポート
-   **アニメーションコネクタ**：より良い可視化のためにダイアグラム要素間に動的でアニメーション化されたコネクタを作成

## **例**

以下はいくつかのプロンプト例と生成されたダイアグラムです：

<div align="center">
<table width="100%">
  <tr>
    <td colspan="2" valign="top" align="center">
      <strong>アニメーションTransformerコネクタ</strong><br />
      <p><strong>プロンプト：</strong> **アニメーションコネクタ**付きのTransformerアーキテクチャ図を作成してください。</p>
      <img src="./public/animated_connectors.svg" alt="アニメーションコネクタ付きTransformerアーキテクチャ" width="480" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>GCPアーキテクチャ図</strong><br />
      <p><strong>プロンプト：</strong> **GCPアイコン**を使用してGCPアーキテクチャ図を生成してください。この図では、ユーザーがインスタンス上でホストされているフロントエンドに接続します。</p>
      <img src="./public/gcp_demo.svg" alt="GCPアーキテクチャ図" width="480" />
    </td>
    <td width="50%" valign="top">
      <strong>AWSアーキテクチャ図</strong><br />
      <p><strong>プロンプト：</strong> **AWSアイコン**を使用してAWSアーキテクチャ図を生成してください。この図では、ユーザーがインスタンス上でホストされているフロントエンドに接続します。</p>
      <img src="./public/aws_demo.svg" alt="AWSアーキテクチャ図" width="480" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>Azureアーキテクチャ図</strong><br />
      <p><strong>プロンプト：</strong> **Azureアイコン**を使用してAzureアーキテクチャ図を生成してください。この図では、ユーザーがインスタンス上でホストされているフロントエンドに接続します。</p>
      <img src="./public/azure_demo.svg" alt="Azureアーキテクチャ図" width="480" />
    </td>
    <td width="50%" valign="top">
      <strong>猫のスケッチ</strong><br />
      <p><strong>プロンプト：</strong> かわいい猫を描いてください。</p>
      <img src="./public/cat_demo.svg" alt="猫の絵" width="240" />
    </td>
  </tr>
</table>
</div>

## 仕組み

本アプリケーションは以下の技術を使用しています：

-   **Next.js**：フロントエンドフレームワークとルーティング
-   **Vercel AI SDK**（`ai` + `@ai-sdk/*`）：ストリーミングAIレスポンスとマルチプロバイダーサポート
-   **react-drawio**：ダイアグラムの表現と操作

ダイアグラムはdraw.ioでレンダリングできるXMLとして表現されます。AIがコマンドを処理し、それに応じてこのXMLを生成または変更します。

## マルチプロバイダーサポート

-   AWS Bedrock（デフォルト）
-   OpenAI
-   Anthropic
-   Google AI
-   Azure OpenAI
-   Ollama
-   OpenRouter
-   DeepSeek
-   SiliconFlow

AWS BedrockとOpenRouter以外のすべてのプロバイダーはカスタムエンドポイントをサポートしています。

📖 **[詳細なプロバイダー設定ガイド](./docs/ai-providers.md)** - 各プロバイダーの設定手順をご覧ください。

**モデル要件**：このタスクは厳密なフォーマット制約（draw.io XML）を持つ長文テキスト生成を伴うため、強力なモデル機能が必要です。Claude Sonnet 4.5、GPT-4o、Gemini 2.0、DeepSeek V3/R1を推奨します。

注：`claude-sonnet-4-5`はAWSロゴ付きのdraw.ioダイアグラムで学習されているため、AWSアーキテクチャダイアグラムを作成したい場合は最適な選択です。

## はじめに

### Dockerで実行（推奨）

ローカルで実行したいだけなら、Dockerを使用するのが最も簡単です。

まず、Dockerをインストールしていない場合はインストールしてください：[Dockerを入手](https://docs.docker.com/get-docker/)

次に実行：

```bash
docker run -d -p 3000:3000 \
  -e AI_PROVIDER=openai \
  -e AI_MODEL=gpt-4o \
  -e OPENAI_API_KEY=your_api_key \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いてください。

環境変数はお好みのAIプロバイダー設定に置き換えてください。利用可能なオプションについては[マルチプロバイダーサポート](#マルチプロバイダーサポート)を参照してください。

### インストール

1. リポジトリをクローン：

```bash
git clone https://github.com/DayuanJiang/next-ai-draw-io
cd next-ai-draw-io
```

2. 依存関係をインストール：

```bash
npm install
# または
yarn install
```

3. AIプロバイダーを設定：

ルートディレクトリに`.env.local`ファイルを作成：

```bash
cp env.example .env.local
```

`.env.local`を編集して選択したプロバイダーを設定：

-   `AI_PROVIDER`を選択したプロバイダーに設定（bedrock, openai, anthropic, google, azure, ollama, openrouter, deepseek, siliconflow）
-   `AI_MODEL`を使用する特定のモデルに設定
-   プロバイダーに必要なAPIキーを追加
-   `TEMPERATURE`：オプションの温度設定（例：`0`で決定論的な出力）。温度をサポートしないモデル（推論モデルなど）では設定しないでください。
-   `ACCESS_CODE_LIST` アクセスパスワード（オプション）。カンマ区切りで複数のパスワードを指定できます。

> 警告：`ACCESS_CODE_LIST`を設定しない場合、誰でもデプロイされたサイトに直接アクセスできるため、トークンが急速に消費される可能性があります。このオプションを設定することをお勧めします。

詳細な設定手順については[プロバイダー設定ガイド](./docs/ai-providers.md)を参照してください。

4. 開発サーバーを起動：

```bash
npm run dev
```

5. ブラウザで[http://localhost:3000](http://localhost:3000)を開いてアプリケーションを確認。

## デプロイ

Next.jsアプリをデプロイする最も簡単な方法は、Next.jsの作成者による[Vercelプラットフォーム](https://vercel.com/new)を使用することです。

詳細は[Next.jsデプロイメントドキュメント](https://nextjs.org/docs/app/building-your-application/deploying)をご覧ください。

または、このボタンでデプロイできます：
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDayuanJiang%2Fnext-ai-draw-io)

ローカルの`.env.local`ファイルと同様に、Vercelダッシュボードで**環境変数を設定**してください。

## プロジェクト構造

```
app/                  # Next.js App Router
  api/chat/           # AIツール付きチャットAPIエンドポイント
  page.tsx            # DrawIO埋め込み付きメインページ
components/           # Reactコンポーネント
  chat-panel.tsx      # ダイアグラム制御付きチャットインターフェース
  chat-input.tsx      # ファイルアップロード付きユーザー入力コンポーネント
  history-dialog.tsx  # ダイアグラムバージョン履歴ビューア
  ui/                 # UIコンポーネント（ボタン、カードなど）
contexts/             # Reactコンテキストプロバイダー
  diagram-context.tsx # グローバルダイアグラム状態管理
lib/                  # ユーティリティ関数とヘルパー
  ai-providers.ts     # マルチプロバイダーAI設定
  utils.ts            # XML処理と変換ユーティリティ
public/               # サンプル画像を含む静的アセット
```

## TODO

-   [x] LLMが毎回ゼロから生成する代わりにXMLを修正できるようにする
-   [x] シェイプストリーミング更新の滑らかさを改善
-   [x] 複数のAIプロバイダーサポートを追加（OpenAI, Anthropic, Google, Azure, Ollama）
-   [x] 60秒以上のセッションで生成が失敗するバグを解決
-   [ ] UIにAPI設定を追加

## サポート＆お問い合わせ

このプロジェクトが役に立ったら、ライブデモサイトのホスティングを支援するために[スポンサー](https://github.com/sponsors/DayuanJiang)をご検討ください！

サポートやお問い合わせについては、GitHubリポジトリでissueを開くか、メンテナーにご連絡ください：

-   メール：me[at]jiang.jp

## スター履歴

[![Star History Chart](https://api.star-history.com/svg?repos=DayuanJiang/next-ai-draw-io&type=date&legend=top-left)](https://www.star-history.com/#DayuanJiang/next-ai-draw-io&type=date&legend=top-left)

---
