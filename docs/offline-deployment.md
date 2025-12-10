# Offline Deployment

In some corporate environments, `embed.diagrams.net` is blocked by network policies. This guide explains how to deploy Next AI Draw.io in offline/air-gapped environments using a self-hosted draw.io instance.

## Overview

By default, Next AI Draw.io uses `embed.diagrams.net` for the diagram editor. For offline deployment, you need to:

1. Run a local draw.io instance
2. Build Next AI Draw.io with a custom `NEXT_PUBLIC_DRAWIO_BASE_URL`

**Important:** This is a **build-time** configuration. You need to rebuild the Docker image to change the draw.io URL.

## Quick Start

Create a `docker-compose.yml`:

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
    depends_on:
      - drawio
```

Then run:

```bash
docker compose up -d
```

## Local Development

1. Start a local draw.io instance:

```bash
docker run -d -p 8080:8080 jgraph/drawio:latest
```

2. Add to your `.env.local`:

```bash
NEXT_PUBLIC_DRAWIO_BASE_URL=http://localhost:8080
```

3. Rebuild and run:

```bash
npm run build
npm run start
```
