# Deploy on Cloudflare Workers

This project can be deployed as a **Cloudflare Worker** using the **OpenNext adapter**, giving you:

- Global edge deployment
- Very low latency
- Free `workers.dev` hosting
- Full Next.js ISR support via R2 (optional)

> **Important Windows Note:** OpenNext and Wrangler are **not fully reliable on native Windows**. Recommended options:
>
> - Use **GitHub Codespaces** (works perfectly)
> - OR use **WSL (Linux)**
>
> Pure Windows builds may fail due to WASM file path issues.

---

## Prerequisites

1. A **Cloudflare account** (free tier works for basic deployment)
2. **Node.js 18+**
3. **Wrangler CLI** installed (dev dependency is fine):

```bash
npm install -D wrangler
```

4. Cloudflare login:

```bash
npx wrangler login
```

> **Note:** A payment method is only required if you want to enable R2 for ISR caching. Basic Workers deployment is free.

---

## Step 1 — Install dependencies

```bash
npm install
```

---

## Step 2 — Configure environment variables

Cloudflare uses a different file for local testing.

### 1) Create `.dev.vars` (for Cloudflare local + deploy)

```bash
cp env.example .dev.vars
```

Fill in your API keys and configuration.

### 2) Make sure `.env.local` also exists (for regular Next.js dev)

```bash
cp env.example .env.local
```

Fill in the same values there.

---

## Step 3 — Choose your deployment type

### Option A: Deploy WITHOUT R2 (Simple, Free)

If you don't need ISR caching, you can deploy without R2:

**1. Use simple `open-next.config.ts`:**

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare/config"

export default defineCloudflareConfig({})
```

**2. Use simple `wrangler.jsonc` (without r2_buckets):**

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

Skip to **Step 4**.

---

### Option B: Deploy WITH R2 (Full ISR Support)

R2 enables **Incremental Static Regeneration (ISR)** caching. Requires a payment method on your Cloudflare account.

**1. Create an R2 bucket** in the Cloudflare Dashboard:

- Go to **Storage & Databases → R2**
- Click **Create bucket**
- Name it: `next-inc-cache`

**2. Configure `open-next.config.ts`:**

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare/config"
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache"

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
})
```

**3. Configure `wrangler.jsonc` (with R2):**

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

> **Important:** The `bucket_name` must exactly match the name you created in the Cloudflare dashboard.

---

## Step 4 — Register a workers.dev subdomain (first-time only)

Before your first deployment, you need a workers.dev subdomain.

**Option 1: Via Cloudflare Dashboard (Recommended)**

Visit: https://dash.cloudflare.com → Workers & Pages → Overview → Set up a subdomain

**Option 2: During deploy**

When you run `npm run deploy`, Wrangler may prompt:

```
Would you like to register a workers.dev subdomain? (Y/n)
```

Type `Y` and choose a subdomain name.

> **Note:** In CI/CD or non-interactive environments, the prompt won't appear. Register via the dashboard first.

---

## Step 5 — Deploy to Cloudflare

```bash
npm run deploy
```

What the script does:

- Builds the Next.js app
- Converts it to a Cloudflare Worker via OpenNext
- Uploads static assets
- Publishes the Worker

Your app will be available at:

```
https://<worker-name>.<your-subdomain>.workers.dev
```

---

## Common issues & fixes

### `You need to register a workers.dev subdomain`

**Cause:** No workers.dev subdomain registered for your account.

**Fix:** Go to https://dash.cloudflare.com → Workers & Pages → Set up a subdomain.

---

### `Please enable R2 through the Cloudflare Dashboard`

**Cause:** R2 is configured in wrangler.jsonc but not enabled on your account.

**Fix:** Either enable R2 (requires payment method) or use Option A (deploy without R2).

---

### `No R2 binding "NEXT_INC_CACHE_R2_BUCKET" found`

**Cause:** `r2_buckets` is missing from `wrangler.jsonc`.

**Fix:** Add the `r2_buckets` section or switch to Option A (without R2).

---

### `Can't set compatibility date in the future`

**Cause:** `compatibility_date` in wrangler config is set to a future date.

**Fix:** Change `compatibility_date` to today or an earlier date.

---

### Windows error: `resvg.wasm?module` (ENOENT)

**Cause:** Windows filenames cannot include `?`, but a wasm asset uses `?module` in its filename.

**Fix:** Build/deploy on Linux (WSL, Codespaces, or CI).

---

## Optional: Preview locally

Preview the Worker locally before deploying:

```bash
npm run preview
```

---

## Summary

| Feature | Without R2 | With R2 |
|---------|------------|---------|
| Cost | Free | Requires payment method |
| ISR Caching | No | Yes |
| Static Pages | Yes | Yes |
| API Routes | Yes | Yes |
| Setup Complexity | Simple | Moderate |

Choose **without R2** for testing or simple apps. Choose **with R2** for production apps that need ISR caching.
