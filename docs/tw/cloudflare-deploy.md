# 部署到 Cloudflare Workers

本頁介紹如何把 Next AI Draw.io 部署為 Cloudflare Worker，也就是執行在 Cloudflare 伺服器上的程式。OpenNext 轉接器會把 Next.js 應用程式轉換成 Worker。

Worker 會部署到 Cloudflare 遍布全球的伺服器上，所以延遲極低。託管在 `workers.dev` 網域上是免費的。如果需要，還可以用 Cloudflare 的 R2 儲存服務取得完整的 Next.js ISR 支援。

## 需要準備什麼

- 一個 Cloudflare 帳戶。基本部署用免費版就夠了。
- Node.js 22 或更高版本。儲存庫安裝的 Wrangler 版本需要 Node.js 22，Next.js 16 需要 20.9 或更高版本。
- Wrangler CLI，也就是 Cloudflare 的命令列工具。儲存庫已經把它列為開發相依套件，執行 `npm install` 時會一起安裝。

基本的 Workers 部署是免費的。只有在您想啟用 R2 進行 ISR 快取時，才需要綁定付款方式。

## 如果您使用 Windows

OpenNext 和 Wrangler 直接在 Windows 上執行時並不完全可靠。在 Windows 上直接建置，可能會因為 WASM 檔案路徑的問題而失敗。請改用以下任一方式：

- GitHub Codespaces，可以完美執行
- WSL，讓您在 Windows 上使用 Linux

## 安裝相依套件並登入

```bash
npm install
```

然後用 Wrangler 登入 Cloudflare：

```bash
npx wrangler login
```

## 設定環境變數

設定可以放在三個地方，它們在不同的時間點被讀取：

- `.env.local` 是一般 Next.js 開發（`npm run dev`）使用的檔案。OpenNext 建置時還會把 `.env.local`、`.env` 以及其他 `.env` 檔案裡的值複製進 Worker 的程式碼。這些檔案裡的所有內容，包括 API Key，都會在部署時隨 Worker 一起上傳。
- `.dev.vars` 只由您電腦上的 Wrangler 讀取。`npm run preview` 會把其中的值交給在您電腦上執行的 Worker，`npm run deploy` 不會上傳這個檔案。
- 您在 Cloudflare 中為 Worker 新增的金鑰（Secret）由部署後的 Worker 讀取。同一個名稱在 Cloudflare 和 `.env.local` 中都有值時，Worker 使用 Cloudflare 中的值。

建立 `.env.local`，填入您的 API Key 和設定：

```bash
cp env.example .env.local
```

部署後的 Worker 所用的 API Key，請在首次部署之後作為金鑰新增到 Cloudflare 中，步驟見[為 Worker 新增 API Key](#為-worker-新增-api-key)。如果您不希望 API Key 出現在 Worker 的程式碼裡，請在執行 `npm run deploy` 之前把它們從 `.env.local` 中刪掉。`AI_PROVIDER`、`AI_MODEL` 這類不含金鑰的設定可以留在 `.env.local` 中。

如果 `.env.local` 中沒有 API Key，您又想在自己的電腦上預覽 Worker，可以把 API Key 填進 `.dev.vars`。這個檔案只留在您的電腦上：

```bash
cp env.example .dev.vars
```

## 選擇是否使用 R2

R2 是 Cloudflare 的儲存服務。它為 OpenNext 提供存放增量靜態再生（ISR）頁面的地方。ISR 頁面是 Next.js 預先建置、部署之後還會更新的頁面。本應用程式目前沒有 ISR 頁面，所以只有在您自己新增了這類頁面時才需要 R2。

| 功能 | 不使用 R2 | 使用 R2 |
|---|---|---|
| 成本 | 免費 | 需要綁定付款方式 |
| ISR 快取 | 無 | 有 |
| 靜態頁面 | 支援 | 支援 |
| API 路由 | 支援 | 支援 |
| 設定難度 | 簡單 | 中等 |

儲存庫預設不使用 R2。只有當您新增了需要 ISR 快取的頁面時，才選擇使用 R2。

### 保持預設，不使用 R2

這套設定是免費的，儲存庫附帶的就是它：`open-next.config.ts` 為 `defineCloudflareConfig({})`，`wrangler.jsonc` 中沒有 `r2_buckets`。您無需改動任何檔案，接著註冊 workers.dev 子網域即可。

### 新增 R2 用於 ISR 快取

使用 R2 需要在您的 Cloudflare 帳戶中綁定付款方式。

1. 在 Cloudflare 儀表板中建立 R2 儲存貯體：進入 **Storage & Databases**，再進入 **R2**，點選 **Create bucket**，命名為 `next-inc-cache`。
2. 設定 `open-next.config.ts`：

   ```ts
   import { defineCloudflareConfig } from "@opennextjs/cloudflare/config"
   import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache"

   export default defineCloudflareConfig({
     incrementalCache: r2IncrementalCache,
   })
   ```

3. 在 `wrangler.jsonc` 中加入 `r2_buckets`：

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

`bucket_name` 必須與您在 Cloudflare 儀表板中建立的儲存貯體名稱完全一致。

定時重新驗證（在設定的時間之後更新頁面，即頁面或 fetch 上的 `revalidate`）還需要在 `open-next.config.ts` 中設定 `queue`。請參閱 OpenNext 的 Cloudflare 快取文件。

## 註冊 workers.dev 子網域

首次部署之前，您需要一個 workers.dev 子網域。這一步只需做一次。

建議透過 Cloudflare 儀表板註冊：在 https://dash.cloudflare.com 上開啟 **Workers & Pages**，再開啟 **Overview**，選擇 **Set up a subdomain**。

也可以在部署過程中註冊。執行 `npm run deploy` 時，Wrangler 可能會提示：

```
Would you like to register a workers.dev subdomain? (Y/n)
```

輸入 `Y` 並選擇一個子網域。在 CI/CD 等沒有人回答提示的環境中，這個提示不會出現，所以請先在儀表板中註冊。

## 先在本機預覽

這一步並非必要。如果想在部署前先在您的電腦上預覽 Worker，請執行：

```bash
npm run preview
```

## 部署

```bash
npm run deploy
```

這個指令碼會：

1. 建置 Next.js 應用程式
2. 透過 OpenNext 把它轉換為 Cloudflare Worker，並把 `.env.local` 等 `.env` 檔案裡的值複製進 Worker
3. 上傳靜態資源
4. 發布 Worker

之後，您的應用程式可以透過以下網址存取：

```
https://<worker-name>.<your-subdomain>.workers.dev
```

## 為 Worker 新增 API Key

部署後的 Worker 所用的 API Key，請作為金鑰新增到 Worker 中。您的服務商需要的每個 Key（例如 `OPENAI_API_KEY`）都可以用以下任一方式新增：

- 在 Cloudflare 儀表板中：開啟 **Workers & Pages**，選擇您的 Worker，開啟 **Settings**，再開啟 **Variables and Secrets**，點選 **Add**，類型選擇 **Secret**。
- 在命令列中執行下面的指令，Wrangler 會提示您輸入值：

  ```bash
  npx wrangler secret put OPENAI_API_KEY
  ```

在儀表板中新增這些 Key 時，請選擇 Secret 類型。每次執行 `npm run deploy` 都會保留金鑰，同時刪除在儀表板中新增的 Text 類型變數。在 `wrangler.jsonc` 中設定 `"keep_vars": true`，這些變數也會被保留。

## 解決常見錯誤

- **`You need to register a workers.dev subdomain`**：您的帳戶還沒有註冊 workers.dev 子網域。請在 https://dash.cloudflare.com 上開啟 **Workers & Pages**，選擇 **Set up a subdomain**。
- **`Please enable R2 through the Cloudflare Dashboard`**：`wrangler.jsonc` 中設定了 R2，您的帳戶還沒有啟用 R2。請啟用 R2（需要綁定付款方式），或者不使用 R2 部署。
- **`No R2 binding "NEXT_INC_CACHE_R2_BUCKET" found`**：`wrangler.jsonc` 中缺少 `r2_buckets`。請加上 `r2_buckets` 部分，或者改用不使用 R2 的預設設定。
- **`Can't set compatibility date in the future`**：wrangler 設定中的 `compatibility_date` 是一個未來的日期。請把它改為今天或更早的日期。
- **Windows 錯誤 `resvg.wasm?module`（ENOENT）**：有一個 wasm 檔案的檔案名稱裡有 `?module`，而 Windows 的檔案名稱不能包含 `?`。請在 Linux 上建置和部署，例如 WSL、Codespaces 或 CI。
