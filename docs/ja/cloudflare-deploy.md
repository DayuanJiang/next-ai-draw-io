# Cloudflare Workers にデプロイする

このページでは、Next AI Draw.io を Cloudflare Worker（Cloudflare のサーバーで動くプログラム）としてデプロイする方法を説明します。Next.js アプリは、OpenNext アダプターで Worker に変換されます。

Worker は世界中にある Cloudflare のサーバーにデプロイされるので、応答までの時間（レイテンシー）がとても短くなります。`workers.dev` のアドレスでのホスティングは無料です。必要であれば、Cloudflare の R2 ストレージで Next.js の ISR を完全にサポートできます。

## 必要なもの

- Cloudflare アカウント。基本的なデプロイなら無料プランで十分です。
- Node.js 18 以降。
- Wrangler CLI。Cloudflare のコマンドラインツールです。

Wrangler をインストールします。開発依存関係としてインストールして問題ありません。

```bash
npm install -D wrangler
```

次に Cloudflare にログインします。

```bash
npx wrangler login
```

基本的な Workers へのデプロイは無料です。支払い方法の登録が必要なのは、ISR キャッシュのために R2 を有効にする場合だけです。

## Windows を使う場合

OpenNext と Wrangler は、Windows 上で直接動かすと完全には信頼できません。Windows 上で直接ビルドすると、WASM ファイルのパスの問題で失敗することがあります。代わりに次のどちらかを使ってください。

- GitHub Codespaces（完全に動作します）
- WSL（Windows 上で Linux を使えます）

## 依存関係をインストールする

```bash
npm install
```

## 環境変数を設定する

Cloudflare はローカルでのテストに別のファイルを使うので、2 つのファイルに同じ値を入れます。

`.dev.vars` を作成します。Cloudflare がローカルでの実行とデプロイに使うファイルです。

```bash
cp env.example .dev.vars
```

API キーと設定を入力してください。

`.env.local` もあることを確認します。通常の Next.js の開発で使うファイルです。

```bash
cp env.example .env.local
```

こちらにも同じ値を入力してください。

## R2 を使うかどうかを選ぶ

R2 は Cloudflare のストレージサービスです。OpenNext が Incremental Static Regeneration（ISR）のページを保存する場所になります。ISR のページは、Next.js が前もってビルドし、デプロイの後にも更新するページです。このアプリには現在 ISR のページがないため、R2 が必要なのは自分で ISR のページを追加した場合だけです。

| 機能 | R2 なし | R2 あり |
|---|---|---|
| コスト | 無料 | 支払い方法が必要 |
| ISR キャッシュ | なし | あり |
| 静的ページ | あり | あり |
| API ルート | あり | あり |
| 設定の手間 | シンプル | 普通 |

リポジトリの既定は R2 なしです。ISR キャッシュが必要なページを追加した場合にだけ、R2 ありを選んでください。

### 既定のまま R2 を使わない

この構成は無料で、リポジトリもこの構成になっています。`open-next.config.ts` は `defineCloudflareConfig({})` で、`wrangler.jsonc` に `r2_buckets` はありません。ファイルを変更する必要はないので、workers.dev サブドメインの登録に進んでください。

### ISR キャッシュ用に R2 を追加する

R2 を使うには、Cloudflare アカウントに支払い方法の登録が必要です。

1. Cloudflare ダッシュボードで R2 バケットを作成します。**Storage & Databases** から **R2** を開き、**Create bucket** をクリックして、名前を `next-inc-cache` にします。
2. `open-next.config.ts` を設定します。

   ```ts
   import { defineCloudflareConfig } from "@opennextjs/cloudflare/config"
   import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache"

   export default defineCloudflareConfig({
     incrementalCache: r2IncrementalCache,
   })
   ```

3. `wrangler.jsonc` に `r2_buckets` を追加します。

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

`bucket_name` は、Cloudflare ダッシュボードで作成したバケットの名前と完全に一致させてください。

時間ベースの再検証（決めた時間が過ぎたらページを更新する機能で、ページや fetch の `revalidate` のことです）には、`open-next.config.ts` での `queue` の設定も必要です。OpenNext の Cloudflare キャッシュのドキュメントを参照してください。

## workers.dev サブドメインを登録する

初回のデプロイの前に、workers.dev サブドメインが必要です。登録は 1 回だけです。

おすすめは Cloudflare ダッシュボードでの登録です。https://dash.cloudflare.com で **Workers & Pages**、**Overview** の順に開き、**Set up a subdomain** を選びます。

デプロイ中に登録することもできます。`npm run deploy` を実行すると、Wrangler が次のように尋ねることがあります。

```
Would you like to register a workers.dev subdomain? (Y/n)
```

`Y` を入力し、サブドメイン名を選んでください。CI/CD など、質問に答える人がいない環境ではこの質問は表示されないので、先にダッシュボードで登録してください。

## 先にローカルでプレビューする

この手順は任意です。デプロイの前に Worker を自分のコンピューターでプレビューするには、次を実行します。

```bash
npm run preview
```

## デプロイする

```bash
npm run deploy
```

スクリプトは次の処理を行います。

1. Next.js アプリをビルドする
2. OpenNext で Cloudflare Worker に変換する
3. 静的アセットをアップロードする
4. Worker を公開する

アプリは次の URL で使えるようになります。

```
https://<worker-name>.<your-subdomain>.workers.dev
```

## よくあるエラーを解決する

- **`You need to register a workers.dev subdomain`**：アカウントに workers.dev サブドメインが登録されていません。https://dash.cloudflare.com で **Workers & Pages** を開き、**Set up a subdomain** を選んでください。
- **`Please enable R2 through the Cloudflare Dashboard`**：`wrangler.jsonc` で R2 が設定されていて、アカウントではまだ R2 が有効になっていません。R2 を有効にする（支払い方法が必要です）か、R2 なしでデプロイしてください。
- **`No R2 binding "NEXT_INC_CACHE_R2_BUCKET" found`**：`wrangler.jsonc` に `r2_buckets` がありません。`r2_buckets` のセクションを追加するか、既定の R2 なしの構成に切り替えてください。
- **`Can't set compatibility date in the future`**：wrangler の設定の `compatibility_date` が未来の日付になっています。今日かそれより前の日付に変更してください。
- **Windows エラー `resvg.wasm?module`（ENOENT）**：wasm ファイルの 1 つは名前に `?module` を含み、Windows のファイル名には `?` を使えないためです。WSL、Codespaces、CI などの Linux 環境でビルドとデプロイをしてください。
