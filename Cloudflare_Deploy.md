## Deploy on Cloudflare Workers

This project can be deployed as a **Cloudflare Worker** using the **OpenNext adapter**, giving you:

- ✅ Global edge deployment
- ✅ Very low latency
- ✅ Free `workers.dev` hosting
- ✅ Full Next.js ISR support via R2

> ⚠️ **Important Windows Note:** OpenNext and Wrangler are **not fully reliable on native Windows**. Recommended options:
>
> - Use **GitHub Codespaces** (works perfectly)
> - OR use **WSL (Linux)**
>
> Pure Windows builds may fail due to WASM file path issues.

---

## Prerequisites

1. A **Cloudflare account** with a **payment method added** (required for R2).
2. **Node.js 18+**.
3. **Wrangler CLI** installed (dev dependency is fine):

```bash
npm install -D wrangler
```

4. Cloudflare login (choose one):

```bash
npx wrangler login
# or
npx wrangler config   # paste an API token
```

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
touch .dev.vars
```

Add the same variables as `env.example`, using the same format

### 2) Make sure `.env.local` also exists (for regular Next.js dev)

```bash
cp env.example .env.local
```

Fill in the same values there.

---

## Step 3 — Enable R2 Incremental Cache

OpenNext uses **Cloudflare R2** to power **Next.js Incremental Static Regeneration (ISR)** and caching.

### 3.1 — Create an R2 bucket

In the Cloudflare Dashboard:

- Go to **Storage & Databases → R2**
- Click **Create bucket**
- Name it:

```
next-inc-cache
```

---

### 3.2 — Enable R2 in `open-next.config.ts`

Set the file to use the R2 incremental cache:

```ts
// open-next.config.ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
```

---

## Step 4 — Configure `wrangler.json` / `wrangler.jsonc` (With R2)

Make sure your Wrangler config meets these rules:

- ✅ Includes `nodejs_compat` in `compatibility_flags`
- ✅ Includes an `r2_buckets` binding named **NEXT_INC_CACHE_R2_BUCKET**
- ✅ Uses a **today or past** `compatibility_date`

### Example `wrangler.jsonc`

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "main": ".open-next/worker.js",
  "name": "next-ai-draw-io-worker",
  "compatibility_date": "2025-12-08",
  "compatibility_flags": ["nodejs_compat"],
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

## Step 5 — Deploy to Cloudflare

Run the project’s deploy script:

```bash
npm run deploy
```

What the script does:

- Builds the Next.js app
- Converts it to a Cloudflare Worker via OpenNext
- Uploads static assets
- Populates the R2 incremental cache
- Publishes the Worker

---

## Step 6 — Register a free `workers.dev` subdomain (first-time only)

On first deploy Wrangler will prompt:

```
Would you like to register a workers.dev subdomain? (Y/n)
```

Type `Y`, then enter a subdomain name (example: `next-ai-draw-io`).

Your app will be available at:

```
https://next-ai-draw-io.workers.dev
```

---

## Common issues & fixes

### `No R2 binding "NEXT_INC_CACHE_R2_BUCKET" found`

**Cause:** `r2_buckets` is missing from `wrangler.json`.

**Fix:** Add the `r2_buckets` section exactly as shown in **Step 4**.

---

### `Can't set compatibility date in the future`

**Cause:** `compatibility_date` in wrangler config is set to a future date.

**Fix:** Change `compatibility_date` to today or an earlier date.

---

### Windows error: `resvg.wasm?module` (ENOENT)

**Cause:** Windows filenames cannot include `?`, but a wasm asset uses `?module` in its filename during packaging.

**Fix:** Build/deploy on Linux (WSL, Codespaces, or CI) or remove the dynamic OG image route that pulls in `resvg`.

---

## Optional: Preview locally

You can preview a Worker locally with:

```bash
npm run preview
```

---

## Summary

This flow gives you a **production-grade Cloudflare Workers deployment with full R2-backed ISR support**. A payment method is required only for enabling R2; Workers and `workers.dev` hosting remain free-tier friendly.
