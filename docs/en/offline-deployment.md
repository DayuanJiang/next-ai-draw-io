# Offline Deployment

Next AI Draw.io ships with its own copy of draw.io. `npm run build` (and the Docker build) downloads the draw.io release into `public/drawio` once, and the app serves it from `/drawio`. In use, the browser never contacts `embed.diagrams.net`, so the app works on an offline or intranet network as long as the build had internet access.

## Docker Compose Setup

1. Clone the repository and define API keys in `.env`.
2. Run `docker compose up -d` (it uses the `docker-compose.yml` in the repository).
3. Open `http://localhost:3000`.

No separate draw.io container is needed.

## Building Without Internet Access

The build downloads `draw.war` (about 50 MB) from the [draw.io releases](https://github.com/jgraph/drawio/releases). If the build machine cannot reach GitHub:

- On another machine, download `draw.war` for the version in `scripts/fetch-drawio.mjs`, unzip it into `public/drawio` (delete `WEB-INF` and `META-INF`), and write the version, for example `v32.0.2`, into `public/drawio/.version`. The build then uses this copy.
- Or build the image on a machine with internet access and transfer it to the offline network.

## Images From Other Websites

The bundled draw.io is static files only, without draw.io's image proxy (`/drawio/proxy`). An image inserted by its web address from another site shows on the canvas, but exports (PNG, SVG) and version thumbnails leave it out, because draw.io fetches such images through that proxy. Insert these images from a file instead: draw.io then stores them inside the diagram.

## Using a Separate draw.io Server (Optional)

You can still point the app at another draw.io, such as the `jgraph/drawio` image, with the build-time variable `NEXT_PUBLIC_DRAWIO_BASE_URL`:

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

With an external draw.io the app uses draw.io's own toolbar, and these features are off: highlighting what the AI changed, asking about selected shapes, the app's canvas toolbar, and undoing AI changes with Ctrl+Z. Browsers do not let a page control an editor served from a different origin.

**The `NEXT_PUBLIC_DRAWIO_BASE_URL` must be accessible from the user's browser.**

| Scenario | URL Value |
|----------|-----------|
| Localhost | `http://localhost:8080` |
| Remote/Server | `http://YOUR_SERVER_IP:8080` |

**Do NOT use** internal Docker aliases like `http://drawio:8080`; the browser cannot resolve them.

