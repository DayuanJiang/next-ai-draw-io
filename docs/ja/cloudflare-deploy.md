# Cloudflare Workers にデプロイする

このページでは、Next AI Draw.io を Cloudflare Worker（Cloudflare のサーバーで動くプログラム）としてデプロイする方法を説明します。Next.js アプリは、OpenNext アダプターで Worker に変換されます。

Worker は世界中にある Cloudflare のサーバーにデプロイされるので、応答までの時間（レイテンシー）がとても短くなります。`workers.dev` のアドレスでのホスティングは無料です。必要であれば、Cloudflare の R2 ストレージで Next.js の ISR を完全にサポートできます。

## 必要なもの

- Cloudflare アカウント。基本的なデプロイなら無料プランで十分です。
- Node.js 22 以降。リポジトリがインストールする Wrangler のバージョンには Node.js 22 が必要で、Next.js 16 には 20.9 以降が必要です。
- Wrangler CLI。Cloudflare のコマンドラインツールです。リポジトリの開発依存関係に入っているので、`npm install` でインストールされます。

基本的な Workers へのデプロイは無料です。支払い方法の登録が必要なのは、ISR キャッシュのために R2 を有効にする場合だけです。

## Windows を使う場合

OpenNext と Wrangler は、Windows 上で直接動かすと完全には信頼できません。Windows 上で直接ビルドすると、WASM ファイルのパスの問題で失敗することがあります。代わりに次のどちらかを使ってください。

- GitHub Codespaces（完全に動作します）
- WSL（Windows 上で Linux を使えます）

## 依存関係をインストールしてログインする

```bash
npm install
```

次に Wrangler で Cloudflare にログインします。

```bash
npx wrangler login
```

## 環境変数を設定する

設定を置ける場所は 3 つあり、それぞれ読み込まれるタイミングが違います。

- `.env.local` は、通常の Next.js の開発（`npm run dev`）で使うファイルです。OpenNext のビルドは、`.env.local`、`.env` などの `.env` ファイルの値も Worker のコードにコピーします。これらのファイルの内容は、API キーも含めてすべて、デプロイのときに Worker と一緒にアップロードされます。
- `.dev.vars` を読み込むのは、自分のコンピューター上の Wrangler だけです。`npm run preview` はその値を自分のコンピューターで動く Worker に渡します。`npm run deploy` はこのファイルをアップロードしません。
- Cloudflare で Worker に追加したシークレット（Secret）は、デプロイした Worker が読み込みます。同じ名前の値が Cloudflare と `.env.local` の両方にある場合、Worker は Cloudflare の値を使います。

`.env.local` を作成し、API キーと設定を入力してください。

```bash
cp env.example .env.local
```

デプロイした Worker が使う API キーは、初回のデプロイの後に Cloudflare でシークレットとして追加してください。手順は [Worker に API キーを追加する](#worker-に-api-キーを追加する) で説明しています。API キーを Worker のコードに含めたくない場合は、`npm run deploy` を実行する前に `.env.local` から削除してください。`AI_PROVIDER` や `AI_MODEL` のような秘密ではない設定は、`.env.local` に残しておいてかまいません。

`.env.local` に API キーがない状態で自分のコンピューターで Worker をプレビューしたい場合は、API キーを `.dev.vars` に入力してください。このファイルは自分のコンピューターの中だけに置かれます。

```bash
cp env.example .dev.vars
```

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
2. OpenNext で Cloudflare Worker に変換し、`.env.local` などの `.env` ファイルの値を Worker にコピーする
3. 静的アセットをアップロードする
4. Worker を公開する

アプリは次の URL で使えるようになります。

```
https://<worker-name>.<your-subdomain>.workers.dev
```

## Worker に API キーを追加する

デプロイした Worker が使う API キーは、Worker のシークレットとして追加します。プロバイダーが必要とするキー（たとえば `OPENAI_API_KEY`）を、次のどちらかの方法で追加してください。

- Cloudflare ダッシュボードで追加する：**Workers & Pages** を開いて Worker を選び、**Settings**、**Variables and Secrets** の順に開いて **Add** をクリックし、種類に **Secret** を選びます。
- コマンドラインで追加する：次のコマンドを実行すると、Wrangler が値の入力を求めます。

  ```bash
  npx wrangler secret put OPENAI_API_KEY
  ```

ダッシュボードでこれらのキーを追加するときは、種類に Secret を選んでください。`npm run deploy` を実行するたびに、シークレットは残り、ダッシュボードで追加した Text 型の変数は削除されます。`wrangler.jsonc` で `"keep_vars": true` を設定すると、これらの変数も残ります。

## よくあるエラーを解決する

- **`You need to register a workers.dev subdomain`**：アカウントに workers.dev サブドメインが登録されていません。https://dash.cloudflare.com で **Workers & Pages** を開き、**Set up a subdomain** を選んでください。
- **`Please enable R2 through the Cloudflare Dashboard`**：`wrangler.jsonc` で R2 が設定されていて、アカウントではまだ R2 が有効になっていません。R2 を有効にする（支払い方法が必要です）か、R2 なしでデプロイしてください。
- **`No R2 binding "NEXT_INC_CACHE_R2_BUCKET" found`**：`wrangler.jsonc` に `r2_buckets` がありません。`r2_buckets` のセクションを追加するか、既定の R2 なしの構成に切り替えてください。
- **`Can't set compatibility date in the future`**：wrangler の設定の `compatibility_date` が未来の日付になっています。今日かそれより前の日付に変更してください。
- **Windows エラー `resvg.wasm?module`（ENOENT）**：wasm ファイルの 1 つは名前に `?module` を含み、Windows のファイル名には `?` を使えないためです。WSL、Codespaces、CI などの Linux 環境でビルドとデプロイをしてください。
