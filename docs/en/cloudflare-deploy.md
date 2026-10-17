# Deploy on Cloudflare Workers

This page shows you how to deploy Next AI Draw.io as a Cloudflare Worker, a program that runs on Cloudflare's servers. The OpenNext adapter turns the Next.js app into a Worker.

The Worker is deployed to Cloudflare's servers around the world, so it answers with very low latency. Hosting on a `workers.dev` address is free. If you need it, Cloudflare's R2 storage adds full Next.js ISR support.

## What you need

- A Cloudflare account. The free plan works for a basic deployment.
- Node.js 22 or later. The Wrangler version that the repository installs needs Node.js 22, and Next.js 16 needs 20.9 or later.
- The Wrangler CLI, Cloudflare's command line tool. The repository lists it as a dev dependency, so `npm install` installs it.

A basic Workers deployment is free. You need a payment method only if you want to turn on R2 for ISR caching.

## If you use Windows

OpenNext and Wrangler are not fully reliable when they run directly on Windows. A build there may fail because of problems with WASM file paths. Use one of these instead:

- GitHub Codespaces, which works perfectly
- WSL, which gives you Linux on Windows

## Install the dependencies and log in

```bash
npm install
```

Then log in to Cloudflare with Wrangler:

```bash
npx wrangler login
```

## Set the environment variables

The settings can be in three places, and each one is read at a different time:

- `.env.local` is the file for regular Next.js development with `npm run dev`. The OpenNext build also copies the values of `.env.local`, `.env` and the other `.env` files into the code of the Worker. Everything in these files, API keys included, is uploaded inside the Worker when you deploy.
- `.dev.vars` is read only by Wrangler on your computer. `npm run preview` gives its values to the Worker that runs on your computer, and `npm run deploy` does not upload the file.
- Secrets that you add to the Worker in Cloudflare are read by the deployed Worker. When the same name is set in Cloudflare and in `.env.local`, the Worker uses the value from Cloudflare.

Create `.env.local` and fill in your API keys and configuration:

```bash
cp env.example .env.local
```

For the deployed Worker, add the API keys as secrets in Cloudflare after the first deploy, as described in [Add the API keys to the Worker](#add-the-api-keys-to-the-worker). If you don't want the keys inside the code of the Worker, take them out of `.env.local` before you run `npm run deploy`. Settings without secrets, such as `AI_PROVIDER` and `AI_MODEL`, can stay in `.env.local`.

To preview the Worker on your computer when `.env.local` has no API keys, put the keys in `.dev.vars`. This file stays on your computer:

```bash
cp env.example .dev.vars
```

## Choose whether to use R2

R2 is Cloudflare's storage service. It gives OpenNext a place to store Incremental Static Regeneration (ISR) pages, which are pages that Next.js builds ahead of time and updates after the deploy. This app has no ISR pages today, so you need R2 only if you add some.

| Feature | Without R2 | With R2 |
|---|---|---|
| Cost | Free | Needs a payment method |
| ISR caching | No | Yes |
| Static pages | Yes | Yes |
| API routes | Yes | Yes |
| Setup | Simple | Moderate |

The repository uses the setup without R2 by default. Choose R2 only if you add pages that need ISR caching.

### Keep the default, without R2

This setup is free, and it is how the repository is set up: `open-next.config.ts` is `defineCloudflareConfig({})` and `wrangler.jsonc` has no `r2_buckets`. You don't need to change anything. Go on to register a workers.dev subdomain.

### Add R2 for ISR caching

R2 needs a payment method on your Cloudflare account.

1. Create an R2 bucket in the Cloudflare dashboard: go to **Storage & Databases**, then **R2**, click **Create bucket**, and name it `next-inc-cache`.
2. Set up `open-next.config.ts`:

   ```ts
   import { defineCloudflareConfig } from "@opennextjs/cloudflare/config"
   import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache"

   export default defineCloudflareConfig({
     incrementalCache: r2IncrementalCache,
   })
   ```

3. Add `r2_buckets` to `wrangler.jsonc`:

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

The `bucket_name` must exactly match the name of the bucket you created in the Cloudflare dashboard.

Time-based revalidation, which updates a page after a set time (`revalidate` on a page or fetch), also needs a `queue` in `open-next.config.ts`. See the OpenNext Cloudflare caching docs.

## Register a workers.dev subdomain

You need a workers.dev subdomain before your first deployment. You do this only once.

The recommended way is the Cloudflare dashboard: go to https://dash.cloudflare.com, open **Workers & Pages**, then **Overview**, and choose **Set up a subdomain**.

You can also register one during the deploy. When you run `npm run deploy`, Wrangler may ask:

```
Would you like to register a workers.dev subdomain? (Y/n)
```

Type `Y` and choose a subdomain name. In CI/CD and other environments where nobody can answer, this question does not appear, so register in the dashboard first.

## Preview it locally first

This step is optional. To preview the Worker on your computer before you deploy, run:

```bash
npm run preview
```

## Deploy

```bash
npm run deploy
```

The script:

1. Builds the Next.js app
2. Converts it to a Cloudflare Worker with OpenNext, and copies the values of `.env.local` and the other `.env` files into the Worker
3. Uploads the static assets
4. Publishes the Worker

Your app is then available at:

```
https://<worker-name>.<your-subdomain>.workers.dev
```

## Add the API keys to the Worker

For the deployed Worker, put the API keys in secrets of the Worker. Add each key that your provider needs, for example `OPENAI_API_KEY`, in one of two ways:

- In the Cloudflare dashboard: open **Workers & Pages**, choose your Worker, open **Settings**, then **Variables and Secrets**, click **Add**, and choose the type **Secret**.
- On the command line, run the command below. Wrangler asks for the value.

  ```bash
  npx wrangler secret put OPENAI_API_KEY
  ```

Choose the type Secret when you add these keys in the dashboard. Every `npm run deploy` keeps the secrets and removes the variables of type Text that were added in the dashboard. Setting `"keep_vars": true` in `wrangler.jsonc` keeps those variables too.

## Fix common errors

- **`You need to register a workers.dev subdomain`**: your account has no workers.dev subdomain yet. Go to https://dash.cloudflare.com, open **Workers & Pages** and choose **Set up a subdomain**.
- **`Please enable R2 through the Cloudflare Dashboard`**: R2 is set up in `wrangler.jsonc` and is not turned on for your account yet. Turn on R2, which needs a payment method, or deploy without R2.
- **`No R2 binding "NEXT_INC_CACHE_R2_BUCKET" found`**: `wrangler.jsonc` has no `r2_buckets`. Add the `r2_buckets` section, or switch to the default setup without R2.
- **`Can't set compatibility date in the future`**: the `compatibility_date` in the wrangler config is a date in the future. Change it to today or an earlier date.
- **Windows error `resvg.wasm?module` (ENOENT)**: a wasm file has `?module` in its name, and Windows file names cannot contain `?`. Build and deploy on Linux: WSL, Codespaces or CI.
