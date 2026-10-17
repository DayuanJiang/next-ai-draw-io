# 部署到 Cloudflare Workers

本页介绍如何把 Next AI Draw.io 部署为 Cloudflare Worker，也就是运行在 Cloudflare 服务器上的程序。OpenNext 适配器会把 Next.js 应用转换成 Worker。

Worker 会部署到 Cloudflare 遍布全球的服务器上，所以延迟极低。托管在 `workers.dev` 地址上是免费的。如果需要，还可以用 Cloudflare 的 R2 存储获得完整的 Next.js ISR 支持。

## 需要准备什么

- 一个 Cloudflare 账户。基本部署用免费版就够了。
- Node.js 22 或更高版本。仓库安装的 Wrangler 版本需要 Node.js 22，Next.js 16 需要 20.9 或更高版本。
- Wrangler CLI，也就是 Cloudflare 的命令行工具。仓库已经把它列为开发依赖，运行 `npm install` 时会一起安装。

基本的 Workers 部署是免费的。只有在您想启用 R2 进行 ISR 缓存时，才需要绑定支付方式。

## 如果您使用 Windows

OpenNext 和 Wrangler 直接在 Windows 上运行时并不完全可靠。在 Windows 上直接构建，可能会因为 WASM 文件路径的问题而失败。请改用以下任一方式：

- GitHub Codespaces，可以完美运行
- WSL，让您在 Windows 上使用 Linux

## 安装依赖并登录

```bash
npm install
```

然后用 Wrangler 登录 Cloudflare：

```bash
npx wrangler login
```

## 配置环境变量

配置可以放在三个地方，它们在不同的时候被读取：

- `.env.local` 是常规 Next.js 开发（`npm run dev`）使用的文件。OpenNext 构建时还会把 `.env.local`、`.env` 以及其他 `.env` 文件里的值复制进 Worker 的代码。这些文件里的所有内容，包括 API Key，都会在部署时随 Worker 一起上传。
- `.dev.vars` 只由您电脑上的 Wrangler 读取。`npm run preview` 会把其中的值交给在您电脑上运行的 Worker，`npm run deploy` 不会上传这个文件。
- 您在 Cloudflare 中为 Worker 添加的密钥（Secret）由部署后的 Worker 读取。同一个名称在 Cloudflare 和 `.env.local` 中都有值时，Worker 使用 Cloudflare 中的值。

创建 `.env.local`，填入您的 API Key 和配置信息：

```bash
cp env.example .env.local
```

部署后的 Worker 所用的 API Key，请在首次部署之后作为密钥添加到 Cloudflare 中，步骤见[为 Worker 添加 API Key](#为-worker-添加-api-key)。如果您不希望 API Key 出现在 Worker 的代码里，请在运行 `npm run deploy` 之前把它们从 `.env.local` 中删掉。`AI_PROVIDER`、`AI_MODEL` 这类不含密钥的配置可以留在 `.env.local` 中。

如果 `.env.local` 中没有 API Key，您又想在自己的电脑上预览 Worker，可以把 API Key 填进 `.dev.vars`。这个文件只留在您的电脑上：

```bash
cp env.example .dev.vars
```

## 选择是否使用 R2

R2 是 Cloudflare 的存储服务。它为 OpenNext 提供存放增量静态再生（ISR）页面的地方。ISR 页面是 Next.js 预先构建、部署之后还会更新的页面。本应用目前没有 ISR 页面，所以只有在您自己添加了这类页面时才需要 R2。

| 功能 | 不使用 R2 | 使用 R2 |
|---|---|---|
| 成本 | 免费 | 需要绑定支付方式 |
| ISR 缓存 | 无 | 有 |
| 静态页面 | 支持 | 支持 |
| API 路由 | 支持 | 支持 |
| 配置难度 | 简单 | 中等 |

仓库默认不使用 R2。只有当您添加了需要 ISR 缓存的页面时，才选择使用 R2。

### 保持默认，不使用 R2

这套配置是免费的，仓库自带的就是它：`open-next.config.ts` 为 `defineCloudflareConfig({})`，`wrangler.jsonc` 中没有 `r2_buckets`。您无需改动任何文件，接着注册 workers.dev 子域名即可。

### 添加 R2 用于 ISR 缓存

使用 R2 需要在您的 Cloudflare 账户中绑定支付方式。

1. 在 Cloudflare 控制台中创建 R2 存储桶：进入 **Storage & Databases**，再进入 **R2**，点击 **Create bucket**，命名为 `next-inc-cache`。
2. 配置 `open-next.config.ts`：

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

`bucket_name` 必须与您在 Cloudflare 控制台中创建的存储桶名称完全一致。

定时重新验证（在设定的时间之后更新页面，即页面或 fetch 上的 `revalidate`）还需要在 `open-next.config.ts` 中配置 `queue`。请参阅 OpenNext 的 Cloudflare 缓存文档。

## 注册 workers.dev 子域名

首次部署之前，您需要一个 workers.dev 子域名。这一步只需做一次。

推荐通过 Cloudflare 控制台注册：在 https://dash.cloudflare.com 上打开 **Workers & Pages**，再打开 **Overview**，选择 **Set up a subdomain**。

也可以在部署过程中注册。运行 `npm run deploy` 时，Wrangler 可能会提示：

```
Would you like to register a workers.dev subdomain? (Y/n)
```

输入 `Y` 并选择一个子域名。在 CI/CD 等没有人回答提示的环境中，这个提示不会出现，所以请先在控制台中注册。

## 先在本地预览

这一步是可选的。如果想在部署前先在您的电脑上预览 Worker，请运行：

```bash
npm run preview
```

## 部署

```bash
npm run deploy
```

这个脚本会：

1. 构建 Next.js 应用
2. 通过 OpenNext 把它转换为 Cloudflare Worker，并把 `.env.local` 等 `.env` 文件里的值复制进 Worker
3. 上传静态资源
4. 发布 Worker

之后，您的应用可以通过以下地址访问：

```
https://<worker-name>.<your-subdomain>.workers.dev
```

## 为 Worker 添加 API Key

部署后的 Worker 所用的 API Key，请作为密钥添加到 Worker 中。您的服务商需要的每个 Key（例如 `OPENAI_API_KEY`）都可以用以下任一方式添加：

- 在 Cloudflare 控制台中：打开 **Workers & Pages**，选择您的 Worker，打开 **Settings**，再打开 **Variables and Secrets**，点击 **Add**，类型选择 **Secret**。
- 在命令行中运行下面的命令，Wrangler 会提示您输入值：

  ```bash
  npx wrangler secret put OPENAI_API_KEY
  ```

在控制台中添加这些 Key 时，请选择 Secret 类型。每次运行 `npm run deploy` 都会保留密钥，同时删除在控制台中添加的 Text 类型变量。在 `wrangler.jsonc` 中设置 `"keep_vars": true`，这些变量也会被保留。

## 解决常见错误

- **`You need to register a workers.dev subdomain`**：您的账户还没有注册 workers.dev 子域名。请在 https://dash.cloudflare.com 上打开 **Workers & Pages**，选择 **Set up a subdomain**。
- **`Please enable R2 through the Cloudflare Dashboard`**：`wrangler.jsonc` 中配置了 R2，您的账户还没有启用 R2。请启用 R2（需要绑定支付方式），或者不使用 R2 部署。
- **`No R2 binding "NEXT_INC_CACHE_R2_BUCKET" found`**：`wrangler.jsonc` 中缺少 `r2_buckets`。请加上 `r2_buckets` 部分，或者改用不使用 R2 的默认配置。
- **`Can't set compatibility date in the future`**：wrangler 配置中的 `compatibility_date` 是一个未来的日期。请把它改为今天或更早的日期。
- **Windows 错误 `resvg.wasm?module`（ENOENT）**：有一个 wasm 文件的文件名里有 `?module`，而 Windows 的文件名不能包含 `?`。请在 Linux 上构建和部署，例如 WSL、Codespaces 或 CI。
