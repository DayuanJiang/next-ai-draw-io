# 部署到 Cloudflare Workers

本项目可以通过 **OpenNext 适配器** 部署为 **Cloudflare Worker**，为您提供：

- 全球边缘部署
- 极低延迟
- 免费的 `workers.dev` 域名托管
- 通过 R2 实现完整的 Next.js ISR 支持（可选）

> **Windows 用户重要提示：** OpenNext 和 Wrangler 在 **原生 Windows 环境下并不完全可靠**。建议方案：
>
> - 使用 **GitHub Codespaces**（完美运行）
> - 或者使用 **WSL (Linux)**
>
> 纯 Windows 构建可能会因为 WASM 文件路径问题而失败。

---

## 前置条件

1. 一个 **Cloudflare 账户**（免费版即可满足基本部署需求）
2. **Node.js 18+**
3. 安装 **Wrangler CLI**（作为开发依赖安装即可）：

```bash
npm install -D wrangler
```

4. 登录 Cloudflare：

```bash
npx wrangler login
```

> **注意：** 只有在启用 R2 进行 ISR 缓存时才需要绑定支付方式。基本的 Workers 部署是免费的。

---

## 第一步 — 安装依赖

```bash
npm install
```

---

## 第二步 — 配置环境变量

Cloudflare 在本地测试时使用不同的文件。

### 1) 创建 `.dev.vars`（用于 Cloudflare 本地调试 + 部署）

```bash
cp env.example .dev.vars
```

填入您的 API 密钥和配置信息。

### 2) 确保 `.env.local` 也存在（用于常规 Next.js 开发）

```bash
cp env.example .env.local
```

在此处填入相同的值。

---

## 第三步 — 选择部署类型

### 选项 A：不使用 R2 部署（简单，免费）

如果您不需要 ISR 缓存，可以选择不使用 R2 进行部署：

**1. 使用简单的 `open-next.config.ts`：**

```ts
import { defineCloudflareConfig } from " @opennextjs/cloudflare/config"

export default defineCloudflareConfig({})
```

**2. 使用简单的 `wrangler.jsonc`（不包含 r2_buckets）：**

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

直接跳至 **第四步**。

---

### 选项 B：使用 R2 部署（完整的 ISR 支持）

R2 开启了 **增量静态再生 (ISR)** 缓存功能。需要在您的 Cloudflare 账户中绑定支付方式。

**1. 在 Cloudflare 控制台中创建 R2 存储桶：**

- 进入 **Storage & Databases → R2**
- 点击 **Create bucket**
- 命名为：`next-inc-cache`

**2. 配置 `open-next.config.ts`：**

```ts
import { defineCloudflareConfig } from " @opennextjs/cloudflare/config"
import r2IncrementalCache from " @opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache"

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
})
```

**3. 配置 `wrangler.jsonc`（包含 R2）：**

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

> **重要提示：** `bucket_name` 必须与您在 Cloudflare 控制台中创建的名称完全一致。

---

## 第四步 — 注册 workers.dev 子域名（仅首次需要）

在首次部署之前，您需要一个 workers.dev 子域名。

**选项 1：通过 Cloudflare 控制台（推荐）**

访问：https://dash.cloudflare.com → Workers & Pages → Overview → Set up a subdomain

**选项 2：在部署过程中**

运行 `npm run deploy` 时，Wrangler 可能会提示：

```
Would you like to register a workers.dev subdomain? (Y/n)
```

输入 `Y` 并选择一个子域名。

> **注意：** 在 CI/CD 或非交互式环境中，该提示不会出现。请先通过控制台进行注册。

---

## 第五步 — 部署到 Cloudflare

```bash
npm run deploy
```

该脚本执行的操作：

- 构建 Next.js 应用
- 通过 OpenNext 将其转换为 Cloudflare Worker
- 上传静态资源
- 发布 Worker

您的应用将可通过以下地址访问：

```
https://<worker-name>.<your-subdomain>.workers.dev
```

---

## 常见问题与修复

### `You need to register a workers.dev subdomain`

**原因：** 您的账户尚未注册 workers.dev 子域名。

**修复：** 前往 https://dash.cloudflare.com → Workers & Pages → Set up a subdomain。

---

### `Please enable R2 through the Cloudflare Dashboard`

**原因：** wrangler.jsonc 中配置了 R2，但您的账户尚未启用该功能。

**修复：** 启用 R2（需要支付方式）或使用选项 A（不使用 R2 部署）。

---

### `No R2 binding "NEXT_INC_CACHE_R2_BUCKET" found`

**原因：** `wrangler.jsonc` 中缺少 `r2_buckets` 配置。

**修复：** 添加 `r2_buckets` 部分或切换到选项 A（不使用 R2）。

---

### `Can't set compatibility date in the future`

**原因：** wrangler 配置中的 `compatibility_date` 设置为了未来的日期。

**修复：** 将 `compatibility_date` 修改为今天或更早的日期。

---

### Windows 错误：`resvg.wasm?module` (ENOENT)

**原因：** Windows 文件名不能包含 `?`，但某个 wasm 资源文件名中使用了 `?module`。

**修复：** 在 Linux 环境（WSL、Codespaces 或 CI）上进行构建/部署。

---

## 可选：本地预览

部署前在本地预览 Worker：

```bash
npm run preview
```

---

## 总结

| 功能 | 不使用 R2 | 使用 R2 |
|---------|------------|---------|
| 成本 | 免费 | 需要绑定支付方式 |
| ISR 缓存 | 无 | 有 |
| 静态页面 | 支持 | 支持 |
| API 路由 | 支持 | 支持 |
| 配置复杂度 | 简单 | 中等 |

测试或简单应用请选择 **不使用 R2**。需要 ISR 缓存的生产环境应用请选择 **使用 R2**。
