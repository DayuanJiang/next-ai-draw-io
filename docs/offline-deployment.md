# Offline Deployment

Deploy Next AI Draw.io offline by self-hosting draw.io to replace `embed.diagrams.net`.

**Note:** `NEXT_PUBLIC_DRAWIO_BASE_URL` is a **build-time** variable. Changing it requires rebuilding the Docker image.

## Docker Compose Setup

1. Clone the repository and define API keys in `.env`.
2. Create `docker-compose.yml`:

```yaml
services:
  drawio:
    image: jgraph/drawio:latest
    ports: ["8080:8080"]
  next-ai-draw-io:
    build:
      context: .
      args:
        - NEXT_PUBLIC_DRAWIO_BASE_URL=http://localhost:8080
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [drawio]
```

3. Run `docker compose up -d` and open `http://localhost:3000`.

## Configuration & Critical Warning

**The `NEXT_PUBLIC_DRAWIO_BASE_URL` must be accessible from the user's browser.**

| Scenario | URL Value |
|----------|-----------|
| Localhost | `http://localhost:8080` |
| Remote/Server | `http://YOUR_SERVER_IP:8080` |

**Do NOT use** internal Docker aliases like `http://drawio:8080`; the browser cannot resolve them.

## Common Issues

### Cross-Domain Configuration

When deploying with separate domains or URLs for the main application and draw.io:

**Problem:** If `next-ai-draw-io` is accessible at `http://draw.ai.example.com` but `NEXT_PUBLIC_DRAWIO_BASE_URL` points to `http://painting.example.com`, the chat functionality may fail due to cross-origin restrictions.

**Solution:** Ensure both services are accessible from the same domain/origin, or use the direct IP address and port:

```yaml
services:
  drawio:
    image: jgraph/drawio:latest
    ports: ["8080:8080"]
  next-ai-draw-io:
    build:
      context: .
      args:
        - NEXT_PUBLIC_DRAWIO_BASE_URL=http://YOUR_SERVER_IP:8080  # Use actual IP
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [drawio]
```

**Example:** If your server IP is `192.168.1.100`, use `http://192.168.1.100:8080` instead of a different domain name.

### Rebuilding After Configuration Changes

If you modify `NEXT_PUBLIC_DRAWIO_BASE_URL`, you must rebuild without cache:

```bash
docker-compose down
docker-compose build --no-cache next-ai-draw-io
docker-compose up -d
```

This ensures the new URL is properly embedded in the build.