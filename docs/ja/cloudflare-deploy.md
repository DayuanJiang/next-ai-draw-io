# Cloudflare Workers へのデプロイ

このプロジェクトは **OpenNext アダプター** を使用して **Cloudflare Worker** としてデプロイすることができ、以下のメリットがあります：

- グローバルエッジへのデプロイ
- 超低レイテンシー
- 無料の `workers.dev` ホスティング
- R2 を介した完全な Next.js ISR サポート（オプション）

> **Windows ユーザー向けの重要な注意:** OpenNext と Wrangler は、**ネイティブ Windows 環境では完全には信頼できません**。以下の方法を推奨します：
>
> - **GitHub Codespaces** を使用する（完全に動作します）
> - または **WSL (Linux)** を使用する
>
> 純粋な Windows 環境でのビルドは、WASM ファイルパスの問題により失敗する可能性があります。

---

## 前提条件

1. **Cloudflare アカウント**（基本的なデプロイには無料プランで十分です）
2. **Node.js 18以上**
3. **Wrangler CLI** のインストール（開発依存関係で問題ありません）：

```bash
npm install -D wrangler
```

4. Cloudflare へのログイン：

```bash
npx wrangler login
```

> **注意:** 支払い方法の登録が必要なのは、ISR キャッシュのために R2 を有効にする場合のみです。基本的な Workers へのデプロイは無料です。

---

## ステップ 1 — 依存関係のインストール

```bash
npm install
```

---

## ステップ 2 — 環境変数の設定

Cloudflare はローカルテスト用に別のファイルを使用します。

### 1) `.dev.vars` の作成（Cloudflare ローカルおよびデプロイ用）

```bash
cp env.example .dev.vars
```

API キーと設定を入力してください。

### 2) `.env.local` も存在することを確認（通常の Next.js 開発用）

```bash
cp env.example .env.local
```

同じ値を入力してください。

---

## ステップ 3 — デプロイタイプの選択

### オプション A: R2 なしでのデプロイ（シンプル、無料）

ISR キャッシュが不要な場合は、R2 なしでデプロイできます：

**1. シンプルな `open-next.config.ts` を使用:**

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare/config"

export default defineCloudflareConfig({})
```

**2. シンプルな `wrangler.jsonc` を使用（r2_buckets なし）:**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "main": ".open-next/worker.js",
  "name": "next-ai-draw-io-worker",
  "compatibility_date": "2025-12-08",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "services": [
    {
      "binding": "WORKER_SELF_REFERENCE",
      "service": "next-ai-draw-io-worker"
    }
  ]
}
```

**ステップ 4** へ進んでください。

---

### オプション B: R2 ありでのデプロイ（完全な ISR サポート）

R2 を使用すると **Incremental Static Regeneration (ISR)** キャッシュが有効になります。これには Cloudflare アカウントに支払い方法の登録が必要です。

**1. R2 バケットの作成**（Cloudflare ダッシュボードにて）:

- **Storage & Databases → R2** へ移動
- **Create bucket** をクリック
- 名前を入力: `next-inc-cache`

**2. `open-next.config.ts` の設定:**

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare/config"
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache"

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
})
```

**3. `wrangler.jsonc` の設定（R2 あり）:**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "main": ".open-next/worker.js",
  "name": "next-ai-draw-io-worker",
  "compatibility_date": "2025-12-08",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "r2_buckets": [
    {
      "binding": "NEXT_INC_CACHE_R2_BUCKET",
      "bucket_name": "next-inc-cache"
    }
  ],
  "services": [
    {
      "binding": "WORKER_SELF_REFERENCE",
      "service": "next-ai-draw-io-worker"
    }
  ]
}
```

> **重要:** `bucket_name` は Cloudflare ダッシュボードで作成した名前と完全に一致させる必要があります。

---

## ステップ 4 — workers.dev サブドメインの登録（初回のみ）

初回デプロイの前に、workers.dev サブドメインが必要です。

**オプション 1: Cloudflare ダッシュボード経由（推奨）**

アクセス先: https://dash.cloudflare.com → Workers & Pages → Overview → Set up a subdomain

**オプション 2: デプロイ時**

`npm run deploy` を実行した際、Wrangler が以下のように尋ねてくる場合があります：

```
Would you like to register a workers.dev subdomain? (Y/n)
```

`Y` を入力し、サブドメイン名を選択してください。

> **注意:** CI/CD や非対話型環境では、このプロンプトは表示されません。事前にダッシュボードで登録してください。

---

## ステップ 5 — Cloudflare へのデプロイ

```bash
npm run deploy
```

スクリプトの処理内容：

- Next.js アプリのビルド
- OpenNext を介した Cloudflare Worker への変換
- 静的アセットのアップロード
- Worker の公開

アプリは以下の URL で利用可能になります：

```
https://<worker-name>.<your-subdomain>.workers.dev
```

---

## よくある問題と解決策

### `You need to register a workers.dev subdomain`

**原因:** アカウントに workers.dev サブドメインが登録されていません。

**解決策:** https://dash.cloudflare.com → Workers & Pages → Set up a subdomain から登録してください。

---

### `Please enable R2 through the Cloudflare Dashboard`

**原因:** `wrangler.jsonc` で R2 が設定されていますが、アカウントで R2 が有効になっていません。

**解決策:** R2 を有効にする（支払い方法が必要）か、オプション A（R2 なしでデプロイ）を使用してください。

---

### `No R2 binding "NEXT_INC_CACHE_R2_BUCKET" found`

**原因:** `wrangler.jsonc` に `r2_buckets` がありません。

**解決策:** `r2_buckets` セクションを追加するか、オプション A（R2 なし）に切り替えてください。

---

### `Can't set compatibility date in the future`

**原因:** wrangler 設定の `compatibility_date` が未来の日付に設定されています。

**解決策:** `compatibility_date` を今日またはそれ以前の日付に変更してください。

---

### Windows エラー: `resvg.wasm?module` (ENOENT)

**原因:** Windows のファイル名には `?` を含めることができませんが、wasm アセットのファイル名に `?module` が使用されているためです。

**解決策:** Linux 環境（WSL、Codespaces、または CI）でビルド/デプロイしてください。

---

## オプション: ローカルでのプレビュー

デプロイ前に Worker をローカルでプレビューできます：

```bash
npm run preview
```

---

## まとめ

| 機能 | R2 なし | R2 あり |
|---------|------------|---------|
| コスト | 無料 | 支払い方法が必要 |
| ISR キャッシュ | なし | あり |
| 静的ページ | あり | あり |
| API ルート | あり | あり |
| 設定の複雑さ | シンプル | 普通 |

テストやシンプルなアプリには **R2 なし** を選んでください。ISR キャッシュが必要な本番アプリには **R2 あり** を選んでください。
