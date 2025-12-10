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
| Remote/Server | `http://YOUR_SERVER_IP:8080` or `https://drawio.your-domain.com` |

**Do NOT use** internal Docker aliases like `http://drawio:8080`; the browser cannot resolve them.

