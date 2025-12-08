# Next AI Draw.io

<div align="center">

**AI-Powered Diagram Creation Tool - Chat, Draw, Visualize**

English | [中文](./docs/README_CN.md) | [日本語](./docs/README_JA.md)

[![TrendShift](https://trendshift.io/api/badge/repositories/15449)](https://next-ai-drawio.jiang.jp/)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Next.js](https://img.shields.io/badge/Next.js-16.x-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.x-61dafb)](https://react.dev/)
[![Sponsor](https://img.shields.io/badge/Sponsor-❤-ea4aaa)](https://github.com/sponsors/DayuanJiang)

[![Live Demo](./public/live-demo-button.svg)](https://next-ai-drawio.jiang.jp/)

</div>

A Next.js web application that integrates AI capabilities with draw.io diagrams. Create, modify, and enhance diagrams through natural language commands and AI-assisted visualization.

https://github.com/user-attachments/assets/b2eef5f3-b335-4e71-a755-dc2e80931979

## Table of Contents
- [Next AI Draw.io ](#next-ai-drawio-)
  - [Table of Contents](#table-of-contents)
  - [Examples](#examples)
  - [Features](#features)
  - [Getting Started](#getting-started)
    - [Try it Online](#try-it-online)
    - [Run with Docker (Recommended)](#run-with-docker-recommended)
    - [Installation](#installation)
  - [Deployment](#deployment)
  - [Multi-Provider Support](#multi-provider-support)
  - [How It Works](#how-it-works)
  - [Project Structure](#project-structure)
  - [Support \& Contact](#support--contact)
  - [Star History](#star-history)

## Examples

Here are some example prompts and their generated diagrams:

<div align="center">
<table width="100%">
  <tr>
    <td colspan="2" valign="top" align="center">
      <strong>Animated transformer connectors</strong><br />
      <p><strong>Prompt:</strong> Give me a **animated connector** diagram of transformer's architecture.</p>
      <img src="./public/animated_connectors.svg" alt="Transformer Architecture with Animated Connectors" width="480" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>GCP architecture diagram</strong><br />
      <p><strong>Prompt:</strong> Generate a GCP architecture diagram with **GCP icons**. In this diagram, users connect to a frontend hosted on an instance.</p>
      <img src="./public/gcp_demo.svg" alt="GCP Architecture Diagram" width="480" />
    </td>
    <td width="50%" valign="top">
      <strong>AWS architecture diagram</strong><br />
      <p><strong>Prompt:</strong> Generate a AWS architecture diagram with **AWS icons**. In this diagram, users connect to a frontend hosted on an instance.</p>
      <img src="./public/aws_demo.svg" alt="AWS Architecture Diagram" width="480" />
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <strong>Azure architecture diagram</strong><br />
      <p><strong>Prompt:</strong> Generate a Azure architecture diagram with **Azure icons**. In this diagram, users connect to a frontend hosted on an instance.</p>
      <img src="./public/azure_demo.svg" alt="Azure Architecture Diagram" width="480" />
    </td>
    <td width="50%" valign="top">
      <strong>Cat sketch prompt</strong><br />
      <p><strong>Prompt:</strong> Draw a cute cat for me.</p>
      <img src="./public/cat_demo.svg" alt="Cat Drawing" width="240" />
    </td>
  </tr>
</table>
</div>

## Features

-   **LLM-Powered Diagram Creation**: Leverage Large Language Models to create and manipulate draw.io diagrams directly through natural language commands
-   **Image-Based Diagram Replication**: Upload existing diagrams or images and have the AI replicate and enhance them automatically
-   **Diagram History**: Comprehensive version control that tracks all changes, allowing you to view and restore previous versions of your diagrams before the AI editing.
-   **Interactive Chat Interface**: Communicate with AI to refine your diagrams in real-time
-   **AWS Architecture Diagram Support**: Specialized support for generating AWS architecture diagrams
-   **Animated Connectors**: Create dynamic and animated connectors between diagram elements for better visualization

## Getting Started

### Try it Online

No installation needed! Try the app directly on our demo site:

[![Live Demo](./public/live-demo-button.svg)](https://next-ai-drawio.jiang.jp/)

> Note: Due to high traffic, the demo site currently uses Claude Haiku 4.5. For best results, we recommend self-hosting with Claude Opus 4.5.

### Run with Docker (Recommended)

If you just want to run it locally, the best way is to use Docker.

First, install Docker if you haven't already: [Get Docker](https://docs.docker.com/get-docker/)

Then run:

```bash
docker run -d -p 3000:3000 \
  -e AI_PROVIDER=openai \
  -e AI_MODEL=gpt-4o \
  -e OPENAI_API_KEY=your_api_key \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

Or use an env file (create one from `env.example`):

```bash
cp env.example .env
# Edit .env with your configuration
docker run -d -p 3000:3000 --env-file .env ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

Replace the environment variables with your preferred AI provider configuration. See [Multi-Provider Support](#multi-provider-support) for available options.

### Installation

1. Clone the repository:

```bash
git clone https://github.com/DayuanJiang/next-ai-draw-io
cd next-ai-draw-io
```

2. Install dependencies:

```bash
npm install
```

3. Configure your AI provider:

Create a `.env.local` file in the root directory:

```bash
cp env.example .env.local
```

Edit `.env.local` and configure your chosen provider:

-   Set `AI_PROVIDER` to your chosen provider (bedrock, openai, anthropic, google, azure, ollama, openrouter, deepseek, siliconflow)
-   Set `AI_MODEL` to the specific model you want to use
-   Add the required API keys for your provider
-   `TEMPERATURE`: Optional temperature setting (e.g., `0` for deterministic output). Leave unset for models that don't support it (e.g., reasoning models).
-   `ACCESS_CODE_LIST`: Optional access password(s), can be comma-separated for multiple passwords.

> Warning: If you do not set `ACCESS_CODE_LIST`, anyone can access your deployed site directly, which may lead to rapid depletion of your token. It is recommended to set this option.

See the [Provider Configuration Guide](./docs/ai-providers.md) for detailed setup instructions for each provider.

4. Run the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Deployment

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

Or you can deploy by this button.
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDayuanJiang%2Fnext-ai-draw-io)

Be sure to **set the environment variables** in the Vercel dashboard as you did in your local `.env.local` file.

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



## Multi-Provider Support

-   AWS Bedrock (default)
-   OpenAI
-   Anthropic
-   Google AI
-   Azure OpenAI
-   Ollama
-   OpenRouter
-   DeepSeek
-   SiliconFlow

All providers except AWS Bedrock and OpenRouter support custom endpoints.

📖 **[Detailed Provider Configuration Guide](./docs/ai-providers.md)** - See setup instructions for each provider.

**Model Requirements**: This task requires strong model capabilities for generating long-form text with strict formatting constraints (draw.io XML). Recommended models include Claude Sonnet 4.5, GPT-4o, Gemini 2.0, and DeepSeek V3/R1.

Note that `claude-sonnet-4-5` has trained on draw.io diagrams with AWS logos, so if you want to create AWS architecture diagrams, this is the best choice.


## How It Works

The application uses the following technologies:

-   **Next.js**: For the frontend framework and routing
-   **Vercel AI SDK** (`ai` + `@ai-sdk/*`): For streaming AI responses and multi-provider support
-   **react-drawio**: For diagram representation and manipulation

Diagrams are represented as XML that can be rendered in draw.io. The AI processes your commands and generates or modifies this XML accordingly.

## Project Structure

```
app/                  # Next.js App Router
  api/chat/           # Chat API endpoint with AI tools
  page.tsx            # Main page with DrawIO embed
components/           # React components
  chat-panel.tsx      # Chat interface with diagram control
  chat-input.tsx      # User input component with file upload
  history-dialog.tsx  # Diagram version history viewer
  ui/                 # UI components (buttons, cards, etc.)
contexts/             # React context providers
  diagram-context.tsx # Global diagram state management
lib/                  # Utility functions and helpers
  ai-providers.ts     # Multi-provider AI configuration
  utils.ts            # XML processing and conversion utilities
public/               # Static assets including example images
```

## Support & Contact

If you find this project useful, please consider [sponsoring](https://github.com/sponsors/DayuanJiang) to help me host the live demo site!

For support or inquiries, please open an issue on the GitHub repository or contact the maintainer at:

-   Email: me[at]jiang.jp

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=DayuanJiang/next-ai-draw-io&type=date&legend=top-left)](https://www.star-history.com/#DayuanJiang/next-ai-draw-io&type=date&legend=top-left)

---
