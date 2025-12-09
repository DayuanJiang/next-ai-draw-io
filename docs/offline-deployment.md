# Offline Deployment

In some corporate environments, `embed.diagrams.net` is blocked by network policies. This guide explains how to deploy Next AI Draw.io in offline/air-gapped environments using a self-hosted draw.io instance.

## Overview

By default, Next AI Draw.io uses `embed.diagrams.net` for the diagram editor. For offline deployment, you need to:

1. Run a local draw.io instance
2. Build Next AI Draw.io with a custom `NEXT_PUBLIC_DRAWIO_BASE_URL`

**Important:** This is a **build-time** configuration. You need to rebuild the Docker image to change the draw.io URL.

## Quick Start

### 1. Run Local Draw.io

```bash
docker run -d -p 8080:8080 jgraph/drawio:latest
```

### 2. Build Next AI Draw.io

```bash
docker build --build-arg NEXT_PUBLIC_DRAWIO_BASE_URL=http://localhost:8080 -t next-ai-draw-io .
```

### 3. Run the Application

```bash
docker run -d -p 3000:3000 --env-file .env next-ai-draw-io
```

## Docker Compose

For a complete offline setup with both services:

```yaml
services:
  drawio:
    image: jgraph/drawio:latest
    ports:
      - "8080:8080"

  next-ai-draw-io:
    build:
      context: .
      args:
        - NEXT_PUBLIC_DRAWIO_BASE_URL=http://drawio:8080
    ports:
      - "3000:3000"
    env_file:
      - .env
```

## Local Development

For local development, add to your `.env.local`:

```bash
NEXT_PUBLIC_DRAWIO_BASE_URL=http://localhost:8080
```

Then rebuild the application:

```bash
npm run build
npm run start
```

## Notes

- The default draw.io URL is `https://embed.diagrams.net`
- Changes to `NEXT_PUBLIC_DRAWIO_BASE_URL` require rebuilding (it's baked into the Next.js bundle at build time)
- You still need network access to your AI provider (OpenAI, Anthropic, etc.) unless using a local model like Ollama
